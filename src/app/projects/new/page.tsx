import { createProject } from "@/app/actions/project";
import { CheckboxRow, SkillSelect } from "@/components/skill-picker";
import { requireUser } from "@/lib/auth";
import { ENGAGEMENTS, ENGINES, PLATFORMS, STAGES } from "@/lib/taxonomy";

export const metadata = { title: "New project" };

export default async function NewProjectPage() {
  await requireUser();
  return (
    <form action={createProject} className="mx-auto max-w-2xl space-y-5">
      <h1 className="h1">Start a project</h1>
      <div>
        <label className="label" htmlFor="name">Name</label>
        <input id="name" name="name" required minLength={2} maxLength={80} className="input" />
      </div>
      <div>
        <label className="label" htmlFor="pitch">Pitch</label>
        <textarea id="pitch" name="pitch" rows={4} placeholder="One paragraph: premise, core loop, what makes it different." className="input" />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className="label" htmlFor="engine">Engine</label>
          <select id="engine" name="engine" className="input">
            {ENGINES.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="stage">Current stage</label>
          <select id="stage" name="stage" defaultValue="concept" className="input">
            {STAGES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="engagement">Team arrangement</label>
          <select id="engagement" name="engagement" defaultValue="revshare" className="input">
            {ENGAGEMENTS.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
          </select>
        </div>
      </div>
      <div>
        <span className="label">Target platforms</span>
        <CheckboxRow name="platforms" options={PLATFORMS} selected={["pc"]} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="genres">Genres (comma separated)</label>
          <input id="genres" name="genres" placeholder="Action RPG, dark fantasy" className="input" />
        </div>
        <div>
          <label className="label">Your role on the project</label>
          <SkillSelect name="ownerSkill" />
        </div>
      </div>
      <div>
        <span className="label">Visibility</span>
        <label className="mr-4 text-sm"><input type="radio" name="visibility" value="public" defaultChecked /> Public page (recruiting, devlogs)</label>
        <label className="text-sm"><input type="radio" name="visibility" value="private" /> Private</label>
      </div>
      <button className="btn">Create project</button>
    </form>
  );
}
