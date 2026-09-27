import { verify } from "@octokit/webhooks-methods";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/db";
import { env } from "@/lib/env";
import { applyWebhook } from "@/lib/github/apply";

export async function POST(req: NextRequest) {
  if (!env.github.webhookSecret) return new NextResponse("Webhook secret not configured", { status: 503 });
  const body = await req.text();
  const signature = req.headers.get("x-hub-signature-256") ?? "";
  if (!signature || !(await verify(env.github.webhookSecret, body, signature))) {
    return new NextResponse("Invalid signature", { status: 401 });
  }
  const event = req.headers.get("x-github-event") ?? "";
  const deliveryId = req.headers.get("x-github-delivery") ?? "";
  if (!event || !deliveryId) return new NextResponse("Missing headers", { status: 400 });

  // Processed inline for the MVP; move to a queue (BullMQ) once volume needs it — GitHub
  // expects a response within 10 seconds.
  const result = await applyWebhook(db, deliveryId, event, JSON.parse(body));
  return NextResponse.json(result);
}
