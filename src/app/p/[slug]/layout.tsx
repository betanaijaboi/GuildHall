import { Globe, Lock } from "lucide-react";
import Link from "next/link";
import { ProjectCover, ProjectCrest } from "@/components/project-cover";
import { ProjectTabs } from "@/components/project-tabs";
import { loadProject, roleAtLeast } from "@/lib/access";
import { getCurrentUser } from "@/lib/auth";
import { ENGINES, labelFor, STAGES } from "@/lib/taxonomy";

export default async function ProjectLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await getCurrentUser();
  const { project, role } = await loadProject(slug, user);
  return (
    <div className="space-y-5">
      <header className="card overflow-hidden p-0">
        <ProjectCover slug={project.slug} className="h-24 sm:h-32" />
        <div className="flex flex-wrap items-end gap-4 px-5 pb-4">
          <div className="-mt-9 animate-pop">
            <ProjectCrest slug={project.slug} name={project.name} size={72} />
          </div>
          <div className="min-w-0 flex-1 pt-3">
            <Link href={`/p/${slug}`} className="font-display text-2xl font-bold tracking-tight hover:underline">{project.name}</Link>
            <div className="mt-1 flex flex-wrap gap-1.5">
              <span className="chip">{labelFor(ENGINES, project.engine)}</span>
              <span className="chip">{labelFor(STAGES, project.stage)}</span>
              <span className="chip">
                {project.visibility === "public" ? <Globe size={12} /> : <Lock size={12} />}
                {project.visibility}
              </span>
            </div>
          </div>
        </div>
        {role && (
          <div className="border-t border-border px-5 py-2.5">
            <ProjectTabs slug={slug} isLead={roleAtLeast(role, "lead")} />
          </div>
        )}
      </header>
      <div className="animate-fade-up">{children}</div>
    </div>
  );
}
