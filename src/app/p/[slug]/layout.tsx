import Link from "next/link";
import { loadProject } from "@/lib/access";
import { getCurrentUser } from "@/lib/auth";
import { ENGINES, labelFor, STAGES } from "@/lib/taxonomy";

const TABS = [
  ["workspace/general", "Chat"],
  ["tasks", "Tasks"],
  ["milestones", "Milestones"],
  ["roles", "Team & roles"],
  ["updates", "Updates"],
  ["digest", "Digest"],
  ["settings", "Settings"],
] as const;

export default async function ProjectLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await getCurrentUser();
  const { project, role } = await loadProject(slug, user);
  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end gap-x-6 gap-y-2 border-b border-border pb-3">
        <div>
          <Link href={`/p/${slug}`} className="text-xl font-semibold tracking-tight hover:underline">{project.name}</Link>
          <div className="text-sm text-fg-muted">
            {labelFor(ENGINES, project.engine)} · {labelFor(STAGES, project.stage)} · {project.visibility}
          </div>
        </div>
        {role && (
          <nav className="flex flex-wrap gap-1 text-sm">
            {TABS.map(([href, label]) => (
              <Link key={href} href={`/p/${slug}/${href}`} className="rounded-md px-2.5 py-1 text-fg-muted hover:bg-muted hover:text-fg">
                {label}
              </Link>
            ))}
          </nav>
        )}
      </header>
      {children}
    </div>
  );
}
