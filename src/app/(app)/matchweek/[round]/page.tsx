import { auth } from "@/auth";
import { db } from "@/lib/db";
import {
  seasons,
  rounds,
  matches,
  teams,
  predictions,
} from "../../../../../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { notFound } from "next/navigation";
import { MatchCard } from "./match-card";
import Link from "next/link";

interface Props {
  params: Promise<{ round: string }>;
}

export default async function MatchweekPage({ params }: Props) {
  const { round: roundParam } = await params;
  const roundNumber = parseInt(roundParam, 10);
  if (isNaN(roundNumber)) notFound();

  const session = await auth();
  const userId = session!.user!.id!;

  const [season] = await db
    .select()
    .from(seasons)
    .where(eq(seasons.isActive, true))
    .limit(1);

  if (!season) notFound();

  const [round] = await db
    .select()
    .from(rounds)
    .where(and(eq(rounds.seasonId, season.id), eq(rounds.number, roundNumber)))
    .limit(1);

  if (!round) notFound();

  // Load matches with team names
  const roundMatches = await db
    .select({
      id: matches.id,
      kickoff: matches.kickoff,
      status: matches.status,
      homeGoals: matches.homeGoals,
      awayGoals: matches.awayGoals,
      homeTeamId: matches.homeTeamId,
      awayTeamId: matches.awayTeamId,
    })
    .from(matches)
    .where(eq(matches.roundId, round.id))
    .orderBy(matches.kickoff);

  const teamIds = [...new Set(roundMatches.flatMap((m) => [m.homeTeamId, m.awayTeamId]))];
  const teamRows = teamIds.length
    ? await db.select().from(teams).where(eq(teams.id, teamIds[0]))
    : [];

  // Load all teams needed
  const allTeams = await db.select().from(teams);
  const teamMap = new Map(allTeams.map((t) => [t.id, t]));

  // Load user's predictions for this round
  const userPredictions = await db
    .select()
    .from(predictions)
    .where(
      and(
        eq(predictions.userId, userId),
        // for the match ids in this round
      )
    );

  // Build match prediction map
  const matchIds = roundMatches.map((m) => m.id);
  const allPredictions = matchIds.length
    ? await db
        .select()
        .from(predictions)
        .where(eq(predictions.userId, userId))
    : [];

  const predMap = new Map(allPredictions.map((p) => [p.matchId, p]));

  const now = new Date();

  // Get all other players' predictions (visible after kickoff)
  const totalRounds = await db
    .select({ number: rounds.number })
    .from(rounds)
    .where(eq(rounds.seasonId, season.id))
    .orderBy(rounds.number);

  const roundNumbers = totalRounds.map((r) => r.number);
  const currentIndex = roundNumbers.indexOf(roundNumber);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Speeldag {roundNumber}</h1>
          <p className="text-zinc-500 text-sm mt-1">{season.name}</p>
        </div>
        <div className="flex gap-2">
          {currentIndex > 0 && (
            <Link
              href={`/matchweek/${roundNumbers[currentIndex - 1]}`}
              className="text-sm px-3 py-1.5 border rounded-md hover:bg-zinc-50"
            >
              ← Vorige
            </Link>
          )}
          {currentIndex < roundNumbers.length - 1 && (
            <Link
              href={`/matchweek/${roundNumbers[currentIndex + 1]}`}
              className="text-sm px-3 py-1.5 border rounded-md hover:bg-zinc-50"
            >
              Volgende →
            </Link>
          )}
        </div>
      </div>

      <div className="space-y-3">
        {roundMatches.map((match) => {
          const homeTeam = teamMap.get(match.homeTeamId);
          const awayTeam = teamMap.get(match.awayTeamId);
          const pred = predMap.get(match.id);
          const isLocked = now >= match.kickoff;

          return (
            <MatchCard
              key={match.id}
              matchId={match.id}
              homeTeam={homeTeam?.name ?? "?"}
              homeTeamLogo={homeTeam?.logoUrl ?? null}
              awayTeam={awayTeam?.name ?? "?"}
              awayTeamLogo={awayTeam?.logoUrl ?? null}
              kickoff={match.kickoff}
              status={match.status}
              actualHome={match.homeGoals}
              actualAway={match.awayGoals}
              predictedHome={pred?.homeGoals ?? null}
              predictedAway={pred?.awayGoals ?? null}
              points={pred?.points ?? null}
              isLocked={isLocked}
            />
          );
        })}
      </div>
    </div>
  );
}
