import { ArrowBigUp, BookOpen, CircleDot, ExternalLink, ListChecks, MessageSquare, Plus } from "lucide-react";
import Link from "next/link";
import { convertTopicToIssue, convertTopicToTask, createTopic, setTopicStatus, setTopicTags, toggleVote } from "@/app/actions/forum";
import { promoteTopicToPage } from "@/app/actions/gdd";
import { Avatar } from "./avatar";
import { STATUS_COLOR, SUGGESTED_TAGS, TOPIC_STATUSES, type TopicSort, type TopicStatus } from "@/lib/forum";

export type TopicCard = {
  id: string;
  title: string;
  body: string;
  tags: string[];
  status: TopicStatus;
  votes: number;
  votedByMe: boolean;
  replies: number;
  createdAt: Date;
  lastActivity: Date;
  author: { handle: string; name: string; avatarUrl: string | null; avatar: unknown } | null;
  convertedTaskId: string | null;
  convertedUrl: string | null;
};

export function StatusPill({ status }: { status: TopicStatus }) {
  return <span className="chip-tint capitalize" style={{ "--c": STATUS_COLOR[status] } as React.CSSProperties}><CircleDot size={11} /> {status}</span>;
}

export function VoteButton({ slug, id, votes, voted }: { slug: string; id: string; votes: number; voted: boolean }) {
  return (
    <form action={toggleVote.bind(null, slug, id)}>
      <button
        className={`flex w-12 flex-col items-center rounded-xl border py-1.5 text-sm font-bold transition-all active:scale-95 ${voted ? "border-accent bg-accent/15 text-accent" : "border-border text-fg-muted hover:border-accent/50 hover:text-fg"}`}
        aria-label={voted ? "Remove vote" : "Upvote"}
      >
        <ArrowBigUp size={20} className={voted ? "fill-current" : ""} />
        {votes}
      </button>
    </form>
  );
}

