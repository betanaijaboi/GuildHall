import { and, desc, eq, inArray, ne, or } from "drizzle-orm";
import { FileSignature } from "lucide-react";
import Link from "next/link";
import { db } from "@/db";
import { engagementMilestones, engagements, memberships, users } from "@/db/schema";
import { createEngagement } from "@/app/actions/engagements";
import { Avatar } from "@/components/avatar";
import { loadProject, roleAtLeast } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { FLAT_FEE_CENTS, formatMoney, PERCENT_FEE } from "@/lib/fees";

export const metadata = { title: "Contracts" };

const STATUS_COLOR: Record<string, string> = { draft: "#9a96b3", sent: "#fbbf24", active: "#22d3ee", completed: "#34d399", cancelled: "#fb7185" };

export default async function ContractsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await requireUser();
  const { project, role } = await loadProject(slug, user, "contractor");
  const isLead = roleAtLeast(role, "lead");
  const list = await db
    .select({ e: engagements, maker: users })
    .from(engagements)
    .innerJoin(users, eq(users.id, engagements.makerId))
    .where(and(eq(engagements.projectId, project.id), isLead ? undefined : or(eq(engagements.clientId, user.id), eq(engagements.makerId, user.id))))
    .orderBy(desc(engagements.createdAt));
  const totals = new Map<string, number>();
  const ids = list.map((x) => x.e.id);
  for (const m of ids.length ? await db.select().from(engagementMilestones).where(inArray(engagementMilestones.engagementId, ids)) : []) totals.set(m.engagementId, (totals.get(m.engagementId) ?? 0) + (m.amountCents ?? 0));
  const team = isLead
    ? await db.select({ id: users.id, name: users.name }).from(memberships).innerJoin(users, eq(users.id, memberships.userId)).where(and(eq(memberships.projectId, project.id), ne(users.id, user.id)))
    : [];

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_420px]">
      <section className="space-y-3">
        {list.length === 0 && (
          <div className="card flex flex-col items-center gap-2 py-14 text-center text-fg-muted">
            <span className="animate-float text-5xl">📜</span>
            <p className="max-w-md">Contracts set scope, IP, credits and payment before work starts. Paid milestones are held and released on approval.</p>
          </div>
        )}
        <ul className="stagger space-y-2">
          {list.map(({ e, maker }) => (
            <li key={e.id}>
              <Link href={`/p/${slug}/contracts/${e.id}`} className="card card-hover flex items-center gap-3 p-4">
                <Avatar user={maker} size={36} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{e.title}</div>
                  <div className="text-xs text-fg-muted">
                    {maker.name} · {e.kind === "revshare" ? `${(e.terms as { revsharePercent?: number }).revsharePercent ?? 0}% rev-share` : formatMoney(totals.get(e.id) ?? 0, e.currency)}
                  </div>
                </div>
                <span className="chip-tint capitalize" style={{ "--c": STATUS_COLOR[e.status] } as React.CSSProperties}>{e.status}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {isLead && (
        <form action={createEngagement.bind(null, slug)} className="card h-fit space-y-3">
          <h2 className="h2 flex items-center gap-2"><FileSignature size={18} className="text-accent" /> New contract</h2>
          <select name="makerId" required className="input">
            <option value="">Who is it with?</option>
            {team.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
          <input name="title" required placeholder="Role / title, e.g. Environment artist — harbour" className="input" />
          <div className="grid grid-cols-2 gap-2">
            <select name="kind" className="input" defaultValue="work_for_hire">
              <option value="work_for_hire">Paid (work for hire)</option>
              <option value="revshare">Rev-share</option>
            </select>
            <select name="currency" className="input" defaultValue="usd">
              {["usd", "eur", "gbp", "cad", "aud"].map((c) => <option key={c} value={c}>{c.toUpperCase()}</option>)}
            </select>
          </div>
          <textarea name="scope" rows={3} placeholder="Scope: what's delivered, formats, poly/texture budgets, engine…" className="input" />
          <div>
            <label className="label text-xs">Milestones, one per line: <code>Title | amount</code> (no amount for rev-share)</label>
            <textarea name="milestones" rows={4} required defaultValue={"Dock kit | 600\nWarehouse kit | 600\nMarket stalls | 600"} className="input font-mono text-xs" />
          </div>
          <fieldset className="space-y-1 rounded-xl border border-border p-3 text-sm">
            <legend className="px-1 text-xs font-semibold text-fg-muted">Pricing (paid contracts)</legend>
            <label className="flex items-start gap-2"><input type="radio" name="pricingModel" value="percent" defaultChecked className="mt-1" /> <span>{PERCENT_FEE * 100}% fee taken from each payout</span></label>
            <label className="flex items-start gap-2"><input type="radio" name="pricingModel" value="flat" className="mt-1" /> <span>Flat {formatMoney(FLAT_FEE_CENTS, "usd")} contract fee paid by you, and the maker keeps 100% (cheaper above ~{formatMoney(Math.round(FLAT_FEE_CENTS / PERCENT_FEE), "usd")})</span></label>
          </fieldset>
          <input name="revsharePercent" type="number" min={0} max={100} step="0.5" placeholder="Rev-share % (rev-share contracts)" className="input" />
          <select name="ipAssignment" className="input" defaultValue="assign_on_payment">
            <option value="assign_on_payment">IP transfers to you when each milestone is paid</option>
            <option value="assign_on_signing">IP is yours from creation</option>
            <option value="license">Maker keeps IP and licenses it to the project</option>
          </select>
          <input name="credit" required placeholder='Credit line, e.g. "Environment Art"' className="input" />
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="portfolioRights" defaultChecked /> Maker may show the work after announcement</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="confidentiality" defaultChecked /> Confidential until announced</label>
          <button className="btn w-full">Create draft</button>
        </form>
      )}
    </div>
  );
}
