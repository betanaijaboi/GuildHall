"use client";

import { Check, Dices, Image as ImageIcon, RotateCcw, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveAvatar } from "@/app/actions/profile";
import {
  ACCESSORIES, BG_COLORS, EYES, FACIAL_HAIR, HAIR_COLORS, HAIR_STYLES, HEADS, MOUTHS, OUTFIT_COLORS, PATTERNS,
  SKIN_TONES, randomAvatar, type AvatarConfig,
} from "@/lib/avatar";
import { AvatarArt } from "./avatar-art";

type Key = keyof AvatarConfig;
type Section = { id: string; label: string; options: { key: Key; values: readonly (string | boolean)[]; label: string; swatch?: boolean }[] };

const SECTIONS: Section[] = [
  { id: "face", label: "Face", options: [
    { key: "head", values: HEADS, label: "Head shape" },
    { key: "skin", values: SKIN_TONES, label: "Skin", swatch: true },
    { key: "blush", values: [true, false], label: "Blush" },
  ] },
  { id: "hair", label: "Hair", options: [
    { key: "hair", values: HAIR_STYLES, label: "Style" },
    { key: "hairColor", values: HAIR_COLORS, label: "Colour", swatch: true },
    { key: "facialHair", values: FACIAL_HAIR, label: "Facial hair" },
  ] },
  { id: "expression", label: "Expression", options: [
    { key: "eyes", values: EYES, label: "Eyes" },
    { key: "mouth", values: MOUTHS, label: "Mouth" },
  ] },
  { id: "gear", label: "Gear", options: [
    { key: "accessory", values: ACCESSORIES, label: "Accessory" },
    { key: "outfit", values: OUTFIT_COLORS, label: "Outfit", swatch: true },
  ] },
  { id: "backdrop", label: "Backdrop", options: [
    { key: "bg", values: BG_COLORS, label: "Colour", swatch: true },
    { key: "pattern", values: PATTERNS, label: "Pattern" },
  ] },
];

const label = (v: string | boolean) => (typeof v === "boolean" ? (v ? "On" : "Off") : v.replace(/([a-z])([A-Z])/g, "$1 $2"));

export function AvatarBuilder({ initial, photoUrl, name }: { initial: AvatarConfig; photoUrl: string | null; name: string }) {
  const [config, setConfig] = useState<AvatarConfig>(initial);
  const [section, setSection] = useState("face");
  const [rolls, setRolls] = useState(0);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const set = (patch: Partial<AvatarConfig>) => {
    setConfig((c) => ({ ...c, ...patch }));
    setSaved(false);
  };
  const current = SECTIONS.find((s) => s.id === section)!;

  return (
    <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
      <div className="lg:sticky lg:top-24 lg:self-start">
        <div className="card flex flex-col items-center gap-4 text-center">
          <div className="avatar-ring rounded-full p-1">
            <div className="avatar avatar-live h-56 w-56 overflow-hidden rounded-full">
              {config.mode === "photo" && photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photoUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <div key={rolls} className="h-full w-full animate-pop">
                  <AvatarArt config={config} title={name} />
                </div>
              )}
            </div>
          </div>
          <div className="font-display text-lg font-semibold">{name}</div>
          <div className="flex flex-wrap justify-center gap-2">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                set({ ...randomAvatar(), mode: "character" });
                setRolls((r) => r + 1);
              }}
            >
              <Dices size={16} key={rolls} style={{ animation: rolls ? "dice 0.5s ease" : undefined }} /> Randomize
            </button>
            <button type="button" className="btn-secondary" onClick={() => set(initial)}>
              <RotateCcw size={16} /> Reset
            </button>
          </div>
          {photoUrl && (
            <label className="flex items-center gap-2 text-sm text-fg-muted">
              <input type="checkbox" checked={config.mode === "photo"} onChange={(e) => set({ mode: e.target.checked ? "photo" : "character" })} />
              <ImageIcon size={14} /> Use my GitHub photo instead
            </label>
          )}
          <button
            type="button"
            className="btn w-full"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                await saveAvatar(config);
                setSaved(true);
                router.refresh();
              })
            }
          >
            {saved ? <Check size={16} /> : <Save size={16} />} {pending ? "Saving…" : saved ? "Saved!" : "Save avatar"}
          </button>
        </div>
      </div>

      <div className="space-y-5">
        <div className="scroll-x flex gap-2">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSection(s.id)}
              className={`whitespace-nowrap rounded-xl px-4 py-2 text-sm font-medium transition-all ${
                s.id === section ? "bg-gradient-to-r from-violet-500 to-cyan-500 text-white shadow-lg shadow-violet-500/30" : "bg-surface-2 text-fg-muted hover:text-fg"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        <div key={section} className="stagger space-y-6">
          {current.options.map((opt) => (
            <section key={opt.key}>
              <h3 className="mb-2 text-sm font-semibold text-fg-muted">{opt.label}</h3>
              {opt.swatch ? (
                <div className="flex flex-wrap gap-2.5">
                  {opt.values.map((v) => {
                    const selected = config[opt.key] === v;
                    return (
                      <button
                        key={String(v)}
                        type="button"
                        aria-label={`${opt.label} ${v}`}
                        aria-pressed={selected}
                        onClick={() => set({ [opt.key]: v } as Partial<AvatarConfig>)}
                        className={`h-10 w-10 rounded-full border-2 transition-transform hover:scale-110 ${selected ? "scale-110 border-white ring-2 ring-accent" : "border-transparent"}`}
                        style={{ background: String(v) }}
                      />
                    );
                  })}
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 xl:grid-cols-6">
                  {opt.values.map((v) => {
                    const selected = config[opt.key] === v;
                    return (
                      <button
                        key={String(v)}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => set({ [opt.key]: v, mode: "character" } as Partial<AvatarConfig>)}
                        className={`group flex flex-col items-center gap-1.5 rounded-2xl border p-2 transition-all hover:-translate-y-0.5 ${
                          selected ? "border-accent bg-accent/10 shadow-lg shadow-violet-500/20" : "border-border bg-surface-2 hover:border-accent/50"
                        }`}
                      >
                        <span className="avatar block h-16 w-16 overflow-hidden rounded-full">
                          <AvatarArt config={{ ...config, [opt.key]: v } as AvatarConfig} />
                        </span>
                        <span className="text-xs capitalize text-fg-muted group-hover:text-fg">{label(v)}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
