/**
 * Scoring rules for a single match prediction.
 *
 * Tier 1 — Exact score                              → 10 points
 * Tier 2 — Correct goal difference (not exact)      →  7 points
 * Tier 3 — Correct winner/draw (not same GD)        →  5 points
 * Tier 4 — Wrong outcome                            →  1 point
 * No prediction submitted (caller's responsibility) →  0 points
 *
 * Draw note: a correct-but-inexact draw (e.g. predict 2-2, actual 1-1) falls
 * into Tier 2 because the goal difference (0) matches. This is intentional —
 * drawing correctly deserves more credit than just picking the right winner.
 */

export interface Score {
  home: number;
  away: number;
}

/** Returns the sign of n: -1, 0, or 1 */
function sign(n: number): -1 | 0 | 1 {
  if (n < 0) return -1;
  if (n > 0) return 1;
  return 0;
}

/**
 * Compute points for a submitted prediction against the actual result.
 * Both arguments must have integer home/away goals ≥ 0.
 */
export function scorePrediction(predicted: Score, actual: Score): number {
  const { home: ph, away: pa } = predicted;
  const { home: ah, away: aa } = actual;

  // Tier 1: exact score
  if (ph === ah && pa === aa) return 10;

  // Tier 2: same goal difference
  if (ph - pa === ah - aa) return 7;

  // Tier 3: correct outcome (winner or draw)
  if (sign(ph - pa) === sign(ah - aa)) return 5;

  // Tier 4: wrong outcome
  return 1;
}

/**
 * Compute points for a list of finished matches and their predictions.
 * Returns an array of [predictionId, points] tuples.
 */
export function scoreAll(
  items: Array<{
    predictionId: number;
    predicted: Score;
    actual: Score;
  }>
): Array<{ predictionId: number; points: number }> {
  return items.map(({ predictionId, predicted, actual }) => ({
    predictionId,
    points: scorePrediction(predicted, actual),
  }));
}
