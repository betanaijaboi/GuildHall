import { and, asc, eq } from "drizzle-orm";
import { ArrowLeft, BadgeCheck, CircleDollarSign, Link2, ShieldAlert, Star } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { assets, engagementMilestones, engagementReviews, engagements, payoutAccounts } from "@/db/schema";
import {
  approveAndRelease, cancelEngagement, disputeMilestone, fundMilestone, leaveReview, linkMilestoneAsset, sendContract, signContract,
} from "@/app/actions/engagements";
import { Avatar } from "@/components/avatar";
import { Confetti } from "@/components/confetti";
import { ContractText } from "@/components/contract-text";
import { loadProject, roleAtLeast } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { partiesOf } from "@/lib/engagements";
import { contractFeeCents, formatMoney, milestoneFees } from "@/lib/fees";
import { paymentsConfigured } from "@/lib/payments";

export const metadata = { title: "Contract" };

const PAY_COLOR: Record<string, string> = { unfunded: "#9a96b3", funding: "#fbbf24", funded: "#22d3ee", released: "#34d399", disputed: "#fb7185", refunded: "#9a96b3" };

export default async function ContractPage({ params, searchParams }: { params: Promise<{ slug: string; id: string }>; searchParams: Promise<{ funded?: string }> }) {
  const { slug, id } = await params;
  const { funded } = await searchParams;
  const user = await requireUser();
  const { project, role } = await loadProject(slug, user, "guest");
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [e] = await db.select().from(engagements).where(and(eq(engagements.id, id), eq(engagements.projectId, project.id))).limit(1);
  if (!e || (e.clientId !== user.id && e.makerId !== user.id && !roleAtLeast(role, "lead"))) notFound();
  const { client, maker } = await partiesOf(db, e);
  const [milestones, projectAssets, reviews, [makerPayout]] = await Promise.all([
    db.select().from(engagementMilestones).where(eq(engagementMilestones.engagementId, e.id)).orderBy(asc(engagementMilestones.position)),
    db.select({ id: assets.id, title: assets.title, status: assets.status }).from(assets).where(eq(assets.projectId, project.id)),
    db.select().from(engagementReviews).where(eq(engagementReviews.engagementId, e.id)),
    db.select().from(payoutAccounts).where(eq(payoutAccounts.userId, e.makerId)).limit(1),
  ]);
  const isClient = e.clientId === user.id;
  const isMaker = e.makerId === user.id;
  const paid = e.kind === "work_for_hire";
  const mySigned = isMaker ? e.makerSignedAt : isClient ? e.clientSignedAt : null;
  const total = milestones.reduce((n, m) => n + (m.amountCents ?? 0), 0);
  const myReview = reviews.find((r) => r.fromId === user.id);

  return (
    <div className="space-y-5">
      {funded && <Confetti />}
      <div className="flex flex-wrap items-center gap-3">
        <Link href={`/p/${slug}/contracts`} className="btn-ghost"><ArrowLeft size={16} /> Contracts</Link>
        <h1 className="font-display text-2xl font-bold tracking-tight">{e.title}</h1>
        <span className="chip capitalize">{e.status}</span>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
        <div className="space-y-5">
          <section className="card space-y-3">
            <h2 className="h2 flex items-center gap-2"><CircleDollarSign size={18} className="text-accent" /> Milestones</h2>
            {paid && !paymentsConfigured() && <p className="text-sm text-warn">Payments aren&apos;t configured on this server (STRIPE_SECRET_KEY).</p>}
            <ol className="space-y-2">
              {milestones.map((m, i) => {
                const fees = m.amountCents ? milestoneFees(m.amountCents, e.pricingModel) : null;
                const linked = projectAssets.find((a) => a.id === m.assetId);
                return (
                  <li key={m.id} className="rounded-xl border border-border bg-surface-2 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-display font-bold text-fg-muted">{i + 1}</span>
                      <span className="font-medium">{m.title}</span>
                      {m.amountCents != null && <span className="font-display font-semibold">{formatMoney(m.amountCents, e.currency)}</span>}
                      {paid && <span className="chip-tint ml-auto capitalize" style={{ "--c": PAY_COLOR[m.status] } as React.CSSProperties}>{m.status}</span>}
                    </div>
                    {fees && (
                      <div className="mt-1 text-xs text-fg-muted">
                        Maker receives {formatMoney(fees.makerReceives, e.currency)}{fees.platformFee ? ` · Guildhall fee ${formatMoney(fees.platformFee, e.currency)}` : " · no fee on payout"}
                      </div>
                    )}
                    {linked && m.status !== "released" && (
                      <Link href={`/p/${slug}/assets/${linked.id}`} className="mt-1 inline-flex items-center gap-1 text-xs text-accent"><Link2 size={12} /> Released automatically when &quot;{linked.title}&quot; is approved</Link>
                    )}
                    {m.status === "disputed" && <p className="mt-1 text-xs text-bad">Dispute: {m.disputeReason}</p>}
                    {paid && e.status === "active" && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {isClient && (m.status === "unfunded" || m.status === "funding") && paymentsConfigured() && (
                          <form action={fundMilestone.bind(null, slug, e.id)}>
                            <input type="hidden" name="milestoneId" value={m.id} />
                            <button className="btn py-1.5 text-xs">
                              Fund {formatMoney((m.amountCents ?? 0) + contractFeeCents(e.pricingModel, !e.flatFeePaid), e.currency)}
                              {contractFeeCents(e.pricingModel, !e.flatFeePaid) > 0 && " (incl. flat fee)"}
                            </button>
                          </form>
                        )}
                        {isClient && m.status === "funded" && (
                          <form action={approveAndRelease.bind(null, slug, e.id)}>
                            <input type="hidden" name="milestoneId" value={m.id} />
                            <button className="btn py-1.5 text-xs"><BadgeCheck size={14} /> Approve &amp; release</button>
                          </form>
                        )}
                        {isClient && m.status !== "released" && (
                          <form action={linkMilestoneAsset.bind(null, slug, e.id)} className="flex gap-1">
                            <input type="hidden" name="milestoneId" value={m.id} />
                            <select name="assetId" defaultValue={m.assetId ?? ""} className="input py-1 text-xs">
                              <option value="">No linked asset</option>
                              {projectAssets.map((a) => <option key={a.id} value={a.id}>{a.title}</option>)}
                            </select>
                            <button className="btn-secondary py-1 text-xs">Link</button>
                          </form>
                        )}
                        {(isClient || isMaker) && m.status === "funded" && (
                          <details className="text-xs">
                            <summary className="btn-ghost cursor-pointer text-bad"><ShieldAlert size={13} /> Dispute</summary>
                            <form action={disputeMilestone.bind(null, slug, e.id)} className="mt-1 flex gap-1">
                              <input type="hidden" name="milestoneId" value={m.id} />
                              <input name="reason" required minLength={5} placeholder="What's wrong?" className="input py-1 text-xs" />
                              <button className="btn-secondary py-1 text-xs">Open</button>
                            </form>
                          </details>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
            {paid && <div className="text-right text-sm text-fg-muted">Total {formatMoney(total, e.currency)} · {e.pricingModel === "flat" ? "flat contract fee" : "percentage fee"}</div>}
            {paid && isMaker && !makerPayout?.payoutsEnabled && (
              <p className="rounded-xl border border-warn/40 p-3 text-sm text-warn">Set up payouts to receive released funds. <Link href="/settings/payouts" className="link">Settings → Payouts</Link></p>
            )}
          </section>

          <section className="card">
            {e.contractText ? <ContractText text={e.contractText} /> : <p className="text-sm text-fg-muted">Draft: the contract text is generated when the client sends it.</p>}
          </section>
        </div>

        <aside className="space-y-4">
          <section className="card space-y-3">
            <h2 className="h2">Signatures</h2>
            {[{ who: client, label: "Client", name: e.clientSignedName, at: e.clientSignedAt }, { who: maker, label: "Maker", name: e.makerSignedName, at: e.makerSignedAt }].map((p) => (
              <div key={p.label} className="flex items-center gap-3">
                <Avatar user={p.who} size={36} />
                <div className="min-w-0 flex-1">
                  <div className="text-xs text-fg-muted">{p.label}</div>
                  <div className="font-medium">{p.who.name}</div>
                </div>
                {p.at ? (
                  <div className="text-right">
                    <div className="font-serif text-lg italic">{p.name}</div>
                    <div className="text-[11px] text-fg-muted">{p.at.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</div>
                  </div>
                ) : (
                  <span className="text-xs text-fg-muted">not signed</span>
                )}
              </div>
            ))}
            {e.contractHash && <p className="break-all font-mono text-[10px] text-fg-muted">SHA-256 {e.contractHash}</p>}
            {e.status === "draft" && isClient && (
              <div className="flex gap-2">
                <form action={sendContract.bind(null, slug, e.id)} className="flex-1"><button className="btn w-full">Send for signature</button></form>
                <form action={cancelEngagement.bind(null, slug, e.id)}><button className="btn-secondary">Cancel</button></form>
              </div>
            )}
            {e.status === "sent" && (isClient || isMaker) && !mySigned && (
              <form action={signContract.bind(null, slug, e.id)} className="space-y-2 border-t border-border pt-3">
                <label className="label text-xs">Type your full name to sign</label>
                <input name="signature" required placeholder={user.name} className="input font-serif text-lg italic" />
                <label className="flex items-start gap-2 text-xs text-fg-muted"><input type="checkbox" name="agree" required className="mt-0.5" /> I&apos;ve read this agreement and agree to its terms.</label>
                <button className="btn w-full">Sign contract</button>
              </form>
            )}
          </section>

          {e.status === "completed" && (isClient || isMaker) && (
            <section className="card space-y-2">
              <h2 className="h2 flex items-center gap-2"><Star size={18} className="text-gold" /> Review</h2>
              {myReview ? (
                <p className="text-sm">You rated {isClient ? maker.name : client.name} {"★".repeat(myReview.rating)}{"☆".repeat(5 - myReview.rating)}</p>
              ) : (
                <form action={leaveReview.bind(null, slug, e.id)} className="space-y-2">
                  <div className="flex flex-row-reverse justify-end gap-1 text-2xl">
                    {[5, 4, 3, 2, 1].map((n) => (
                      <label key={n} className="cursor-pointer text-fg-muted transition-colors has-[:checked]:text-gold [&:has(~label:hover)]:text-gold hover:text-gold">
                        <input type="radio" name="rating" value={n} required className="sr-only" />★
                      </label>
                    ))}
                  </div>
                  <textarea name="body" rows={3} placeholder={`How was working with ${isClient ? maker.name : client.name}?`} className="input" />
                  <button className="btn w-full">Submit review</button>
                </form>
              )}
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
