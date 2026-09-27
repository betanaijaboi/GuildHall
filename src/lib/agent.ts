/**
 * AI coding agent (C22). A lead hands a task to an agent from Guildhall: we file (or reuse) the
 * GitHub issue with a clear brief and the `guildhall-agent` label. A workflow in the repo runs
 * Claude Code (anthropics/claude-code-action) on labelled issues; its branch/PR flows back into
 * #code and onto the task card like any other PR. The agent never gets more access than the
 * workflow's own GITHUB_TOKEN, and nothing merges without a human review.
 */

export const AGENT_LABEL = "guildhall-agent";
export const AGENT_WORKFLOW_PATH = ".github/workflows/guildhall-agent.yml";

/** The repo workflow. `appSlug` is our GitHub App: its bot applies the label, so it must be allowed. */
export function agentWorkflow(appSlug: string): string {
  const bot = appSlug ? `${appSlug}[bot]` : "";
  return `# Added by Guildhall: runs Claude Code on issues labelled "${AGENT_LABEL}".
# Needs a repository secret ANTHROPIC_API_KEY (Settings → Secrets and variables → Actions).
name: Guildhall AI agent
on:
  issues:
    types: [labeled]

jobs:
  agent:
    if: github.event.label.name == '${AGENT_LABEL}'
    runs-on: ubuntu-latest
    timeout-minutes: 60
    permissions:
      contents: write
      issues: write
      pull-requests: write
      id-token: write
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 1
      - uses: anthropics/claude-code-action@v1
        with:
          anthropic_api_key: \${{ secrets.ANTHROPIC_API_KEY }}
          label_trigger: "${AGENT_LABEL}"
${bot ? `          # Guildhall's app applies the label, so its bot must be allowed to trigger runs.\n          allowed_bots: "${bot}"\n` : ""}          track_progress: true
`;
}

export type BriefInput = {
  title: string;
  body: string;
  instructions: string;
  projectName: string;
  engine: string;
  taskUrl: string;
  gddLinks: { title: string; url: string }[];
};

/** The issue body the agent works from. Plain markdown: specific, scoped, with acceptance criteria. */
export function agentBrief(b: BriefInput): string {
  const criteria = b.instructions
    .split("\n")
    .map((l) => l.trim().replace(/^[-*]\s*/, ""))
    .filter(Boolean);
  return [
    `## Task`,
    b.body.trim() || b.title,
    "",
    `## Context`,
    `- Project: ${b.projectName} (${b.engine})`,
    `- Tracked in Guildhall: ${b.taskUrl}`,
    ...b.gddLinks.map((g) => `- Design doc: [${g.title}](${g.url})`),
    "",
    `## Done when`,
    ...(criteria.length ? criteria.map((c) => `- [ ] ${c}`) : ["- [ ] The change is implemented and explained in the PR description"]),
    "- [ ] Existing tests and the build still pass",
    "",
    `## Guardrails`,
    "- Keep the change focused on this task; don't touch binary assets or LFS-tracked files.",
    `- Open a pull request that says \`Fixes #<this issue>\` so Guildhall can link it back.`,
    "",
    `_Assigned to the AI coding agent from Guildhall. A teammate reviews before anything merges._`,
  ].join("\n");
}

/** Issue numbers a PR is linked to: closing keywords in its body/title, or the agent's issue branch. */
export function linkedIssueNumbers(pr: { body?: string | null; title?: string | null; headRef?: string | null }): number[] {
  const found = new Set<number>();
  const text = `${pr.title ?? ""}\n${pr.body ?? ""}`;
  for (const m of text.matchAll(/\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s*:?\s+#(\d{1,7})\b/gi)) found.add(Number(m[1]));
  const branch = /(?:^|\/)issue-(\d{1,7})(?:\b|-)/.exec(pr.headRef ?? "");
  if (branch) found.add(Number(branch[1]));
  return [...found];
}
