import { eq } from "drizzle-orm";
import { db } from "@/db";
import { portfolioItems, profileSkills } from "@/db/schema";
import { addPortfolioItem, deletePortfolioItem, updateProfile } from "@/app/actions/profile";
import { CheckboxRow, SkillPicker } from "@/components/skill-picker";
import { requireUser } from "@/lib/auth";
import { ENGAGEMENTS, ENGINES, PLATFORMS, SENIORITIES } from "@/lib/taxonomy";

export const metadata = { title: "Edit profile" };

export default async function EditProfilePage({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const user = await requireUser();
  const { welcome } = await searchParams;
  const [skills, portfolio] = await Promise.all([
    db.select().from(profileSkills).where(eq(profileSkills.userId, user.id)),
    db.select().from(portfolioItems).where(eq(portfolioItems.userId, user.id)),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <h1 className="h1">{welcome ? "Welcome — set up your profile" : "Edit profile"}</h1>
        <p className="text-sm text-fg-muted">Your skills and engines decide which projects and searches you show up in.</p>
      </div>
      <form action={updateProfile} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="name">Name</label>
            <input id="name" name="name" defaultValue={user.name} required className="input" />
          </div>
          <div>
            <label className="label" htmlFor="headline">Headline</label>
            <input id="headline" name="headline" defaultValue={user.headline} placeholder="Environment artist · Unreal · open to rev-share" className="input" />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="bio">Bio</label>
          <textarea id="bio" name="bio" rows={4} defaultValue={user.bio} className="input" />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="label" htmlFor="availability">Availability</label>
            <select id="availability" name="availability" defaultValue={user.availability} className="input">
              <option value="open">Open to work</option>
              <option value="limited">Limited</option>
              <option value="busy">Busy</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="seniority">Seniority</label>
            <select id="seniority" name="seniority" defaultValue={user.seniority ?? ""} className="input">
              <option value="">—</option>
              {SENIORITIES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="timezone">Timezone</label>
            <input id="timezone" name="timezone" defaultValue={user.timezone ?? ""} placeholder="Europe/London" className="input" />
          </div>
        </div>
        <div>
          <span className="label">Skills (up to 12)</span>
          <SkillPicker name="skills" selected={skills.map((s) => s.skillId)} />
        </div>
        <div>
          <span className="label">Engines</span>
          <CheckboxRow name="engines" options={ENGINES} selected={user.engines} />
        </div>
        <div>
          <span className="label">Platforms shipped on or targeting</span>
          <CheckboxRow name="platforms" options={PLATFORMS} selected={user.platforms} />
        </div>
        <div>
          <span className="label">Open to</span>
          <CheckboxRow name="engagements" options={ENGAGEMENTS} selected={user.engagements} />
        </div>
        <div>
          <label className="label" htmlFor="tools">Tools (comma separated)</label>
          <input id="tools" name="tools" defaultValue={user.tools.join(", ")} placeholder="Blender, Substance Painter, Houdini" className="input" />
        </div>
        <button className="btn">Save profile</button>
      </form>

      <section className="space-y-3">
        <h2 className="h2">Portfolio</h2>
        <ul className="space-y-2">
          {portfolio.map((item) => (
            <li key={item.id} className="card flex items-center justify-between gap-3">
              <a href={item.url} className="link" target="_blank" rel="noreferrer">{item.title}</a>
              <form action={deletePortfolioItem}>
                <input type="hidden" name="id" value={item.id} />
                <button className="text-sm text-bad">Remove</button>
              </form>
            </li>
          ))}
        </ul>
        <form action={addPortfolioItem} className="card grid gap-3 sm:grid-cols-2">
          <input name="title" required placeholder="Title" className="input" />
          <input name="url" required type="url" placeholder="https://www.artstation.com/…" className="input" />
          <input name="description" placeholder="Short description" className="input sm:col-span-2" />
          <button className="btn-secondary sm:col-span-2">Add portfolio item</button>
        </form>
      </section>
    </div>
  );
}
