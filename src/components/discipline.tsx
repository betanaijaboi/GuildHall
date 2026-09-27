import { ClipboardCheck, Code2, Feather, Megaphone, Music, Palette, Puzzle, type LucideIcon } from "lucide-react";
import { disciplineOf, skillLabel } from "@/lib/taxonomy";

/** Colour + icon per discipline, so skills read at a glance everywhere in the app. */
export const DISCIPLINE_STYLE: Record<string, { color: string; icon: LucideIcon }> = {
  narrative: { color: "#fbbf24", icon: Feather },
  design: { color: "#f472b6", icon: Puzzle },
  engineering: { color: "#22d3ee", icon: Code2 },
  art: { color: "#a78bfa", icon: Palette },
  audio: { color: "#34d399", icon: Music },
  production: { color: "#fb923c", icon: ClipboardCheck },
  business: { color: "#60a5fa", icon: Megaphone },
};

export function disciplineStyle(disciplineId: string | undefined) {
  return DISCIPLINE_STYLE[disciplineId ?? ""] ?? { color: "#9a96b3", icon: Puzzle };
}

export function SkillChip({ skillId, prefix }: { skillId: string; prefix?: string }) {
  const { color, icon: Icon } = disciplineStyle(disciplineOf(skillId)?.id);
  return (
    <span className="chip-tint" style={{ "--c": color } as React.CSSProperties}>
      <Icon size={12} strokeWidth={2.4} />
      {prefix ? `${prefix} ${skillLabel(skillId)}` : skillLabel(skillId)}
    </span>
  );
}

export function DisciplineIcon({ disciplineId, size = 18 }: { disciplineId: string; size?: number }) {
  const { color, icon: Icon } = disciplineStyle(disciplineId);
  return (
    <span
      className="inline-flex items-center justify-center rounded-xl"
      style={{ color, background: `color-mix(in oklab, ${color} 16%, transparent)`, width: size * 2, height: size * 2 }}
    >
      <Icon size={size} strokeWidth={2.2} />
    </span>
  );
}
