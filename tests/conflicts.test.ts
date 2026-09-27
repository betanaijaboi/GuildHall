import { describe, expect, it } from "vitest";
import { findHotspots, isUnmergeable, unmergeableTouches } from "@/lib/conflicts";
import { mapEvent } from "@/lib/github/events";

describe("conflict radar", () => {
  it("knows which files can't be merged", () => {
    expect(isUnmergeable("Content/Maps/Harbour.umap")).toBe(true);
    expect(isUnmergeable("Art/boat.PSD")).toBe(true);
    expect(isUnmergeable("src/player.gd")).toBe(false);
    expect(unmergeableTouches([{ added: ["a.umap", "b.gd"], modified: ["a.umap", "c.blend"] }])).toEqual(["a.umap", "c.blend"]);
  });

  it("finds files touched by 2+ people inside the window, flagging cross-branch edits", () => {
    const now = new Date("2026-09-27T12:00:00Z");
    const day = (d: number) => new Date(now.getTime() - d * 86_400_000);
    const hotspots = findHotspots(
      [
        { path: "Harbour.umap", actorLogin: "ada", branch: "main", at: day(1) },
        { path: "Harbour.umap", actorLogin: "mei", branch: "storm", at: day(0.5) },
        { path: "Boat.blend", actorLogin: "ada", branch: "main", at: day(2) },
        { path: "Boat.blend", actorLogin: "ada", branch: "main", at: day(1) },
        { path: "Old.psd", actorLogin: "ada", branch: "main", at: day(10) },
        { path: "Old.psd", actorLogin: "mei", branch: "main", at: day(9) },
      ],
      now,
    );
    expect(hotspots).toHaveLength(1);
    expect(hotspots[0]).toMatchObject({ path: "Harbour.umap", actors: ["ada", "mei"], crossBranch: true });
  });

  it("emits file touches from push webhooks", () => {
    const effects = mapEvent("push", {
      ref: "refs/heads/storm",
      repository: { id: 1, full_name: "s/g" },
      pusher: { name: "mei" },
      commits: [{ message: "x", added: ["Maps/Sea.umap"], modified: ["scripts/a.gd"] }],
    });
    expect(effects.find((e) => e.type === "file_touches")).toEqual({ type: "file_touches", branch: "storm", actorLogin: "mei", paths: ["Maps/Sea.umap"] });
  });
});