export function ForumBoard({
  slug,
  channel,
  topics,
  filters,
}: {
  slug: string;
  channel: { id: string; name: string };
  topics: TopicCard[];
  filters: { tag?: string; status?: string; sort: TopicSort };
}) {
  const base = `/p/${slug}/workspace/${channel.name}`;
  const q = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams(Object.entries({ tag: filters.tag, status: filters.status, sort: filters.sort, ...patch }).filter(([, v]) => v) as [string, string][]);
    return `${base}?${p}`;
  };
  const allTags = [...new Set(topics.flatMap((t) => t.tags))].sort();
  return (
    <div className="flex flex-1 flex-col gap-3 p-4">
      <details className="group rounded-2xl border border-dashed border-border open:border-solid open:border-accent/50">
        <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-semibold text-fg-muted hover:text-fg"><Plus size={16} /> New topic</summary>
        <form action={createTopic.bind(null, slug)} className="space-y-2 px-4 pb-4">
          <input type="hidden" name="channelId" value={channel.id} />
          <input name="title" required minLength={3} maxLength={140} placeholder="Proposal: a tide mechanic that floods low districts at night" className="input text-base" />
          <textarea name="body" required rows={4} placeholder="What, why, and what it would take. Link references or mockups." className="input" />
          <input name="tags" placeholder={`Tags (comma separated): ${SUGGESTED_TAGS.slice(0, 5).join(", ")}`} className="input" />
          <button className="btn">Post topic</button>
        </form>
      </details>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        {(["votes", "active", "new"] as const).map((s) => (
          <Link key={s} href={q({ sort: s })} className={`chip px-2.5 py-1 capitalize ${filters.sort === s ? "border-accent text-fg" : ""}`}>{s === "votes" ? "Top" : s}</Link>
        ))}
        <span className="mx-1 h-4 w-px bg-border" />
        <Link href={q({ status: undefined })} className={`chip px-2.5 py-1 ${!filters.status ? "border-accent text-fg" : ""}`}>Any status</Link>
        {TOPIC_STATUSES.map((s) => (
          <Link key={s} href={q({ status: s })} className="chip-tint px-2.5 py-1 capitalize" style={{ "--c": STATUS_COLOR[s], outline: filters.status === s ? `2px solid ${STATUS_COLOR[s]}` : undefined } as React.CSSProperties}>{s}</Link>
        ))}
        {allTags.length > 0 && <span className="mx-1 h-4 w-px bg-border" />}
        {allTags.map((t) => (
          <Link key={t} href={q({ tag: filters.tag === t ? undefined : t })} className={`chip px-2.5 py-1 ${filters.tag === t ? "border-accent text-fg" : ""}`}>#{t}</Link>
        ))}
      </div>

      {topics.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-12 text-center text-sm text-fg-muted">
          <span className="animate-float text-4xl">🗳️</span>
          No topics yet. Pitch an idea, and the party votes.
        </div>
      ) : (
        <ul className="stagger space-y-2">
          {topics.map((t) => (
            <li key={t.id} className="card card-hover flex gap-3 p-3">
              <VoteButton slug={slug} id={t.id} votes={t.votes} voted={t.votedByMe} />
              <Link href={`${base}?${new URLSearchParams({ ...(filters.sort ? { sort: filters.sort } : {}), thread: t.id })}`} className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{t.title}</span>
                  <StatusPill status={t.status} />
                  {t.convertedTaskId && <span className="chip"><ListChecks size={11} /> task</span>}
                  {t.convertedUrl && <span className="chip"><ExternalLink size={11} /> issue</span>}
                </div>
                <p className="mt-1 line-clamp-2 text-sm text-fg-muted">{t.body}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-fg-muted">
                  {t.author && <span className="flex items-center gap-1.5"><Avatar user={t.author} size={18} /> {t.author.name}</span>}
                  {t.tags.map((tag) => <span key={tag} className="chip">#{tag}</span>)}
                  <span className="ml-auto flex items-center gap-1"><MessageSquare size={12} /> {t.replies}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function TopicHeader({ slug, topic, canLead, canWork, hasRepo }: { slug: string; topic: TopicCard; canLead: boolean; canWork: boolean; hasRepo: boolean }) {
  return (
    <div className="space-y-3 border-b border-border px-5 py-4">
      <div className="flex items-start gap-3">
        <VoteButton slug={slug} id={topic.id} votes={topic.votes} voted={topic.votedByMe} />
        <div className="min-w-0">
          <h3 className="font-display text-lg font-semibold leading-snug">{topic.title}</h3>
          <div className="mt-1 flex flex-wrap gap-1.5"><StatusPill status={topic.status} />{topic.tags.map((t) => <span key={t} className="chip">#{t}</span>)}</div>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 text-xs">
        {canLead && (
          <form key={topic.status} action={setTopicStatus.bind(null, slug, topic.id)} className="flex gap-1">
            <select name="status" defaultValue={topic.status} className="input py-1 text-xs">{TOPIC_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}</select>
            <button className="btn-secondary px-2 py-1 text-xs">Set</button>
          </form>
        )}
        {canWork && !topic.convertedTaskId && (
          <form action={convertTopicToTask.bind(null, slug, topic.id)}><button className="btn-secondary px-2 py-1 text-xs"><ListChecks size={13} /> Make task</button></form>
        )}
        {canWork && (
          <form action={promoteTopicToPage.bind(null, slug, topic.id)}><button className="btn-secondary px-2 py-1 text-xs"><BookOpen size={13} /> Add to GDD</button></form>
        )}
        {canLead && hasRepo && !topic.convertedUrl && (
          <form action={convertTopicToIssue.bind(null, slug, topic.id)}><button className="btn-secondary px-2 py-1 text-xs"><ExternalLink size={13} /> Open GitHub issue</button></form>
        )}
        {topic.convertedTaskId && <Link href={`/p/${slug}/tasks`} className="chip"><ListChecks size={11} /> on the task board</Link>}
        {topic.convertedUrl && <a href={topic.convertedUrl} target="_blank" rel="noreferrer" className="chip"><ExternalLink size={11} /> GitHub issue</a>}
      </div>
      {canLead && (
        <form key={topic.tags.join(",")} action={setTopicTags.bind(null, slug, topic.id)} className="flex gap-1">
          <input name="tags" defaultValue={topic.tags.join(", ")} placeholder="tags" className="input py-1 text-xs" />
          <button className="btn-ghost px-2 py-1 text-xs">Save tags</button>
        </form>
      )}
    </div>
  );
}
