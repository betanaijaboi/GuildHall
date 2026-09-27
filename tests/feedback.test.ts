import { describe, expect, it } from "vitest";
import { cleanAnswers, issueBody, parseQuestions, questionsToText, RateLimiter, summarise } from "@/lib/feedback";

const qs = parseQuestions("rating: How fun?\ntext: What confused you?\nchoice: Wishlist? | Yes | Maybe | No\n\nJust a plain question");

describe("playtest questions", () => {
  it("parses one per line and round-trips", () => {
    expect(qs.map((q) => [q.id, q.kind, q.prompt, q.options.length])).toEqual([
      ["q1", "rating", "How fun?", 0],
      ["q2", "text", "What confused you?", 0],
      ["q3", "choice", "Wishlist?", 3],
      ["q4", "text", "Just a plain question", 0],
    ]);
    expect(parseQuestions(questionsToText(qs))).toEqual(qs);
  });
  it("rejects choices without options and too many questions", () => {
    expect(() => parseQuestions("choice: Buy? | Yes")).toThrow(/two options/);
    expect(() => parseQuestions(Array.from({ length: 11 }, (_, i) => `text: q${i}`).join("\n"))).toThrow(/Up to 10/);
  });
});

describe("answers", () => {
  it("keeps only valid values", () => {
    expect(cleanAnswers(qs, { q1: "6", q2: "  lost  ", q3: "Definitely", q4: "" })).toEqual({ q2: "lost" });
    expect(cleanAnswers(qs, { q1: "4", q3: "Yes", extra: "x" })).toEqual({ q1: 4, q3: "Yes" });
  });
  it("summarises ratings, choices and text", () => {
    const [r, t, c] = summarise(qs, [{ q1: 5, q3: "Yes", q2: "the map" }, { q1: 3, q3: "Yes" }, { q1: 4, q3: "No" }]);
    expect(r).toMatchObject({ kind: "rating", average: 4, counts: [0, 0, 1, 1, 1], n: 3 });
    expect(t).toMatchObject({ kind: "text", answers: ["the map"] });
    expect(c).toMatchObject({ kind: "choice", counts: { Yes: 2, Maybe: 0, No: 1 } });
  });
});

describe("issueBody", () => {
  it("quotes player text and neutralises @mentions", () => {
    const b = issueBody({ kind: "bug", title: "t", body: "Fell through\n@everyone look", build: "0.4", platform: "Windows", source: "sdk", reporterName: "@sam", answers: { q1: 2, q3: "No | really" } }, qs, "https://gh/x");
    expect(b).toContain("> Fell through\n> @​everyone look");
    expect(b).toContain("from @​sam");
    expect(b).toContain("| How fun? | 2 |");
    expect(b).toContain("No \\| really");
    expect(b).toContain("- Build: `0.4`");
  });
});

describe("RateLimiter", () => {
  it("allows a burst then refills over time", () => {
    const l = new RateLimiter(2, 60);
    expect([l.take("k", 0), l.take("k", 0), l.take("k", 0)]).toEqual([true, true, false]);
    expect(l.take("k", 1000)).toBe(true);
    expect(l.take("other", 0)).toBe(true);
  });
});
