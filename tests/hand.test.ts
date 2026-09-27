import { describe, expect, it } from "vitest";
import { mentions, orderHand, type HandItem } from "@/lib/hand";

const item = (key: string, kind: HandItem["kind"], at: number, extra: Partial<HandItem> = {}): HandItem => ({
  key, kind, title: key, detail: "", href: "/", project: { slug: "p", name: "P" }, at: new Date(2026, 0, at), ...extra,
});

describe("your hand", () => {
  it("puts blocking work first, then doing, then todo, locked last", () => {
    const ordered = orderHand(
      [item("m", "mention", 9), item("t-locked", "task", 8, { locked: true }), item("t-todo", "task", 7), item("t-doing", "task", 1, { doing: true }), item("sig", "sign", 1), item("rev", "review", 5)],
      new Map(),
    );
    expect(ordered.map((i) => i.key)).toEqual(["sig", "rev", "t-doing", "t-todo", "t-locked", "m"]);
  });
  it("respects the person's own order first", () => {
    const ordered = orderHand([item("a", "sign", 1), item("b", "task", 1), item("c", "mention", 1)], new Map([["c", 0], ["b", 1]]));
    expect(ordered.map((i) => i.key)).toEqual(["c", "b", "a"]);
  });
  it("matches whole-word mentions only", () => {
    expect(mentions("hey @mei can you look?", "mei")).toBe(true);
    expect(mentions("@Mei, please", "mei")).toBe(true);
    expect(mentions("email mei@example.com", "mei")).toBe(false);
    expect(mentions("@meimei", "mei")).toBe(false);
    expect(mentions("ping @mei-tanaka", "mei")).toBe(false);
  });
});
