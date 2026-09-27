import { linkedIssueNumbers } from "@/lib/agent";
import type { MessageCard } from "@/db/schema";
import { unmergeableTouches } from "@/lib/conflicts";

/**
 * Pure mapping from a GitHub webhook to the effects Guildhall applies to every project linked
 * to the repository. No I/O here so it can be unit-tested against recorded payloads.
 * Payload types are intentionally loose: we read only the fields we need and tolerate the rest.
 */

export type Effect =
  | { type: "message"; channel: "github" | "builds"; body: string; card?: MessageCard; threadKey?: string }
  | { type: "activity"; kind: ActivityKind; actorLogin?: string; title: string; url?: string }
  | {
      type: "task_upsert";
      issueNumber: number;
      title: string;
      body: string;
      state: "open" | "closed";
      url: string;
      assigneeLogin: string | null;
    }
  | { type: "file_touches"; branch: string; actorLogin: string; paths: string[] }
  /** A PR linked to issues; tasks handed to the AI agent (C22) follow it. */
  | { type: "agent_pr"; issueNumbers: number[]; state: "pr_open" | "merged" | "closed"; url: string; number: number; title: string };

export type ActivityKind =
  | "push"
  | "pr_opened"
  | "pr_merged"
  | "review"
  | "issue_opened"
  | "issue_closed"
  | "release"
  | "ci_failed";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Payload = Record<string, any>;

const firstLine = (s: string | null | undefined) => (s ?? "").split("\n")[0].trim();
const truncate = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export function repoIdOf(payload: Payload): number | null {
  return typeof payload.repository?.id === "number" ? payload.repository.id : null;
}

