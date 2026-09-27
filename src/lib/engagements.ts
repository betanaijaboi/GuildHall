import { and, asc, eq, inArray } from "drizzle-orm";
import type { Db } from "@/db";
import { engagementMilestones, engagements, payoutAccounts, users } from "@/db/schema";
import { renderContract, type ContractTerms } from "./contracts";
import { contractFeeCents, formatMoney, milestoneFees } from "./fees";
import { channelByName, postMessage } from "./messages";
import type { PaymentProvider } from "./payments/provider";

export type Engagement = typeof engagements.$inferSelect;
export type EngagementMilestone = typeof engagementMilestones.$inferSelect;

async function note(db: Db, projectId: string, engagementId: string, body: string) {
  const channel = await channelByName(db, projectId, "general");
  if (channel) await postMessage(db, { channelId: channel.id, authorId: null, threadKey: `engagement:${engagementId}`, body });
}

/** Record that a milestone's checkout succeeded. Idempotent. */
export async function markFunded(db: Db, milestoneId: string, paymentRef: string): Promise<boolean> {
  const [row] = await db
    .select({ m: engagementMilestones, e: engagements })
    .from(engagementMilestones)
    .innerJoin(engagements, eq(engagements.id, engagementMilestones.engagementId))
    .where(eq(engagementMilestones.id, milestoneId))
    .limit(1);
  if (!row || row.m.paymentRef !== paymentRef || (row.m.status !== "funding" && row.m.status !== "unfunded")) return false;
  await db.update(engagementMilestones).set({ status: "funded", fundedAt: new Date() }).where(eq(engagementMilestones.id, milestoneId));
  if (row.e.pricingModel === "flat" && !row.e.flatFeePaid) await db.update(engagements).set({ flatFeePaid: true }).where(eq(engagements.id, row.e.id));
  await note(db, row.e.projectId, row.e.id, `💰 "${row.m.title}" is funded (${formatMoney(row.m.amountCents ?? 0, row.e.currency)} held until approval).`);
  return true;
}

export function checkoutAmounts(e: Engagement, m: EngagementMilestone) {
  if (m.amountCents == null) throw new Error("This milestone has no amount");
  return { amountCents: m.amountCents, extraFeeCents: contractFeeCents(e.pricingModel, !e.flatFeePaid) };
}

/**
 * Pay the maker for a funded milestone. The platform keeps its fee (percent model) and transfers
 * the rest. Completes the engagement when every paid milestone is released.
 */
export async function releaseMilestone(db: Db, provider: PaymentProvider, milestoneId: string): Promise<{ ok: boolean; reason?: string }> {
  const [row] = await db
    .select({ m: engagementMilestones, e: engagements })
    .from(engagementMilestones)
    .innerJoin(engagements, eq(engagements.id, engagementMilestones.engagementId))
    .where(eq(engagementMilestones.id, milestoneId))
    .limit(1);
  if (!row) return { ok: false, reason: "Milestone not found" };
  const { m, e } = row;
  if (m.status !== "funded") return { ok: false, reason: `Milestone is ${m.status}, not funded` };
  const [account] = await db.select().from(payoutAccounts).where(eq(payoutAccounts.userId, e.makerId)).limit(1);
  if (!account?.payoutsEnabled) {
    await note(db, e.projectId, e.id, `"${m.title}" was approved, but the maker hasn't finished payout setup yet, so the funds stay held. They can finish it in Settings → Payouts.`);
    return { ok: false, reason: "Maker has no payout account yet" };
  }
  const fees = milestoneFees(m.amountCents!, e.pricingModel);
  // Claim the release first so two concurrent approvals can't both transfer.
  const claimed = await db
    .update(engagementMilestones)
    .set({ status: "released", releasedAt: new Date(), platformFeeCents: fees.platformFee })
    .where(and(eq(engagementMilestones.id, m.id), eq(engagementMilestones.status, "funded")))
    .returning();
  if (!claimed.length) return { ok: false, reason: "Already released" };
  try {
    const { transferRef } = await provider.transfer({ accountId: account.accountId, amountCents: fees.makerReceives, currency: e.currency, milestoneId: m.id, paymentRef: m.paymentRef! });
    await db.update(engagementMilestones).set({ transferRef }).where(eq(engagementMilestones.id, m.id));
  } catch (err) {
    await db.update(engagementMilestones).set({ status: "funded", releasedAt: null, platformFeeCents: 0 }).where(eq(engagementMilestones.id, m.id));
    return { ok: false, reason: (err as Error).message };
  }
  await note(db, e.projectId, e.id, `✅ "${m.title}" released: ${formatMoney(fees.makerReceives, e.currency)} paid to the maker.`);

  const all = await db.select().from(engagementMilestones).where(eq(engagementMilestones.engagementId, e.id)).orderBy(asc(engagementMilestones.position));
  if (all.every((x) => x.status === "released" || x.amountCents == null)) {
    await db.update(engagements).set({ status: "completed" }).where(eq(engagements.id, e.id));
    await note(db, e.projectId, e.id, `🏁 "${e.title}" is complete. Both sides can now leave a review.`);
  }
  return { ok: true };
}

/** Approving an asset releases any funded milestones tied to it. */
export async function releaseForAsset(db: Db, provider: PaymentProvider | null, assetId: string): Promise<void> {
  const rows = await db
    .select({ id: engagementMilestones.id })
    .from(engagementMilestones)
    .innerJoin(engagements, eq(engagements.id, engagementMilestones.engagementId))
    .where(and(eq(engagementMilestones.assetId, assetId), eq(engagementMilestones.status, "funded"), eq(engagements.status, "active")));
  if (!rows.length || !provider) return;
  for (const r of rows) await releaseMilestone(db, provider, r.id);
}

export async function partiesOf(db: Db, e: Engagement) {
  const people = await db.select().from(users).where(inArray(users.id, [e.clientId, e.makerId]));
  return { client: people.find((p) => p.id === e.clientId)!, maker: people.find((p) => p.id === e.makerId)! };
}

export type StoredTerms = Omit<ContractTerms, "kind" | "projectName" | "clientName" | "makerName" | "roleTitle" | "currency" | "milestones">;

export async function renderEngagementContract(db: Db, e: Engagement, projectName: string): Promise<string> {
  const { client, maker } = await partiesOf(db, e);
  const ms = await db.select().from(engagementMilestones).where(eq(engagementMilestones.engagementId, e.id)).orderBy(asc(engagementMilestones.position));
  return renderContract({
    ...(e.terms as StoredTerms),
    kind: e.kind,
    projectName,
    clientName: client.name,
    makerName: maker.name,
    roleTitle: e.title,
    currency: e.currency,
    milestones: ms.map((m) => ({ title: m.title, amountCents: m.amountCents })),
  });
}
