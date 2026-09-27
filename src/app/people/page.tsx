import { db } from "@/db";
import { PersonCard } from "@/components/person-card";
import { SkillSelect } from "@/components/skill-picker";
import { searchPeople } from "@/lib/people";
import { ENGAGEMENTS, ENGINES } from "@/lib/taxonomy";

export const metadata = { title: "People" };

type Search = { q?: string; skill?: string; engine?: string; availability?: string; engagement?: string };

export default async function PeoplePage({ searchParams }: { searchParams: Promise<Search> }) {
  const filters = await searchParams;
  const people = await searchPeople(db, filters);
  return (
    <div className="grid gap-6 md:grid-cols-[260px_1fr]">
      <form className="space-y-3" method="get">
        <h1 className="h1">People</h1>
        <div>
          <label className="label" htmlFor="q">Search</label>
          <input id="q" name="q" defaultValue={filters.q} placeholder="Name, headline, tool…" className="input" />
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
        <div className="grid gap-3 lg:grid-cols-2">
          {people.map((p) => <PersonCard key={p.id} person={p} />)}
        </div>
      </section>
    </div>
  );
}
