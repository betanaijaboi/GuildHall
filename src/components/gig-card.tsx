import { Clock } from "lucide-react";
import Link from "next/link";
import { Avatar, type AvatarUser } from "./avatar";
import { SkillChip } from "./discipline";
import { ProjectCover } from "./project-cover";
import { formatMoney } from "@/lib/fees";

export function GigCard({
  gig,
  seller,
  fromCents,
  fastestDays,
}: {
  gig: { id: string; title: string; skillId: string; currency: string; coverUrl: string | null; status: string };
  seller: AvatarUser;
  fromCents: number;
  fastestDays: number;
}) {
  return (
    <Link href={`/gigs/${gig.id}`} className="card card-hover group flex h-full flex-col overflow-hidden p-0">
      {gig.coverUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={gig.coverUrl} alt="" className="h-32 w-full object-cover transition-transform duration-500 group-hover:scale-105" />
      ) : (
        <ProjectCover slug={gig.id} className="h-32" />
      )}
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-center gap-2 text-sm">
          <Avatar user={seller} size={24} />
          <span className="text-fg-muted">{seller.name}</span>
          {gig.status === "paused" && <span className="chip ml-auto">paused</span>}
        </div>
        <div className="font-display font-semibold leading-snug group-hover:text-accent">{gig.title}</div>
        <div><SkillChip skillId={gig.skillId} /></div>
        <div className="mt-auto flex items-center justify-between pt-2 text-sm">
          <span className="flex items-center gap-1 text-fg-muted"><Clock size={13} /> from {fastestDays}d</span>
          <span className="text-fg-muted">from <span className="font-display text-base font-bold text-fg">{formatMoney(fromCents, gig.currency)}</span></span>
        </div>
      </div>
    </Link>
  );
}
