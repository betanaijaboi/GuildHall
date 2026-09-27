import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { getCurrentUser } from "@/lib/auth";
import { loadHuddle } from "@/lib/huddle-server";
import { activeParticipants } from "@/lib/huddles-db";
import { publishHuddle } from "@/lib/pubsub";

const point = z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)]);
const body = z.discriminatedUnion("kind", [
  z.object({ kind: z.enum(["offer", "answer"]), to: z.string().uuid(), data: z.object({ type: z.enum(["offer", "answer"]), sdp: z.string().max(60_000) }) }),
  z.object({ kind: z.literal("ice"), to: z.string().uuid(), data: z.object({ candidate: z.string().max(2000), sdpMid: z.string().max(64).nullable().optional(), sdpMLineIndex: z.number().int().nullable().optional() }).nullable() }),
  z.object({ kind: z.literal("state"), session: z.string().regex(/^[a-z0-9]{6,40}$/i), mic: z.boolean(), cam: z.boolean(), screen: z.boolean() }),
  z.object({ kind: z.literal("draw"), data: z.object({ points: z.array(point).min(1).max(400), color: z.string().regex(/^#[0-9a-f]{6}$/i) }) }),
  z.object({ kind: z.literal("clear") }),
]);

/** Relays WebRTC signalling and call events between participants who are currently connected. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  const row = await loadHuddle(id, user.id);
  if (!row || row.huddle.endedAt) return new NextResponse("Not found", { status: 404 });
  const text = await req.text();
  if (text.length > 100_000) return new NextResponse("Too large", { status: 413 });
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return new NextResponse("Bad request", { status: 400 });
  }
  const parsed = body.safeParse(json);
  if (!parsed.success) return new NextResponse("Bad request", { status: 400 });
  const present = new Set((await activeParticipants(db, id)).map((p) => p.id));
  if (!present.has(user.id)) return new NextResponse("Join the huddle first", { status: 409 });

  const m = parsed.data;
  if (m.kind === "offer" || m.kind === "answer" || m.kind === "ice") {
    if (!present.has(m.to)) return new NextResponse("Not in the huddle", { status: 404 });
    publishHuddle(id, { type: "signal", from: user.id, kind: m.kind, data: m.data }, m.to);
  } else if (m.kind === "state") {
    publishHuddle(id, { type: "state", from: user.id, session: m.session, mic: m.mic, cam: m.cam, screen: m.screen });
  } else if (m.kind === "draw") {
    publishHuddle(id, { type: "draw", from: user.id, data: m.data });
  } else {
    publishHuddle(id, { type: "draw", from: user.id, data: { clear: true } });
  }
  return new NextResponse(null, { status: 204 });
}
