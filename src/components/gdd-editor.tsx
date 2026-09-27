"use client";

import { Eye, Loader2, Pencil, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { savePage } from "@/app/actions/gdd";
import { Markdown } from "./markdown";

export function GddEditor({ slug, page }: { slug: string; page: { id: string; title: string; emoji: string; body: string; version: number } }) {
  const router = useRouter();
  const [title, setTitle] = useState(page.title);
  const [emoji, setEmoji] = useState(page.emoji);
  const [body, setBody] = useState(page.body);
  const [preview, setPreview] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const save = () =>
    start(async () => {
      const fd = new FormData();
      fd.set("title", title);
      fd.set("emoji", emoji);
      fd.set("body", body);
      fd.set("version", String(page.version));
      const res = await savePage(slug, page.id, fd);
      if (!res.ok) return setError(res.error ?? "Couldn't save");
      router.push(`/p/${slug}/gdd/${page.id}`);
      router.refresh();
    });
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input value={emoji} onChange={(e) => setEmoji(e.target.value)} maxLength={8} className="input w-16 text-center text-xl" aria-label="Emoji" />
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} className="input font-display text-xl font-bold" aria-label="Title" />
      </div>
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => setPreview(false)} className={preview ? "btn-ghost" : "btn-secondary"}><Pencil size={14} /> Write</button>
        <button type="button" onClick={() => setPreview(true)} className={preview ? "btn-secondary" : "btn-ghost"}><Eye size={14} /> Preview</button>
        <span className="ml-auto text-xs text-fg-muted">Markdown · paste a Figma or Miro link on its own line to embed it</span>
      </div>
      {preview ? (
        <div className="card min-h-80"><Markdown text={body} /></div>
      ) : (
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "s") {
              e.preventDefault();
              save();
            }
          }}
          rows={22}
          className="input font-mono text-sm leading-relaxed"
        />
      )}
      {error && <p className="rounded-xl border border-bad/40 p-3 text-sm text-bad">{error}</p>}
      <div className="flex gap-2">
        <button onClick={save} disabled={pending} className="btn">{pending ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Save</button>
        <button onClick={() => router.push(`/p/${slug}/gdd/${page.id}`)} className="btn-ghost">Cancel</button>
        <span className="self-center text-xs text-fg-muted">⌘/Ctrl + S saves</span>
      </div>
    </div>
  );
}
