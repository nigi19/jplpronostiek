import { auth } from "@/auth";
import { db } from "@/lib/db";
import { seasons, rounds, matches, predictions } from "../../../../drizzle/schema";
import { eq, and, gt, sum, count } from "drizzle-orm";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function DashboardPage() {
  const session = await auth();
  const userId = session!.user!.id!;

  const [season] = await db
    .select()
    .from(seasons)
    .where(eq(seasons.isActive, true))
    .limit(1);

  if (!season) {
    return (
      <div className="text-center py-16 text-zinc-400">
        <p className="text-lg">Geen actief seizoen gevonden.</p>
        <p className="text-sm mt-2">Een admin kan een seizoen instellen via /admin.</p>
      </div>
    );
  }

  const now = new Date();

  // Current matchweek = the round containing the next upcoming kickoff
  const [nextMatch] = await db
    .select({ roundId: matches.roundId })
    .from(matches)
    .where(and(eq(matches.seasonId, season.id), gt(matches.kickoff, now)))
    .orderBy(matches.kickoff)
    .limit(1);

  const currentRound = nextMatch
    ? (
        await db
          .select()
          .from(rounds)
          .where(eq(rounds.id, nextMatch.roundId))
          .limit(1)
      )[0]
    : null;

  // Count open matches (future kickoff) in the current round without a prediction
  let pendingCount = 0;
  if (currentRound) {
    const openMatches = await db
      .select({ id: matches.id })
      .from(matches)
      .where(and(eq(matches.roundId, currentRound.id), gt(matches.kickoff, now)));

    const openMatchIds = openMatches.map((m) => m.id);

    const existingPreds = openMatchIds.length
      ? await db
          .select({ matchId: predictions.matchId })
          .from(predictions)
          .where(eq(predictions.userId, userId))
      : [];

    const predictedSet = new Set(existingPreds.map((p) => p.matchId));
    pendingCount = openMatchIds.filter((id) => !predictedSet.has(id)).length;
  }

  // User's total points (from scored predictions)
  const [totals] = await db
    .select({
      totalPoints: sum(predictions.points),
      predictionsCount: count(predictions.id),
    })
    .from(predictions)
    .where(eq(predictions.userId, userId));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-zinc-500 text-sm mt-1">
          {season.name} — Jupiler Pro League
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-zinc-500">
              Jouw punten
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{totals?.totalPoints ?? 0}</p>
            <p className="text-xs text-zinc-400 mt-1">
              {totals?.predictionsCount ?? 0} voorspellingen gescoord
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-zinc-500">
              Huidige speeldag
            </CardTitle>
          </CardHeader>
          <CardContent>
            {currentRound ? (
              <>
                <p className="text-3xl font-bold">{currentRound.number}</p>
                <Link
                  href={`/matchweek/${currentRound.number}`}
                  className="text-xs text-blue-600 hover:underline mt-1 block"
                >
                  Bekijk speeldag →
                </Link>
              </>
            ) : (
              <p className="text-zinc-400 text-sm">Geen komende wedstrijden</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-zinc-500">
              Openstaande voorspellingen
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{pendingCount}</p>
            {pendingCount > 0 && currentRound && (
              <Link
                href={`/matchweek/${currentRound.number}`}
                className="text-xs text-blue-600 hover:underline mt-1 block"
              >
                Voorspel nu →
              </Link>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="flex gap-4 flex-wrap">
        <Link
          href={
            currentRound ? `/matchweek/${currentRound.number}` : "/matchweek"
          }
          className="inline-flex items-center gap-2 bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-800 transition-colors"
        >
          ✏️ Voorspellingen invoeren
        </Link>
        <Link
          href="/leaderboard"
          className="inline-flex items-center gap-2 bg-zinc-100 dark:bg-zinc-800 px-4 py-2 rounded-lg text-sm font-medium hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
        >
          🏆 Globaal klassement
        </Link>
        <Link
          href="/groups"
          className="inline-flex items-center gap-2 bg-zinc-100 dark:bg-zinc-800 px-4 py-2 rounded-lg text-sm font-medium hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
        >
          👥 Mijn groepen
        </Link>
      </div>
    </div>
  );
}
