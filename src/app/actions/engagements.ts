"use server";

import { and, asc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { assets, engagementMilestones, engagementReviews, engagements, memberships, payoutAccounts } from "@/db/schema";
import { loadProject, roleAtLeast } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { contractHash } from "@/lib/contracts";
import { checkoutAmounts, partiesOf, releaseMilestone, renderEngagementContract } from "@/lib/engagements";
import { env } from "@/lib/env";
import { parseMoney } from "@/lib/fees";
import { channelByName, postMessage } from "@/lib/messages";
import { paymentProvider } from "@/lib/payments";
import { GITHUB_PERMISSION, grantRepoAccess } from "@/lib/repo-access";

const CURRENCIES = ["usd", "eur", "gbp", "cad", "aud"] as const;

const engagementSchema = z.object({
  makerId: z.string().uuid(),
  title: z.string().trim().min(2).max(120),
  kind: z.enum(["work_for_hire", "revshare"]),
  currency: z.enum(CURRENCIES),
  pricingModel: z.enum(["percent", "flat"]),
  scope: z.string().trim().max(4000),
  milestones: z.string().trim().min(1).max(4000),
  revsharePercent: z.coerce.number().min(0).max(100).optional(),
  ipAssignment: z.enum(["assign_on_payment", "assign_on_signing", "license"]),
  credit: z.string().trim().min(1).max(120),
  portfolioRights: z.boolean(),
  confidentiality: z.boolean(),
});

/** Milestones are entered one per line: "Dock kit | 600" (amount omitted for rev-share). */
function parseMilestones(input: string, paid: boolean) {
  const lines = input.split("\n").map((l) => l.trim()).filter(Boolean).slice(0, 20);
  return lines.map((line) => {
    const [title, amount] = line.split("|").map((x) => x.trim());
    if (!title) throw new Error(`Milestone "${line}" needs a title`);
    if (paid && !amount) throw new Error(`Milestone "${title}" needs an amount, e.g. "${title} | 600"`);
    return { title: title.slice(0, 120), amountCents: paid ? parseMoney(amount) : null };
  });
}

async function loadEngagement(slug: string, id: string) {
  const user = await requireUser();
  const { project, role } = await loadProject(slug, user, "guest");
  const [e] = await db.select().from(engagements).where(and(eq(engagements.id, z.string().uuid().parse(id)), eq(engagements.projectId, project.id))).limit(1);
  if (!e) throw new Error("Contract not found");
  if (e.clientId !== user.id && e.makerId !== user.id && !roleAtLeast(role, "lead")) throw new Error("Only the parties can see this contract");
  return { user, project, role, e };
}

async function notice(projectId: string, engagementId: string, body: string) {
  const channel = await channelByName(db, projectId, "general");
  if (channel) await postMessage(db, { channelId: channel.id, authorId: null, threadKey: `engagement:${engagementId}`, body });
}

export async function createEngagement(slug: string, form: FormData): Promise<void> {
  const user = await requireUser();
  const { project } = await loadProject(slug, user, "lead");
  const data = engagementSchema.parse({
    makerId: form.get("makerId"),
    title: form.get("title"),
    kind: form.get("kind"),
    currency: form.get("currency"),
    pricingModel: form.get("pricingModel") ?? "percent",
    scope: form.get("scope") ?? "",
    milestones: form.get("milestones"),
    revsharePercent: form.get("revsharePercent") || undefined,
    ipAssignment: form.get("ipAssignment"),
    credit: form.get("credit"),
    portfolioRights: form.get("portfolioRights") === "on",
    confidentiality: form.get("confidentiality") === "on",
  });
  if (data.makerId === user.id) throw new Error("Pick someone other than yourself");
  const [member] = await db.select().from(memberships).where(and(eq(memberships.projectId, project.id), eq(memberships.userId, data.makerId))).limit(1);
  if (!member) throw new Error("The maker must be on the project first (accept their application)");
  const paid = data.kind === "work_for_hire";
  const milestones = parseMilestones(data.milestones, paid);

  const [e] = await db
    .insert(engagements)
    .values({
      projectId: project.id,
      clientId: user.id,
      makerId: data.makerId,
      title: data.title,
      kind: data.kind,
      currency: data.currency,
      pricingModel: paid ? data.pricingModel : "percent",
      terms: {
        scope: data.scope,
        revsharePercent: paid ? null : (data.revsharePercent ?? 0),
        ipAssignment: data.ipAssignment,
        credit: data.credit,
        portfolioRights: data.portfolioRights,
        confidentiality: data.confidentiality,
      },
    })
    .returning();
  await db.insert(engagementMilestones).values(milestones.map((m, i) => ({ engagementId: e.id, position: i, ...m })));
  redirect(`/p/${slug}/contracts/${e.id}`);
}


export async function sendContract(slug: string, id: string): Promise<void> {
  const { user, project, e } = await loadEngagement(slug, id);
  if (e.clientId !== user.id || e.status !== "draft") throw new Error("Only the client can send a draft");
  const text = await renderEngagementContract(db, e, project.name);
  await db.update(engagements).set({ status: "sent", contractText: text, contractHash: contractHash(text) }).where(eq(engagements.id, e.id));
  const { maker } = await partiesOf(db, e);
  await notice(project.id, e.id, `📜 ${user.name} sent @${maker.handle} a contract to review and sign: "${e.title}".`);
  revalidatePath(`/p/${slug}/contracts/${e.id}`);
}

export async function signContract(slug: string, id: string, form: FormData): Promise<void> {
  const { user, project, e } = await loadEngagement(slug, id);
  if (e.status !== "sent" || !e.contractText) throw new Error("This contract isn't awaiting signatures");
  if (contractHash(e.contractText) !== e.contractHash) throw new Error("Contract text changed after it was sent; ask the client to resend");
  const typed = z.string().trim().min(2).max(120).parse(form.get("signature"));
  if (typed.toLowerCase() !== user.name.trim().toLowerCase()) throw new Error(`Type your full name exactly as "${user.name}" to sign`);
  if (form.get("agree") !== "on") throw new Error("Tick the box to confirm you agree");
  const isMaker = e.makerId === user.id;
  const isClient = e.clientId === user.id;
  if (!isMaker && !isClient) throw new Error("Only the parties can sign");
  const patch = isMaker ? { makerSignedName: typed, makerSignedAt: new Date() } : { clientSignedName: typed, clientSignedAt: new Date() };
  const [updated] = await db.update(engagements).set(patch).where(eq(engagements.id, e.id)).returning();

  if (updated.makerSignedAt && updated.clientSignedAt) {
    await db.update(engagements).set({ status: "active" }).where(eq(engagements.id, e.id));
    const { maker } = await partiesOf(db, e);
    const [m] = await db.select().from(memberships).where(and(eq(memberships.projectId, project.id), eq(memberships.userId, maker.id))).limit(1);
    const notes = [`🤝 "${e.title}" is signed by both sides and active.`];
    notes.push(...(await grantRepoAccess(db, project.id, maker.githubLogin, GITHUB_PERMISSION[m?.role ?? "contractor"])));
    await notice(project.id, e.id, notes.join("\n"));
  } else {
    await notice(project.id, e.id, `✍️ ${user.name} signed "${e.title}".`);
  }
  revalidatePath(`/p/${slug}/contracts/${e.id}`);
}

export async function cancelEngagement(slug: string, id: string): Promise<void> {
  const { user, e } = await loadEngagement(slug, id);
  if (e.clientId !== user.id || !["draft", "sent"].includes(e.status)) throw new Error("Only unsigned contracts can be cancelled");
  await db.update(engagements).set({ status: "cancelled" }).where(eq(engagements.id, e.id));
  revalidatePath(`/p/${slug}/contracts`);
  redirect(`/p/${slug}/contracts`);
}

export async function linkMilestoneAsset(slug: string, id: string, form: FormData): Promise<void> {
  const { user, project, e } = await loadEngagement(slug, id);
  if (e.clientId !== user.id) throw new Error("Only the client can link assets");
  const milestoneId = z.string().uuid().parse(form.get("milestoneId"));
  const assetId = z.string().uuid().optional().parse(form.get("assetId") || undefined);
  if (assetId) {
    const [a] = await db.select({ id: assets.id }).from(assets).where(and(eq(assets.id, assetId), eq(assets.projectId, project.id))).limit(1);
    if (!a) throw new Error("Asset not found");
  }
  await db.update(engagementMilestones).set({ assetId: assetId ?? null }).where(and(eq(engagementMilestones.id, milestoneId), eq(engagementMilestones.engagementId, e.id)));
  revalidatePath(`/p/${slug}/contracts/${e.id}`);
}

export async function fundMilestone(slug: string, id: string, form: FormData): Promise<void> {
  const { user, e } = await loadEngagement(slug, id);
  if (e.clientId !== user.id || e.status !== "active" || e.kind !== "work_for_hire") throw new Error("Only the client can fund an active paid contract");
  const milestoneId = z.string().uuid().parse(form.get("milestoneId"));
  const [m] = await db.select().from(engagementMilestones).where(and(eq(engagementMilestones.id, milestoneId), eq(engagementMilestones.engagementId, e.id))).limit(1);
  if (!m || (m.status !== "unfunded" && m.status !== "funding")) throw new Error("Milestone can't be funded");
  const { amountCents, extraFeeCents } = checkoutAmounts(e, m);
  const base = `${env.appUrl}/p/${slug}/contracts/${e.id}`;
  const { url, paymentRef } = await paymentProvider().checkout({
    milestoneId: m.id, engagementId: e.id, description: `${e.title}: ${m.title}`, amountCents, extraFeeCents, currency: e.currency,
    successUrl: `${base}?funded=1`, cancelUrl: base,
  });
  await db.update(engagementMilestones).set({ status: "funding", paymentRef }).where(eq(engagementMilestones.id, m.id));
  redirect(url);
}

export async function approveAndRelease(slug: string, id: string, form: FormData): Promise<void> {
  const { user, e } = await loadEngagement(slug, id);
  if (e.clientId !== user.id) throw new Error("Only the client can release payment");
  const milestoneId = z.string().uuid().parse(form.get("milestoneId"));
  const [m] = await db.select().from(engagementMilestones).where(and(eq(engagementMilestones.id, milestoneId), eq(engagementMilestones.engagementId, e.id))).limit(1);
  if (!m) throw new Error("Milestone not found");
  const result = await releaseMilestone(db, paymentProvider(), m.id);
  if (!result.ok && result.reason !== "Maker has no payout account yet") throw new Error(result.reason);
  revalidatePath(`/p/${slug}/contracts/${e.id}`);
}

export async function disputeMilestone(slug: string, id: string, form: FormData): Promise<void> {
  const { user, project, e } = await loadEngagement(slug, id);
  if (e.clientId !== user.id && e.makerId !== user.id) throw new Error("Only the parties can open a dispute");
  const milestoneId = z.string().uuid().parse(form.get("milestoneId"));
  const reason = z.string().trim().min(5).max(1000).parse(form.get("reason"));
  const updated = await db
    .update(engagementMilestones)
    .set({ status: "disputed", disputeReason: reason })
    .where(and(eq(engagementMilestones.id, milestoneId), eq(engagementMilestones.engagementId, e.id), eq(engagementMilestones.status, "funded")))
    .returning();
  if (!updated.length) throw new Error("Only funded milestones can be disputed");
  await notice(project.id, e.id, `⚠ ${user.name} opened a dispute on "${updated[0].title}". Funds stay held while it's resolved.`);
  revalidatePath(`/p/${slug}/contracts/${e.id}`);
}

export async function leaveReview(slug: string, id: string, form: FormData): Promise<void> {
  const { user, e } = await loadEngagement(slug, id);
  if (e.status !== "completed") throw new Error("Reviews open once the contract is complete");
  if (e.clientId !== user.id && e.makerId !== user.id) throw new Error("Only the parties can review");
  const rating = z.coerce.number().int().min(1).max(5).parse(form.get("rating"));
  const body = z.string().trim().max(1000).parse(form.get("body") ?? "");
  await db
    .insert(engagementReviews)
    .values({ engagementId: e.id, fromId: user.id, toId: user.id === e.clientId ? e.makerId : e.clientId, rating, body })
    .onConflictDoNothing();
  revalidatePath(`/p/${slug}/contracts/${e.id}`);
}

// --- Payouts --------------------------------------------------------------------------------

export async function startPayoutOnboarding(): Promise<void> {
  const user = await requireUser();
  const provider = paymentProvider();
  const returnUrl = `${env.appUrl}/settings/payouts`;
  const [existing] = await db.select().from(payoutAccounts).where(eq(payoutAccounts.userId, user.id)).limit(1);
  if (existing) redirect(await provider.onboardingLink(existing.accountId, returnUrl));
  const { accountId, onboardingUrl } = await provider.createPayoutAccount({ id: user.id }, returnUrl);
  await db.insert(payoutAccounts).values({ userId: user.id, provider: provider.name, accountId, payoutsEnabled: provider.name === "dev" });
  redirect(onboardingUrl);
}

export async function refreshPayoutStatus(): Promise<void> {
  const user = await requireUser();
  const [acct] = await db.select().from(payoutAccounts).where(eq(payoutAccounts.userId, user.id)).limit(1);
  if (!acct) return;
  const enabled = await paymentProvider().payoutsEnabled(acct.accountId);
  await db.update(payoutAccounts).set({ payoutsEnabled: enabled }).where(eq(payoutAccounts.userId, user.id));
  revalidatePath("/settings/payouts");
}

