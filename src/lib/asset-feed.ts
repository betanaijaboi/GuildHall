import type { Db } from "@/db";
import { channelByName, postMessage } from "./messages";

/** Asset activity goes to #art, threaded per asset so its whole review history stays together. */
export async function postAssetActivity(
  db: Db,
  projectId: string,
  slug: string,
  asset: { id: string; title: string },
  body: string,
  card?: { state: string; version: number; lines?: string[] },
) {
  const channel = await channelByName(db, projectId, "art");
  if (!channel) return;
  await postMessage(db, {
    channelId: channel.id,
    authorId: null,
    body,
    threadKey: `asset:${asset.id}`,
    card: card
      ? { kind: "asset", title: asset.title, url: `/p/${slug}/assets/${asset.id}`, state: card.state, number: card.version, lines: card.lines }
      : undefined,
  });
}
