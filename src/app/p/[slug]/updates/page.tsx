import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { posts, users } from "@/db/schema";
import { createPost } from "@/app/actions/workspace";
import { loadProject, roleAtLeast } from "@/lib/access";
import { requireUser } from "@/lib/auth";

export const metadata = { title: "Updates" };

export default async function UpdatesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await requireUser();
  const { project, role } = await loadProject(slug, user, "guest");
  const list = await db.select({ post: posts, author: users }).from(posts).leftJoin(users, eq(users.id, posts.authorId)).where(eq(posts.projectId, project.id)).orderBy(desc(posts.createdAt));

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {roleAtLeast(role, "member") && (
        <form action={createPost.bind(null, slug)} className="card space-y-3">
          <div className="font-medium">Post a progress update</div>
          <input name="title" required maxLength={160} placeholder="Title — e.g. Greybox of the harbour district is in" className="input" />
          <textarea name="body" required rows={5} placeholder="What changed, what's next, screenshots/video links…" className="input" />
          <div className="flex items-center gap-4 text-sm">
            <label><input type="radio" name="visibility" value="team" defaultChecked /> Team only</label>
            <label><input type="radio" name="visibility" value="public" /> Public devlog</label>
            <button className="btn ml-auto">Publish</button>
          </div>
        </form>
      )}
      <ul className="space-y-4">
        {list.map(({ post, author }) => (
          <li key={post.id} className="card">
            <div className="flex items-center gap-2">
              <h2 className="font-medium">{post.title}</h2>
              <span className="chip">{post.visibility}</span>
            </div>
            <div className="text-xs text-fg-muted">{author?.name} · {post.createdAt.toLocaleDateString("en-GB")}</div>
            <p className="mt-2 whitespace-pre-wrap text-sm">{post.body}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
