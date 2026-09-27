import { describe, expect, it } from "vitest";
import { buildDigest } from "@/lib/digest";

describe("buildDigest", () => {
  it("counts activity and ranks contributors", () => {
    const d = buildDigest({
      activity: [
        { kind: "push", actorLogin: "mei", title: "mei pushed 3 commits to main", url: null },
        { kind: "push", actorLogin: "mei", title: "mei pushed 1 commit to main", url: null },
        { kind: "pr_merged", actorLogin: "mei", title: "Storm events", url: null },
        { kind: "release", actorLogin: "amara", title: "v0.3", url: null },
        { kind: "ci_failed", actorLogin: "jonas", title: "CI failed", url: null },
      ],
      tasksDone: [{ title: "Harbour blockout" }],
      posts: [{ title: "Devlog #1" }],
      newMembers: [{ name: "Lukas" }],
    });
    expect(d.counts).toMatchObject({ commits: 4, prsMerged: 1, releases: 1, ciFailures: 1, tasksDone: 1, posts: 1, newMembers: 1 });
    expect(d.topContributors[0]).toEqual({ login: "mei", events: 3 });
    expect(d.headline).toBe("1 PR merged · 1 task done · 1 build · 1 new member");
    expect(d.highlights[0]).toBe("Build shipped: v0.3");
  });

  it("has a headline for an empty week", () => {
    const d = buildDigest({ activity: [], tasksDone: [], posts: [], newMembers: [] });
    expect(d.headline).toMatch(/quiet week/);
  });
});
