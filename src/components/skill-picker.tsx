import { DISCIPLINES } from "@/lib/taxonomy";

/** Checkbox groups over the full taxonomy. Pure server component; works without JS. */
export function SkillPicker({ name, selected }: { name: string; selected: string[] }) {
  const chosen = new Set(selected);
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {DISCIPLINES.map((d) => (
        <fieldset key={d.id} className="rounded-md border border-border p-3">
          <legend className="px-1 text-sm font-medium">{d.label}</legend>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {d.specialisations.map((s) => (
              <label key={s.id} className="flex items-center gap-1.5 text-sm">
                <input type="checkbox" name={name} value={s.id} defaultChecked={chosen.has(s.id)} />
                {s.label}
              </label>
            ))}
          </div>
        </fieldset>
      ))}
    </div>
  );
}

export function SkillSelect({ name, defaultValue, required }: { name: string; defaultValue?: string; required?: boolean }) {
  return (
    <select name={name} defaultValue={defaultValue ?? ""} className="input" required={required}>
      <option value="">Choose a specialisation…</option>
      {DISCIPLINES.map((d) => (
        <optgroup key={d.id} label={d.label}>
          {d.specialisations.map((s) => (
            <option key={s.id} value={s.id}>{s.label}</option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

export function CheckboxRow({ name, options, selected }: { name: string; options: readonly { id: string; label: string }[]; selected: string[] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1">
      {options.map((o) => (
        <label key={o.id} className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" name={name} value={o.id} defaultChecked={selected.includes(o.id)} />
          {o.label}
        </label>
      ))}
    </div>
  );
}
