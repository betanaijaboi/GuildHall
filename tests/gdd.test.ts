import { describe, expect, it } from "vitest";
import { buildTree, DEFAULT_GDD, embedUrl, pageProgress } from "@/lib/gdd";

describe("living GDD", () => {
  it("has a sensible default tree", () => {
    expect(DEFAULT_GDD.map((p) => p.title)).toContain("Mechanics");
  });
  it("only embeds Figma and Miro", () => {
    expect(embedUrl("https://www.figma.com/design/AbC123/Harbour-UI")).toBe(
      "https://www.figma.com/embed?embed_host=guildhall&url=https%3A%2F%2Fwww.figma.com%2Fdesign%2FAbC123%2FHarbour-UI",
    );
    expect(embedUrl("https://miro.com/app/board/uXjVK123=/")).toBe("https://miro.com/app/live-embed/uXjVK123=/");
    expect(embedUrl("https://evil.example/figma.com/file/x")).toBeNull();
    expect(embedUrl("http://www.figma.com/file/x")).toBeNull();
    expect(embedUrl("https://www.figma.com/settings")).toBeNull();
    expect(embedUrl("javascript:alert(1)")).toBeNull();
  });
  it("computes progress across linked work", () => {
    expect(pageProgress([])).toBeNull();
    expect(pageProgress([{ type: "task", status: "done" }, { type: "task", status: "doing" }, { type: "pipeline", progress: 50 }, { type: "asset", status: "in_review" }])).toBe(50);
  });
  it("builds a two-level tree", () => {
    const tree = buildTree([
      { id: "a", parentId: null, position: 1 },
      { id: "b", parentId: null, position: 0 },
      { id: "c", parentId: "a", position: 0 },
    ]);
    expect(tree.map((t) => t.id)).toEqual(["b", "a"]);
    expect(tree[1].children.map((c) => c.id)).toEqual(["c"]);
  });
});
