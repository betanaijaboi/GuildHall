import { disciplineOf } from "@/lib/taxonomy";

/** Saved-search alerts and the personalised weekly digest (C16). */

export type SearchLike = { skill: string | null; engine: string | null; stage: string | null };
export type RoleLike = { skillId: string; engine: string; stage: string };

export function matchesSearch(s: SearchLike, r: RoleLike): boolean {
  return (!s.skill || s.skill === r.skillId) && (!s.engine || s.engine === r.engine) && (!s.stage || s.stage === r.stage);
}

/** ISO week key ("2026-W40"): one digest per person per week. */
export function isoWeekKey(d: Date): string {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = Date.UTC(t.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((t.getTime() - yearStart) / 86_400_000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export const digestDue = (last: Date | null, now: Date) => !last || now.getTime() - last.getTime() >= 7 * 86_400_000 - 3_600_000;

/** How well a role fits someone: their exact skill beats same discipline; engine familiarity helps. */
export function roleFit(person: { skills: string[]; engines: string[] }, r: RoleLike): number {
  let score = 0;
  if (person.skills.includes(r.skillId)) score += 3;
  else if (person.skills.some((s) => disciplineOf(s)?.id === disciplineOf(r.skillId)?.id)) score += 1;
  if (person.engines.includes(r.engine)) score += 1;
  return score;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function digestEmail(name: string, sections: { heading: string; lines: { text: string; url: string }[] }[], appUrl: string) {
  const subject = `Your Guildhall week: ${sections.map((s) => `${s.lines.length} ${s.heading.toLowerCase()}`).join(", ")}`;
  const text = [`Hi ${name},`, "", ...sections.flatMap((s) => [s.heading, ...s.lines.map((l) => `- ${l.text}: ${appUrl}${l.url}`), ""]), `Manage alerts: ${appUrl}/settings/notifications`].join("\n");
  const html = `<p>Hi ${esc(name)},</p>${sections.map((s) => `<h3>${esc(s.heading)}</h3><ul>${s.lines.map((l) => `<li><a href="${esc(appUrl + l.url)}">${esc(l.text)}</a></li>`).join("")}</ul>`).join("")}<p><a href="${esc(appUrl)}/settings/notifications">Manage alerts</a></p>`;
  return { subject, text, html };
}
