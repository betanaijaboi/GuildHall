import { describe, expect, it } from "vitest";
import { isValidHandle, slugify } from "@/lib/slug";

describe("slugify", () => {
  it("normalises names", () => {
    expect(slugify("Tidebound: The Voyage!")).toBe("tidebound-the-voyage");
    expect(slugify("Café Noir")).toBe("cafe-noir");
    expect(slugify("!!!")).toBe("project");
    expect(slugify("a".repeat(80)).length).toBeLessThanOrEqual(48);
  });
});

describe("isValidHandle", () => {
  it("accepts GitHub-style handles only", () => {
    expect(isValidHandle("mei-tanaka")).toBe(true);
    expect(isValidHandle("-bad")).toBe(false);
    expect(isValidHandle("double--dash")).toBe(false);
    expect(isValidHandle("a".repeat(40))).toBe(false);
  });
});
