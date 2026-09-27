import { desc, eq } from "drizzle-orm";
import { BellRing, Mail, Trash2 } from "lucide-react";
import Link from "next/link";
import { db } from "@/db";
import { savedSearches } from "@/db/schema";
import { saveEmailPrefs, updateSavedSearch } from "@/app/actions/alerts";
import { requireUser } from "@/lib/auth";
import { emailConfigured } from "@/lib/mailer";

export const metadata = { title: "Alerts" };

export default async function NotificationSettingsPage() {
  const user = await requireUser();
  const searches = await db.select().from(savedSearches).where(eq(savedSearches.userId, user.id)).orderBy(desc(savedSearches.createdAt));
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <h1 className="h1">Alerts & digest</h1>
      <section className="card space-y-3">
        <h2 className="h2 flex items-center gap-2"><BellRing size={18} className="text-accent" /> Role alerts</h2>
        <p className="text-sm text-fg-muted">Filter <Link href="/projects" className="link">Projects</Link> by skill, engine or stage and press “Alert me”. You&apos;ll hear about matching roles the moment they open.</p>
        {searches.length === 0 ? <p className="text-sm text-fg-muted">No alerts yet.</p> : (
          <ul className="divide-y divide-border rounded-xl border border-border">
            {searches.map((s) => (
              <li key={s.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                <span className={`flex-1 ${s.alerts ? "" : "text-fg-muted line-through"}`}>{s.name}</span>
                <form action={updateSavedSearch}>
                  <input type="hidden" name="id" value={s.id} />
                  <button name="alerts" value={s.alerts ? "0" : "1"} className="btn-ghost py-1 text-xs">{s.alerts ? "Pause" : "Resume"}</button>
                  <button name="delete" value="1" className="btn-ghost py-1 text-xs text-bad" aria-label={`Delete ${s.name}`}><Trash2 size={13} /></button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>
      <form action={saveEmailPrefs} className="card space-y-3">
        <h2 className="h2 flex items-center gap-2"><Mail size={18} className="text-accent" /> Weekly digest</h2>
        <p className="text-sm text-fg-muted">Once a week: roles that fit your skills and alerts, jams coming up, and what&apos;s waiting in your hand. It always appears in Notifications; email is optional.</p>
        <input name="email" type="email" defaultValue={user.email ?? ""} placeholder="you@example.com" className="input" aria-label="Email for the digest" />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="emailDigest" defaultChecked={user.emailDigest} className="accent-violet-500" /> Email me the weekly digest</label>
        {!emailConfigured() && <p className="text-xs text-fg-muted">Email isn&apos;t set up on this server yet, so digests stay in-app for now.</p>}
        <p className="text-xs text-fg-muted">Your email is only used for the digest and is never shown on your profile.</p>
        <button className="btn-secondary">Save</button>
      </form>
    </div>
  );
}
