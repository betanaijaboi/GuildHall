/**
 * Rate transparency (C20). Aggregates are only released when at least MIN_SAMPLE people
 * contributed, so no individual's rate can be inferred.
 */

export const MIN_SAMPLE = 10;

export const REGIONS = [
  { id: "na", label: "North America" },
  { id: "latam", label: "Latin America" },
  { id: "eu", label: "Europe" },
  { id: "africa", label: "Africa" },
  { id: "mena", label: "Middle East" },
  { id: "asia", label: "Asia" },
  { id: "oceania", label: "Oceania" },
] as const;

export type RegionId = (typeof REGIONS)[number]["id"];

/** Best-effort region from an IANA timezone; the user can override it when reporting. */
export function regionFromTimezone(tz: string | null | undefined): RegionId | null {
  if (!tz) return null;
  const [area, city = ""] = tz.split("/");
  if (area === "Europe") return "eu";
  if (area === "Africa") return ["Cairo", "Tripoli"].includes(city) ? "mena" : "africa";
  if (area === "Australia" || area === "Pacific") return "oceania";
  if (area === "Asia") return ["Dubai", "Riyadh", "Qatar", "Tehran", "Baghdad", "Jerusalem", "Beirut", "Amman", "Kuwait"].includes(city) ? "mena" : "asia";
  if (area === "America") {
    const na = ["New_York", "Chicago", "Denver", "Los_Angeles", "Toronto", "Vancouver", "Phoenix", "Anchorage", "Halifax", "Edmonton", "Winnipeg", "Detroit"];
    return na.includes(city) ? "na" : "latam";
  }
  return null;
}

function percentile(sorted: number[], p: number): number {
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return Math.round(sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo));
}

export type RateSummary = { n: number; p25: number; median: number; p75: number } | { n: number; insufficient: true };

export function summariseRates(values: number[]): RateSummary {
  if (values.length < MIN_SAMPLE) return { n: values.length, insufficient: true };
  const sorted = [...values].sort((a, b) => a - b);
  return { n: values.length, p25: percentile(sorted, 0.25), median: percentile(sorted, 0.5), p75: percentile(sorted, 0.75) };
}

export function isInsufficient(s: RateSummary): s is { n: number; insufficient: true } {
  return "insufficient" in s;
}
