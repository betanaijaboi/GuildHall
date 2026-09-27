import { describe, expect, it } from "vitest";
import { avatarSchema, defaultAvatar, randomAvatar, resolveAvatar } from "@/lib/avatar";

describe("avatars", () => {
  it("generates a valid, deterministic default per handle", () => {
    const a = defaultAvatar("mei");
    expect(avatarSchema.safeParse(a).success).toBe(true);
    expect(defaultAvatar("mei")).toEqual(a);
    const distinct = new Set(["mei", "amara", "lukas", "rafael", "priya", "jonas"].map((h) => JSON.stringify(defaultAvatar(h))));
    expect(distinct.size).toBeGreaterThan(4);
  });

  it("random avatars are always valid", () => {
    for (let i = 0; i < 50; i++) expect(avatarSchema.safeParse(randomAvatar()).success).toBe(true);
  });

  it("falls back to the default for missing or tampered configs", () => {
    expect(resolveAvatar(null, "mei")).toEqual(defaultAvatar("mei"));
    expect(resolveAvatar({ ...defaultAvatar("x"), skin: "javascript:alert(1)" }, "mei")).toEqual(defaultAvatar("mei"));
    const custom = { ...defaultAvatar("x"), accessory: "crown" as const };
    expect(resolveAvatar(custom, "mei")).toEqual(custom);
  });
});
