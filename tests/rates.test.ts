import { describe, expect, it } from "vitest";
import { isInsufficient, MIN_SAMPLE, regionFromTimezone, summariseRates } from "@/lib/rates";

describe("rate transparency", () => {
  it("withholds aggregates below the privacy threshold", () => {
    const s = summariseRates([3000, 4000, 5000]);
    expect(isInsufficient(s)).toBe(true);
    expect(s).toEqual({ n: 3, insufficient: true });
  });
  it("reports quartiles once there are enough reports", () => {
    const values = Array.from({ length: MIN_SAMPLE + 1 }, (_, i) => 3000 + i * 100); // 30.00 … 40.00
    expect(summariseRates(values)).toEqual({ n: 11, p25: 3250, median: 3500, p75: 3750 });
  });
  it("derives regions from timezones", () => {
    expect(regionFromTimezone("Europe/London")).toBe("eu");
    expect(regionFromTimezone("America/Los_Angeles")).toBe("na");
    expect(regionFromTimezone("America/Sao_Paulo")).toBe("latam");
    expect(regionFromTimezone("Africa/Lagos")).toBe("africa");
    expect(regionFromTimezone("Asia/Dubai")).toBe("mena");
    expect(regionFromTimezone("Asia/Tokyo")).toBe("asia");
    expect(regionFromTimezone(null)).toBeNull();
  });
});
