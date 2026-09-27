import { and, asc, count, desc, eq, inArray, isNull, max } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { channels, messages, messageVotes, projectRepos, users } from "@/db/schema";
import { ForumBoard, TopicHeader, type TopicCard } from "@/components/forum";
import { sortTopics, type TopicSort } from "@/lib/forum";
import { sendMessage } from "@/app/actions/workspace";
import { Hash, MessagesSquare, Rocket, X } from "lucide-react";
import { Avatar, BotAvatar } from "@/components/avatar";
import { GithubIcon } from "@/components/icons";
import { ChatComposer } from "@/components/chat-composer";
import { LiveRefresh } from "@/components/live-refresh";
import { MessageCardView } from "@/components/message-card";
import { loadProject, roleAtLeast } from "@/lib/access";
import { createDefaultChannels, DEFAULT_CHANNELS } from "@/lib/messages";
import { requireUser } from "@/lib/auth";
import { githubConfigured } from "@/lib/env";

type Row = { message: typeof messages.$inferSelect; author: typeof users.$inferSelect | null };

export default async function ChannelPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; channel: string }>;
  searchParams: Promise<{ thread?: string; tag?: string; status?: string; sort?: string }>;
}) {
  const { slug, channel: channelName } = await params;
  const { thread, tag, status, sort: sortParam } = await searchParams;
  const user = await requireUser();
  const { project, role } = await loadProject(slug, user, "guest");
  // Projects created before a default channel existed (e.g. #proposals) get it on first visit.
  await createDefaultChannels(db, project.id);

  const order = (name: string) => { const i = DEFAULT_CHANNELS.findIndex((c) => c.name === name); return i < 0 ? 99 : i; };
  const allChannels = (await db.select().from(channels).where(eq(channels.projectId, project.id)).orderBy(asc(channels.createdAt))).sort((a, b) => order(a.name) - order(b.name));
  const channel = allChannels.find((c) => c.name === channelName);
  if (!channel) notFound();

  // Latest 100 top-level messages, shown oldest → newest.
  const roots: Row[] = (
    await db
      .select({ message: messages, author: users })
      .from(messages)
      .leftJoin(users, eq(users.id, messages.authorId))
      .where(and(eq(messages.channelId, channel.id), isNull(messages.threadRootId)))
      .orderBy(desc(messages.createdAt))
      .limit(channel.kind === "forum" ? 300 : 100)
  ).reverse();
  const replyCounts = roots.length
    ? await db
        .select({ root: messages.threadRootId, n: count() })
        .from(messages)
        .where(inArray(messages.threadRootId, roots.map((r) => r.message.id)))
        .groupBy(messages.threadRootId)
    : [];
  const repliesOf = new Map(replyCounts.map((r) => [r.root, r.n]));

  // Forum channels (C13): topics with votes, status and tags instead of a chat stream.
  let topics: TopicCard[] = [];
  let hasRepo = false;
  const sort: TopicSort = sortParam === "new" || sortParam === "active" ? sortParam : "votes";
  if (channel.kind === "forum" && roots.length) {
    const ids = roots.map((r) => r.message.id);
    const [votes, mine, last, repo] = await Promise.all([
      db.select({ id: messageVotes.messageId, n: count() }).from(messageVotes).where(inArray(messageVotes.messageId, ids)).groupBy(messageVotes.messageId),
      db.select({ id: messageVotes.messageId }).from(messageVotes).where(and(inArray(messageVotes.messageId, ids), eq(messageVotes.userId, user.id))),
      db.select({ root: messages.threadRootId, at: max(messages.createdAt) }).from(messages).where(inArray(messages.threadRootId, ids)).groupBy(messages.threadRootId),
      db.select({ id: projectRepos.repoId }).from(projectRepos).where(eq(projectRepos.projectId, project.id)).limit(1),
    ]);
    hasRepo = repo.length > 0 && githubConfigured();
    const voteMap = new Map(votes.map((v) => [v.id, v.n]));
    const mineSet = new Set(mine.map((m) => m.id));
    const lastMap = new Map(last.map((l) => [l.root, l.at]));
    topics = roots
      .filter((r) => r.message.title)
      .map((r) => ({
        id: r.message.id,
        title: r.message.title!,
        body: r.message.body,
        tags: r.message.tags ?? [],
        status: r.message.topicStatus ?? "open",
        votes: voteMap.get(r.message.id) ?? 0,
        votedByMe: mineSet.has(r.message.id),
        replies: repliesOf.get(r.message.id) ?? 0,
        createdAt: r.message.createdAt,
        lastActivity: lastMap.get(r.message.id) ?? r.message.createdAt,
        author: r.author,
        convertedTaskId: r.message.convertedTaskId,
        convertedUrl: r.message.convertedUrl,
      }));
  }
  const shownTopics = sortTopics(topics.filter((t) => (!tag || t.tags.includes(tag)) && (!status || t.status === status)), sort);

  const threadRoot = thread && /^[0-9a-f-]{36}$/.test(thread)
    ? (await db
        .select({ message: messages, author: users })
        .from(messages)
        .leftJoin(users, eq(users.id, messages.authorId))
        .where(and(eq(messages.id, thread), eq(messages.channelId, channel.id)))
        .limit(1))[0]
    : undefined;
  const threadReplies: Row[] = threadRoot
    ? await db
        .select({ message: messages, author: users })
        .from(messages)
        .leftJoin(users, eq(users.id, messages.authorId))
        .where(eq(messages.threadRootId, threadRoot.message.id))
        .orderBy(asc(messages.createdAt))
    : [];

  const send = sendMessage.bind(null, slug);
  const base = `/p/${slug}/workspace/${channel.name}`;

  return (
    <div className={`grid gap-4 ${threadRoot ? "md:grid-cols-[180px_1fr_340px]" : "md:grid-cols-[180px_1fr]"}`}>
      <LiveRefresh channelId={channel.id} />
      <aside className="scroll-x md:overflow-visible">
        <div className="mb-2 hidden px-3 text-xs font-semibold uppercase tracking-wider text-fg-muted md:block">Channels</div>
        <ul className="flex gap-1 text-sm md:block md:space-y-0.5">
          {allChannels.map((c) => (
            <li key={c.id}>
              <Link
                href={`/p/${slug}/workspace/${c.name}`}
                className={`flex items-center gap-2 rounded-xl px-3 py-2 transition-colors ${
                  c.id === channel.id ? "bg-gradient-to-r from-violet-500/20 to-cyan-500/5 font-medium text-fg" : "text-fg-muted hover:bg-muted hover:text-fg"
                }`}
              >
                <ChannelIcon name={c.name} kind={c.kind} />
                {c.name}
              </Link>
            </li>
          ))}
        </ul>
      </aside>

      <section className="card flex min-h-[65vh] flex-col p-0">
        <div className="flex items-center gap-2 border-b border-border px-5 py-3">
          <ChannelIcon name={channel.name} kind={channel.kind} />
          <span className="font-display font-semibold">{channel.name}</span>
          {channel.kind === "github" && <span className="text-xs text-fg-muted">activity from linked repos</span>}
          {channel.kind === "forum" && <span className="text-xs text-fg-muted">proposals and ideas, voted by the party</span>}
          <span className="ml-auto flex items-center gap-2 text-xs text-fg-muted"><span className="live-dot" /> Live</span>
        </div>
        {channel.kind === "forum" ? (
          <ForumBoard slug={slug} channel={channel} topics={shownTopics} filters={{ tag, status, sort }} />
        ) : (
        <>
        <ol className="flex-1 space-y-1 overflow-y-auto p-3">
          {roots.length === 0 && (
            <li className="flex flex-col items-center gap-2 py-16 text-center text-sm text-fg-muted">
              <span className="text-4xl animate-float">💬</span>
              Say hi to your party. This is the start of #{channel.name}.
            </li>
          )}
          {roots.map((r) => (
            <MessageRow key={r.message.id} row={r}>
              <Link href={`${base}?thread=${r.message.id}`} className={`mt-1 inline-block text-xs font-medium hover:text-accent ${repliesOf.get(r.message.id) ? "text-accent" : "text-fg-muted opacity-0 transition-opacity group-hover:opacity-100"}`}>
                {repliesOf.get(r.message.id) ? `${repliesOf.get(r.message.id)} repl${repliesOf.get(r.message.id) === 1 ? "y" : "ies"}` : "Reply"}
              </Link>
            </MessageRow>
          ))}
        </ol>
        <div className="border-t border-border p-3">
          <ChatComposer action={send} channelId={channel.id} placeholder={`Message #${channel.name}`} />
        </div>
        </>
        )}
      </section>

      {threadRoot && (
        <section className="card flex animate-fade-up flex-col p-0">
          <div className="flex items-center border-b border-border px-5 py-3 font-display font-semibold">
            {channel.kind === "forum" ? "Topic" : "Thread"}
            <Link href={base} className="btn-ghost ml-auto" aria-label="Close thread"><X size={16} /></Link>
          </div>
          {channel.kind === "forum" && topics.find((t) => t.id === threadRoot.message.id) && (
            <TopicHeader
              slug={slug}
              topic={topics.find((t) => t.id === threadRoot.message.id)!}
              canLead={roleAtLeast(role, "lead")}
              canWork={roleAtLeast(role, "member")}
              hasRepo={hasRepo}
            />
          )}
          <ol className="flex-1 space-y-1 overflow-y-auto p-3">
            <MessageRow row={threadRoot} />
            {threadReplies.map((r) => <MessageRow key={r.message.id} row={r} />)}
          </ol>
          <div className="border-t border-border p-3">
            <ChatComposer action={send} channelId={channel.id} threadRootId={threadRoot.message.id} placeholder="Reply…" />
          </div>
        </section>
      )}
    </div>
  );
}

function MessageRow({ row, children }: { row: Row; children?: React.ReactNode }) {
  const { message, author } = row;
  const name = author?.name ?? "Guildhall";
  return (
    <li className="group flex animate-fade-up gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-muted/50">
      {author ? <Avatar user={author} size={38} /> : <BotAvatar size={38} />}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-semibold">{name}</span>
          {!author && <span className="rounded bg-accent/15 px-1.5 text-[10px] font-semibold uppercase tracking-wide text-accent">bot</span>}
          <time className="text-xs text-fg-muted" dateTime={message.createdAt.toISOString()}>
            {message.createdAt.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}
          </time>
        </div>
        <p className="whitespace-pre-wrap break-words text-sm">{message.body}</p>
        {message.card && <MessageCardView card={message.card} />}
        {children}
      </div>
    </li>
  );
}

function ChannelIcon({ name, kind }: { name: string; kind: string }) {
  if (kind === "github") return <GithubIcon size={15} />;
  if (kind === "forum") return <MessagesSquare size={15} />;
  if (name === "builds") return <Rocket size={15} />;
  return <Hash size={15} />;
}
