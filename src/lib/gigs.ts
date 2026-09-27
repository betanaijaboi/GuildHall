/** Service gig rules (C10). Pure, so pricing and limits are unit-tested. */

export const TIERS = ["basic", "standard", "premium"] as const;
export type Tier = (typeof TIERS)[number];

export const TIER_LABEL: Record<Tier, string> = { basic: "Basic", standard: "Standard", premium: "Premium" };

export type TierInput = { tier: Tier; name: string; priceCents: number; deliveryDays: number; revisions: number };

/** Tiers must be offered in order and get strictly better: price and scope rise, delivery stays sane. */
export function validateTiers(tiers: TierInput[]): string | null {
  if (!tiers.length || tiers[0].tier !== "basic") return "Every gig needs a Basic tier";
  for (let i = 0; i < tiers.length; i++) {
    const t = tiers[i];
    if (t.tier !== TIERS[i]) return "Tiers must be Basic, then Standard, then Premium";
    if (!t.name.trim()) return `${TIER_LABEL[t.tier]} needs a name`;
    if (!Number.isInteger(t.priceCents) || t.priceCents < 500) return `${TIER_LABEL[t.tier]} must cost at least 5.00`;
    if (t.deliveryDays < 1 || t.deliveryDays > 180) return `${TIER_LABEL[t.tier]} delivery must be 1–180 days`;
    if (t.revisions < 0 || t.revisions > 20) return `${TIER_LABEL[t.tier]} revisions must be 0–20`;
    if (i > 0 && t.priceCents <= tiers[i - 1].priceCents) return `${TIER_LABEL[t.tier]} must cost more than ${TIER_LABEL[tiers[i - 1].tier]}`;
  }
  return null;
}

export function orderTotal(tierPrice: number, addons: { priceCents: number }[]): number {
  return tierPrice + addons.reduce((n, a) => n + a.priceCents, 0);
}
