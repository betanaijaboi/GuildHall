import { describe, expect, it } from "vitest";
import { mapEvent } from "@/lib/github/events";

const repository = { id: 42, full_name: "studio/game" };

describe("mapEvent", () => {
  it("summarises pushes and ignores branch deletions", () => {
    const effects = mapEvent("push", {
      ref: "refs/heads/main",
      repository,
      pusher: { name: "mei" },
      compare: "https://x",
      commits: [{ message: "Add boat\n\nlong body" }, { message: "Fix wind" }],
    });
    expect(effects[0]).toMatchObject({ type: "message", channel: "github", body: "mei pushed 2 commits to main" });
    expect(effects[0].type === "message" && effects[0].card?.lines).toEqual(["Add boat", "Fix wind"]);
    expect(mapEvent("push", { deleted: true, commits: [], repository })).toEqual([]);
  });

  it("threads PR lifecycle messages and records merges", () => {
    const pr = { number: 7, title: "Storms", html_url: "https://pr", state: "closed", merged: true };
    const effects = mapEvent("pull_request", { action: "closed", repository, sender: { login: "mei" }, pull_request: pr });
    expect(effects[0]).toMatchObject({ type: "message", threadKey: "pr:42:7", body: "mei merged PR #7: Storms" });
    expect(effects.find((e) => e.type === "activity")).toMatchObject({ kind: "pr_merged" });
    expect(mapEvent("pull_request", { action: "labeled", repository, pull_request: pr })).toEqual([]);
  });

  it("maps reviews into the PR thread", () => {
    const [msg] = mapEvent("pull_request_review", {
      action: "submitted",
      repository,
      sender: { login: "jonas" },
      review: { state: "changes_requested", body: "Needs a test" },
      pull_request: { number: 7, title: "Storms" },
    });
    expect(msg).toMatchObject({ threadKey: "pr:42:7", body: "jonas requested changes on PR #7: Needs a test" });
  });

  it("upserts tasks from issues, only announcing open/close", () => {
    const issue = { number: 3, title: "Harbour", body: null, html_url: "https://i", state: "open", assignee: { login: "lukas" } };
    const edited = mapEvent("issues", { action: "edited", repository, issue });
    expect(edited).toHaveLength(1);
    expect(edited[0]).toMatchObject({ type: "task_upsert", issueNumber: 3, state: "open", assigneeLogin: "lukas", body: "" });
    const closed = mapEvent("issues", { action: "closed", repository, sender: { login: "a" }, issue: { ...issue, state: "closed" } });
    expect(closed.map((e) => e.type)).toEqual(["task_upsert", "message", "activity"]);
  });

  it("routes issue and PR comments to the right thread and skips bots", () => {
    const base = { action: "created", repository, sender: { login: "amara" }, comment: { body: "Looks great", user: { type: "User" } } };
    expect(mapEvent("issue_comment", { ...base, issue: { number: 3 } })[0]).toMatchObject({ threadKey: "issue:42:3" });
    expect(mapEvent("issue_comment", { ...base, issue: { number: 7, pull_request: {} } })[0]).toMatchObject({ threadKey: "pr:42:7" });
    expect(mapEvent("issue_comment", { ...base, comment: { body: "x", user: { type: "Bot" } }, issue: { number: 3 } })).toEqual([]);
  });

  it("posts CI failures and releases to #builds, not successes", () => {
    const run = { name: "CI", head_branch: "main", html_url: "https://run", head_commit: { message: "x" }, actor: { login: "mei" } };
    expect(mapEvent("workflow_run", { action: "completed", repository, workflow_run: { ...run, conclusion: "success" } })).toEqual([]);
    expect(mapEvent("workflow_run", { action: "completed", repository, workflow_run: { ...run, conclusion: "failure" } })[0]).toMatchObject({ channel: "builds" });
    const [rel] = mapEvent("release", { action: "published", repository, release: { tag_name: "v1", name: "", html_url: "https://r", assets: [{ name: "win.zip" }] } });
    expect(rel).toMatchObject({ channel: "builds", body: "New build: v1" });
  });

  it("ignores unknown events", () => {
    expect(mapEvent("star", { repository })).toEqual([]);
  });
});
