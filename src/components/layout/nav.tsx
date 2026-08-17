"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";

interface NavProps {
  user: { name?: string | null; email?: string | null } | null;
  isAdmin: boolean;
}

export function Nav({ user, isAdmin }: NavProps) {
  const pathname = usePathname();

  const links = [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/matchweek", label: "Speeldag" },
    { href: "/leaderboard", label: "Klassement" },
    { href: "/groups", label: "Groepen" },
    ...(isAdmin ? [{ href: "/admin", label: "Admin" }] : []),
  ];

  return (
    <header className="border-b bg-white dark:bg-zinc-900">
      <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
        <nav className="flex items-center gap-1">
          <Link
            href="/"
            className="font-bold text-blue-700 mr-4 text-sm tracking-tight"
          >
            ⚽ Pronostiek
          </Link>
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`text-sm px-3 py-1.5 rounded-md transition-colors ${
                pathname === l.href || (l.href !== "/dashboard" && pathname.startsWith(l.href))
                  ? "bg-zinc-100 dark:bg-zinc-800 font-medium"
                  : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
              }`}
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          {user && (
            <span className="text-xs text-zinc-400 hidden sm:block">
              {user.email}
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => signOut({ callbackUrl: "/auth/signin" })}
          >
            Uitloggen
          </Button>
        </div>
      </div>
    </header>
  );
}
