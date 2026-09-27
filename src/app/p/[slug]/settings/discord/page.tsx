import { eq } from "drizzle-orm";
import { ArrowLeft, MessageCircle, Terminal, Unlink } from "lucide-react";
import Link from "next/link";
import { db } from "@/db";
import { channels, discordLinks } from "@/db/schema";
import { addDiscordWebhook, createDiscordLinkCodeAction, removeDiscordWebhook, unlinkDiscord } from "@/app/actions/discord";
import { DiscordCodeForm, DiscordWebhookForm } from "@/components/sharing-forms";
import { loadProject } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { maskWebhook } from "@/lib/discord";
import { recentLinks } from "@/lib/discord-db";
import { env } from "@/lib/env";

export const metadata = { title: "Discord" };

export default async function DiscordSettingsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await requireUser();
  const { project } = await loadProject(slug, user, "lead");
  const [[link], hooks, own] = await Promise.all([
    db.select().from(discordLinks).where(eq(discordLinks.projectId, project.id)).limit(1),
    recentLinks(db, project.id),
    db.select({ id: channels.id, name: channels.name }).from(channels).where(eq(channels.projectId, project.id)),
  ]);
  const appId = process.env.DISCORD_APPLICATION_ID;
  const configured = Boolean(appId && process.env.DISCORD_PUBLIC_KEY);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href={`/p/${slug}/settings`} className="btn-ghost -ml-2"><ArrowLeft size={16} /> Settings</Link>
      <section className="card space-y-3">
        <h2 className="h2 flex items-center gap-2"><MessageCircle size={20} className="text-[#5865F2]" /> Mirror channels into Discord</h2>
        <p className="text-sm text-fg-muted">Great for #builds, #proposals or a public devlog channel. In Discord: Channel settings → Integrations → Webhooks → New webhook → Copy URL. Mentions are never pinged.</p>
        <DiscordWebhookForm action={addDiscordWebhook.bind(null, slug)} channels={own} />
        {hooks.length > 0 && (
          <ul className="divide-y divide-border rounded-xl border border-border text-sm">
            {hooks.map(({ hook, channel }) => (
              <li key={hook.channelId} className="flex flex-wrap items-center gap-2 px-3 py-2">
                <span className="font-medium">#{channel}</span>
                <code className="text-xs text-fg-muted">{maskWebhook(hook.webhookUrl)}</code>
                {hook.lastError ? <span className="text-xs text-bad">{hook.lastError}</span> : hook.lastSentAt ? <span className="text-xs text-good">last sent {hook.lastSentAt.toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" })}</span> : null}
                <form action={removeDiscordWebhook.bind(null, slug)} className="ml-auto"><input type="hidden" name="channelId" value={hook.channelId} /><button className="btn-ghost py-1 text-xs"><Unlink size={13} /> Stop</button></form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card space-y-3">
        <h2 className="h2 flex items-center gap-2"><Terminal size={18} className="text-accent" /> Slash commands for your community</h2>
        <p className="text-sm text-fg-muted">
          Players type <code>/bug</code>, <code>/feedback</code> or <code>/idea</code> in your Discord and it lands in the feedback inbox; <code>/roadmap</code> shows your top-voted roadmap items.
        </p>
        {!configured ? (
          <p className="text-sm text-fg-muted">The Guildhall Discord app isn&apos;t configured on this server yet (see <code>docs/discord.md</code>).</p>
        ) : link ? (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm">
            <span>Linked to Discord server <code>{link.guildId}</code>{link.linkedBy ? ` by ${link.linkedBy}` : ""}</span>
            <form action={unlinkDiscord.bind(null, slug)} className="ml-auto"><button className="btn-ghost py-1 text-xs"><Unlink size={13} /> Unlink</button></form>
          </div>
        ) : (
          <ol className="list-decimal space-y-2 pl-5 text-sm">
            <li><a className="link" href={`https://discord.com/oauth2/authorize?client_id=${appId}&scope=applications.commands`} target="_blank" rel="noreferrer">Add the Guildhall commands to your server</a> (no bot permissions needed).</li>
            <li>Get a one-time code and run it in any channel as a server admin:<div className="mt-2"><DiscordCodeForm action={createDiscordLinkCodeAction.bind(null, slug)} /></div></li>
          </ol>
        )}
        <p className="text-xs text-fg-muted">Interactions endpoint: <code>{env.appUrl}/api/discord/interactions</code></p>
      </section>
    </div>
  );
}
