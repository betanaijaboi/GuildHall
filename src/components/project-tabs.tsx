"use client";

import { BarChart3, Flag, ImageIcon, ListTodo, MessagesSquare, Newspaper, Settings, Users, Workflow } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "workspace/general", match: "workspace", label: "Chat", icon: MessagesSquare },
  { href: "assets", match: "assets", label: "Assets", icon: ImageIcon },
  { href: "pipelines", match: "pipelines", label: "Pipelines", icon: Workflow },
  { href: "tasks", match: "tasks", label: "Tasks", icon: ListTodo },
  { href: "milestones", match: "milestones", label: "Quest log", icon: Flag },
  { href: "roles", match: "roles", label: "Party", icon: Users },
  { href: "updates", match: "updates", label: "Devlog", icon: Newspaper },
  { href: "digest", match: "digest", label: "Digest", icon: BarChart3 },
  { href: "settings", match: "settings", label: "Settings", icon: Settings },
];

export function ProjectTabs({ slug, isLead }: { slug: string; isLead: boolean }) {
  const path = usePathname();
  return (
    <nav className="scroll-x -mx-4 flex gap-1 px-4 md:mx-0 md:px-0">
      {TABS.filter((t) => t.match !== "settings" || isLead).map(({ href, match, label, icon: Icon }) => {
        const active = path.startsWith(`/p/${slug}/${match}`);
        return (
          <Link
            key={href}
            href={`/p/${slug}/${href}`}
            className={`flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium transition-all ${
              active ? "bg-gradient-to-r from-violet-500 to-cyan-500 text-white shadow-lg shadow-violet-500/25" : "text-fg-muted hover:bg-muted hover:text-fg"
            }`}
          >
            <Icon size={16} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
