"use client";

import { Check, Copy, KeyRound, Link2, UserPlus } from "lucide-react";
import { useActionState, useState } from "react";
import type { SecretState } from "@/app/actions/guests";

type Action = (prev: SecretState, form: FormData) => Promise<SecretState>;

function CopyBox({ value, hint }: { value: string; hint: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="animate-pop space-y-1.5 rounded-xl border border-accent/40 bg-accent/5 p-3" data-testid="secret">
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate font-mono text-sm">{value}</code>
        <button
          type="button"
          className="btn-secondary shrink-0 py-1 text-xs"
          onClick={() => navigator.clipboard?.writeText(value).then(() => setCopied(true), () => {})}
        >
          {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <p className="text-xs text-fg-muted">{hint}</p>
    </div>
  );
}

export function InviteForm({
  action,
  appUrl,
  channels,
  assets,
}: {
  action: Action;
  appUrl: string;
  channels: { id: string; name: string }[];
  assets: { id: string; title: string }[];
}) {
  const [state, submit, pending] = useActionState(action, {});
  return (
    <form action={submit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-[1fr_110px_110px]">
        <div>
          <label className="label" htmlFor="label">Who is it for?</label>
          <input id="label" name="label" required maxLength={80} placeholder="e.g. Publisher: Lantern Games" className="input" />
        </div>
        <div>
          <label className="label" htmlFor="days">Expires in</label>
          <select id="days" name="days" defaultValue="7" className="input">
            <option value="1">1 day</option>
            <option value="7">7 days</option>
            <option value="30">30 days</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="maxUses">Uses</label>
          <input id="maxUses" name="maxUses" type="number" min={1} max={50} defaultValue={1} className="input" />
        </div>
      </div>
      <fieldset>
        <legend className="label">Channels they can see</legend>
        <div className="flex flex-wrap gap-2">
          {channels.map((c) => (
            <label key={c.id} className="chip cursor-pointer has-[:checked]:border-accent has-[:checked]:text-fg">
              <input type="checkbox" name="channelId" value={c.id} className="accent-violet-500" /> #{c.name}
            </label>
          ))}
        </div>
      </fieldset>
      {assets.length > 0 && (
        <fieldset>
          <legend className="label">Assets they can review</legend>
          <div className="flex max-h-40 flex-wrap gap-2 overflow-y-auto">
            {assets.map((a) => (
              <label key={a.id} className="chip cursor-pointer has-[:checked]:border-accent has-[:checked]:text-fg">
                <input type="checkbox" name="assetId" value={a.id} className="accent-violet-500" /> {a.title}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {state.error && <p className="text-sm text-bad">{state.error}</p>}
      {state.secret && <CopyBox value={`${appUrl}/invite/${state.secret}`} hint="Send this link to your guest. It's shown only once. Guests never get repo access." />}
      <button className="btn" disabled={pending}><UserPlus size={16} /> {pending ? "Creating…" : "Create invite link"}</button>
    </form>
  );
}

export function ShareCodeForm({ action, channels }: { action: Action; channels: { id: string; name: string }[] }) {
  const [state, submit, pending] = useActionState(action, {});
  return (
    <form action={submit} className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <select name="channelId" className="input w-auto flex-1" aria-label="Channel to share">
          {channels.map((c) => <option key={c.id} value={c.id}>#{c.name}</option>)}
        </select>
        <button className="btn-secondary" disabled={pending}><KeyRound size={15} /> Get a code</button>
      </div>
      <p className="text-xs text-fg-muted">The partner sees everything posted there, including bot posts such as CI results in #builds.</p>
      {state.error && <p className="text-sm text-bad">{state.error}</p>}
      {state.secret && <CopyBox value={state.secret} hint={`Give this one-time code to the partner project's lead to link ${state.message}. It expires in 48 hours.`} />}
    </form>
  );
}

export function RedeemForm({ action }: { action: Action }) {
  const [state, submit, pending] = useActionState(action, {});
  return (
    <form action={submit} className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <input name="code" required placeholder="GH-XXXX-XXXX" className="input w-auto flex-1 font-mono uppercase" aria-label="Share code" autoComplete="off" />
        <button className="btn-secondary" disabled={pending}><Link2 size={15} /> Link channel</button>
      </div>
      {state.error && <p className="text-sm text-bad">{state.error}</p>}
      {state.message && <p className="animate-pop text-sm text-good">{state.message}</p>}
    </form>
  );
}

export function FeedbackKeyForm({ action, endpoint }: { action: Action; endpoint: string }) {
  const [state, submit, pending] = useActionState(action, {});
  return (
    <form action={submit} className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <input name="label" required maxLength={60} placeholder='e.g. "Steam demo build"' className="input w-auto flex-1" aria-label="Key name" />
        <button className="btn-secondary" disabled={pending}><KeyRound size={15} /> Create key</button>
      </div>
      {state.error && <p className="text-sm text-bad">{state.error}</p>}
      {state.secret && <CopyBox value={state.secret} hint={`Put this in your build's reporter and POST to ${endpoint}. It's shown only once; anyone with it can send reports, so revoke it if it leaks.`} />}
    </form>
  );
}

export function DiscordCodeForm({ action }: { action: Action }) {
  const [state, submit, pending] = useActionState(action, {});
  return (
    <form action={submit} className="space-y-3">
      <button className="btn-secondary" disabled={pending}><KeyRound size={15} /> Get a link code</button>
      {state.secret && <CopyBox value={`/guildhall link code:${state.secret}`} hint="Run this in your Discord server as an admin. The code works once and expires in 30 minutes." />}
    </form>
  );
}

export function DiscordWebhookForm({ action, channels }: { action: Action; channels: { id: string; name: string }[] }) {
  const [state, submit, pending] = useActionState(action, {});
  return (
    <form action={submit} className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <select name="channelId" className="input w-auto" aria-label="Guildhall channel">{channels.map((c) => <option key={c.id} value={c.id}>#{c.name}</option>)}</select>
        <input name="url" required autoComplete="off" placeholder="https://discord.com/api/webhooks/…" className="input min-w-0 flex-1 font-mono text-xs" aria-label="Discord webhook URL" />
        <button className="btn-secondary" disabled={pending}><Link2 size={15} /> {pending ? "Checking…" : "Mirror"}</button>
      </div>
      {state.error && <p className="text-sm text-bad">{state.error}</p>}
      {state.message && <p className="animate-pop text-sm text-good">{state.message}</p>}
    </form>
  );
}
