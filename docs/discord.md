# Discord bridge (C21)

Guildhall talks to Discord over plain HTTPS. There is no always-on bot process.

## Mirror channels into Discord (no setup on the server)

A project lead opens **Settings → Discord** and pastes a Discord channel webhook URL
(Discord: Channel settings → Integrations → Webhooks → New webhook → Copy URL) for a Guildhall
channel. Guildhall checks the webhook with a short hello, then mirrors every new message in that
channel (including bot cards such as builds and PRs). Mentions are never parsed, so nobody gets
pinged by `@everyone`. Messages to one webhook are sent in order; on a rate limit Guildhall waits
for Discord's `retry_after` and retries once. If the webhook is deleted, the settings page shows it.

Mirroring is one way. Reading ordinary Discord chat needs a gateway bot, which is out of scope.

## Slash commands for your community

1. Create an application at https://discord.com/developers/applications.
2. Set these on the Guildhall server:
   - `DISCORD_APPLICATION_ID`: the application ID
   - `DISCORD_PUBLIC_KEY`: the public key (used to verify every interaction)
3. In the Discord app settings, set **Interactions Endpoint URL** to
   `https://<your-guildhall>/api/discord/interactions`. Discord sends a signed PING to check it.
4. Register the commands once (the bot token is only needed for this step):
   `DISCORD_APPLICATION_ID=… DISCORD_BOT_TOKEN=… npx tsx scripts/discord-register.ts`

Each project lead then adds the commands to their server (the settings page has the link; only
the `applications.commands` scope is needed) and gets a one-time code. A server admin (Manage
Server) runs `/guildhall link code:GH-XXXX-XXXX` to link that server to the project.

| Command | Effect |
| --- | --- |
| `/bug title [details]` | Bug report in the project's feedback inbox (source: Discord) |
| `/feedback text` | Feedback in the inbox |
| `/idea title [why]` | Idea in the inbox |
| `/roadmap` | Top five public roadmap items by votes, with a link to vote |

Every request is Ed25519-verified with `DISCORD_PUBLIC_KEY` and must be under 5 minutes old.
Unsigned or stale requests get a 401.
