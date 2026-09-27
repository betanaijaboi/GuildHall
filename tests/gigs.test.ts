import { describe, expect, it } from "vitest";
import { orderTotal, validateTiers } from "@/lib/gigs";

const t = (tier: "basic" | "standard" | "premium", priceCents: number) => ({ tier, name: tier, priceCents, deliveryDays: 5, revisions: 1 });

describe("gig tiers", () => {
  it("accepts ascending tiers", () => {
    expect(validateTiers([t("basic", 5000)])).toBeNull();
    expect(validateTiers([t("basic", 5000), t("standard", 12000), t("premium", 25000)])).toBeNull();
  });
  it("rejects missing basic, wrong order, or non-increasing prices", () => {
    expect(validateTiers([])).toMatch(/Basic/);
    expect(validateTiers([t("standard", 5000)])).toMatch(/Basic/);
    expect(validateTiers([t("basic", 5000), t("premium", 9000)])).toMatch(/order|then/);
    expect(validateTiers([t("basic", 5000), t("standard", 5000)])).toMatch(/more than Basic/);
    expect(validateTiers([t("basic", 100)])).toMatch(/at least/);
  });
  it("totals add-ons", () => {
    expect(orderTotal(12000, [{ priceCents: 3000 }, { priceCents: 1500 }])).toBe(16500);
  });
});
