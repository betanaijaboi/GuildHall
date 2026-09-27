import { and, desc, eq, gte, ilike, inArray, isNull, ne, or } from "drizzle-orm";
import type { Db } from "@/db";
import { assets, assetVersions, channels, engagementMilestones, engagements, handOrder, memberships, messages, projects, tasks, users } from "@/db/schema";
import { formatMoney } from "./fees";
import { mentions, orderHand, type HandItem } from "./hand";
import { isStageLocked } from "./pipelines";

export async function loadHand(db: Db, user: { id: string; handle: string }): Promise<HandItem[]> {
  const mine = await db
    .select({ project: projects, role: memberships.role })
    .from(memberships)
    .innerJoin(projects, eq(projects.id, memberships.projectId))
    .where(eq(memberships.userId, user.id));
  if (!mine.length) return [];
  const projectIds = mine.map((m) => m.project.id);
  const byId = new Map(mine.map((m) => [m.project.id, m.project]));
  const ref = (id: string) => ({ slug: byId.get(id)!.slug, name: byId.get(id)!.name });
  const reviewerProjects = mine.filter((m) => ["member", "lead", "owner"].includes(m.role)).map((m) => m.project.id);
  const since = new Date(Date.now() - 14 * 86_400_000);

  const [myTasks, reviewable, contracts, recent] = await Promise.all([
    db.select().from(tasks).where(and(inArray(tasks.projectId, projectIds), eq(tasks.assigneeId, user.id), ne(tasks.status, "done"))),
    reviewerProjects.length
      ? db
          .select({ asset: assets, uploadedBy: assetVersions.uploadedBy })
          .from(assets)
          .innerJoin(assetVersions, eq(assetVersions.assetId, assets.id))
          .where(and(inArray(assets.projectId, reviewerProjects), eq(assets.status, "in_review")))
          .orderBy(desc(assetVersions.version))
      : Promise.resolve([]),
    db
      .select({ e: engagements, m: engagementMilestones })
      .from(engagements)
      .leftJoin(engagementMilestones, eq(engagementMilestones.engagementId, engagements.id))
      .where(and(inArray(engagements.projectId, projectIds), or(eq(engagements.clientId, user.id), eq(engagements.makerId, user.id)))),
    db
      .select({ m: messages, channel: channels, author: users.name })
      .from(messages)
      .innerJoin(channels, eq(channels.id, messages.channelId))
      .leftJoin(users, eq(users.id, messages.authorId))
      .where(and(inArray(channels.projectId, projectIds), gte(messages.createdAt, since), ilike(messages.body, `%@${user.handle}%`), or(isNull(messages.authorId), ne(messages.authorId, user.id))))
      .orderBy(desc(messages.createdAt))
      .limit(30),
  ]);

  const items: HandItem[] = [];

  // Pipeline stages need their siblings to know whether they're locked.
  const pipelineIds = [...new Set(myTasks.map((t) => t.pipelineItemId).filter((x): x is string => !!x))];
  const siblings = pipelineIds.length ? await db.select({ item: tasks.pipelineItemId, idx: tasks.stageIndex, status: tasks.status }).from(tasks).where(inArray(tasks.pipelineItemId, pipelineIds)) : [];
  for (const t of myTasks) {
    let locked = false;
    if (t.pipelineItemId && t.stageIndex != null) {
      const chain = siblings.filter((s) => s.item === t.pipelineItemId).sort((a, b) => a.idx! - b.idx!).map((s) => s.status);
      locked = isStageLocked(chain, t.stageIndex);
    }
    items.push({
      key: `task:${t.id}`, kind: "task", title: t.title, href: `/p/${ref(t.projectId).slug}/${t.pipelineItemId ? "pipelines" : "tasks"}`,
      detail: locked ? "Waiting on the previous stage" : t.status === "doing" ? "In progress" : "To do", project: ref(t.projectId), at: t.createdAt, locked, doing: t.status === "doing",
    });
  }

  const seenAsset = new Set<string>();
  for (const { asset, uploadedBy } of reviewable) {
    if (seenAsset.has(asset.id)) continue; // latest version first
    seenAsset.add(asset.id);
    if (uploadedBy === user.id) continue;
    items.push({ key: `review:${asset.id}`, kind: "review", title: asset.title, detail: "Waiting for your review", href: `/p/${ref(asset.projectId).slug}/assets/${asset.id}`, project: ref(asset.projectId), at: asset.updatedAt });
  }

  const seenSign = new Set<string>();
  for (const { e, m } of contracts) {
    const href = `/p/${ref(e.projectId).slug}/contracts/${e.id}`;
    const mySigned = e.clientId === user.id ? e.clientSignedAt : e.makerSignedAt;
    if (e.status === "sent" && !mySigned && !seenSign.has(e.id)) {
      seenSign.add(e.id);
      items.push({ key: `sign:${e.id}`, kind: "sign", title: e.title, detail: "Contract waiting for your signature", href, project: ref(e.projectId), at: e.createdAt });
    }
    if (!m || e.status !== "active" || e.clientId !== user.id || m.amountCents == null) continue;
    if (m.status === "funded") items.push({ key: `release:${m.id}`, kind: "release", title: m.title, detail: `Approve & release ${formatMoney(m.amountCents, e.currency)}`, href, project: ref(e.projectId), at: m.fundedAt ?? e.createdAt });
    if (m.status === "unfunded") items.push({ key: `fund:${m.id}`, kind: "fund", title: m.title, detail: `Fund ${formatMoney(m.amountCents, e.currency)} so work can start`, href, project: ref(e.projectId), at: e.createdAt });
  }

  for (const { m, channel, author } of recent) {
    if (!mentions(m.body, user.handle)) continue;
    const root = m.threadRootId ?? m.id;
    items.push({
      key: `mention:${m.id}`, kind: "mention", title: `${author ?? "Guildhall"} in #${channel.name}`, detail: m.body.slice(0, 140),
      href: `/p/${ref(channel.projectId).slug}/workspace/${channel.name}?thread=${root}`, project: ref(channel.projectId), at: m.createdAt,
    });
  }

  const custom = await db.select().from(handOrder).where(eq(handOrder.userId, user.id));
  return orderHand(items, new Map(custom.map((c) => [c.itemKey, c.position])));
}
