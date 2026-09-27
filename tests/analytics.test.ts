import { describe, expect, it } from "vitest";
import { dayKey, isBot, series, sourceOf, sparkPath, trend, visitorHash } from "@/lib/analytics";

describe("analytics helpers", () => {
  it("buckets referrers into sources", () => {
    expect(sourceOf("https://www.google.com/search?q=x", "gh.io")).toBe("Google");
    expect(sourceOf("https://www.artstation.com/lukas", "gh.io")).toBe("ArtStation");
    expect(sourceOf("https://discord.com/channels/1/2", "gh.io")).toBe("Discord");
    expect(sourceOf("https://t.co/abc", "gh.io")).toBe("X / Twitter");
    expect(sourceOf("https://gh.io/people", "gh.io")).toBe("Guildhall");
    expect(sourceOf("https://www.somesite.dev/post", "gh.io")).toBe("somesite.dev");
    expect(sourceOf(null, "gh.io")).toBe("direct");
    expect(sourceOf("garbage", "gh.io")).toBe("direct");
  });
  it("hashes visitors per day without exposing them", () => {
    const a = visitorHash("salt", "2026-09-27", "a:1.2.3.4|UA");
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(a).not.toContain("1.2.3.4");
    expect(visitorHash("salt", "2026-09-27", "a:1.2.3.4|UA")).toBe(a);
    expect(visitorHash("salt", "2026-09-28", "a:1.2.3.4|UA")).not.toBe(a);
    expect(visitorHash("other", "2026-09-27", "a:1.2.3.4|UA")).not.toBe(a);
  });
  it("filters bots", () => {
    expect(isBot("Mozilla/5.0 (compatible; Googlebot/2.1)")).toBe(true);
    expect(isBot("Discordbot/2.0")).toBe(true);
    expect(isBot(null)).toBe(true);
    expect(isBot("Mozilla/5.0 (Windows NT 10.0) Chrome/130")).toBe(false);
  });
  it("fills series, draws sparklines and computes trends", () => {
    const today = new Date(Date.UTC(2026, 8, 27));
    const s = series([{ day: "2026-09-26", value: 3 }], 3, today);
    expect(s).toEqual([{ day: "2026-09-25", value: 0 }, { day: "2026-09-26", value: 3 }, { day: "2026-09-27", value: 0 }]);
    expect(dayKey(today)).toBe("2026-09-27");
    expect(sparkPath([0, 2], 100, 10)).toBe("M0.0,9.0 L100.0,1.0");
    expect(sparkPath([], 100, 10)).toBe("");
    expect(trend([1, 1, 2, 2])).toBe(100);
    expect(trend([0, 0, 1, 1])).toBeNull();
    expect(trend([0, 0, 0, 0])).toBe(0);
  });
});
