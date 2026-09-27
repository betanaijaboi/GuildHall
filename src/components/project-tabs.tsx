"use client";

import {
  Activity, BarChart3, BookOpen, ChevronDown, FileSignature, Flag, FlaskConical, Hammer, ImageIcon, ListTodo, Map as MapIcon,
  MessagesSquare, Newspaper, Palette, ScrollText, Settings, Sparkles, Users, Workflow, Zap, type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Tab = { href: string; match: string; label: string; icon: LucideIcon; hint: string };
type Group = { id: string; label: string; icon: LucideIcon; tabs: Tab[] };

const CHAT: Tab = { href: "workspace", match: "workspace", label: "Chat", icon: MessagesSquare, hint: "Channels, threads and huddles" };
const SETTINGS: Tab = { href: "settings", match: "settings", label: "Settings", icon: Settings, hint: "Project, repos, guests, Discord" };

/** Project sections, grouped by what you're doing: building the game, art, players, the team, and how it's going. */
export const GROUPS: Group[] = [
  {
    id: "build", label: "Build", icon: Hammer, tabs: [
      { href: "tasks", match: "tasks", label: "Tasks", icon: ListTodo, hint: "Board synced with GitHub issues" },
      { href: "pipelines", match: "pipelines", label: "Pipelines", icon: Workflow, hint: "Staged asset production" },
      { href: "milestones", match: "milestones", label: "Quest log", icon: Flag, hint: "Stage milestones and checklists" },
      { href: "gdd", match: "gdd", label: "GDD", icon: BookOpen, hint: "The living design doc" },
    ],
  },
  {
    id: "art", label: "Art", icon: Palette, tabs: [
      { href: "assets", match: "assets", label: "Assets", icon: ImageIcon, hint: "Review, versions and approvals" },
      { href: "moodboards", match: "moodboards", label: "Moodboards", icon: Palette, hint: "References, colours, artists" },
    ],
  },
  {
    id: "players", label: "Players", icon: Sparkles, tabs: [
      { href: "playtests", match: "playtest", label: "Playtests", icon: FlaskConical, hint: "Testers and feedback inbox" },
      { href: "roadmap", match: "roadmap", label: "Roadmap", icon: MapIcon, hint: "Public roadmap and votes" },
      { href: "updates", match: "updates", label: "Devlog", icon: Newspaper, hint: "Posts for the team or the public" },
    ],
  },
  {
    id: "team", label: "Team", icon: Users, tabs: [
      { href: "roles", match: "roles", label: "Party", icon: Users, hint: "Members, open roles, applications" },
      { href: "contracts", match: "contracts", label: "Contracts", icon: FileSignature, hint: "Milestones and payments" },
      { href: "automations", match: "automations", label: "Automations", icon: Zap, hint: "When this happens, do that" },
    ],
  },
  {
    id: "pulse", label: "Pulse", icon: Activity, tabs: [
      { href: "digest", match: "digest", label: "Digest", icon: ScrollText, hint: "The week in one page" },
      { href: "analytics", match: "analytics", label: "Insights", icon: BarChart3, hint: "Visitors, votes, signups" },
    ],
  },
];

const ACTIVE = "bg-gradient-to-r from-violet-500 to-cyan-500 text-white shadow-lg shadow-violet-500/25";
const IDLE = "text-fg-muted hover:bg-muted hover:text-fg";
const PILL = "flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium transition-all";

export function ProjectTabs({ slug, isLead, isGuest = false }: { slug: string; isLead: boolean; isGuest?: boolean }) {
  const path = usePathname();
  const isActive = (t: Tab) => path.startsWith(`/p/${slug}/${t.match}`);
  const [open, setOpen] = useState<string | null>(null);
  const nav = useRef<HTMLElement>(null);

  // On phones the row scrolls sideways: keep the current section in view.
  useEffect(() => {
    const el = nav.current?.querySelector<HTMLElement>("[data-active=true]");
    if (el && nav.current && nav.current.scrollWidth > nav.current.clientWidth) el.scrollIntoView({ block: "nearest", inline: "center" });
  }, [path]);

  // Guests (C15) only ever see the channels and assets shared with them: keep it flat.
  if (isGuest) {
    return (
      <nav className="scroll-x -mx-4 flex gap-1 px-4 md:mx-0 md:px-0" aria-label="Project">
        {[CHAT, GROUPS[1].tabs[0]].map((t) => <TabLink key={t.href} slug={slug} tab={t} active={isActive(t)} />)}
      </nav>
    );
  }

  return (
    <nav ref={nav} className="scroll-x -mx-4 flex items-center gap-1 px-4 md:mx-0 md:px-0" aria-label="Project">
      <TabLink slug={slug} tab={CHAT} active={isActive(CHAT)} />
      {GROUPS.map((g) => (
        <GroupMenu key={g.id} slug={slug} group={g} current={g.tabs.find(isActive) ?? null} open={open === g.id} setOpen={(o) => setOpen(o ? g.id : null)} />
      ))}
      {isLead && (
        <Link href={`/p/${slug}/settings`} data-active={isActive(SETTINGS)} className={`${PILL} group ml-auto ${isActive(SETTINGS) ? ACTIVE : IDLE}`} aria-label="Settings" title="Settings" aria-current={isActive(SETTINGS) ? "page" : undefined}>
          <Settings size={16} className="transition-transform duration-500 group-hover:rotate-90" />
          <span className="hidden lg:inline">Settings</span>
        </Link>
      )}
    </nav>
  );
}

function TabLink({ slug, tab, active }: { slug: string; tab: Tab; active: boolean }) {
  return (
    <Link href={`/p/${slug}/${tab.href}`} data-active={active} className={`${PILL} ${active ? ACTIVE : IDLE}`} aria-current={active ? "page" : undefined}>
      <tab.icon size={16} />
      {tab.label}
    </Link>
  );
}

/**
 * A group button with a dropdown of its sections. The menu is portalled to <body> and positioned
 * `fixed` from the button, so neither the scrollable tab row (on phones) nor the header card can
 * clip it. It follows the button while scrolling; Esc, outside clicks and navigating close it, and
 * arrow keys move between items.
 */
function GroupMenu({ slug, group, current, open, setOpen }: { slug: string; group: Group; current: Tab | null; open: boolean; setOpen: (o: boolean) => void }) {
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const menuId = useId();
  const path = usePathname();
  const setOpenRef = useRef(setOpen);
  setOpenRef.current = setOpen;

  // Navigating closes the menu.
  useEffect(() => setOpenRef.current(false), [path]);

  useEffect(() => {
    if (!open) return;
    // Follow the button (the tab row scrolls sideways on phones, clamped to the viewport); close
    // once the page scrolls it out of sight.
    const place = () => {
      const r = button.current?.getBoundingClientRect();
      if (!r || r.bottom < 0 || r.top > window.innerHeight) return setOpenRef.current(false);
      setPos({ top: r.bottom + 6, left: Math.max(8, Math.min(r.left, window.innerWidth - 264)) });
    };
    place();
    const close = (e: Event) => {
      if (menu.current?.contains(e.target as Node) || button.current?.contains(e.target as Node)) return;
      setOpenRef.current(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpenRef.current(false);
        button.current?.focus();
      }
    };
    document.addEventListener("pointerdown", close);
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", close);
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const items = () => [...(menu.current?.querySelectorAll<HTMLAnchorElement>("a[role=menuitem]") ?? [])];
  const focusItem = (i: number) => {
    const list = items();
    list[(i + list.length) % list.length]?.focus();
  };

  return (
    <>
      <button
        ref={button}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen(!open)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            requestAnimationFrame(() => requestAnimationFrame(() => focusItem(0)));
          }
        }}
        className={`${PILL} ${current ? ACTIVE : open ? "bg-muted text-fg" : IDLE}`}
        data-testid={`group-${group.id}`}
        data-active={Boolean(current)}
      >
        {current ? <current.icon size={16} /> : <group.icon size={16} />}
        <span className="whitespace-nowrap">
          {group.label}
          {current && <span className="font-normal opacity-80"> · {current.label}</span>}
        </span>
        <ChevronDown size={14} className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>
      {open && pos && createPortal(
        <div
          ref={menu}
          id={menuId}
          role="menu"
          aria-label={group.label}
          className="animate-pop fixed z-50 w-64 origin-top-left rounded-2xl border border-border bg-surface/95 p-1.5 shadow-2xl shadow-black/40 backdrop-blur-xl"
          style={{ top: pos.top, left: pos.left }}
          onKeyDown={(e) => {
            const i = items().indexOf(document.activeElement as HTMLAnchorElement);
            if (e.key === "ArrowDown") (e.preventDefault(), focusItem(i + 1));
            else if (e.key === "ArrowUp") (e.preventDefault(), focusItem(i - 1));
            else if (e.key === "Home") (e.preventDefault(), focusItem(0));
            else if (e.key === "End") (e.preventDefault(), focusItem(-1));
            else if (e.key === "Tab") setOpen(false);
          }}
        >
          {group.tabs.map((t, i) => {
            const active = current?.href === t.href;
            return (
              <Link
                key={t.href}
                role="menuitem"
                href={`/p/${slug}/${t.href}`}
                onClick={() => setOpen(false)}
                aria-current={active ? "page" : undefined}
                className={`flex items-start gap-3 rounded-xl px-3 py-2.5 outline-none transition-colors focus-visible:bg-muted ${active ? "bg-gradient-to-r from-violet-500/20 to-cyan-500/5" : "hover:bg-muted"}`}
                style={{ animation: `fade-up 0.25s ${i * 35}ms both` }}
              >
                <span className={`mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${active ? "bg-accent text-white" : "bg-muted text-accent"}`}>
                  <t.icon size={15} />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-fg">{t.label}</span>
                  <span className="block text-xs text-fg-muted">{t.hint}</span>
                </span>
              </Link>
            );
          })}
        </div>,
        // Portal: the header card's backdrop-filter would otherwise become the menu's containing block.
        document.body,
      )}
    </>
  );
}
