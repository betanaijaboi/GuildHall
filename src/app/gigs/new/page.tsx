import { createGig } from "@/app/actions/gigs";
import { CheckboxRow, SkillSelect } from "@/components/skill-picker";
import { RateHint } from "@/components/rate-hint";
import { requireUser } from "@/lib/auth";
import { TIER_LABEL, TIERS } from "@/lib/gigs";
import { ENGINES } from "@/lib/taxonomy";

export const metadata = { title: "Offer a service" };

const EXAMPLE = {
  basic: { name: "1 loopable track", desc: "One 60–90s loop, stereo WAV.", price: "150", days: "5", rev: "1" },
  standard: { name: "3 adaptive layers", desc: "One track as 3 intensity layers that crossfade.", price: "400", days: "10", rev: "2" },
  premium: { name: "Full FMOD implementation", desc: "3 layers plus an FMOD event with parameters, ready to drop in.", price: "750", days: "14", rev: "3" },
};

export default async function NewGigPage() {
  await requireUser();
  return (
    <form action={createGig} className="mx-auto max-w-3xl space-y-5">
      <h1 className="h1">Offer a <span className="text-gradient">service</span></h1>
      <div className="card space-y-3">
        <input name="title" required minLength={5} maxLength={100} placeholder="I will compose adaptive combat music for your game" className="input text-base" />
        <div className="grid gap-3 sm:grid-cols-[1fr_140px]">
          <SkillSelect name="skillId" required />
          <select name="currency" className="input" defaultValue="usd">{["usd", "eur", "gbp", "cad", "aud"].map((c) => <option key={c} value={c}>{c.toUpperCase()}</option>)}</select>
        </div>
        <RateHint selectName="skillId" />
        <textarea name="description" rows={4} placeholder="What you deliver, your process, what you need from the client…" className="input" />
        <input name="formats" maxLength={300} placeholder="Delivered as, e.g. WAV 48kHz + FMOD bank / FBX + PBR textures 2K" className="input" />
        <input name="coverUrl" type="url" placeholder="Cover image (https link, optional)" className="input" />
        <div><span className="label">Engines</span><CheckboxRow name="engines" options={ENGINES} selected={[]} /></div>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {TIERS.map((tier) => (
          <fieldset key={tier} className="card space-y-2">
            <legend className="font-display font-semibold">{TIER_LABEL[tier]} {tier !== "basic" && <span className="text-xs font-normal text-fg-muted">(optional)</span>}</legend>
            <input name={`${tier}.name`} required={tier === "basic"} placeholder={EXAMPLE[tier].name} className="input" />
            <textarea name={`${tier}.description`} rows={2} placeholder={EXAMPLE[tier].desc} className="input" />
            <div className="grid grid-cols-3 gap-2">
              <input name={`${tier}.price`} required={tier === "basic"} placeholder={EXAMPLE[tier].price} className="input" aria-label="Price" />
              <input name={`${tier}.days`} type="number" min={1} max={180} defaultValue={EXAMPLE[tier].days} className="input" aria-label="Days" />
              <input name={`${tier}.revisions`} type="number" min={0} max={20} defaultValue={EXAMPLE[tier].rev} className="input" aria-label="Revisions" />
            </div>
            <div className="grid grid-cols-3 gap-2 text-[11px] text-fg-muted"><span>price</span><span>days</span><span>revisions</span></div>
          </fieldset>
        ))}
      </div>
      <div className="card space-y-2">
        <label className="label">Add-ons, one per line: <code>Name | price</code></label>
        <textarea name="addons" rows={3} placeholder={"Stems for each layer | 60\nCommercial licence for trailers | 100"} className="input font-mono text-xs" />
      </div>
      <button className="btn w-full py-2.5">Publish gig</button>
    </form>
  );
}
