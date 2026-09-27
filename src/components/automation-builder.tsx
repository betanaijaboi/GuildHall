"use client";

import { Loader2, Sparkles, Wand2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { draftAutomation, saveAutomation } from "@/app/actions/automations";
import { DAYS, describeAction, describeTrigger, type Action, type Rule, type Trigger } from "@/lib/automations";

const TRIGGERS: { value: Trigger["type"]; label: string }[] = [
  { value: "ci_failed", label: "CI fails" },
  { value: "release_published", label: "A release is published" },
  { value: "task_done", label: "A task is done" },
  { value: "asset_submitted", label: "An asset is submitted" },
  { value: "asset_approved", label: "An asset is approved" },
  { value: "member_joined", label: "Someone joins" },
  { value: "weekly", label: "Every week at…" },
];

export function AutomationBuilder({ slug, channels, aiEnabled }: { slug: string; channels: string[]; aiEnabled: boolean }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [draft, setDraft] = useState<{ rule: Rule; via: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [trigger, setTrigger] = useState<Trigger>({ type: "ci_failed", branch: "main" });
  const [action, setAction] = useState<Action>({ type: "post_message", channel: channels.includes("builds") ? "builds" : channels[0], text: "Heads up: {title} {url}", mention: null });
  const [name, setName] = useState("");

  const save = (rule: Rule, source: "custom" | "ai") =>
    start(async () => {
      setError(null);
      try {
        await saveAutomation(slug, rule, source);
        setDraft(null);
        setText("");
        router.refresh();
      } catch (e) {
        setError((e as Error).message);
      }
    });

  return (
    <div className="space-y-4">
      <section className="card space-y-3">
        <h2 className="h2 flex items-center gap-2"><Wand2 size={18} className="text-accent" /> Describe it in plain English</h2>
        <div className="flex gap-2">
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder='e.g. "When CI fails on main, ping @amara in #builds"' className="input" />
          <button
            className="btn shrink-0"
            disabled={pending || text.trim().length < 5}
            onClick={() =>
              start(async () => {
                setError(null);
                const res = await draftAutomation(slug, text);
                if (res.rule) setDraft({ rule: res.rule, via: res.via });
                else setError(res.error ?? "Couldn't draft a rule");
              })
            }
          >
            {pending ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />} Draft
          </button>
        </div>
        <p className="text-xs text-fg-muted">{aiEnabled ? "Drafted by Claude; you confirm before anything is saved." : "Drafted by the built-in phrase parser (set ANTHROPIC_API_KEY to draft with Claude)."}</p>
        {draft && (
          <div className="animate-pop space-y-2 rounded-2xl border border-accent/50 bg-accent/10 p-4">
            <div className="text-sm"><span className="font-semibold">When</span> {describeTrigger(draft.rule.trigger)} <span className="font-semibold">then</span> {describeAction(draft.rule.action)}</div>
            <div className="flex gap-2">
              <button className="btn py-1.5" onClick={() => save(draft.rule, draft.via === "ai" ? "ai" : "custom")}>Save rule</button>
              <button className="btn-ghost" onClick={() => setDraft(null)}>Discard</button>
            </div>
          </div>
        )}
      </section>

      <details className="card">
        <summary className="cursor-pointer font-display font-semibold">Or build one step by step</summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-fg-muted">When</div>
            <select
              className="input"
              value={trigger.type}
              onChange={(e) => {
                const t = e.target.value as Trigger["type"];
                setTrigger(t === "ci_failed" ? { type: t, branch: "main" } : t === "task_done" ? { type: t, pipelineOnly: false } : t === "weekly" ? { type: t, day: 5, hourUtc: 16 } : ({ type: t } as Trigger));
              }}
            >
              {TRIGGERS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            {trigger.type === "ci_failed" && <input className="input" placeholder="Branch (blank = any)" value={trigger.branch ?? ""} onChange={(e) => setTrigger({ type: "ci_failed", branch: e.target.value || null })} />}
            {trigger.type === "task_done" && (
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={trigger.pipelineOnly} onChange={(e) => setTrigger({ type: "task_done", pipelineOnly: e.target.checked })} /> Only pipeline stages</label>
            )}
            {trigger.type === "weekly" && (
              <div className="flex gap-2">
                <select className="input" value={trigger.day} onChange={(e) => setTrigger({ ...trigger, day: Number(e.target.value) })}>{DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}</select>
                <select className="input" value={trigger.hourUtc} onChange={(e) => setTrigger({ ...trigger, hourUtc: Number(e.target.value) })}>{Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, "0")}:00 UTC</option>)}</select>
              </div>
            )}
          </div>
          <div className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-fg-muted">Then</div>
            <select
              className="input"
              value={action.type}
              onChange={(e) => {
                const t = e.target.value as Action["type"];
                setAction(t === "post_message" ? { type: t, channel: channels[0], text: "{title} {url}", mention: null } : t === "post_digest" ? { type: t, channel: "general" } : { type: "draft_devlog" });
              }}
            >
              <option value="post_message">Post a message</option>
              <option value="draft_devlog">Draft a devlog post</option>
              <option value="post_digest">Post the weekly digest</option>
            </select>
            {(action.type === "post_message" || action.type === "post_digest") && (
              <select className="input" value={action.channel} onChange={(e) => setAction({ ...action, channel: e.target.value })}>{channels.map((c) => <option key={c} value={c}>#{c}</option>)}</select>
            )}
            {action.type === "post_message" && (
              <>
                <input className="input" value={action.text} onChange={(e) => setAction({ ...action, text: e.target.value })} placeholder="Message: {title} {url} {actor} {branch}" />
                <input className="input" value={action.mention ?? ""} onChange={(e) => setAction({ ...action, mention: e.target.value.replace(/^@/, "") || null })} placeholder="Ping someone (handle, optional)" />
              </>
            )}
          </div>
          <input className="input sm:col-span-2" value={name} onChange={(e) => setName(e.target.value)} placeholder="Rule name" />
          <button className="btn sm:col-span-2" disabled={pending} onClick={() => save({ name: name || `${describeTrigger(trigger)}`, trigger, action }, "custom")}>Save rule</button>
        </div>
      </details>
      {error && <p className="rounded-xl border border-bad/40 p-3 text-sm text-bad">{error}</p>}
    </div>
  );
}
