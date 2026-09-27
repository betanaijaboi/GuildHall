import { CreditCard, FlaskConical } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { db } from "@/db";
import { requireUser } from "@/lib/auth";
import { markFunded } from "@/lib/engagements";
import { env } from "@/lib/env";
import { formatMoney } from "@/lib/fees";
import { devPaymentsEnabled } from "@/lib/payments";

export const metadata = { title: "Checkout (simulated)" };

type Q = { milestone?: string; ref?: string; amount?: string; currency?: string; description?: string; success?: string; cancel?: string };

const local = (url: string | undefined) => (url && url.startsWith(env.appUrl) ? url.slice(env.appUrl.length) || "/" : "/");

/** Stand-in for Stripe Checkout when ENABLE_DEV_PAYMENTS is on. Never available in production. */
export default async function DevCheckout({ searchParams }: { searchParams: Promise<Q> }) {
  if (!devPaymentsEnabled()) notFound();
  await requireUser();
  const q = await searchParams;

  async function pay() {
    "use server";
    if (!devPaymentsEnabled()) notFound();
    await requireUser();
    if (q.milestone && /^[0-9a-f-]{36}$/.test(q.milestone) && q.ref) await markFunded(db, q.milestone, q.ref);
    redirect(local(q.success));
  }

  return (
    <div className="mx-auto max-w-md space-y-5 py-10">
      <div className="flex items-center gap-2 rounded-xl border border-warn/40 bg-warn/10 p-3 text-sm text-warn">
        <FlaskConical size={16} /> Simulated checkout: no real money moves. Configure STRIPE_SECRET_KEY for real payments.
      </div>
      <div className="card space-y-4 text-center">
        <CreditCard className="mx-auto text-accent" size={32} />
        <div className="text-sm text-fg-muted">{q.description}</div>
        <div className="font-display text-4xl font-bold">{formatMoney(Number(q.amount ?? 0), q.currency ?? "usd")}</div>
        <form action={pay}><button className="btn w-full py-2.5">Pay (simulated)</button></form>
        <a href={local(q.cancel)} className="link text-sm">Cancel</a>
      </div>
    </div>
  );
}
