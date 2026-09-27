import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { markFunded, releaseForAsset, releaseMilestone } from "@/lib/engagements";
import { createDefaultChannels } from "@/lib/messages";
import type { PaymentProvider } from "@/lib/payments/provider";

const client = postgres(process.env.DATABASE_URL!, { max: 2, onnotice: () => {} });
const db = drizzle(client, { schema });
const { users, projects, engagements, engagementMilestones, payoutAccounts, assets } = schema;

const transfers: { amountCents: number; accountId: string }[] = [];
const fake: PaymentProvider = {
  name: "dev",
  createPayoutAccount: async () => ({ accountId: "a", onboardingUrl: "/" }),
  onboardingLink: async () => "/",
  payoutsEnabled: async () => true,
  checkout: async () => ({ url: "/", paymentRef: "r" }),
  transfer: async (t) => { transfers.push(t); return { transferRef: `tr_${transfers.length}` }; },
  refund: async () => {},
};

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "./drizzle" });
  await client`truncate users, projects, github_installations, github_deliveries, payment_events restart identity cascade`;
});
afterAll(async () => client.end());

describe("escrowed milestones", () => {
  it("funds, releases with fees, completes, and never double-pays", async () => {
    const [c] = await db.insert(users).values({ handle: "client", name: "Client" }).returning();
    const [m] = await db.insert(users).values({ handle: "maker", name: "Maker" }).returning();
    const [p] = await db.insert(projects).values({ slug: "esc", name: "Esc", engine: "godot", ownerId: c.id }).returning();
    await createDefaultChannels(db, p.id);
    const [e] = await db.insert(engagements).values({ projectId: p.id, clientId: c.id, makerId: m.id, title: "Env art", kind: "work_for_hire", status: "active", currency: "usd", pricingModel: "percent", terms: {} }).returning();
    const [asset] = await db.insert(assets).values({ projectId: p.id, title: "Dock", kind: "image" }).returning();
    const [m1, m2] = await db.insert(engagementMilestones).values([
      { engagementId: e.id, position: 0, title: "Dock kit", amountCents: 60000, status: "funding", paymentRef: "pay_1", assetId: asset.id },
      { engagementId: e.id, position: 1, title: "Market kit", amountCents: 40000, status: "funding", paymentRef: "pay_2" },
    ]).returning();

    expect(await markFunded(db, m1.id, "wrong_ref")).toBe(false);
    expect(await markFunded(db, m1.id, "pay_1")).toBe(true);
    expect(await markFunded(db, m1.id, "pay_1")).toBe(false);

    // No payout account yet: funds stay held.
    expect(await releaseMilestone(db, fake, m1.id)).toEqual({ ok: false, reason: "Maker has no payout account yet" });
    await db.insert(payoutAccounts).values({ userId: m.id, provider: "dev", accountId: "acct_maker", payoutsEnabled: true });

    // Approving the linked asset releases it: 6% fee kept, 94% transferred.
    await releaseForAsset(db, fake, asset.id);
    expect(transfers).toEqual([expect.objectContaining({ amountCents: 56400, accountId: "acct_maker" })]);
    const [r1] = await db.select().from(engagementMilestones).where(eq(engagementMilestones.id, m1.id));
    expect(r1).toMatchObject({ status: "released", platformFeeCents: 3600, transferRef: "tr_1" });
    expect(await releaseMilestone(db, fake, m1.id)).toMatchObject({ ok: false });
    expect(transfers).toHaveLength(1);

    await markFunded(db, m2.id, "pay_2");
    await releaseMilestone(db, fake, m2.id);
    const [done] = await db.select().from(engagements).where(eq(engagements.id, e.id));
    expect(done.status).toBe("completed");
  });

  it("rolls back the release if the transfer fails", async () => {
    const [e] = await db.select().from(engagements).limit(1);
    const [ms] = await db.insert(engagementMilestones).values({ engagementId: e.id, position: 9, title: "Extra", amountCents: 1000, status: "funded", paymentRef: "p" }).returning();
    const failing: PaymentProvider = { ...fake, transfer: async () => { throw new Error("card_declined"); } };
    expect(await releaseMilestone(db, failing, ms.id)).toEqual({ ok: false, reason: "card_declined" });
    const [after] = await db.select().from(engagementMilestones).where(eq(engagementMilestones.id, ms.id));
    expect(after.status).toBe("funded");
  });
});
