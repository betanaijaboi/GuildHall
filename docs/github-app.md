# Registering the GitHub App

Guildhall uses one **GitHub App** for sign-in, webhooks and repo actions (see
the design in `game-ideas-vault/project-01-guildhall/github-integration.md`).

## 1. Create the app

Go to **GitHub → Settings → Developer settings → GitHub Apps → New GitHub App**
(or the same page on an organisation). Use the values from
[`github-app-manifest.json`](github-app-manifest.json):

| Setting | Value |
|---|---|
| Callback URL | `{APP_URL}/api/auth/github/callback` |
| Setup URL | `{APP_URL}/api/auth/github/callback`, and turn on **Redirect on update** |
| Request user authorization (OAuth) during installation | **On**: this is how installs are tied to a Guildhall account |
| Webhook URL | `{PUBLIC_URL}/api/github/webhook`. Locally, use a tunnel such as `cloudflared` or `smee.io` |
| Webhook secret | a long random string. Put the same value in `GITHUB_WEBHOOK_SECRET` |

**Permissions:**

| Permission | Level | Why |
|---|---|---|
| Metadata | read | Required |
| Contents | read & write | Setup PR (new branch and commit) |
| Pull requests | read & write | Setup PR, PR cards |
| Issues | read & write | Issues → tasks |
| Checks, Actions | read | CI status |
| Administration | read & write | Optional. Adds accepted members as collaborators and removes them when they leave |
| Email addresses (account) | read | Account linking |

**Events:** push, pull request, pull request review, issues, issue comment,
workflow run, release, repository. Installation events are always delivered.

## 2. Configure the server

After creating the app, fill in `.env`:

```
GITHUB_APP_ID=123456
GITHUB_APP_SLUG=guildhall-dev          # from the app's public URL
GITHUB_CLIENT_ID=Iv1....
GITHUB_CLIENT_SECRET=...
GITHUB_WEBHOOK_SECRET=...
GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----\n"
```

## 3. Flow

1. **Sign in with GitHub** at `/login`. The user token is used only during the
   callback and is never stored.
2. Go to **GitHub** in the nav, then **Install on GitHub**, and pick the repositories.
   GitHub redirects back, and Guildhall records the installation only after
   confirming that the signed-in GitHub user can access it.
3. Open **Project → Settings** and link a repo. From then on, activity appears in
   `#github` and `#builds`, issues become tasks, and **Open setup PR** proposes
   the engine's `.gitattributes`, `.gitignore`, CI and issue templates.

## AI coding agent (C22)

1. In project **Settings**, click **Enable AI agent** next to a linked repo. Guildhall opens a PR
   adding `.github/workflows/guildhall-agent.yml`, which runs `anthropics/claude-code-action@v1`
   on issues labelled `guildhall-agent`.
2. Before merging, add the repository secret `ANTHROPIC_API_KEY` and install the Claude GitHub App
   on the repo (or pass `github_token` to the action).
3. Set `GITHUB_APP_SLUG` on the server. The label is applied by this app's bot, and the workflow
   only accepts label events from bots listed in `allowed_bots`.
4. Leads use **Assign to AI agent** on a task. PRs that say `Fixes #N` or come from a
   `…/issue-N…` branch update the task card and post in #code. Merging stays a human decision.

The GitHub App needs **Issues: write** for this (it already has it for pipelines and forum topics).
