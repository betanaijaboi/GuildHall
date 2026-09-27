"use client";

import { Scale } from "lucide-react";
import { useEffect, useState } from "react";

type Data = { rates: { n: number; p25?: number; median?: number; p75?: number; insufficient?: true }; gigs: { n: number; medianBasic: number | null } };

const usd = (c: number) => `$${(c / 100).toFixed(0)}`;

/** Live market-rate hint for the skill selected in a sibling <select name={selectName}>. */
export function RateHint({ selectName, initialSkill }: { selectName: string; initialSkill?: string }) {
  const [skill, setSkill] = useState(initialSkill ?? "");
  const [data, setData] = useState<Data | null>(null);
  useEffect(() => {
    const el = document.querySelector<HTMLSelectElement>(`select[name="${selectName}"]`);
    if (!el) return;
    const on = () => setSkill(el.value);
    on();
    el.addEventListener("change", on);
    return () => el.removeEventListener("change", on);
  }, [selectName]);
  useEffect(() => {
    if (!skill) return setData(null);
    let live = true;
    fetch(`/api/rates?skill=${encodeURIComponent(skill)}`).then((r) => r.json()).then((d) => live && setData(d)).catch(() => {});
    return () => { live = false; };
  }, [skill]);
  if (!data) return null;
  const r = data.rates;
  return (
    <div className="flex items-start gap-2 rounded-xl border border-border bg-muted/40 p-3 text-xs text-fg-muted">
      <Scale size={15} className="mt-0.5 shrink-0 text-accent" />
      <div>
        {r.insufficient ? (
          <span>Not enough anonymous rate reports for this skill yet ({r.n}/10). </span>
        ) : (
          <span>Market rate: <span className="font-semibold text-fg">{usd(r.median!)}/h median</span> (middle half {usd(r.p25!)}–{usd(r.p75!)}, {r.n} reports). </span>
        )}
        {data.gigs.medianBasic != null && <span>Gigs in this skill start around {usd(data.gigs.medianBasic)} ({data.gigs.n} gig{data.gigs.n === 1 ? "" : "s"}). </span>}
        <a href="/rates" className="link">Share yours anonymously</a>
      </div>
    </div>
  );
}
