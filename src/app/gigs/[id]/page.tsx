import { asc, eq } from "drizzle-orm";
import { Clock, RefreshCw, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { gigAddons, gigs, gigTiers, users } from "@/db/schema";
import { orderGig, setGigStatus } from "@/app/actions/gigs";
import { Avatar } from "@/components/avatar";
import { SkillChip } from "@/components/discipline";
import { ProjectCover } from "@/components/project-cover";
import { getCurrentUser } from "@/lib/auth";
import { formatMoney, recommendedModel } from "@/lib/fees";
import { TIER_LABEL } from "@/lib/gigs";
import { ENGINES, labelFor } from "@/lib/taxonomy";

export const metadata = { title: "Gig" };

export default async function GigPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const user = await getCurrentUser();
  const [row] = await db.select({ gig: gigs, seller: users }).from(gigs).innerJoin(users, eq(users.id, gigs.sellerId)).where(eq(gigs.id, id)).limit(1);
  if (!row || (row.gig.status !== "active" && row.gig.sellerId !== user?.id)) notFound();
  const { gig, seller } = row;
  const [tiers, addons] = await Promise.all([
    db.select().from(gigTiers).where(eq(gigTiers.gigId, gig.id)).orderBy(asc(gigTiers.priceCents)),
    db.select().from(gigAddons).where(eq(gigAddons.gigId, gig.id)),
  ]);
  const mine = user?.id === gig.sellerId;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
      <div className="space-y-5">
        <div className="card overflow-hidden p-0">
          {gig.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={gig.coverUrl} alt="" className="h-56 w-full object-cover" />
          ) : (
            <ProjectCover slug={gig.id} className="h-56" />
          )}
          <div className="space-y-3 p-5">
            <h1 className="h1">{gig.title}</h1>
            <div className="flex flex-wrap items-center gap-2">
              <SkillChip skillId={gig.skillId} />
              {gig.engines.map((e) => <span key={e} className="chip">{labelFor(ENGINES, e)}</span>)}
            </div>
            <Link href={`/people/${seller.handle}`} className="inline-flex items-center gap-2 text-sm">
              <Avatar user={seller} size={32} /> <span className="font-medium">{seller.name}</span> <span className="text-fg-muted">@{seller.handle}</span>
            </Link>
          </div>
        </div>
        {gig.description && <div className="card whitespace-pre-wrap">{gig.description}</div>}
        {gig.formats && <div className="card text-sm"><span className="font-semibold">Delivered as:</span> {gig.formats}</div>}
        <div className="card flex items-start gap-3 text-sm text-fg-muted">
          <ShieldCheck className="shrink-0 text-good" size={20} />
          Ordering opens a private workspace with a contract, where IP transfers on payment. Your payment is held until you approve the delivery in asset review.
        </div>
      </div>

      <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
        {mine ? (
          <div className="card space-y-3">
            <p className="text-sm">This is your gig. It&apos;s <span className="font-semibold">{gig.status}</span>.</p>
            <form action={setGigStatus}>
              <input type="hidden" name="id" value={gig.id} />
              <button name="status" value={gig.status === "active" ? "paused" : "active"} className="btn-secondary w-full">{gig.status === "active" ? "Pause gig" : "Activate gig"}</button>
            </form>
          </div>
        ) : null}
        <form action={orderGig.bind(null, gig.id)} className="card space-y-3">
          <div className="space-y-2">
            {tiers.map((t, i) => (
              <label key={t.tier} className="block cursor-pointer rounded-2xl border border-border p-3 transition-all has-[:checked]:border-accent has-[:checked]:bg-accent/10 has-[:checked]:shadow-lg has-[:checked]:shadow-violet-500/20">
                <div className="flex items-center gap-2">
                  <input type="radio" name="tier" value={t.tier} defaultChecked={i === Math.min(1, tiers.length - 1)} />
                  <span className="text-xs font-bold uppercase tracking-wide text-accent">{TIER_LABEL[t.tier]}</span>
                  <span className="ml-auto font-display text-lg font-bold">{formatMoney(t.priceCents, gig.currency)}</span>
                </div>
                <div className="mt-1 font-medium">{t.name}</div>
                {t.description && <p className="text-sm text-fg-muted">{t.description}</p>}
                <div className="mt-1 flex gap-3 text-xs text-fg-muted">
                  <span className="flex items-center gap-1"><Clock size={12} /> {t.deliveryDays} days</span>
                  <span className="flex items-center gap-1"><RefreshCw size={12} /> {t.revisions} revision{t.revisions === 1 ? "" : "s"}</span>
                </div>
              </label>
            ))}
          </div>
          {addons.length > 0 && (
            <fieldset className="space-y-1">
              <legend className="text-sm font-semibold">Add-ons</legend>
              {addons.map((a) => (
                <label key={a.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="addons" value={a.id} /> {a.name} <span className="ml-auto text-fg-muted">+{formatMoney(a.priceCents, gig.currency)}</span>
                </label>
              ))}
            </fieldset>
          )}
          <textarea name="brief" required minLength={10} rows={4} placeholder="Your brief: the game, references, mood, technical constraints, deadline…" className="input" />
          <select name="pricingModel" className="input text-sm" defaultValue={recommendedModel(tiers[tiers.length - 1]?.priceCents ?? 0)}>
            <option value="percent">6% fee from the seller&apos;s payout</option>
            <option value="flat">Flat $29 fee paid by me (seller keeps 100%)</option>
          </select>
          {user ? (
            <button className="btn w-full py-2.5" disabled={mine}>{mine ? "Your own gig" : "Order and open workspace"}</button>
          ) : (
            <Link href="/login" className="btn w-full py-2.5">Sign in to order</Link>
          )}
        </form>
      </aside>
    </div>
  );
}
