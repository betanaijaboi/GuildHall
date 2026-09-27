import type { Metadata, Viewport } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import { LogOut, Plus, Bell } from "lucide-react";
import { GithubIcon } from "@/components/icons";
import Link from "next/link";
import { Avatar } from "@/components/avatar";
import { Logo } from "@/components/logo";
import { MobileTabBar, NavLinks } from "@/components/nav";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/db";
import { unreadCount } from "@/lib/alerts-db";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const grotesk = Space_Grotesk({ subsets: ["latin"], variable: "--font-grotesk", weight: ["500", "600", "700"] });

export const metadata: Metadata = {
  title: { default: "Guildhall — find your party, build your game", template: "%s · Guildhall" },
  description: "Find game makers, build together, and ship — with GitHub in the loop.",
};

export const viewport: Viewport = { themeColor: "#0b0a14" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  const unread = user ? await unreadCount(db, user.id) : 0;
  return (
    <html lang="en" className={`${inter.variable} ${grotesk.variable}`}>
      <body className="min-h-screen font-sans antialiased">
        <header className="sticky top-0 z-40 border-b border-border bg-bg/70 backdrop-blur-xl">
          <nav className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-2.5">
            <Link href="/" aria-label="Guildhall home">
              <Logo />
            </Link>
            <NavLinks signedIn={!!user} />
            <div className="ml-auto flex items-center gap-2">
              {user ? (
                <>
                  <Link href="/projects/new" className="btn hidden sm:inline-flex">
                    <Plus size={16} /> New project
                  </Link>
                  <Link href="/notifications" className="btn-ghost relative" aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}>
                    <Bell size={18} className={unread ? "animate-[wobble_2.5s_ease-in-out_infinite]" : ""} />
                    {unread > 0 && (
                      <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-gradient-to-br from-rose-500 to-orange-400 px-1 text-[10px] font-bold text-white shadow" data-testid="unread-badge">
                        {unread > 9 ? "9+" : unread}
                      </span>
                    )}
                  </Link>
                  <Link href="/settings/github" className="btn-ghost hidden sm:inline-flex" aria-label="GitHub settings">
                    <GithubIcon size={18} />
                  </Link>
                  <Link href={`/people/${user.handle}`} className="rounded-full transition-transform hover:scale-105" aria-label="Your profile">
                    <Avatar user={user} size={34} />
                  </Link>
                  <form action="/api/auth/logout" method="post" className="hidden sm:block">
                    <button className="btn-ghost" aria-label="Sign out"><LogOut size={16} /></button>
                  </form>
                </>
              ) : (
                <Link href="/login" className="btn">Sign in</Link>
              )}
            </div>
          </nav>
        </header>
        <main className="mx-auto max-w-6xl px-4 pb-28 pt-6 md:pb-12">{children}</main>
        <MobileTabBar handle={user?.handle ?? null} />
      </body>
    </html>
  );
}
