import Link from "next/link";
import { Avatar } from "./avatar";
import { ENGINES, labelFor, skillLabel } from "@/lib/taxonomy";

const AVAILABILITY: Record<string, string> = { open: "Open to work", limited: "Limited availability", busy: "Busy" };

export function PersonCard({
  person,
}: {
  person: { handle: string; name: string; avatarUrl: string | null; headline: string; availability: string; engines: string[]; skillIds: string[] };
}) {
  return (
    <Link href={`/people/${person.handle}`} className="card flex gap-3 hover:border-accent">
      <Avatar name={person.name} url={person.avatarUrl} size={44} />
      <div className="min-w-0">
        <div className="font-medium">{person.name}</div>
        <div className="truncate text-sm text-fg-muted">{person.headline || `@${person.handle}`}</div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {person.skillIds.slice(0, 4).map((s) => (
            <span key={s} className="chip">{skillLabel(s)}</span>
          ))}
          {person.engines.slice(0, 2).map((e) => (
            <span key={e} className="chip">{labelFor(ENGINES, e)}</span>
          ))}
          <span className={`chip ${person.availability === "open" ? "text-good" : ""}`}>{AVAILABILITY[person.availability]}</span>
        </div>
      </div>
    </Link>
  );
}
