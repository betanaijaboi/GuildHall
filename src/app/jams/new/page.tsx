import { createJam } from "@/app/actions/jams";
import { JamDates } from "@/components/jam-form";
import { requireUser } from "@/lib/auth";

export const metadata = { title: "Host a jam" };

export default async function NewJamPage() {
  await requireUser();
  return (
    <form action={createJam} className="card mx-auto max-w-2xl space-y-5">
      <div>
        <h1 className="h1">Host a <span className="text-gradient">jam</span></h1>
        <p className="mt-1 text-sm text-fg-muted">Running it on itch.io already? Paste the jam link: Guildhall becomes the place teams form and work, and entries still go to itch.</p>
      </div>
      <div>
        <label className="label" htmlFor="name">Name</label>
        <input id="name" name="name" required minLength={3} maxLength={80} className="input" placeholder="Tiny Tides Jam" />
      </div>
      <div>
        <label className="label" htmlFor="description">Description and rules</label>
        <textarea id="description" name="description" rows={4} className="input" placeholder="48 hours, any engine, teams of up to 4. Assets made during the jam only." />
      </div>
      <div className="grid gap-4 sm:grid-cols-[1fr_140px]">
        <div>
          <label className="label" htmlFor="theme">Theme <span className="font-normal text-fg-muted">(secret until the start)</span></label>
          <input id="theme" name="theme" maxLength={120} className="input" placeholder="Everything is borrowed" />
        </div>
        <div>
          <label className="label" htmlFor="maxTeamSize">Max team size</label>
          <input id="maxTeamSize" name="maxTeamSize" type="number" min={1} max={12} defaultValue={4} className="input" />
        </div>
      </div>
      <JamDates />
      <div>
        <label className="label" htmlFor="itchUrl">itch.io jam link <span className="font-normal text-fg-muted">(optional)</span></label>
        <input id="itchUrl" name="itchUrl" className="input" placeholder="https://itch.io/jam/tiny-tides" />
      </div>
      <button className="btn w-full py-2.5">Create jam</button>
    </form>
  );
}
