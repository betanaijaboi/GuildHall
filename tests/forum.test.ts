import { describe, expect, it } from "vitest";
import { normaliseTags, sortTopics } from "@/lib/forum";

describe("forum", () => {
  it("normalises tags", () => {
    expect(normaliseTags("Needs Art, UI  ui, <script>, a,b,c,d,e,f")).toEqual(["needs", "art", "ui", "script", "a"]);
    expect(normaliseTags(["needs-art", "Needs-Art", "--x--"])).toEqual(["needs-art", "x"]);
  });
  it("sorts by votes, newest or most active", () => {
    const d = (n: number) => new Date(2026, 0, n);
    const t = [
      { id: "a", votes: 1, createdAt: d(1), lastActivity: d(9) },
      { id: "b", votes: 5, createdAt: d(2), lastActivity: d(3) },
      { id: "c", votes: 5, createdAt: d(3), lastActivity: d(4) },
    ];
    expect(sortTopics(t, "votes").map((x) => x.id)).toEqual(["c", "b", "a"]);
    expect(sortTopics(t, "new").map((x) => x.id)).toEqual(["c", "b", "a"]);
    expect(sortTopics(t, "active").map((x) => x.id)).toEqual(["a", "c", "b"]);
  });
});
