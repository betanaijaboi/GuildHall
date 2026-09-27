import { and, eq, min, sql, type SQL } from "drizzle-orm";
import { Plus, Store } from "lucide-react";
import Link from "next/link";
import { db } from "@/db";
import { gigs, gigTiers, users } from "@/db/schema";
import { DISCIPLINE_STYLE } from "@/components/discipline";
import { GigCard } from "@/components/gig-card";
import { getCurrentUser } from "@/lib/auth";
import { DISCIPLINES, ENGINES } from "@/lib/taxonomy";

export const metadata = { title: "Gigs" };

type Search = { discipline?: string; engine?: string; mine?: string };

export default async function GigsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const f = await searchParams;
  const user = await getCurrentUser();
  const where: SQL[] = [];
  if (f.mine && user) where.push(eq(gigs.sellerId, user.id));
  else where.push(eq(gigs.status, "active"));
  if (f.discipline && /^[a-z]+$/.test(f.discipline)) where.push(sql`${gigs.skillId} like ${`${f.discipline}.%`}`);
  if (f.engine) where.push(sql`${gigs.engines} @> array[${f.engine}]::text[]`);
  const rows = await db
    .select({ gig: gigs, seller: users, fromCents: min(gigTiers.priceCents), fastestDays: min(gigTiers.deliveryDays) })
    .from(gigs)
    .innerJoin(users, eq(users.id, gigs.sellerId))
    .innerJoin(gigTiers, eq(gigTiers.gigId, gigs.id))
    .where(and(...where))
    .groupBy(gigs.id, users.id)
    .limit(60);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <h1 className="h1 flex items-center gap-2"><Store className="text-accent" /> Service <span className="text-gradient">gigs</span></h1>
          <p className="mt-1 text-fg-muted">Ready-to-order game-dev services with clear tiers, delivery times and escrowed payment.</p>
        </div>
        {user && (
          <div className="ml-auto flex gap-2">
            <Link href={f.mine ? "/gigs" : "/gigs?mine=1"} className="btn-secondary">{f.mine ? "All gigs" : "My gigs"}</Link>
            <Link href="/gigs/new" className="btn"><Plus size={16} /> Offer a service</Link>
          </div>
        )}
      </div>
      <div className="scroll-x -mx-4 flex gap-2 px-4">
        <Link href="/gigs" className={`chip shrink-0 px-3 py-1.5 text-sm ${!f.discipline ? "border-accent text-fg" : ""}`}>All</Link>
        {DISCIPLINES.map((d) => {
          const { color, icon: Icon } = DISCIPLINE_STYLE[d.id];
          return (
            <Link key={d.id} href={`/gigs?discipline=${d.id}${f.engine ? `&engine=${f.engine}` : ""}`} className="chip-tint shrink-0 px-3 py-1.5 text-sm" style={{ "--c": color, outline: f.discipline === d.id ? `2px solid ${color}` : undefined } as React.CSSProperties}>
              <Icon size={14} /> {d.label}
            </Link>
          );
        })}
        <span className="mx-1 w-px shrink-0 bg-border" />
        {ENGINES.slice(0, 3).map((e) => (
          <Link key={e.id} href={`/gigs?engine=${e.id}${f.discipline ? `&discipline=${f.discipline}` : ""}`} className={`chip shrink-0 px-3 py-1.5 text-sm ${f.engine === e.id ? "border-accent text-fg" : ""}`}>{e.label}</Link>
        ))}
      </div>
      {rows.length === 0 ? (
        <div className="card flex flex-col items-center gap-2 py-14 text-center text-fg-muted">
          <span className="animate-float text-5xl">🛍️</span>
          No gigs here yet. {user && <Link href="/gigs/new" className="link">Be the first to offer one.</Link>}
        </div>
      ) : (
        <ul className="stagger grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {rows.map((r) => <li key={r.gig.id}><GigCard gig={r.gig} seller={r.seller} fromCents={r.fromCents ?? 0} fastestDays={r.fastestDays ?? 0} /></li>)}
        </ul>
      )}
    </div>
  );
}
