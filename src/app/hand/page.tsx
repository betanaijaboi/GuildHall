import { db } from "@/db";
import { HandView } from "@/components/hand-view";
import { requireUser } from "@/lib/auth";
import { loadHand } from "@/lib/hand-db";

export const metadata = { title: "Your hand" };

export default async function HandPage() {
  const user = await requireUser();
  const items = await loadHand(db, user);
  return (
    <div className="space-y-4">
      <div>
        <h1 className="h1">Your <span className="text-gradient">hand</span></h1>
        <p className="mt-1 text-fg-muted">Everything waiting on you across your projects, blocking work first. Play your cards.</p>
      </div>
      <HandView initial={items.map((i) => ({ ...i, at: i.at.toISOString() }))} />
    </div>
  );
}
