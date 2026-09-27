import { desc, eq } from "drizzle-orm";
import { Bell, BellRing, ScrollText, Settings } from "lucide-react";
import Link from "next/link";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import { markNotificationsRead } from "@/app/actions/alerts";
import { requireUser } from "@/lib/auth";

export const metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const user = await requireUser();
  const rows = await db.select().from(notifications).where(eq(notifications.userId, user.id)).orderBy(desc(notifications.createdAt)).limit(60);
  const unread = rows.filter((r) => !r.readAt).length;
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="h1 flex items-center gap-2"><Bell size={24} className="text-accent" /> Notifications</h1>
        {unread > 0 && (
          <form action={markNotificationsRead} className="ml-auto">
            <button className="btn-secondary py-1 text-sm">Mark all read</button>
          </form>
        )}
        <Link href="/settings/notifications" className={`btn-ghost py-1 text-sm ${unread ? "" : "ml-auto"}`}><Settings size={15} /> Alerts</Link>
      </div>
      {rows.length === 0 ? (
        <div className="card flex flex-col items-center gap-2 py-14 text-center text-sm text-fg-muted">
          <span className="animate-float text-4xl">🔔</span>
          Nothing yet. Save a role search on <Link href="/projects" className="link">Projects</Link> to get alerts, and your weekly digest will show up here.
        </div>
      ) : (
        <ul className="stagger space-y-2">
          {rows.map((n) => (
            <li key={n.id} className={`card space-y-2 ${n.readAt ? "" : "border-accent/50 shadow-lg shadow-violet-500/10"}`} data-testid="notification">
              <div className="flex items-start gap-3">
                <span className={`mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${n.kind === "digest" ? "bg-cyan-500/15 text-cyan-400" : "bg-violet-500/15 text-violet-400"}`}>
                  {n.kind === "digest" ? <ScrollText size={16} /> : <BellRing size={16} />}
                </span>
                <div className="min-w-0 flex-1">
                  {n.url && n.kind !== "digest" ? <Link href={n.url} className="font-medium hover:underline">{n.title}</Link> : <span className="font-medium">{n.title}</span>}
                  {n.body && <p className="text-sm text-fg-muted">{n.body}</p>}
                </div>
                {!n.readAt && <span className="mt-2 h-2 w-2 shrink-0 animate-pulse rounded-full bg-accent" aria-label="unread" />}
                <time className="shrink-0 text-xs text-fg-muted">{n.createdAt.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</time>
              </div>
              {n.data.lines && (
                <div className="space-y-1 pl-11 text-sm">
                  {n.data.lines.map((l, i) =>
                    l.startsWith("## ") ? (
                      <div key={i} className="pt-1 text-xs font-semibold uppercase tracking-wider text-fg-muted">{l.slice(3)}</div>
                    ) : (
                      <Link key={i} href={l.slice(l.lastIndexOf("|") + 1)} className="block hover:text-accent">• {l.slice(0, l.lastIndexOf("|"))}</Link>
                    ),
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
