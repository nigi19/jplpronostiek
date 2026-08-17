/**
 * GET /api/cron/sync
 *
 * Daily cron job (Vercel Hobby: once per day, triggered at 03:00 UTC).
 * Also callable manually from /admin for on-demand syncs.
 *
 * Vercel automatically sends:
 *   Authorization: Bearer <CRON_SECRET>
 *
 * Steps:
 *   1. Read the active season from the DB.
 *   2. Fetch ALL fixtures for that season from API-Football (~1 request).
 *   3. Upsert teams, rounds, matches.
 *   4. Score finished matches whose predictions are still unscored.
 *   5. Update lastSyncedAt on the season row.
 */

import { NextRequest, NextResponse } from "next/server";
import { eq, and, isNull, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  seasons,
  teams,
  rounds,
  matches,
  predictions,
} from "../../../../../drizzle/schema";
import { fetchFixtures, type ApiFixture } from "@/lib/api-football";
import { scorePrediction } from "@/lib/scoring";

// Statuses we treat as "final result available"
const FINAL_STATUSES = new Set(["FT", "AET", "PEN"]);

export async function GET(req: NextRequest) {
  // ── 1. Authenticate ────────────────────────────────────────────────────────
  const expectedToken = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");
  if (!expectedToken || authHeader !== `Bearer ${expectedToken}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = new Date();
  let syncError: string | null = null;

  try {
    // ── 2. Load active season ────────────────────────────────────────────────
    const [season] = await db
      .select()
      .from(seasons)
      .where(eq(seasons.isActive, true))
      .limit(1);

    if (!season) {
      return NextResponse.json(
        { error: "No active season found. Set one in /admin." },
        { status: 400 }
      );
    }

    // ── 3. Fetch from API-Football ───────────────────────────────────────────
    const fixtures = await fetchFixtures(season.apiLeagueId, season.year);

    if (!fixtures || fixtures.length === 0) {
      return NextResponse.json(
        {
          warning: `No fixtures returned for league ${season.apiLeagueId} season ${season.year}. Check your API_FOOTBALL_SEASON and free-tier access.`,
          fetchedAt: startedAt,
        },
        { status: 200 }
      );
    }

    // ── 4. Upsert teams ──────────────────────────────────────────────────────
    const allApiTeams = extractTeams(fixtures);
    if (allApiTeams.length > 0) {
      for (const team of allApiTeams) {
        await db
          .insert(teams)
          .values(team)
          .onConflictDoUpdate({
            target: teams.apiTeamId,
            set: { name: team.name, logoUrl: team.logoUrl },
          });
      }
    }

    // ── 5. Build round → DB id map ───────────────────────────────────────────
    const roundNames = [
      ...new Set(fixtures.map((f) => f.league.round).filter(isRegularRound)),
    ];

    const roundDbMap = new Map<string, number>(); // roundName → db id
    for (const name of roundNames) {
      const number = extractRoundNumber(name);
      const [row] = await db
        .insert(rounds)
        .values({ seasonId: season.id, name, number })
        .onConflictDoUpdate({
          target: [rounds.seasonId, rounds.number],
          set: { name },
        })
        .returning({ id: rounds.id });
      roundDbMap.set(name, row.id);
    }

    // ── 6. Build team apiTeamId → db id map ─────────────────────────────────
    const teamRows = await db.select().from(teams);
    const teamDbMap = new Map<number, number>(); // apiTeamId → db id
    for (const t of teamRows) {
      teamDbMap.set(t.apiTeamId, t.id);
    }

    // ── 7. Upsert matches ────────────────────────────────────────────────────
    const now = new Date();
    for (const f of fixtures) {
      if (!isRegularRound(f.league.round)) continue;

      const roundId = roundDbMap.get(f.league.round);
      const homeTeamId = teamDbMap.get(f.teams.home.id);
      const awayTeamId = teamDbMap.get(f.teams.away.id);

      if (!roundId || !homeTeamId || !awayTeamId) continue;

      const status = f.fixture.status.short;
      const isFinished = FINAL_STATUSES.has(status);
      const homeGoals = isFinished ? (f.goals.home ?? f.score.fulltime.home) : null;
      const awayGoals = isFinished ? (f.goals.away ?? f.score.fulltime.away) : null;

      await db
        .insert(matches)
        .values({
          apiFixtureId: f.fixture.id,
          seasonId: season.id,
          roundId,
          homeTeamId,
          awayTeamId,
          kickoff: new Date(f.fixture.date),
          status,
          homeGoals,
          awayGoals,
          lastSyncedAt: now,
        })
        .onConflictDoUpdate({
          target: matches.apiFixtureId,
          set: {
            status,
            homeGoals,
            awayGoals,
            kickoff: new Date(f.fixture.date),
            lastSyncedAt: now,
          },
        });
    }

    // ── 8. Score finished matches ────────────────────────────────────────────
    await scoreFinishedMatches(season.id);

    // ── 9. Stamp lastSyncedAt ────────────────────────────────────────────────
    await db
      .update(seasons)
      .set({ lastSyncedAt: now, syncError: null })
      .where(eq(seasons.id, season.id));

    return NextResponse.json({
      ok: true,
      fixturesProcessed: fixtures.length,
      syncedAt: now,
    });
  } catch (err) {
    syncError = err instanceof Error ? err.message : String(err);
    console.error("[cron/sync] Error:", syncError);

    // Try to persist the error so /admin can surface it
    try {
      await db
        .update(seasons)
        .set({ syncError, lastSyncedAt: startedAt })
        .where(eq(seasons.isActive, true));
    } catch {
      // best effort
    }

    return NextResponse.json({ error: syncError }, { status: 500 });
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isRegularRound(round: string): boolean {
  return round.startsWith("Regular Season");
}

function extractRoundNumber(roundName: string): number {
  // "Regular Season - 3" → 3
  const match = roundName.match(/(\d+)$/);
  return match ? parseInt(match[1], 10) : 0;
}

function extractTeams(
  fixtures: ApiFixture[]
): Array<{ apiTeamId: number; name: string; logoUrl: string }> {
  const seen = new Set<number>();
  const result: Array<{ apiTeamId: number; name: string; logoUrl: string }> = [];

  for (const f of fixtures) {
    for (const side of [f.teams.home, f.teams.away]) {
      if (!seen.has(side.id)) {
        seen.add(side.id);
        result.push({ apiTeamId: side.id, name: side.name, logoUrl: side.logo });
      }
    }
  }

  return result;
}

async function scoreFinishedMatches(seasonId: number) {
  // Find finished matches in this season that have un-scored predictions
  const finishedMatches = await db
    .select()
    .from(matches)
    .where(
      and(
        eq(matches.seasonId, seasonId),
        inArray(matches.status, [...FINAL_STATUSES])
      )
    );

  if (finishedMatches.length === 0) return;

  const matchIds = finishedMatches.map((m) => m.id);

  // Load all unscored predictions for those matches
  const unscoredPredictions = await db
    .select()
    .from(predictions)
    .where(
      and(
        inArray(predictions.matchId, matchIds),
        isNull(predictions.points)
      )
    );

  if (unscoredPredictions.length === 0) return;

  // Build a matchId → result map for fast lookup
  const matchResultMap = new Map(
    finishedMatches
      .filter((m) => m.homeGoals !== null && m.awayGoals !== null)
      .map((m) => [m.id, { home: m.homeGoals!, away: m.awayGoals! }])
  );

  // Compute and persist points
  for (const pred of unscoredPredictions) {
    const actual = matchResultMap.get(pred.matchId);
    if (!actual) continue;

    const points = scorePrediction(
      { home: pred.homeGoals, away: pred.awayGoals },
      actual
    );

    await db
      .update(predictions)
      .set({ points, updatedAt: new Date() })
      .where(eq(predictions.id, pred.id));
  }
}
