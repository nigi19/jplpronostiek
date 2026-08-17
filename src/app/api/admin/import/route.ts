import { NextRequest, NextResponse } from "next/server";
import { eq, and, isNull, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { seasons, teams, rounds, matches, predictions } from "../../../../../drizzle/schema";
import { scorePrediction } from "@/lib/scoring";

// Give the function the full 60 s on Vercel Hobby
export const maxDuration = 60;

interface ImportFixture {
  fixtureId: number;
  round: number;
  homeTeamId: number;
  homeTeamName: string;
  homeTeamLogo?: string | null;
  awayTeamId: number;
  awayTeamName: string;
  awayTeamLogo?: string | null;
  kickoff: string;
  status: "finished" | "in_progress" | "scheduled";
  homeGoals: number | null;
  awayGoals: number | null;
}

interface ImportPayload {
  tournamentId: number;
  seasonId: number;
  seasonYear: string;
  fixtures: ImportFixture[];
}

export async function POST(req: NextRequest) {
  const expectedToken = process.env.IMPORT_SECRET;
  if (!expectedToken || req.headers.get("authorization") !== `Bearer ${expectedToken}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: ImportPayload;
  try {
    payload = (await req.json()) as ImportPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!Array.isArray(payload.fixtures) || payload.fixtures.length === 0) {
    return NextResponse.json({ error: "No fixtures in payload" }, { status: 400 });
  }

  const startedAt = new Date();

  try {
    // ── 1. Find or auto-create the active season ───────────────────────────
    let [season] = await db
      .select()
      .from(seasons)
      .where(eq(seasons.isActive, true))
      .limit(1);

    if (!season) {
      const seasonName = String(payload.seasonYear);
      const yearMatch = seasonName.match(/(\d{2,4})/);
      const year = yearMatch
        ? yearMatch[1].length === 2
          ? 2000 + parseInt(yearMatch[1])
          : parseInt(yearMatch[1])
        : new Date().getFullYear();
      const [newSeason] = await db
        .insert(seasons)
        .values({ apiLeagueId: payload.tournamentId, year, name: seasonName, isActive: true })
        .returning();
      season = newSeason;
    }

    // ── 2. Batch-upsert teams (1 query) ────────────────────────────────────
    const teamDataMap = new Map<number, { name: string; logoUrl: string | null }>();
    for (const f of payload.fixtures) {
      teamDataMap.set(f.homeTeamId, { name: f.homeTeamName, logoUrl: f.homeTeamLogo ?? null });
      teamDataMap.set(f.awayTeamId, { name: f.awayTeamName, logoUrl: f.awayTeamLogo ?? null });
    }

    const teamValues = [...teamDataMap.entries()].map(([apiTeamId, d]) => ({
      apiTeamId,
      name: d.name,
      logoUrl: d.logoUrl,
    }));

    await db
      .insert(teams)
      .values(teamValues)
      .onConflictDoUpdate({
        target: teams.apiTeamId,
        set: {
          name: sql`excluded.name`,
          logoUrl: sql`excluded."logoUrl"`,
        },
      });

    // ── 3. Batch-upsert rounds (1 query) ───────────────────────────────────
    const roundNumbers = [...new Set(payload.fixtures.map((f) => f.round))].sort((a, b) => a - b);
    const roundValues = roundNumbers.map((n) => ({
      seasonId: season.id,
      name: `Regular Season - ${n}`,
      number: n,
    }));

    await db
      .insert(rounds)
      .values(roundValues)
      .onConflictDoUpdate({
        target: [rounds.seasonId, rounds.number],
        set: { name: sql`excluded.name` },
      });

    // ── 4. Fetch back IDs we need for the matches FK ───────────────────────
    const [teamRows, roundRows] = await Promise.all([
      db.select({ id: teams.id, apiTeamId: teams.apiTeamId }).from(teams),
      db
        .select({ id: rounds.id, number: rounds.number })
        .from(rounds)
        .where(eq(rounds.seasonId, season.id)),
    ]);

    const teamDbMap = new Map(teamRows.map((t) => [t.apiTeamId, t.id]));
    const roundDbMap = new Map(roundRows.map((r) => [r.number, r.id]));

    // ── 5. Batch-upsert matches (1 query) ──────────────────────────────────
    const now = new Date();

    const matchValues = payload.fixtures.flatMap((f) => {
      const roundId = roundDbMap.get(f.round);
      const homeTeamId = teamDbMap.get(f.homeTeamId);
      const awayTeamId = teamDbMap.get(f.awayTeamId);
      if (!roundId || !homeTeamId || !awayTeamId) return [];

      const isFinished = f.status === "finished";
      const status = isFinished ? "FT" : f.status === "in_progress" ? "LIVE" : "NS";

      return [{
        apiFixtureId: f.fixtureId,
        seasonId: season.id,
        roundId,
        homeTeamId,
        awayTeamId,
        kickoff: new Date(f.kickoff),
        status,
        homeGoals: isFinished ? f.homeGoals : null,
        awayGoals: isFinished ? f.awayGoals : null,
        lastSyncedAt: now,
      }];
    });

    if (matchValues.length > 0) {
      await db
        .insert(matches)
        .values(matchValues)
        .onConflictDoUpdate({
          target: matches.apiFixtureId,
          set: {
            status: sql`excluded.status`,
            homeGoals: sql`excluded."homeGoals"`,
            awayGoals: sql`excluded."awayGoals"`,
            kickoff: sql`excluded.kickoff`,
            lastSyncedAt: sql`excluded."lastSyncedAt"`,
          },
        });
    }

    // ── 6. Score finished predictions ──────────────────────────────────────
    const scoredPredictions = await scoreFinishedMatches(season.id);

    await db
      .update(seasons)
      .set({ lastSyncedAt: now, syncError: null })
      .where(eq(seasons.id, season.id));

    return NextResponse.json({
      ok: true,
      fixturesProcessed: matchValues.length,
      predictionsScored: scoredPredictions,
      syncedAt: now,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[api/admin/import] Error:", message);
    try {
      await db
        .update(seasons)
        .set({ syncError: message, lastSyncedAt: startedAt })
        .where(eq(seasons.isActive, true));
    } catch { /* best effort */ }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function scoreFinishedMatches(seasonId: number): Promise<number> {
  const finishedMatches = await db
    .select()
    .from(matches)
    .where(and(eq(matches.seasonId, seasonId), eq(matches.status, "FT")));

  if (!finishedMatches.length) return 0;

  const matchIds = finishedMatches.map((m) => m.id);
  const unscoredPreds = await db
    .select()
    .from(predictions)
    .where(and(inArray(predictions.matchId, matchIds), isNull(predictions.points)));

  if (!unscoredPreds.length) return 0;

  const resultMap = new Map(
    finishedMatches
      .filter((m) => m.homeGoals !== null && m.awayGoals !== null)
      .map((m) => [m.id, { home: m.homeGoals!, away: m.awayGoals! }])
  );

  let count = 0;
  for (const pred of unscoredPreds) {
    const actual = resultMap.get(pred.matchId);
    if (!actual) continue;
    const points = scorePrediction({ home: pred.homeGoals, away: pred.awayGoals }, actual);
    await db.update(predictions).set({ points, updatedAt: new Date() }).where(eq(predictions.id, pred.id));
    count++;
  }
  return count;
}
