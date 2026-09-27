"use client";

import { FolderKanban, Home, Layers, Plus, Sparkles, Store, Users, Gamepad2 } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/people", label: "People", icon: Users },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/gigs", label: "Gigs", icon: Store },
  { href: "/jams", label: "Jams", icon: Gamepad2 },
];

export function NavLinks({ signedIn }: { signedIn: boolean }) {
  const path = usePathname();
  const links = signedIn ? [{ href: "/hand", label: "Your hand", icon: Layers }, ...LINKS] : LINKS;
  return (
    <div className="hidden items-center gap-1 md:flex">
      {links.map(({ href, label, icon: Icon }) => {
        const active = path.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={`relative inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition-colors ${active ? "text-fg" : "text-fg-muted hover:text-fg"}`}
          >
            <Icon size={16} />
            {label}
            {active && <span className="absolute inset-x-3 -bottom-[13px] h-0.5 rounded-full bg-gradient-to-r from-violet-500 to-cyan-400" />}
          </Link>
        );
      })}
    </div>
  );
}

/** Thumb-reachable tab bar on phones. */
export function MobileTabBar({ handle }: { handle: string | null }) {
  const path = usePathname();
  const tabs = [
    handle
      ? { href: "/hand", label: "Hand", icon: Layers, match: (p: string) => p === "/hand" }
      : { href: "/", label: "Home", icon: Home, match: (p: string) => p === "/" },
    { href: "/people", label: "People", icon: Users, match: (p: string) => p.startsWith("/people") && !p.startsWith(`/people/${handle}`) },
    { href: handle ? "/projects/new" : "/login", label: "Create", icon: Plus, match: (p: string) => p === "/projects/new", primary: true },
    { href: "/projects", label: "Projects", icon: FolderKanban, match: (p: string) => p.startsWith("/projects") && p !== "/projects/new" || p.startsWith("/p/") },
    { href: handle ? `/people/${handle}` : "/login", label: "Me", icon: Sparkles, match: (p: string) => !!handle && (p.startsWith(`/people/${handle}`) || p.startsWith("/settings")) },
  ];
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden">
      <ul className="grid grid-cols-5">
        {tabs.map(({ href, label, icon: Icon, match, primary }) => {
          const active = match(path);
          return (
            <li key={label}>
              <Link href={href} className={`flex flex-col items-center gap-0.5 py-2 text-[11px] ${active ? "text-fg" : "text-fg-muted"}`}>
                {primary ? (
                  <span className="-mt-5 inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-cyan-500 text-white shadow-lg shadow-violet-500/40">
                    <Icon size={22} />
                  </span>
                ) : (
                  <Icon size={20} className={active ? "text-accent" : ""} />
                )}
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
