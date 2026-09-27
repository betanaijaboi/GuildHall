"use client";

import { Check, CheckCircle2, Crosshair, MessageSquarePlus, RotateCcw, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { addAssetComment, reviewAsset, setCommentResolved } from "@/app/actions/assets";
import { formatTimecode } from "@/lib/assets";

export type ReviewComment = {
  id: string;
  body: string;
  x: number | null;
  y: number | null;
  timeSec: number | null;
  position3d: string | null;
  normal3d: string | null;
  resolved: boolean;
  createdAt: string;
  author: { name: string; handle: string } | null;
};

type Pin = { x?: number; y?: number; timeSec?: number; position3d?: string; normal3d?: string };

type Props = {
  slug: string;
  asset: { id: string; title: string; kind: "image" | "video" | "model" };
  version: { id: string; version: number; isLatest: boolean; uploadedByMe: boolean };
  comments: ReviewComment[];
  canComment: boolean;
  /** Guests can pin notes but not resolve the team's comments. */
  canResolve?: boolean;
  canReview: boolean;
};

type ModelViewerElement = HTMLElement & {
  positionAndNormalFromPoint(x: number, y: number): { position: { toString(): string }; normal: { toString(): string } } | null;
};

export function AssetReview({ slug, asset, version, comments, canComment, canResolve = canComment, canReview }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [draftPin, setDraftPin] = useState<Pin | null>(null);
  const [pinMode, setPinMode] = useState(asset.kind !== "video");
  const [active, setActive] = useState<string | null>(null);
  const [showResolved, setShowResolved] = useState(false);
  const [draft, setDraft] = useState("");
  const [reviewNote, setReviewNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [time, setTime] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const modelRef = useRef<ModelViewerElement>(null);
  const src = `/api/files/${version.id}`;

  useEffect(() => {
    if (asset.kind === "model") import("@google/model-viewer");
  }, [asset.kind]);

  const visible = comments.filter((c) => showResolved || !c.resolved);
  const numbered = comments.map((c, i) => ({ ...c, n: i + 1 }));
  const pinned = numbered.filter((c) => showResolved || !c.resolved);

  const run = (fn: () => Promise<unknown>, after?: () => void) =>
    startTransition(async () => {
      setError(null);
      try {
        await fn();
        after?.();
        router.refresh();
      } catch (e) {
        setError((e as Error).message);
      }
    });

  const placeFlatPin = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!canComment || !pinMode) return;
    const r = e.currentTarget.getBoundingClientRect();
    const pin: Pin = { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
    if (asset.kind === "video" && videoRef.current) {
      videoRef.current.pause();
      pin.timeSec = videoRef.current.currentTime;
    }
    setDraftPin(pin);
  };

  const placeModelPin = (e: React.MouseEvent) => {
    if (!canComment || !pinMode || !modelRef.current) return;
    const hit = modelRef.current.positionAndNormalFromPoint(e.clientX, e.clientY);
    if (hit) setDraftPin({ position3d: hit.position.toString(), normal3d: hit.normal.toString() });
  };

  const seek = (t: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = t;
      videoRef.current.pause();
    }
  };

  const focus = (c: (typeof numbered)[number]) => {
    setActive(c.id);
    if (c.timeSec != null) seek(c.timeSec);
  };

  // On video, pins show only around their frame.
  const pinVisibleNow = (c: ReviewComment) => asset.kind !== "video" || c.timeSec == null || Math.abs(c.timeSec - time) < 0.35;

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
      <div className="space-y-3">
        <div className="card relative overflow-hidden p-0">
          {asset.kind === "model" ? (
            <div className="relative aspect-[4/3] bg-gradient-to-br from-surface-2 to-muted" onClick={placeModelPin}>
              <model-viewer
                ref={modelRef}
                src={src}
                camera-controls=""
                auto-rotate={pinMode ? undefined : ""}
                shadow-intensity="1"
                exposure="1"
                style={{ width: "100%", height: "100%", background: "transparent" }}
              >
                {pinned
                  .filter((c) => c.position3d)
                  .map((c) => (
                    <button
                      key={c.id}
                      slot={`hotspot-${c.n}`}
                      data-position={c.position3d!}
                      data-normal={c.normal3d ?? undefined}
                      onClick={(e) => {
                        e.stopPropagation();
                        focus(c);
                      }}
                      className={pinClass(c, active)}
                    >
                      {c.n}
                    </button>
                  ))}
                {draftPin?.position3d && (
                  <button slot="hotspot-draft" data-position={draftPin.position3d} data-normal={draftPin.normal3d} className={`${pinBase} animate-pop bg-white text-bg ring-4 ring-accent`}>
                    +
                  </button>
                )}
              </model-viewer>
            </div>
          ) : (
            <div className="relative bg-black/40">
              {asset.kind === "image" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={src} alt={asset.title} className="mx-auto block max-h-[72vh] w-auto select-none" draggable={false} />
              ) : (
                <video
                  ref={videoRef}
                  src={src}
                  controls={!pinMode}
                  className="mx-auto block max-h-[72vh] w-full"
                  onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
                  onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
                />
              )}
              <div className={`absolute inset-0 ${pinMode && canComment ? "cursor-crosshair" : "pointer-events-none"}`} onClick={placeFlatPin}>
                {pinned
                  .filter((c) => c.x != null && c.y != null && pinVisibleNow(c))
                  .map((c) => (
                    <button
                      key={c.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        focus(c);
                      }}
                      className={`pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 animate-pop ${pinClass(c, active)}`}
                      style={{ left: `${c.x! * 100}%`, top: `${c.y! * 100}%` }}
                    >
                      {c.n}
                    </button>
                  ))}
                {draftPin?.x != null && (
                  <span
                    className={`${pinBase} absolute -translate-x-1/2 -translate-y-1/2 animate-pop bg-white text-bg ring-4 ring-accent`}
                    style={{ left: `${draftPin.x * 100}%`, top: `${draftPin.y! * 100}%` }}
                  >
                    +
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        {asset.kind === "video" && duration > 0 && (
          <div className="card space-y-2 p-3">
            <div className="flex items-center gap-2 text-xs text-fg-muted">
              <span className="font-mono">{formatTimecode(time)}</span>
              <div
                className="relative h-8 flex-1 cursor-pointer rounded-lg bg-muted"
                onClick={(e) => {
                  const r = e.currentTarget.getBoundingClientRect();
                  seek(((e.clientX - r.left) / r.width) * duration);
                }}
              >
                <div className="absolute inset-y-0 left-0 rounded-lg bg-accent/25" style={{ width: `${(time / duration) * 100}%` }} />
                {pinned
                  .filter((c) => c.timeSec != null)
                  .map((c) => (
                    <button
                      key={c.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        focus(c);
                      }}
                      title={`${formatTimecode(c.timeSec!)} ${c.body}`}
                      className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 ${pinBase} h-5 w-5 text-[10px] ${c.resolved ? "bg-muted text-fg-muted" : "bg-gradient-to-br from-violet-500 to-cyan-500 text-white"}`}
                      style={{ left: `${(c.timeSec! / duration) * 100}%` }}
                    >
                      {c.n}
                    </button>
                  ))}
              </div>
              <span className="font-mono">{formatTimecode(duration)}</span>
            </div>
          </div>
        )}

        {canComment && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <button type="button" onClick={() => setPinMode((p) => !p)} className={pinMode ? "btn" : "btn-secondary"}>
              <Crosshair size={16} /> {pinMode ? "Pin mode on: click to comment" : "Turn on pin mode"}
            </button>
            {asset.kind === "video" && !pinMode && <span className="text-fg-muted">Play, pause on a frame, then turn on pin mode.</span>}
            {asset.kind === "model" && <span className="text-fg-muted">{pinMode ? "Click the model surface to pin. Drag to orbit." : "Orbit freely; turn on pin mode to comment."}</span>}
          </div>
        )}
      </div>

      <aside className="space-y-4">
        {canReview && version.isLatest && (
          <div className="card space-y-3">
            <h3 className="h2">Your review of v{version.version}</h3>
            <input value={reviewNote} onChange={(e) => setReviewNote(e.target.value)} placeholder="Summary for the artist (optional)" className="input" />
            <div className="grid grid-cols-2 gap-2">
              <button
                className="btn-secondary border-bad/40 hover:border-bad"
                disabled={pending}
                onClick={() => run(() => reviewAsset(slug, { assetId: asset.id, versionId: version.id, decision: "changes_requested", note: reviewNote }), () => setReviewNote(""))}
              >
                <RotateCcw size={16} /> Request changes
              </button>
              <button
                className="btn"
                disabled={pending || version.uploadedByMe}
                title={version.uploadedByMe ? "A teammate has to approve your upload" : undefined}
                onClick={() => run(() => reviewAsset(slug, { assetId: asset.id, versionId: version.id, decision: "approved", note: reviewNote }), () => setReviewNote(""))}
              >
                <CheckCircle2 size={16} /> Approve
              </button>
            </div>
          </div>
        )}

        {canComment && (
          <form
            className={`card space-y-2 ${draftPin ? "ring-2 ring-accent" : ""}`}
            onSubmit={(e) => {
              e.preventDefault();
              if (!draft.trim()) return;
              run(
                () => addAssetComment(slug, { assetId: asset.id, versionId: version.id, body: draft, ...draftPin }),
                () => {
                  setDraft("");
                  setDraftPin(null);
                },
              );
            }}
          >
            <div className="flex items-center gap-2 text-sm font-semibold">
              <MessageSquarePlus size={16} className="text-accent" />
              {draftPin ? (draftPin.timeSec != null ? `Pin at ${formatTimecode(draftPin.timeSec)}` : "New pin") : "General comment"}
              {draftPin && (
                <button type="button" onClick={() => setDraftPin(null)} className="btn-ghost ml-auto p-1" aria-label="Remove pin"><X size={14} /></button>
              )}
            </div>
            <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={3} maxLength={2000} placeholder="The rim light reads too blue here…" className="input" autoFocus={!!draftPin} />
            <button className="btn w-full" disabled={pending || !draft.trim()}>Post comment</button>
          </form>
        )}

        {error && <p className="rounded-xl border border-bad/40 p-3 text-sm text-bad">{error}</p>}

        <div className="card space-y-3 p-4">
          <div className="flex items-center gap-2">
            <h3 className="font-display font-semibold">Comments</h3>
            <span className="text-xs text-fg-muted">{comments.filter((c) => !c.resolved).length} open</span>
            <label className="ml-auto flex items-center gap-1.5 text-xs text-fg-muted">
              <input type="checkbox" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} /> Show resolved
            </label>
          </div>
          {visible.length === 0 && <p className="text-sm text-fg-muted">No comments on this version yet.</p>}
          <ol className="space-y-2">
            {numbered
              .filter((c) => showResolved || !c.resolved)
              .map((c) => (
                <li
                  key={c.id}
                  onClick={() => focus(c)}
                  className={`cursor-pointer rounded-xl border p-3 text-sm transition-colors ${active === c.id ? "border-accent bg-accent/10" : "border-border hover:bg-muted/50"} ${c.resolved ? "opacity-60" : ""}`}
                >
                  <div className="flex items-center gap-2 text-xs text-fg-muted">
                    <span className={`${pinBase} h-5 w-5 text-[10px] ${c.resolved ? "bg-muted" : "bg-gradient-to-br from-violet-500 to-cyan-500 text-white"}`}>{c.n}</span>
                    <span className="font-medium text-fg">{c.author?.name ?? "Someone"}</span>
                    {c.timeSec != null && <span className="font-mono">{formatTimecode(c.timeSec)}</span>}
                    {canResolve && (
                      <button
                        type="button"
                        className="btn-ghost ml-auto px-1.5 py-0.5 text-xs"
                        onClick={(e) => {
                          e.stopPropagation();
                          run(() => setCommentResolved(slug, { assetId: asset.id, commentId: c.id, resolved: !c.resolved }));
                        }}
                      >
                        <Check size={12} /> {c.resolved ? "Reopen" : "Resolve"}
                      </button>
                    )}
                  </div>
                  <p className={`mt-1 whitespace-pre-wrap ${c.resolved ? "line-through" : ""}`}>{c.body}</p>
                </li>
              ))}
          </ol>
        </div>
      </aside>
    </div>
  );
}

const pinBase = "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold shadow-lg";

function pinClass(c: { id: string; resolved: boolean }, active: string | null) {
  return `${pinBase} transition-transform hover:scale-110 ${
    c.resolved ? "bg-muted text-fg-muted" : "bg-gradient-to-br from-violet-500 to-cyan-500 text-white"
  } ${active === c.id ? "scale-125 ring-4 ring-white/70" : "ring-2 ring-black/30"}`;
}
