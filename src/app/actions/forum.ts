"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { channels, messages, messageVotes, projectRepos, tasks } from "@/db/schema";
import { loadProject, roleAtLeast } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { githubConfigured } from "@/lib/env";
import { normaliseTags, TOPIC_STATUSES } from "@/lib/forum";
import { createIssue } from "@/lib/github/client";
import { postMessage } from "@/lib/messages";

async function loadTopic(slug: string, messageId: string, min: "guest" | "member" | "lead" = "guest") {
  const user = await requireUser();
  const { project, role } = await loadProject(slug, user, min);
  const [row] = await db
    .select({ topic: messages, channel: channels })
    .from(messages)
    .innerJoin(channels, eq(channels.id, messages.channelId))
    .where(and(eq(messages.id, z.string().uuid().parse(messageId)), eq(channels.projectId, project.id), eq(channels.kind, "forum"), isNull(messages.threadRootId)))
    .limit(1);
  if (!row) throw new Error("Topic not found");
  return { user, project, role, ...row };
}

const reply = (channelId: string, topicId: string, body: string) => postMessage(db, { channelId, authorId: null, threadRootId: topicId, body });

export async function createTopic(slug: string, form: FormData): Promise<void> {
  const user = await requireUser();
  const { project } = await loadProject(slug, user, "guest");
  const channelId = z.string().uuid().parse(form.get("channelId"));
  const title = z.string().trim().min(3).max(140).parse(form.get("title"));
  const body = z.string().trim().min(1).max(8000).parse(form.get("body"));
  const tags = normaliseTags(String(form.get("tags") ?? ""));
  const [channel] = await db.select().from(channels).where(and(eq(channels.id, channelId), eq(channels.projectId, project.id), eq(channels.kind, "forum"))).limit(1);
  if (!channel) throw new Error("Forum not found");
  await db.insert(messages).values({ channelId: channel.id, authorId: user.id, title, body, tags, topicStatus: "open" });
  revalidatePath(`/p/${slug}/workspace/${channel.name}`);
}

export async function toggleVote(slug: string, messageId: string): Promise<void> {
  const { user, topic, channel } = await loadTopic(slug, messageId);
  const removed = await db.delete(messageVotes).where(and(eq(messageVotes.messageId, topic.id), eq(messageVotes.userId, user.id))).returning();
  if (!removed.length) await db.insert(messageVotes).values({ messageId: topic.id, userId: user.id });
  revalidatePath(`/p/${slug}/workspace/${channel.name}`);
}

export async function setTopicStatus(slug: string, messageId: string, form: FormData): Promise<void> {
  const { user, topic, channel } = await loadTopic(slug, messageId, "lead");
  const status = z.enum(TOPIC_STATUSES).parse(form.get("status"));
  if (status === topic.topicStatus) return;
  await db.update(messages).set({ topicStatus: status }).where(eq(messages.id, topic.id));
  await reply(channel.id, topic.id, `${user.name} marked this ${status}.`);
  revalidatePath(`/p/${slug}/workspace/${channel.name}`);
}

export async function setTopicTags(slug: string, messageId: string, form: FormData): Promise<void> {
  const { user, role, topic, channel } = await loadTopic(slug, messageId);
  if (topic.authorId !== user.id && !roleAtLeast(role, "lead")) throw new Error("Only the author or a lead can edit tags");
  await db.update(messages).set({ tags: normaliseTags(String(form.get("tags") ?? "")) }).where(eq(messages.id, topic.id));
  revalidatePath(`/p/${slug}/workspace/${channel.name}`);
}

export async function convertTopicToTask(slug: string, messageId: string): Promise<void> {
  const { user, project, topic, channel } = await loadTopic(slug, messageId, "member");
  if (topic.convertedTaskId) return;
  const link = `/p/${slug}/workspace/${channel.name}?thread=${topic.id}`;
  const [task] = await db.insert(tasks).values({ projectId: project.id, title: topic.title ?? topic.body.slice(0, 120), body: `${topic.body}\n\nFrom #${channel.name}: ${link}` }).returning();
  await db.update(messages).set({ convertedTaskId: task.id, topicStatus: topic.topicStatus === "open" ? "accepted" : topic.topicStatus }).where(eq(messages.id, topic.id));
  await reply(channel.id, topic.id, `${user.name} turned this into a task on the board.`);
  revalidatePath(`/p/${slug}/workspace/${channel.name}`);
  revalidatePath(`/p/${slug}/tasks`);
}

export async function convertTopicToIssue(slug: string, messageId: string): Promise<void> {
  const { user, project, topic, channel } = await loadTopic(slug, messageId, "lead");
  if (topic.convertedUrl) return;
  const [repo] = await db.select().from(projectRepos).where(eq(projectRepos.projectId, project.id)).limit(1);
  if (!repo || !githubConfigured()) throw new Error("Link a GitHub repo first");
  const issue = await createIssue(repo.installationId, repo.fullName, topic.title ?? "Proposal", `${topic.body}\n\n_Discussed in Guildhall #${channel.name}._`, (topic.tags ?? []).slice(0, 5));
  await db.update(messages).set({ convertedUrl: issue.url, topicStatus: topic.topicStatus === "open" ? "accepted" : topic.topicStatus }).where(eq(messages.id, topic.id));
  await reply(channel.id, topic.id, `${user.name} opened GitHub issue #${issue.number}: ${issue.url}`);
  revalidatePath(`/p/${slug}/workspace/${channel.name}`);
}
