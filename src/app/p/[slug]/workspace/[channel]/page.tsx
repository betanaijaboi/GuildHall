import { and, asc, count, desc, eq, inArray, isNull } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { channels, messages, users } from "@/db/schema";
import { sendMessage } from "@/app/actions/workspace";
import { Avatar } from "@/components/avatar";
import { ChatComposer } from "@/components/chat-composer";
import { LiveRefresh } from "@/components/live-refresh";
import { MessageCardView } from "@/components/message-card";
import { loadProject } from "@/lib/access";
import { requireUser } from "@/lib/auth";

type Row = { message: typeof messages.$inferSelect; author: typeof users.$inferSelect | null };

export default async function ChannelPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; channel: string }>;
  searchParams: Promise<{ thread?: string }>;
}) {
  const { slug, channel: channelName } = await params;
  const { thread } = await searchParams;
  const user = await requireUser();
  const { project } = await loadProject(slug, user, "guest");

  const allChannels = await db.select().from(channels).where(eq(channels.projectId, project.id)).orderBy(asc(channels.createdAt));
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
      .limit(100)
  ).reverse();
  const replyCounts = roots.length
    ? await db
        .select({ root: messages.threadRootId, n: count() })
        .from(messages)
        .where(inArray(messages.threadRootId, roots.map((r) => r.message.id)))
        .groupBy(messages.threadRootId)
    : [];
  const repliesOf = new Map(replyCounts.map((r) => [r.root, r.n]));

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
      <aside>
        <ul className="space-y-0.5 text-sm">
          {allChannels.map((c) => (
            <li key={c.id}>
              <Link
                href={`/p/${slug}/workspace/${c.name}`}
                className={`block rounded-md px-2 py-1 ${c.id === channel.id ? "bg-muted font-medium" : "text-fg-muted hover:bg-muted"}`}
              >
                # {c.name}
              </Link>
            </li>
          ))}
        </ul>
      </aside>

      <section className="flex min-h-[60vh] flex-col rounded-lg border border-border bg-surface">
        <div className="border-b border-border px-4 py-2 font-medium">
          # {channel.name}
          {channel.kind === "github" && <span className="ml-2 text-xs font-normal text-fg-muted">activity from linked repos</span>}
        </div>
        <ol className="flex-1 space-y-4 overflow-y-auto p-4">
          {roots.length === 0 && <li className="text-sm text-fg-muted">No messages yet.</li>}
          {roots.map((r) => (
            <MessageRow key={r.message.id} row={r}>
              <Link href={`${base}?thread=${r.message.id}`} className="text-xs text-fg-muted hover:text-accent">
                {repliesOf.get(r.message.id) ? `${repliesOf.get(r.message.id)} repl${repliesOf.get(r.message.id) === 1 ? "y" : "ies"}` : "Reply"}
              </Link>
            </MessageRow>
          ))}
        </ol>
        <div className="border-t border-border p-3">
          <ChatComposer action={send} channelId={channel.id} placeholder={`Message #${channel.name}`} />
        </div>
      </section>

      {threadRoot && (
        <section className="flex flex-col rounded-lg border border-border bg-surface">
          <div className="flex items-center border-b border-border px-4 py-2 font-medium">
            Thread
            <Link href={base} className="ml-auto text-sm text-fg-muted">Close</Link>
          </div>
          <ol className="flex-1 space-y-4 overflow-y-auto p-4">
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
    <li className="flex gap-3">
      {author ? <Avatar name={name} url={author.avatarUrl} size={32} /> : <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">⚔︎</span>}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-medium">{name}</span>
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
