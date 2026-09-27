import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/db";
import { getCurrentUser } from "@/lib/auth";
import { loadHuddle, scheduleEndIfEmpty } from "@/lib/huddle-server";
import { MAX_PARTICIPANTS } from "@/lib/huddles";
import { activeParticipants, connect, disconnect } from "@/lib/huddles-db";
import { subscribeHuddle } from "@/lib/pubsub";

export const dynamic = "force-dynamic";

/**
 * Server-Sent Events for one huddle participant: presence, WebRTC signalling addressed to them,
 * draw-over strokes, captions and notes. Having this stream open is what "being in the call" means.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  const row = await loadHuddle(id, user.id);
  if (!row) return new NextResponse("Not found", { status: 404 });
  if (row.huddle.endedAt) return new NextResponse("Ended", { status: 410 });
  const present = await activeParticipants(db, id);
  if (present.length >= MAX_PARTICIPANTS && !present.some((p) => p.id === user.id)) return new NextResponse("Huddle is full", { status: 409 });

  const encoder = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: string) => {
        try {
          controller.enqueue(encoder.encode(data));
        } catch {}
      };
      send(": connected\n\n");
      const unsubscribe = subscribeHuddle(id, user.id, (e) => send(`data: ${JSON.stringify(e)}\n\n`));
      const heartbeat = setInterval(() => send(": ping\n\n"), 20_000);
      let closed = false;
      cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        unsubscribe();
        disconnect(db, id, user.id)
          .then((left) => left === 0 && scheduleEndIfEmpty(id))
          .catch((err) => console.error("huddle disconnect failed", err));
      };
      req.signal.addEventListener("abort", () => {
        cleanup();
        try {
          controller.close();
        } catch {}
      });
      await connect(db, id, user.id);
    },
    cancel() {
      cleanup();
    },
  });
  return new NextResponse(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" },
  });
}
