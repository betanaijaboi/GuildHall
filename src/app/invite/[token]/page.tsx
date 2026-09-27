import { Clock, Hash, ImageIcon, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { db } from "@/db";
import { acceptInviteAction } from "@/app/actions/guests";
import { ProjectCrest } from "@/components/project-cover";
import { getCurrentUser } from "@/lib/auth";
import { previewInvite } from "@/lib/guests";

export const metadata = { title: "Guest invite" };

export default async function InvitePage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ error?: string }> }) {
  const { token } = await params;
  const { error } = await searchParams;
  const invite = /^[A-Za-z0-9_-]{20,100}$/.test(token) ? await previewInvite(db, token) : null;
  const user = await getCurrentUser();

  if (!invite) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <span className="animate-float text-5xl">🗝️</span>
        <h1 className="h1 mt-4">Invite not found</h1>
        <p className="mt-2 text-sm text-fg-muted">This link isn&apos;t valid. Ask the team for a new one.</p>
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-md space-y-5 py-10">
      <div className="card animate-fade-up space-y-5 text-center">
        <div className="flex justify-center"><ProjectCrest slug={invite.project.slug} name={invite.project.name} size={72} /></div>
        <div>
          <p className="text-sm text-fg-muted">You&apos;re invited as a guest to</p>
          <h1 className="h1">{invite.project.name}</h1>
          <p className="mt-1 text-sm"><span className="chip">{invite.label}</span></p>
        </div>
        <div className="space-y-2 text-left text-sm">
          <p className="font-medium">You&apos;ll be able to see</p>
          <div className="flex flex-wrap gap-1.5">
            {invite.channels.map((c) => <span key={c} className="chip"><Hash size={11} /> {c}</span>)}
            {invite.assets.map((a) => <span key={a} className="chip"><ImageIcon size={11} /> {a}</span>)}
          </div>
          <p className="flex items-start gap-2 text-xs text-fg-muted"><ShieldCheck size={14} className="mt-0.5 shrink-0" /> Nothing else in the project: no other channels, tasks, docs or code.</p>
          <p className="flex items-center gap-2 text-xs text-fg-muted"><Clock size={14} /> Link expires {invite.expiresAt.toLocaleDateString("en-GB", { dateStyle: "medium" })}</p>
        </div>
        {error && <p className="rounded-md border border-bad/40 p-3 text-sm text-bad">This invite has expired or been used up. Ask the team for a new link.</p>}
        {!invite.usable ? (
          !error && <p className="rounded-md border border-bad/40 p-3 text-sm text-bad">This invite has expired or been used up. Ask the team for a new link.</p>
        ) : user ? (
          <form action={acceptInviteAction.bind(null, token)}>
            <button className="btn w-full py-2.5">Join as {user.name}</button>
          </form>
        ) : (
          <Link href={`/login?next=${encodeURIComponent(`/invite/${token}`)}`} className="btn w-full py-2.5">Sign in to accept</Link>
        )}
      </div>
    </div>
  );
}
