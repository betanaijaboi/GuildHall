import { AvatarBuilder } from "@/components/avatar-builder";
import { requireUser } from "@/lib/auth";
import { resolveAvatar } from "@/lib/avatar";

export const metadata = { title: "Avatar builder" };

export default async function AvatarPage() {
  const user = await requireUser();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="h1">Design your <span className="text-gradient">avatar</span></h1>
        <p className="mt-1 text-fg-muted">This is how the guild sees you: in chat, on teams, and on your profile.</p>
      </div>
      <AvatarBuilder initial={resolveAvatar(user.avatar, user.handle)} photoUrl={user.avatarUrl} name={user.name} />
    </div>
  );
}
