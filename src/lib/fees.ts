/**
 * Marketplace pricing (C24): paid work uses either a small percentage taken from the payout, or a
 * flat per-contract fee paid by the client so the maker keeps 100%. Rev-share, hobby and jam
 * engagements are free. All amounts are integer minor units (cents).
 */

export const PERCENT_FEE = 0.06;
export const FLAT_FEE_CENTS = 2900;

export type PricingModel = "percent" | "flat";

export type MilestoneFees = { clientPays: number; platformFee: number; makerReceives: number };

export function milestoneFees(amountCents: number, model: PricingModel): MilestoneFees {
  if (!Number.isInteger(amountCents) || amountCents <= 0) throw new Error("Amount must be a positive whole number of cents");
  if (model === "flat") return { clientPays: amountCents, platformFee: 0, makerReceives: amountCents };
  const platformFee = Math.round(amountCents * PERCENT_FEE);
  return { clientPays: amountCents, platformFee, makerReceives: amountCents - platformFee };
}

/** The flat fee is charged once per contract, when the first milestone is funded. */
export function contractFeeCents(model: PricingModel, isFirstFunding: boolean): number {
  return model === "flat" && isFirstFunding ? FLAT_FEE_CENTS : 0;
}

/** Which model is cheaper for the maker for a given contract total — shown as a hint. */
export function recommendedModel(totalCents: number): PricingModel {
  return Math.round(totalCents * PERCENT_FEE) > FLAT_FEE_CENTS ? "flat" : "percent";
}

export function formatMoney(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: currency.toUpperCase() }).format(cents / 100);
}

export function parseMoney(input: string): number {
  const cleaned = input.replace(/[^\d.]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) throw new Error("Enter an amount like 450 or 450.50");
  return Math.round(Number(cleaned) * 100);
}
