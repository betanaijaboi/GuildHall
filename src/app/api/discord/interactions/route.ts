import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/db";
import { verifyDiscordSignature } from "@/lib/discord";
import { handleInteraction, type Interaction } from "@/lib/discord-db";
import { env } from "@/lib/env";

/**
 * Discord interactions endpoint (set it as the app's "Interactions Endpoint URL"). Every request
 * is Ed25519-verified with DISCORD_PUBLIC_KEY; Discord itself rejects endpoints that don't.
 */
export async function POST(req: NextRequest) {
  const publicKey = process.env.DISCORD_PUBLIC_KEY ?? "";
  const body = await req.text();
  if (body.length > 100_000) return new NextResponse("Too large", { status: 413 });
  const ok = verifyDiscordSignature(publicKey, req.headers.get("x-signature-ed25519") ?? "", req.headers.get("x-signature-timestamp") ?? "", body);
  if (!ok) return new NextResponse("Bad signature", { status: 401 });
  let interaction: Interaction;
  try {
    interaction = JSON.parse(body);
  } catch {
    return new NextResponse("Bad request", { status: 400 });
  }
  return NextResponse.json(await handleInteraction(db, interaction, env.appUrl));
}
