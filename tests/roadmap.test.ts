import { describe, expect, it } from "vitest";
import { canVote, rankItems } from "@/lib/roadmap";

const d = (n: number) => new Date(2026, 0, n);
describe("rankItems", () => {
  it("orders open columns by votes then age, and shipped by date", () => {
    const b = rankItems([
      { id: "a", column: "next", votes: 2, createdAt: d(3), shippedAt: null },
      { id: "b", column: "next", votes: 5, createdAt: d(5), shippedAt: null },
      { id: "c", column: "next", votes: 2, createdAt: d(1), shippedAt: null },
      { id: "s1", column: "shipped", votes: 9, createdAt: d(1), shippedAt: d(2) },
      { id: "s2", column: "shipped", votes: 0, createdAt: d(1), shippedAt: d(8) },
    ]);
    expect(b.next.map((i) => i.id)).toEqual(["b", "c", "a"]);
    expect(b.shipped.map((i) => i.id)).toEqual(["s2", "s1"]);
    expect(b.now).toEqual([]);
    expect(canVote("shipped")).toBe(false);
  });
});
