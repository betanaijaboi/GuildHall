import { notFound, redirect } from "next/navigation";
import { db } from "@/db";
import { loadProject } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { channelSegment, sortChannels, visibleChannels } from "@/lib/channel-access";
import { createDefaultChannels } from "@/lib/messages";

/** The Chat tab: open the first channel this person can see (guests may not have #general). */
export default async function WorkspaceIndex({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await requireUser();
  const { project, role } = await loadProject(slug, user, "guest");
  await createDefaultChannels(db, project.id);
  const [first] = sortChannels(await visibleChannels(db, project.id, user.id, role!));
  if (!first) notFound();
  redirect(`/p/${slug}/workspace/${channelSegment(first)}`);
}
