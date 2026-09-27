import { describe, expect, it } from "vitest";
import { hashSecret, newInviteToken, newShareCode, normaliseShareCode } from "@/lib/guests";
import { safeNext } from "@/lib/next-path";

describe("share codes", () => {
  it("are readable and avoid ambiguous characters", () => {
    for (let i = 0; i < 50; i++) expect(newShareCode()).toMatch(/^GH-[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/);
  });
  it("normalise what people type", () => {
    expect(normaliseShareCode("gh-ab23-cd45")).toBe("GH-AB23-CD45");
    expect(normaliseShareCode(" ab23 cd45 ")).toBe("GH-AB23-CD45");
    expect(normaliseShareCode("GHAB23CD45")).toBe("GH-AB23-CD45");
  });
});

describe("invite tokens", () => {
  it("are long, url-safe and stored only as a hash", () => {
    const t = newInviteToken();
    expect(t).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(hashSecret(t)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashSecret(t)).not.toContain(t);
  });
});

describe("safeNext", () => {
  it("allows same-site paths only", () => {
    expect(safeNext("/invite/abc")).toBe("/invite/abc");
    expect(safeNext("//evil.com")).toBeNull();
    expect(safeNext("https://evil.com")).toBeNull();
    expect(safeNext("/\\evil.com")).toBeNull();
    expect(safeNext("/a\nb")).toBeNull();
    expect(safeNext(undefined)).toBeNull();
  });
});
