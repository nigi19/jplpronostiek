/**
 * POST /api/admin/import
 *
 * Accepts normalized fixture data from the sofascore_sync.py GitHub Actions job
 * and upserts teams, rounds, matches, then scores finished predictions.
 *
 * Authorization: Bearer <IMPORT_SECRET>
 */

import { NextRequest, NextResponse } from "next/server";
import { eq, and, isNull, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { seasons, teams, rounds, matches, predictions } from "../../../../../drizzle/schema";
import { scorePrediction } from "@/lib/scoring";

// ─── Payload schema ───────────────────────────────────────────────────────────

interface ImportFixture {
  fixtureId: number;
  round: number;
  homeTeamId: number;
  homeTeamName: string;
  homeTeamLogo?: string | null;
  awayTeamId: number;
  awayTeamName: string;
  awayTeamLogo?: string | null;
  kickoff: string; // ISO 8601
  status: "finished" | "in_progress" | "scheduled";
  homeGoals: number | null;
  awayGoals: number | null;
}

interface ImportPayload {
  tournamentId: number;
  seasonId: number;
  seasonYear: string; // e.g. "26/27"
  fixtures: ImportFixture[];
}

const FINAL_STATUSES = new Set(["finished"]);

export async function POST(req: NextRequest) {
  // ── 1. Authenticate ────────────────────────────────────────────────────────
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
    // ── 2. Find (or create) the active season ──────────────────────────────
    let [season] = await db
      .select()
      .from(seasons)
      .where(eq(seasons.isActive, true))
      .limit(1);

    if (!season) {
      // Auto-create season on first import if none exists
      const seasonName = String(payload.seasonYear);
      const yearMatch = seasonName.match(/(\d{2,4})/);
      const year = yearMatch ? (yearMatch[1].length === 2 ? 2000 + parseInt(yearMatch[1]) : parseInt(yearMatch[1])) : new Date().getFullYear();

      const [newSeason] = await db
        .insert(seasons)
        .values({ apiLeagueId: payload.tournamentId, year, name: seasonName, isActive: true })
        .returning();
      season = newSeason;
    }

    // ── 3. Upsert teams ────────────────────────────────────────────────────
    const allTeamIds = [
      ...new Set(payload.fixtures.flatMap((f) => [f.homeTeamId, f.awayTeamId])),
    ];

    const teamDataMap = new Map<number, { name: string; logoUrl: string | null }>();
    for (const f of payload.fixtures) {
      teamDataMap.set(f.homeTeamId, { name: f.homeTeamName, logoUrl: f.homeTeamLogo ?? null });
      teamDataMap.set(f.awayTeamId, { name: f.awayTeamName, logoUrl: f.awayTeamLogo ?? null });
    }

    for (const [apiTeamId, data] of teamDataMap) {
      await db
        .insert(teams)
        .values({ apiTeamId, name: data.name, logoUrl: data.logoUrl })
        .onConflictDoUpdate({
          target: teams.apiTeamId,
          set: { name: data.name, logoUrl: data.logoUrl },
        });
    }

    // ── 4. Upsert rounds ───────────────────────────────────────────────────
    const roundNumbers = [...new Set(payload.fixtures.map((f) => f.round))].sort((a, b) => a - b);
    const roundDbMap = new Map<number, number>(); // roundNumber → db id

    for (const number of roundNumbers) {
      const name = `Regular Season - ${number}`;
      const [row] = await db
        .insert(rounds)
        .values({ seasonId: season.id, name, number })
        .onConflictDoUpdate({
          target: [rounds.seasonId, rounds.number],
          set: { name },
        })
        .returning({ id: rounds.id });
      roundDbMap.set(number, row.id);
    }

    // ── 5. Build team apiTeamId → db id map ───────────────────────────────
    const teamRows = await db.select().from(teams);
    const teamDbMap = new Map<number, number>();
    for (const t of teamRows) teamDbMap.set(t.apiTeamId, t.id);

    // ── 6. Upsert matches ──────────────────────────────────────────────────
    const now = new Date();
    let upsertedCount = 0;

    for (const f of payload.fixtures) {
      const roundId = roundDbMap.get(f.round);
      const homeTeamId = teamDbMap.get(f.homeTeamId);
      const awayTeamId = teamDbMap.get(f.awayTeamId);

      if (!roundId || !homeTeamId || !awayTeamId) continue;

      const isFinished = f.status === "finished";
      const homeGoals = isFinished ? f.homeGoals : null;
      const awayGoals = isFinished ? f.awayGoals : null;

      // Map SofaScore status to our status field
      const status = isFinished ? "FT" : f.status === "in_progress" ? "LIVE" : "NS";

      await db
        .insert(matches)
        .values({
          apiFixtureId: f.fixtureId,
          seasonId: season.id,
          roundId,
          homeTeamId,
          awayTeamId,
          kickoff: new Date(f.kickoff),
          status,
          homeGoals,
          awayGoals,
          lastSyncedAt: now,
        })
        .onConflictDoUpdate({
          target: matches.apiFixtureId,
          set: { status, homeGoals, awayGoals, kickoff: new Date(f.kickoff), lastSyncedAt: now },
        });

      upsertedCount++;
    }

    // ── 7. Score finished predictions ──────────────────────────────────────
    const scoredPredictions = await scoreFinishedMatches(season.id);

    // ── 8. Update season sync timestamp ───────────────────────────────────
    await db
      .update(seasons)
      .set({ lastSyncedAt: now, syncError: null })
      .where(eq(seasons.id, season.id));

    return NextResponse.json({
      ok: true,
      fixturesProcessed: upsertedCount,
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
    } catch {
      // best effort
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ─── Helper ───────────────────────────────────────────────────────────────────

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

    const points = scorePrediction(
      { home: pred.homeGoals, away: pred.awayGoals },
      actual
    );

    await db
      .update(predictions)
      .set({ points, updatedAt: new Date() })
      .where(eq(predictions.id, pred.id));

    count++;
  }

  return count;
}
