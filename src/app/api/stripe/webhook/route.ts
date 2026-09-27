import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { db } from "@/db";
import { paymentEvents, payoutAccounts } from "@/db/schema";
import { markFunded } from "@/lib/engagements";
import { stripeClient } from "@/lib/payments/stripe";

export async function POST(req: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !process.env.STRIPE_SECRET_KEY) return new NextResponse("Stripe not configured", { status: 503 });
  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = stripeClient().webhooks.constructEvent(body, req.headers.get("stripe-signature") ?? "", secret);
  } catch {
    return new NextResponse("Invalid signature", { status: 400 });
  }
  const fresh = await db.insert(paymentEvents).values({ eventId: event.id, type: event.type }).onConflictDoNothing().returning();
  if (!fresh.length) return NextResponse.json({ duplicate: true });

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const milestoneId = session.metadata?.milestone_id;
    if (milestoneId && session.payment_status === "paid") await markFunded(db, milestoneId, session.id);
  } else if (event.type === "account.updated") {
    const account = event.data.object as Stripe.Account;
    await db.update(payoutAccounts).set({ payoutsEnabled: Boolean(account.payouts_enabled) }).where(eq(payoutAccounts.accountId, account.id));
  }
  return NextResponse.json({ ok: true });
}
