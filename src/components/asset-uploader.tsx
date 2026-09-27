"use client";

import { CloudUpload, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

/** Drag-and-drop upload with a progress bar. New asset, or a new version when `assetId` is set. */
export function AssetUploader({ slug, assetId, compact = false }: { slug: string; assetId?: string; compact?: boolean }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [drag, setDrag] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = (form: HTMLFormElement) => {
    if (!file) return setError("Choose a file first");
    const data = new FormData(form);
    data.set("file", file);
    if (assetId) data.set("assetId", assetId);
    setError(null);
    setProgress(0);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/p/${slug}/assets`);
    xhr.upload.onprogress = (e) => e.lengthComputable && setProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      setProgress(null);
      const res = JSON.parse(xhr.responseText || "{}");
      if (xhr.status >= 400) return setError(res.error ?? "Upload failed");
      setFile(null);
      form.reset();
      router.push(`/p/${slug}/assets/${res.assetId}`);
      router.refresh();
    };
    xhr.onerror = () => {
      setProgress(null);
      setError("Network error, please try again");
    };
    xhr.send(data);
  };

  return (
    <form
      ref={formRef}
      onSubmit={(e) => {
        e.preventDefault();
        submit(e.currentTarget);
      }}
      className={compact ? "space-y-2" : "card space-y-3"}
    >
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          if (e.dataTransfer.files[0]) setFile(e.dataTransfer.files[0]);
        }}
        className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed text-center transition-all ${
          compact ? "p-4" : "p-8"
        } ${drag ? "scale-[1.01] border-accent bg-accent/10" : "border-border hover:border-accent/60 hover:bg-muted/40"}`}
      >
        <CloudUpload className={`text-accent transition-transform ${drag ? "-translate-y-1 scale-110" : ""}`} size={compact ? 22 : 32} />
        <span className="text-sm font-medium">{file ? file.name : assetId ? "Drop the new version here" : "Drop art, video or a 3D model here"}</span>
        <span className="text-xs text-fg-muted">PNG, JPEG, WebP, GIF, MP4, WebM or GLB · up to 50 MB</span>
        <input
          type="file"
          className="sr-only"
          accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm,.glb,model/gltf-binary"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
      </label>
      {!assetId && (
        <div className="grid gap-2 sm:grid-cols-2">
          <input name="title" required maxLength={120} placeholder="Title, e.g. Harbour dock kit" className="input" />
          <input name="repoPath" maxLength={400} placeholder="Repo path (optional), e.g. Content/Harbour/Dock.uasset" className="input" />
        </div>
      )}
      <input name="note" maxLength={1000} placeholder={assetId ? "What changed in this version?" : "Notes for reviewers (optional)"} className="input" />
      {progress !== null && (
        <div className="xp-bar"><span style={{ width: `${progress}%`, animation: "none" }} /></div>
      )}
      {error && <p className="text-sm text-bad">{error}</p>}
      <button className="btn w-full" disabled={progress !== null}>
        {progress !== null ? <><Loader2 size={16} className="animate-spin" /> Uploading {progress}%</> : assetId ? "Upload new version" : "Submit for review"}
      </button>
    </form>
  );
}
