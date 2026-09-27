import Link from "next/link";
import { Avatar } from "./avatar";
import { SkillChip } from "./discipline";
import { ENGINES, labelFor } from "@/lib/taxonomy";

const AVAILABILITY: Record<string, { label: string; color: string }> = {
  open: { label: "Open to work", color: "#34d399" },
  limited: { label: "Limited", color: "#fbbf24" },
  busy: { label: "Busy", color: "#9a96b3" },
};

export function PersonCard({
  person,
}: {
  person: { handle: string; name: string; avatarUrl: string | null; avatar: unknown; headline: string; availability: string; engines: string[]; skillIds: string[] };
}) {
  const a = AVAILABILITY[person.availability] ?? AVAILABILITY.busy;
  return (
    <Link href={`/people/${person.handle}`} className="card card-hover group flex gap-4">
      <div className="relative">
        <Avatar user={person} size={60} />
        <span className="absolute bottom-0.5 right-0.5 h-3.5 w-3.5 rounded-full ring-2 ring-surface" style={{ background: a.color }} title={a.label} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="truncate font-display font-semibold group-hover:text-accent">{person.name}</span>
          <span className="truncate text-xs text-fg-muted">@{person.handle}</span>
        </div>
        <div className="truncate text-sm text-fg-muted">{person.headline || "Game maker"}</div>
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {person.skillIds.slice(0, 3).map((s) => <SkillChip key={s} skillId={s} />)}
          {person.engines.slice(0, 2).map((e) => <span key={e} className="chip">{labelFor(ENGINES, e)}</span>)}
        </div>
      </div>
    </Link>
  );
}
