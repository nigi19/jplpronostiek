import { db } from "@/lib/db";
import { seasons, rounds, matches } from "../../../../drizzle/schema";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";

export default async function MatchweekIndexPage() {
  const [season] = await db
    .select()
    .from(seasons)
    .where(eq(seasons.isActive, true))
    .limit(1);

  if (!season) redirect("/");

  // Find the first upcoming match and redirect to its round
  const [firstMatch] = await db
    .select({ roundId: matches.roundId, kickoff: matches.kickoff })
    .from(matches)
    .where(eq(matches.seasonId, season.id))
    .orderBy(matches.kickoff)
    .limit(1);

  if (!firstMatch) redirect("/");

  const [round] = await db
    .select()
    .from(rounds)
    .where(eq(rounds.id, firstMatch.roundId))
    .limit(1);

  redirect(`/matchweek/${round?.number ?? 1}`);
}
