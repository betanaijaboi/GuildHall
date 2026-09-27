import { db } from "@/db";
import Link from "next/link";
import { Search } from "lucide-react";
import { DISCIPLINE_STYLE } from "@/components/discipline";
import { PersonCard } from "@/components/person-card";
import { SkillSelect } from "@/components/skill-picker";
import { searchPeople } from "@/lib/people";
import { DISCIPLINES, ENGAGEMENTS, ENGINES } from "@/lib/taxonomy";

export const metadata = { title: "People" };

type Search = { q?: string; skill?: string; discipline?: string; engine?: string; availability?: string; engagement?: string };

export default async function PeoplePage({ searchParams }: { searchParams: Promise<Search> }) {
  const filters = await searchParams;
  const people = await searchPeople(db, filters);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="h1">Find your <span className="text-gradient">party</span></h1>
        <p className="mt-1 text-fg-muted">Every discipline a game needs, searchable by skill, engine and availability. <Link href="/rates" className="link">See market rates →</Link></p>
      </div>
      <div className="scroll-x -mx-4 flex gap-2 px-4">
        <Link href="/people" className={`chip shrink-0 px-3 py-1.5 text-sm ${!filters.discipline ? "border-accent text-fg" : ""}`}>All</Link>
        {DISCIPLINES.map((d) => {
          const { color, icon: Icon } = DISCIPLINE_STYLE[d.id];
          const active = filters.discipline === d.id;
          return (
            <Link
              key={d.id}
              href={`/people?discipline=${d.id}`}
              className="chip-tint shrink-0 px-3 py-1.5 text-sm transition-transform hover:-translate-y-0.5"
              style={{ "--c": color, outline: active ? `2px solid ${color}` : undefined } as React.CSSProperties}
            >
              <Icon size={14} /> {d.label}
            </Link>
          );
        })}
      </div>
    <div className="grid gap-6 md:grid-cols-[260px_1fr]">
      <form className="card h-fit space-y-3 md:sticky md:top-24" method="get">
        {filters.discipline && <input type="hidden" name="discipline" value={filters.discipline} />}
        <div>
          <label className="label" htmlFor="q">Search</label>
          <div className="relative">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-muted" />
            <input id="q" name="q" defaultValue={filters.q} placeholder="Name, headline, tool…" className="input pl-9" />
          </div>
        </div>
        <div>
          <label className="label">Specialisation</label>
          <SkillSelect name="skill" defaultValue={filters.skill} />
        </div>
        <div>
          <label className="label" htmlFor="engine">Engine</label>
          <select id="engine" name="engine" defaultValue={filters.engine ?? ""} className="input">
            <option value="">Any</option>
            {ENGINES.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="engagement">Engagement</label>
          <select id="engagement" name="engagement" defaultValue={filters.engagement ?? ""} className="input">
            <option value="">Any</option>
            {ENGAGEMENTS.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="availability">Availability</label>
          <select id="availability" name="availability" defaultValue={filters.availability ?? ""} className="input">
            <option value="">Any</option>
            <option value="open">Open to work</option>
            <option value="limited">Limited</option>
          </select>
        </div>
        <button className="btn w-full">Filter</button>
      </form>
      <section>
        <p className="mb-3 text-sm text-fg-muted">{people.length} {people.length === 1 ? "person" : "people"}</p>
        <div className="stagger grid gap-3 lg:grid-cols-2">
          {people.map((p) => <PersonCard key={p.id} person={p} />)}
        </div>
        {people.length === 0 && (
          <div className="card flex flex-col items-center gap-2 py-12 text-center text-fg-muted">
            <span className="animate-float text-4xl">🔭</span>
            No one matches yet. Try widening the filters.
          </div>
        )}
      </section>
    </div>
    </div>
  );
}
