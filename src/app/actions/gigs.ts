"use server";

import { and, count, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { engagementMilestones, engagements, gigAddons, gigOrders, gigs, gigTiers, memberships, projects, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { contractHash } from "@/lib/contracts";
import { renderEngagementContract } from "@/lib/engagements";
import { formatMoney, parseMoney } from "@/lib/fees";
import { DEFAULT_GIG_SLOTS, orderTotal, TIER_LABEL, TIERS, validateTiers, type TierInput } from "@/lib/gigs";
import { channelByName, createDefaultChannels, postMessage } from "@/lib/messages";
import { slugify } from "@/lib/slug";
import { ENGINES, isSkillId, skillLabel } from "@/lib/taxonomy";

export async function createGig(form: FormData): Promise<void> {
  const user = await requireUser();
  const [{ n }] = await db.select({ n: count() }).from(gigs).where(and(eq(gigs.sellerId, user.id), eq(gigs.status, "active")));
  if (n >= DEFAULT_GIG_SLOTS) throw new Error(`You can have ${DEFAULT_GIG_SLOTS} active gigs; pause one first (ranks unlock more)`);
  const base = z
    .object({
      title: z.string().trim().min(5).max(100),
      skillId: z.string().refine(isSkillId, "Pick a specialisation"),
      description: z.string().trim().max(4000),
      formats: z.string().trim().max(300),
      coverUrl: z.string().trim().url().refine((u) => u.startsWith("https://"), "Use an https link").optional(),
      currency: z.enum(["usd", "eur", "gbp", "cad", "aud"]),
    })
    .parse({
      title: form.get("title"),
      skillId: form.get("skillId"),
      description: form.get("description") ?? "",
      formats: form.get("formats") ?? "",
      coverUrl: form.get("coverUrl") || undefined,
      currency: form.get("currency") ?? "usd",
    });
  const engines = form.getAll("engines").map(String).filter((e) => ENGINES.some((x) => x.id === e));
  const tiers: (TierInput & { description: string })[] = [];
  for (const tier of TIERS) {
    const name = String(form.get(`${tier}.name`) ?? "").trim();
    if (!name) continue;
    tiers.push({
      tier,
      name: name.slice(0, 60),
      description: String(form.get(`${tier}.description`) ?? "").trim().slice(0, 1000),
      priceCents: parseMoney(String(form.get(`${tier}.price`) ?? "")),
      deliveryDays: Number(form.get(`${tier}.days`)),
      revisions: Number(form.get(`${tier}.revisions`) ?? 1),
    });
  }
  const problem = validateTiers(tiers);
  if (problem) throw new Error(problem);
  const addons = String(form.get("addons") ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 8)
    .map((l) => {
      const [name, price] = l.split("|").map((x) => x.trim());
      if (!name || !price) throw new Error(`Add-on "${l}" should look like "Extra texture set | 40"`);
      return { name: name.slice(0, 80), priceCents: parseMoney(price) };
    });

  const gigId = await db.transaction(async (tx) => {
    const [gig] = await tx.insert(gigs).values({ sellerId: user.id, ...base, engines }).returning();
    await tx.insert(gigTiers).values(tiers.map((t) => ({ gigId: gig.id, ...t })));
    if (addons.length) await tx.insert(gigAddons).values(addons.map((a) => ({ gigId: gig.id, ...a })));
    return gig.id;
  });
  redirect(`/gigs/${gigId}`);
}

export async function setGigStatus(form: FormData): Promise<void> {
  const user = await requireUser();
  const id = z.string().uuid().parse(form.get("id"));
  const status = z.enum(["active", "paused"]).parse(form.get("status"));
  if (status === "active") {
    const [{ n }] = await db.select({ n: count() }).from(gigs).where(and(eq(gigs.sellerId, user.id), eq(gigs.status, "active")));
    if (n >= DEFAULT_GIG_SLOTS) throw new Error(`You can have ${DEFAULT_GIG_SLOTS} active gigs`);
  }
  await db.update(gigs).set({ status }).where(and(eq(gigs.id, id), eq(gigs.sellerId, user.id)));
  revalidatePath(`/gigs/${id}`);
}

/**
 * Ordering a gig creates a private mini-workspace (buyer = owner, seller = contractor) with the
 * contract pre-filled from the tier and sent for signature, so funding, asset review and
 * release all reuse the normal project flow.
 */
export async function orderGig(gigId: string, form: FormData): Promise<void> {
  const buyer = await requireUser();
  const tier = z.enum(TIERS).parse(form.get("tier"));
  const brief = z.string().trim().min(10, "Tell the seller what you need (10+ characters)").max(4000).parse(form.get("brief"));
  const pricingModel = z.enum(["percent", "flat"]).parse(form.get("pricingModel") ?? "percent");
  const addonIds = form.getAll("addons").map(String).filter((x) => /^[0-9a-f-]{36}$/.test(x));

  const [gig] = await db.select().from(gigs).where(eq(gigs.id, z.string().uuid().parse(gigId))).limit(1);
  if (!gig || gig.status !== "active") throw new Error("This gig isn't available");
  if (gig.sellerId === buyer.id) throw new Error("You can't order your own gig");
  const [t] = await db.select().from(gigTiers).where(and(eq(gigTiers.gigId, gig.id), eq(gigTiers.tier, tier))).limit(1);
  if (!t) throw new Error("That tier isn't offered");
  const addons = addonIds.length ? await db.select().from(gigAddons).where(and(eq(gigAddons.gigId, gig.id), inArray(gigAddons.id, addonIds))) : [];
  const total = orderTotal(t.priceCents, addons);
  const [seller] = await db.select().from(users).where(eq(users.id, gig.sellerId)).limit(1);

  let slug = slugify(`${gig.title} for ${buyer.handle}`);
  for (let i = 2; (await db.select({ id: projects.id }).from(projects).where(eq(projects.slug, slug)).limit(1)).length; i++) slug = `${slugify(`${gig.title} for ${buyer.handle}`)}-${i}`;

  const scope = [
    `${TIER_LABEL[tier]} package: ${t.name}. ${t.description}`.trim(),
    addons.length ? `Add-ons: ${addons.map((a) => a.name).join(", ")}.` : "",
    gig.formats ? `Delivered as: ${gig.formats}.` : "",
    `Delivery within ${t.deliveryDays} days, ${t.revisions} revision${t.revisions === 1 ? "" : "s"} included.`,
    `Brief from the client: ${brief}`,
  ].filter(Boolean).join("\n\n");

  const { project, engagement } = await db.transaction(async (tx) => {
    const [project] = await tx
      .insert(projects)
      .values({ slug, name: `${gig.title} for ${buyer.name}`, pitch: brief.slice(0, 500), engine: gig.engines[0] ?? "other", stage: "production", visibility: "private", engagement: "paid", ownerId: buyer.id })
      .returning();
    await tx.insert(memberships).values([
      { projectId: project.id, userId: buyer.id, role: "owner" },
      { projectId: project.id, userId: seller.id, role: "contractor", skillId: gig.skillId },
    ]);
    await createDefaultChannels(tx as unknown as typeof db, project.id);
    const [engagement] = await tx
      .insert(engagements)
      .values({
        projectId: project.id, clientId: buyer.id, makerId: seller.id, title: gig.title, kind: "work_for_hire", currency: gig.currency, pricingModel,
        terms: { scope, revsharePercent: null, ipAssignment: "assign_on_payment", credit: skillLabel(gig.skillId), portfolioRights: true, confidentiality: true },
      })
      .returning();
    await tx.insert(engagementMilestones).values({ engagementId: engagement.id, position: 0, title: `Delivery: ${t.name}`, amountCents: total });
    await tx.insert(gigOrders).values({ gigId: gig.id, buyerId: buyer.id, tier, addonIds: addons.map((a) => a.id), totalCents: total, brief, projectId: project.id, engagementId: engagement.id });
    return { project, engagement };
  });

  const text = await renderEngagementContract(db, engagement, project.name);
  await db.update(engagements).set({ status: "sent", contractText: text, contractHash: contractHash(text) }).where(eq(engagements.id, engagement.id));
  const general = await channelByName(db, project.id, "general");
  if (general) {
    await postMessage(db, {
      channelId: general.id,
      authorId: null,
      body: `🛒 ${buyer.name} ordered "${gig.title}" (${TIER_LABEL[tier]}, ${formatMoney(total, gig.currency)}) from @${seller.handle}.\n\nBrief: ${brief}\n\nNext: both sign the contract, then ${buyer.name} funds the milestone. Deliver previews in Assets for review.`,
    });
  }
  redirect(`/p/${project.slug}/contracts/${engagement.id}`);
}
