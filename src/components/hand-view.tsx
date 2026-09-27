"use client";

import { AtSign, BadgeCheck, CircleDollarSign, FileSignature, GripVertical, ImageIcon, ListTodo, Lock, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { saveHandOrder } from "@/app/actions/hand";
import type { HandItem, HandKind } from "@/lib/hand";

const KIND: Record<HandKind, { icon: LucideIcon; color: string; label: string }> = {
  sign: { icon: FileSignature, color: "#fbbf24", label: "Sign" },
  release: { icon: BadgeCheck, color: "#34d399", label: "Release" },
  fund: { icon: CircleDollarSign, color: "#22d3ee", label: "Fund" },
  review: { icon: ImageIcon, color: "#a78bfa", label: "Review" },
  task: { icon: ListTodo, color: "#f472b6", label: "Task" },
  mention: { icon: AtSign, color: "#60a5fa", label: "Mention" },
};

type Item = Omit<HandItem, "at"> & { at: string };

export function HandView({ initial }: { initial: Item[] }) {
  const [items, setItems] = useState(initial);
  const [dragging, setDragging] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [, start] = useTransition();
  const fan = items.slice(0, 7);

  const move = (from: string, to: string) => {
    if (from === to) return;
    const next = [...items];
    const a = next.findIndex((i) => i.key === from);
    const b = next.findIndex((i) => i.key === to);
    const [x] = next.splice(a, 1);
    next.splice(b, 0, x);
    setItems(next);
    setSaved(false);
    start(async () => {
      await saveHandOrder(next.map((i) => i.key));
      setSaved(true);
    });
  };

  if (!items.length) {
    return (
      <div className="card flex flex-col items-center gap-3 py-16 text-center text-fg-muted">
        <span className="animate-float text-6xl">🂠</span>
        <p className="text-lg text-fg">Your hand is empty.</p>
        <p>Nothing is waiting on you. Go find a party, or take a quest.</p>
        <div className="flex gap-2"><Link href="/projects" className="btn">Browse projects</Link><Link href="/gigs" className="btn-secondary">Browse gigs</Link></div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="relative mx-auto flex h-72 max-w-4xl items-end justify-center" aria-label="Top of your hand">
        {fan.map((item, i) => {
          const mid = (fan.length - 1) / 2;
          const angle = (i - mid) * 7;
          const lift = Math.abs(i - mid) * 10;
          const k = KIND[item.kind];
          return (
            <Link
              key={item.key}
              href={item.href}
              className="group absolute bottom-0 w-44 origin-bottom transition-all duration-300 hover:z-20 hover:-translate-y-8 hover:rotate-0 hover:scale-110 sm:w-48"
              style={{ transform: `translateX(${(i - mid) * 92}px) translateY(${lift}px) rotate(${angle}deg)`, zIndex: i }}
            >
              <div
                className="flex h-64 flex-col rounded-2xl border-2 bg-surface p-3 shadow-2xl"
                style={{ borderColor: k.color, boxShadow: `0 20px 40px -18px ${k.color}` }}
              >
                <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider" style={{ color: k.color }}>
                  <span className="flex items-center gap-1"><k.icon size={13} /> {k.label}</span>
                  <span className="font-display text-lg">{i + 1}</span>
                </div>
                <div className="my-3 flex flex-1 items-center justify-center rounded-xl" style={{ background: `color-mix(in oklab, ${k.color} 14%, transparent)` }}>
                  {item.locked ? <Lock size={40} className="text-fg-muted" /> : <k.icon size={44} style={{ color: k.color }} className="transition-transform group-hover:scale-110" />}
                </div>
                <div className="line-clamp-2 font-display text-sm font-semibold leading-snug">{item.title}</div>
                <div className="mt-1 truncate text-[11px] text-fg-muted">{item.project.name}</div>
              </div>
            </Link>
          );
        })}
      </div>

      <section className="card space-y-2">
        <div className="flex items-center gap-2">
          <h2 className="h2">Full queue</h2>
          <span className="text-sm text-fg-muted">{items.length} waiting on you · drag to reorder</span>
          {saved && <span className="ml-auto text-xs text-good">Order saved</span>}
        </div>
        <ol className="space-y-1.5">
          {items.map((item, i) => {
            const k = KIND[item.kind];
            return (
              <li
                key={item.key}
                draggable
                onDragStart={() => setDragging(item.key)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => dragging && move(dragging, item.key)}
                onDragEnd={() => setDragging(null)}
                className={`flex items-center gap-3 rounded-xl border border-border bg-surface-2 p-2.5 transition-all ${dragging === item.key ? "scale-[0.98] opacity-50" : "hover:border-accent/40"}`}
              >
                <GripVertical size={16} className="shrink-0 cursor-grab text-fg-muted" />
                <span className="w-5 text-center font-display text-sm font-bold text-fg-muted">{i + 1}</span>
                <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ color: k.color, background: `color-mix(in oklab, ${k.color} 15%, transparent)` }}>
                  {item.locked ? <Lock size={15} /> : <k.icon size={15} />}
                </span>
                <Link href={item.href} className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium hover:text-accent">{item.title}</div>
                  <div className="truncate text-xs text-fg-muted">{item.detail}</div>
                </Link>
                <span className="hidden shrink-0 text-xs text-fg-muted sm:block">{item.project.name}</span>
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}
