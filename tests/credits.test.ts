import { describe, expect, it } from "vitest";
import { creditSource, creditStatus, creditsMarkdown, titleKey } from "@/lib/credits";

describe("credits", () => {
  it("normalises titles for teammate matching", () => {
    expect(titleKey("Tidebound: Deluxe Édition!")).toBe("tidebound deluxe edition");
    expect(titleKey("  Hollow   Knight ")).toBe(titleKey("hollow knight"));
  });
  it("accepts known storefronts and databases only", () => {
    expect(creditSource("https://store.steampowered.com/app/367520/")).toBe("Steam");
    expect(creditSource("https://studio.itch.io/game")).toBe("itch.io");
    expect(creditSource("https://www.mobygames.com/game/1")).toBe("MobyGames");
    expect(creditSource("http://store.steampowered.com/app/1")).toBeNull();
    expect(creditSource("https://evil.example/steam")).toBeNull();
    expect(creditSource("javascript:alert(1)")).toBeNull();
  });
  it("derives status", () => {
    expect(creditStatus("guildhall", 0)).toBe("verified");
    expect(creditStatus("self", 2)).toBe("confirmed");
    expect(creditStatus("self", 0)).toBe("self_reported");
  });
  it("renders CREDITS.md safely", () => {
    const md = creditsMarkdown("Tidebound", [{ name: "Ada | Lovelace", handle: "ada", role: "Narrative direction" }]);
    expect(md).toContain("| Ada  Lovelace (@ada) | Narrative direction |");
  });
});
