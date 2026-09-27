/**
 * Register Guildhall's slash commands with Discord (run once, and after changing COMMANDS):
 *   DISCORD_APPLICATION_ID=… DISCORD_BOT_TOKEN=… npx tsx scripts/discord-register.ts
 */
import { COMMANDS } from "../src/lib/discord";

const appId = process.env.DISCORD_APPLICATION_ID;
const token = process.env.DISCORD_BOT_TOKEN;
if (!appId || !token) {
  console.error("Set DISCORD_APPLICATION_ID and DISCORD_BOT_TOKEN");
  process.exit(1);
}
const res = await fetch(`https://discord.com/api/v10/applications/${appId}/commands`, {
  method: "PUT",
  headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify(COMMANDS),
});
console.log(res.ok ? `Registered ${COMMANDS.length} commands.` : `Discord returned ${res.status}: ${await res.text()}`);
process.exit(res.ok ? 0 : 1);
