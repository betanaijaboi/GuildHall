import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/db";
import { channels, projects } from "@/db/schema";
import { getRole } from "@/lib/access";
import { getCurrentUser } from "@/lib/auth";
import { subscribe } from "@/lib/pubsub";

export const dynamic = "force-dynamic";

/** Server-Sent Events: notifies the client when a message lands in the channel. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  const [channel] = await db
    .select({ id: channels.id, projectId: channels.projectId, visibility: projects.visibility })
    .from(channels)
    .innerJoin(projects, eq(projects.id, channels.projectId))
    .where(eq(channels.id, id))
    .limit(1);
  if (!channel || !(await getRole(channel.projectId, user.id))) return new NextResponse("Not found", { status: 404 });

  const encoder = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream({
    start(controller) {
      const send = (data: string) => controller.enqueue(encoder.encode(data));
      send(": connected\n\n");
      const unsubscribe = subscribe(channel.id, (e) => send(`data: ${JSON.stringify(e)}\n\n`));
      const heartbeat = setInterval(() => send(": ping\n\n"), 25_000);
      cleanup = () => {
        clearInterval(heartbeat);
        unsubscribe();
      };
      req.signal.addEventListener("abort", () => {
        cleanup();
        try {
          controller.close();
        } catch {}
      });
    },
    cancel() {
      cleanup();
    },
  });
  return new NextResponse(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" },
  });
}