export function mapEvent(event: string, payload: Payload): Effect[] {
  const repo: string = payload.repository?.full_name ?? "";
  const actor: string | undefined = payload.sender?.login;

  switch (event) {
    case "push": {
      const commits: Payload[] = payload.commits ?? [];
      if (payload.deleted || commits.length === 0) return [];
      const branch = String(payload.ref ?? "").replace(/^refs\/heads\//, "");
      const pusher = payload.pusher?.name ?? actor ?? "someone";
      const n = commits.length;
      const title = `${pusher} pushed ${n} commit${n === 1 ? "" : "s"} to ${branch}`;
      return [
        {
          type: "message",
          channel: "github",
          body: title,
          card: {
            kind: "push",
            title,
            repo,
            url: payload.compare,
            actor: pusher,
            lines: commits.slice(0, 5).map((c) => truncate(firstLine(c.message), 100)),
          },
        },
        { type: "activity", kind: "push", actorLogin: pusher, title, url: payload.compare },
        ...(() => {
          const paths = unmergeableTouches(commits);
          return paths.length ? [{ type: "file_touches" as const, branch, actorLogin: pusher, paths }] : [];
        })(),
      ];
    }

    case "pull_request": {
      const pr = payload.pull_request;
      if (!pr) return [];
      const action: string = payload.action;
      const merged = action === "closed" && pr.merged;
      const verb =
        action === "opened" ? "opened" :
        action === "reopened" ? "reopened" :
        action === "ready_for_review" ? "marked ready for review" :
        merged ? "merged" :
        action === "closed" ? "closed" : null;
      if (!verb) return [];
      const state = merged ? "merged" : pr.draft ? "draft" : pr.state;
      const title = `${actor ?? "someone"} ${verb} PR #${pr.number}: ${pr.title}`;
      const effects: Effect[] = [
        {
          type: "message",
          channel: "github",
          body: title,
          threadKey: `pr:${payload.repository?.id}:${pr.number}`,
          card: { kind: "pull_request", title: pr.title, url: pr.html_url, repo, number: pr.number, state, actor },
        },
      ];
      if (action === "opened") effects.push({ type: "activity", kind: "pr_opened", actorLogin: actor, title: pr.title, url: pr.html_url });
      if (merged) effects.push({ type: "activity", kind: "pr_merged", actorLogin: actor, title: pr.title, url: pr.html_url });
      const issueNumbers = linkedIssueNumbers({ body: pr.body, title: pr.title, headRef: pr.head?.ref });
      if (issueNumbers.length && action !== "ready_for_review") {
        effects.push({ type: "agent_pr", issueNumbers, state: merged ? "merged" : action === "closed" ? "closed" : "pr_open", url: pr.html_url, number: pr.number, title: pr.title });
      }
      return effects;
    }

    case "pull_request_review": {
      const review = payload.review;
      const pr = payload.pull_request;
      if (payload.action !== "submitted" || !review || !pr) return [];
      const verb =
        review.state === "approved" ? "approved" :
        review.state === "changes_requested" ? "requested changes on" : "reviewed";
      const body = `${actor ?? "someone"} ${verb} PR #${pr.number}${review.body ? `: ${truncate(review.body, 280)}` : ""}`;
      return [
        { type: "message", channel: "github", body, threadKey: `pr:${payload.repository?.id}:${pr.number}` },
        { type: "activity", kind: "review", actorLogin: actor, title: `Review on #${pr.number}: ${pr.title}`, url: review.html_url },
      ];
    }

    case "issues": {
      const issue = payload.issue;
      if (!issue) return [];
      const action: string = payload.action;
      const tracked = ["opened", "edited", "closed", "reopened", "assigned", "unassigned"];
      if (!tracked.includes(action)) return [];
      const effects: Effect[] = [
        {
          type: "task_upsert",
          issueNumber: issue.number,
          title: issue.title,
          body: issue.body ?? "",
          state: issue.state === "closed" ? "closed" : "open",
          url: issue.html_url,
          assigneeLogin: issue.assignee?.login ?? null,
        },
      ];
      if (action === "opened" || action === "closed" || action === "reopened") {
        const title = `${actor ?? "someone"} ${action} issue #${issue.number}: ${issue.title}`;
        effects.push({
          type: "message",
          channel: "github",
          body: title,
          threadKey: `issue:${payload.repository?.id}:${issue.number}`,
          card: { kind: "issue", title: issue.title, url: issue.html_url, repo, number: issue.number, state: issue.state, actor },
        });
      }
      if (action === "opened") effects.push({ type: "activity", kind: "issue_opened", actorLogin: actor, title: issue.title, url: issue.html_url });
      if (action === "closed") effects.push({ type: "activity", kind: "issue_closed", actorLogin: actor, title: issue.title, url: issue.html_url });
      return effects;
    }

    case "issue_comment": {
      const issue = payload.issue;
      const comment = payload.comment;
      if (payload.action !== "created" || !issue || !comment) return [];
      if (comment.user?.type === "Bot") return [];
      const kind = issue.pull_request ? "pr" : "issue";
      return [
        {
          type: "message",
          channel: "github",
          body: `${actor ?? "someone"} commented on #${issue.number}: ${truncate(comment.body ?? "", 400)}`,
          threadKey: `${kind}:${payload.repository?.id}:${issue.number}`,
        },
      ];
    }

    case "workflow_run": {
      const run = payload.workflow_run;
      if (payload.action !== "completed" || !run) return [];
      if (run.conclusion !== "failure" && run.conclusion !== "timed_out") return [];
      const title = `CI failed: ${run.name} on ${run.head_branch} (${firstLine(run.head_commit?.message)})`;
      return [
        {
          type: "message",
          channel: "builds",
          body: title,
          card: { kind: "check", title: `${run.name} — ${run.conclusion}`, url: run.html_url, repo, state: run.conclusion, actor: run.actor?.login },
        },
        { type: "activity", kind: "ci_failed", actorLogin: run.actor?.login, title, url: run.html_url },
      ];
    }

    case "release": {
      const release = payload.release;
      if (payload.action !== "published" || !release) return [];
      const name = release.name || release.tag_name;
      return [
        {
          type: "message",
          channel: "builds",
          body: `New build: ${name}`,
          card: {
            kind: "release",
            title: name,
            url: release.html_url,
            repo,
            actor,
            lines: (release.assets ?? []).slice(0, 5).map((a: Payload) => `${a.name}`),
          },
        },
        { type: "activity", kind: "release", actorLogin: actor, title: name, url: release.html_url },
      ];
    }

    default:
      return [];
  }
}
