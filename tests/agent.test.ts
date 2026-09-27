import { describe, expect, it } from "vitest";
import { AGENT_LABEL, agentBrief, agentWorkflow, linkedIssueNumbers } from "@/lib/agent";
import { mapEvent } from "@/lib/github/events";

describe("agent workflow", () => {
  it("runs only on the agent label and allows Guildhall's bot", () => {
    const y = agentWorkflow("guildhall-dev");
    expect(y).toContain(`if: github.event.label.name == '${AGENT_LABEL}'`);
    expect(y).toContain("anthropics/claude-code-action@v1");
    expect(y).toContain('allowed_bots: "guildhall-dev[bot]"');
    expect(y).toContain("${{ secrets.ANTHROPIC_API_KEY }}");
    expect(agentWorkflow("")).not.toContain("allowed_bots");
  });
});

describe("agentBrief", () => {
  it("includes context, acceptance criteria and guardrails", () => {
    const b = agentBrief({ title: "Fix dock shader", body: "", instructions: "- Compiles for web\n\nNo new warnings", projectName: "Tidebound", engine: "godot", taskUrl: "https://gh/p/t/tasks", gddLinks: [{ title: "Tech", url: "https://gh/p/t/gdd/1" }] });
    expect(b).toContain("## Task\nFix dock shader");
    expect(b).toContain("- Project: Tidebound (godot)");
    expect(b).toContain("- Design doc: [Tech](https://gh/p/t/gdd/1)");
    expect(b).toContain("- [ ] Compiles for web\n- [ ] No new warnings");
    expect(b).toContain("Fixes #<this issue>");
  });
});

describe("linkedIssueNumbers", () => {
  it("reads closing keywords and agent issue branches", () => {
    expect(linkedIssueNumbers({ body: "Fixes #12 and closes #7. Mentions #99", title: "x" }).sort()).toEqual([12, 7].sort());
    expect(linkedIssueNumbers({ body: "Resolves: #3", headRef: "claude/issue-41-20260927-1200" }).sort((a, b) => a - b)).toEqual([3, 41]);
    expect(linkedIssueNumbers({ body: "prefix#12 fixes#13", headRef: "feature/tissue-5" })).toEqual([]);
  });

  it("emits agent_pr effects from pull_request webhooks", () => {
    const base = { repository: { id: 1, full_name: "s/r" }, sender: { login: "claude[bot]" } };
    const pr = { number: 8, title: "Fix shader", body: "Fixes #12", html_url: "https://pr/8", state: "open", draft: false, head: { ref: "claude/issue-12-1" } };
    const opened = mapEvent("pull_request", { ...base, action: "opened", pull_request: pr });
    expect(opened.find((e) => e.type === "agent_pr")).toMatchObject({ issueNumbers: [12], state: "pr_open", number: 8 });
    const merged = mapEvent("pull_request", { ...base, action: "closed", pull_request: { ...pr, merged: true, state: "closed" } });
    expect(merged.find((e) => e.type === "agent_pr")).toMatchObject({ state: "merged" });
    const plain = mapEvent("pull_request", { ...base, action: "opened", pull_request: { ...pr, body: "", head: { ref: "main-fix" } } });
    expect(plain.some((e) => e.type === "agent_pr")).toBe(false);
  });
});
