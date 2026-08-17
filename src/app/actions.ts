"use server";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { matches, predictions, groups, groupMembers } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";

// ─── Predictions ──────────────────────────────────────────────────────────────

export async function upsertPrediction(
  matchId: number,
  homeGoals: number,
  awayGoals: number
): Promise<{ success: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { success: false, error: "Niet ingelogd" };

  // Validate goals
  if (
    !Number.isInteger(homeGoals) || homeGoals < 0 || homeGoals > 20 ||
    !Number.isInteger(awayGoals) || awayGoals < 0 || awayGoals > 20
  ) {
    return { success: false, error: "Ongeldige score" };
  }

  // Server-side kickoff check — never trust the client
  const [match] = await db
    .select({ kickoff: matches.kickoff })
    .from(matches)
    .where(eq(matches.id, matchId))
    .limit(1);

  if (!match) return { success: false, error: "Wedstrijd niet gevonden" };

  if (new Date() >= match.kickoff) {
    return { success: false, error: "Voorspelling vergrendeld — wedstrijd is begonnen" };
  }

  const userId = session.user.id;
  const now = new Date();

  await db
    .insert(predictions)
    .values({ userId, matchId, homeGoals, awayGoals, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({
      target: [predictions.userId, predictions.matchId],
      set: { homeGoals, awayGoals, updatedAt: now },
    });

  revalidatePath("/matchweek/[round]", "page");
  return { success: true };
}

// ─── Groups ───────────────────────────────────────────────────────────────────

function generateInviteCode(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

export async function createGroup(
  name: string
): Promise<{ success: boolean; groupId?: number; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { success: false, error: "Niet ingelogd" };

  name = name.trim();
  if (!name || name.length < 2 || name.length > 60) {
    return { success: false, error: "Naam moet tussen 2 en 60 tekens zijn" };
  }

  const userId = session.user.id;
  const inviteCode = generateInviteCode();

  const [group] = await db
    .insert(groups)
    .values({ name, inviteCode, ownerId: userId })
    .returning({ id: groups.id });

  // Add owner as a member
  await db.insert(groupMembers).values({
    groupId: group.id,
    userId,
    role: "owner",
  });

  revalidatePath("/groups");
  return { success: true, groupId: group.id };
}

export async function joinGroup(
  inviteCode: string
): Promise<{ success: boolean; groupId?: number; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { success: false, error: "Niet ingelogd" };

  const userId = session.user.id;
  const code = inviteCode.trim().toUpperCase();

  const [group] = await db
    .select()
    .from(groups)
    .where(eq(groups.inviteCode, code))
    .limit(1);

  if (!group) return { success: false, error: "Ongeldige uitnodigingscode" };

  // Check if already a member
  const [existing] = await db
    .select()
    .from(groupMembers)
    .where(and(eq(groupMembers.groupId, group.id), eq(groupMembers.userId, userId)))
    .limit(1);

  if (existing) {
    return { success: true, groupId: group.id }; // already a member, redirect
  }

  await db.insert(groupMembers).values({
    groupId: group.id,
    userId,
    role: "member",
  });

  revalidatePath("/groups");
  return { success: true, groupId: group.id };
}
