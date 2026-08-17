"use server";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { seasons } from "../../../../drizzle/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

function isAdmin(email: string | null | undefined): boolean {
  const adminEmails = (process.env.ADMIN_EMAILS ?? "").split(",").map((e) => e.trim());
  return !!(email && adminEmails.includes(email));
}

export async function setActiveSeason(
  seasonId: number
): Promise<{ success: boolean; error?: string }> {
  const session = await auth();
  if (!isAdmin(session?.user?.email)) return { success: false, error: "Geen toegang" };

  // Deactivate all, then activate the chosen one
  await db.update(seasons).set({ isActive: false });
  await db.update(seasons).set({ isActive: true }).where(eq(seasons.id, seasonId));

  revalidatePath("/admin");
  revalidatePath("/");
  return { success: true };
}

export async function createSeason(
  year: number,
  name: string
): Promise<{ success: boolean; error?: string }> {
  const session = await auth();
  if (!isAdmin(session?.user?.email)) return { success: false, error: "Geen toegang" };

  name = name.trim();
  if (!name) return { success: false, error: "Naam vereist" };

  await db.insert(seasons).values({
    year,
    name,
    apiLeagueId: 144,
    isActive: false,
  });

  revalidatePath("/admin");
  return { success: true };
}

/**
 * "Sync now" triggers the GitHub Actions workflow via the repository dispatch API.
 * Alternatively, an admin can manually trigger it from the GitHub UI.
 *
 * This requires GITHUB_TOKEN (or a PAT with workflow scope) set in env vars.
 * If not configured, we return a helpful message instead of erroring.
 */
export async function triggerSync(): Promise<{
  success: boolean;
  fixturesProcessed?: number;
  error?: string;
  message?: string;
}> {
  const session = await auth();
  if (!isAdmin(session?.user?.email)) return { success: false, error: "Geen toegang" };

  const githubToken = process.env.GITHUB_SYNC_TOKEN;
  const repo = process.env.GITHUB_REPO; // e.g. "nielsgielen/voetbalpronostiek"

  if (!githubToken || !repo) {
    revalidatePath("/admin");
    return {
      success: true,
      message:
        "Geen GITHUB_SYNC_TOKEN of GITHUB_REPO geconfigureerd — trigger de sync handmatig via de GitHub Actions UI.",
    };
  }

  const res = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/sync.yml/dispatches`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${githubToken}`,
      "Accept": "application/vnd.github+json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ref: "main" }),
  });

  if (!res.ok) {
    const text = await res.text();
    return { success: false, error: `GitHub API ${res.status}: ${text.slice(0, 200)}` };
  }

  revalidatePath("/admin");
  return {
    success: true,
    message: "GitHub Actions sync workflow gestart. Resultaten verschijnen na ~1 minuut.",
  };
}
