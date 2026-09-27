import { SkillChip } from "@/components/discipline";
import { JAM_ROLES } from "@/lib/jams";

/** Compact chip checkboxes over the common jam roles. */
export function JamRolePicker({ name, selected = [] }: { name: string; selected?: string[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {JAM_ROLES.map((id) => (
        <label key={id} className="cursor-pointer rounded-full ring-accent has-[:checked]:ring-2 has-[:focus-visible]:outline has-[:focus-visible]:outline-2">
          <input type="checkbox" name={name} value={id} defaultChecked={selected.includes(id)} className="sr-only" />
          <SkillChip skillId={id} />
        </label>
      ))}
    </div>
  );
}
