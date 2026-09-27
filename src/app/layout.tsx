import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { Avatar } from "@/components/avatar";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Guildhall", template: "%s · Guildhall" },
  description: "Find game makers, build together, and ship — with GitHub in the loop.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  return (
    <html lang="en">
      <body className="min-h-screen font-sans antialiased">
        <header className="border-b border-border bg-surface">
          <nav className="mx-auto flex max-w-6xl items-center gap-5 px-4 py-3 text-sm">
            <Link href="/" className="text-base font-semibold tracking-tight">
              ⚔︎ Guildhall
            </Link>
            <Link href="/people" className="text-fg-muted hover:text-fg">People</Link>
            <Link href="/projects" className="text-fg-muted hover:text-fg">Projects</Link>
            <div className="ml-auto flex items-center gap-3">
              {user ? (
                <>
                  <Link href="/projects/new" className="btn">New project</Link>
                  <Link href="/settings/github" className="text-fg-muted hover:text-fg">GitHub</Link>
                  <Link href={`/people/${user.handle}`} className="flex items-center gap-2">
                    <Avatar name={user.name} url={user.avatarUrl} size={28} />
                  </Link>
                  <form action="/api/auth/logout" method="post">
                    <button className="text-fg-muted hover:text-fg">Sign out</button>
                  </form>
                </>
              ) : (
                <Link href="/login" className="btn">Sign in</Link>
              )}
            </div>
          </nav>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
