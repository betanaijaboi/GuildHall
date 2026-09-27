import { eq } from "drizzle-orm";
import { BadgeCheck, Wallet } from "lucide-react";
import { db } from "@/db";
import { payoutAccounts } from "@/db/schema";
import { refreshPayoutStatus, startPayoutOnboarding } from "@/app/actions/engagements";
import { requireUser } from "@/lib/auth";
import { FLAT_FEE_CENTS, formatMoney, PERCENT_FEE } from "@/lib/fees";
import { devPaymentsEnabled, paymentsConfigured } from "@/lib/payments";

export const metadata = { title: "Payouts" };

export default async function PayoutsPage() {
  const user = await requireUser();
  const [acct] = await db.select().from(payoutAccounts).where(eq(payoutAccounts.userId, user.id)).limit(1);
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <h1 className="h1 flex items-center gap-2"><Wallet className="text-accent" /> Payouts</h1>
      <section className="card space-y-3">
        {!paymentsConfigured() ? (
          <p className="text-sm text-fg-muted">Payments aren&apos;t configured on this server.</p>
        ) : acct?.payoutsEnabled ? (
          <p className="flex items-center gap-2 text-good"><BadgeCheck size={18} /> Payouts are set up{acct.provider === "dev" ? " (simulated)" : ""}. Released milestones are paid to this account.</p>
        ) : (
          <>
            <p className="text-sm text-fg-muted">
              Connect a payout account to receive milestone payments. Identity checks and bank details are handled by Stripe; Guildhall never sees your bank details.
            </p>
            <div className="flex gap-2">
              <form action={startPayoutOnboarding}><button className="btn">{acct ? "Continue setup" : "Set up payouts"}</button></form>
              {acct && <form action={refreshPayoutStatus}><button className="btn-secondary">Refresh status</button></form>}
            </div>
            {devPaymentsEnabled() && <p className="text-xs text-warn">Dev mode: onboarding and payments are simulated.</p>}
          </>
        )}
      </section>
      <section className="card text-sm text-fg-muted">
        <h2 className="h2 mb-2 text-fg">How fees work</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>Rev-share, hobby and jam projects: always free.</li>
          <li>Paid contracts, percentage model: {PERCENT_FEE * 100}% is taken from each released milestone.</li>
          <li>Paid contracts, flat model: the client pays a one-off {formatMoney(FLAT_FEE_CENTS, "usd")} and you keep 100%.</li>
        </ul>
      </section>
    </div>
  );
}
