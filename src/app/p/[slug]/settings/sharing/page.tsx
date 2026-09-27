import { and, asc, desc, eq, gt, inArray, ne } from "drizzle-orm";
import { ArrowLeft, Link2, ShieldCheck, Unlink, UserMinus, Users } from "lucide-react";
import Link from "next/link";
import { db } from "@/db";
import { assets, assetShares, channelAccess, channelLinks, channels, guestInvites, memberships, projects, users } from "@/db/schema";
import { createInviteAction, createShareCodeAction, redeemShareCodeAction, revokeInviteAction, unlinkChannelAction } from "@/app/actions/guests";
import { leaveOrRemoveMember } from "@/app/actions/project";
import { Avatar } from "@/components/avatar";
import { InviteForm, RedeemForm, ShareCodeForm } from "@/components/sharing-forms";
import { loadProject } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { env } from "@/lib/env";

export const metadata = { title: "Guests & sharing" };

const day = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });

export default async function SharingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await requireUser();
  const { project } = await loadProject(slug, user, "lead");

  const [own, projectAssets, invites, guests, sharedOut, sharedIn] = await Promise.all([
    db.select({ id: channels.id, name: channels.name, kind: channels.kind }).from(channels).where(eq(channels.projectId, project.id)).orderBy(asc(channels.createdAt)),
    db.select({ id: assets.id, title: assets.title }).from(assets).where(eq(assets.projectId, project.id)).orderBy(desc(assets.updatedAt)).limit(60),
    db.select().from(guestInvites).where(and(eq(guestInvites.projectId, project.id), gt(guestInvites.expiresAt, new Date()))).orderBy(desc(guestInvites.createdAt)),
    db.select({ user: users }).from(memberships).innerJoin(users, eq(users.id, memberships.userId)).where(and(eq(memberships.projectId, project.id), eq(memberships.role, "guest"))),
    db.select({ channel: channels, partner: projects.name }).from(channelLinks).innerJoin(channels, eq(channels.id, channelLinks.channelId)).innerJoin(projects, eq(projects.id, channelLinks.projectId)).where(eq(channels.projectId, project.id)),
    db.select({ channel: channels, owner: projects.name }).from(channelLinks).innerJoin(channels, eq(channels.id, channelLinks.channelId)).innerJoin(projects, eq(projects.id, channels.projectId)).where(and(eq(channelLinks.projectId, project.id), ne(channels.projectId, project.id))),
  ]);
  const guestIds = guests.map((g) => g.user.id);
  const ownIds = own.map((c) => c.id);
  const [grants, shares] = guestIds.length
    ? await Promise.all([
        db.select({ userId: channelAccess.userId, name: channels.name }).from(channelAccess).innerJoin(channels, eq(channels.id, channelAccess.channelId)).where(and(inArray(channelAccess.userId, guestIds), inArray(channelAccess.channelId, ownIds))),
        db.select({ userId: assetShares.userId, id: assetShares.assetId }).from(assetShares).innerJoin(assets, eq(assets.id, assetShares.assetId)).where(and(inArray(assetShares.userId, guestIds), eq(assets.projectId, project.id))),
      ])
    : [[], []];
  const shareable = own.filter((c) => c.kind !== "github");

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href={`/p/${slug}/settings`} className="btn-ghost -ml-2"><ArrowLeft size={16} /> Settings</Link>

      <section className="card space-y-4">
        <div>
          <h2 className="h2 flex items-center gap-2"><ShieldCheck size={20} className="text-accent" /> Invite a guest</h2>
          <p className="mt-1 text-sm text-fg-muted">
            For publishers, outsourcers, porting partners and localisers. Guests see only the channels and assets you pick: no tasks, GDD, contracts, other channels or repo access.
          </p>
        </div>
        <InviteForm action={createInviteAction.bind(null, slug)} appUrl={env.appUrl} channels={shareable} assets={projectAssets} />
        {invites.length > 0 && (
          <ul className="divide-y divide-border rounded-xl border border-border text-sm">
            {invites.map((i) => (
              <li key={i.tokenHash} className="flex flex-wrap items-center gap-2 px-3 py-2">
                <span className="font-medium">{i.label}</span>
                <span className="text-xs text-fg-muted">{i.uses}/{i.maxUses} used · expires {day(i.expiresAt)} · {i.channelIds.length} channel{i.channelIds.length === 1 ? "" : "s"}, {i.assetIds.length} asset{i.assetIds.length === 1 ? "" : "s"}</span>
                <form action={revokeInviteAction.bind(null, slug)} className="ml-auto">
                  <input type="hidden" name="tokenHash" value={i.tokenHash} />
                  <button className="btn-ghost py-1 text-xs text-bad">Revoke</button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card space-y-3">
        <h2 className="h2 flex items-center gap-2"><Users size={20} className="text-accent" /> Guests <span className="text-sm font-normal text-fg-muted">{guests.length}</span></h2>
        {guests.length === 0 ? (
          <p className="text-sm text-fg-muted">No guests yet.</p>
        ) : (
          <ul className="space-y-2">
            {guests.map(({ user: g }) => (
              <li key={g.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-border p-2.5">
                <Avatar user={g} size={34} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{g.name} <span className="text-fg-muted">@{g.handle}</span></div>
                  <div className="flex flex-wrap gap-1 pt-0.5">
                    {grants.filter((x) => x.userId === g.id).map((x) => <span key={x.name} className="chip py-0 text-[11px]">#{x.name}</span>)}
                    {shares.some((x) => x.userId === g.id) && <span className="chip py-0 text-[11px]">{shares.filter((x) => x.userId === g.id).length} assets</span>}
                  </div>
                </div>
                <form action={leaveOrRemoveMember.bind(null, slug)}>
                  <input type="hidden" name="userId" value={g.id} />
                  <button className="btn-ghost py-1 text-xs text-bad"><UserMinus size={14} /> Remove</button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card space-y-4">
        <div>
          <h2 className="h2 flex items-center gap-2"><Link2 size={20} className="text-accent" /> Shared channels</h2>
          <p className="mt-1 text-sm text-fg-muted">Co-developing with another team on Guildhall? Share one channel between both projects. Nothing else is shared.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">Share one of ours</h3>
            <ShareCodeForm action={createShareCodeAction.bind(null, slug)} channels={shareable} />
          </div>
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">Link a partner&apos;s channel</h3>
            <RedeemForm action={redeemShareCodeAction.bind(null, slug)} />
          </div>
        </div>
        {(sharedOut.length > 0 || sharedIn.length > 0) && (
          <ul className="divide-y divide-border rounded-xl border border-border text-sm">
            {sharedOut.map((s) => (
              <LinkRow key={`o-${s.channel.id}-${s.partner}`} slug={slug} channelId={s.channel.id} label={<>#{s.channel.name} <span className="text-fg-muted">→ shared with {s.partner}</span></>} />
            ))}
            {sharedIn.map((s) => (
              <LinkRow key={`i-${s.channel.id}`} slug={slug} channelId={s.channel.id} label={<>#{s.channel.name} <span className="text-fg-muted">← from {s.owner}</span></>} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function LinkRow({ slug, channelId, label }: { slug: string; channelId: string; label: React.ReactNode }) {
  return (
    <li className="flex items-center gap-2 px-3 py-2">
      <Link2 size={14} className="text-cyan-400" />
      <span>{label}</span>
      <form action={unlinkChannelAction.bind(null, slug)} className="ml-auto">
        <input type="hidden" name="channelId" value={channelId} />
        <button className="btn-ghost py-1 text-xs"><Unlink size={13} /> Stop sharing</button>
      </form>
    </li>
  );
}
