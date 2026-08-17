import { describe, it, expect } from "vitest";
import { scorePrediction } from "./scoring";

describe("scorePrediction", () => {
  // ── Tier 1: exact score ────────────────────────────────────────────────────
  it("returns 10 for exact score — home win", () => {
    expect(scorePrediction({ home: 2, away: 0 }, { home: 2, away: 0 })).toBe(10);
  });
  it("returns 10 for exact score — draw", () => {
    expect(scorePrediction({ home: 1, away: 1 }, { home: 1, away: 1 })).toBe(10);
  });
  it("returns 10 for exact score — away win", () => {
    expect(scorePrediction({ home: 0, away: 3 }, { home: 0, away: 3 })).toBe(10);
  });

  // ── Tier 2: same goal difference, not exact ────────────────────────────────
  it("returns 7 for same GD (home win, different scores)", () => {
    // both +2 GD
    expect(scorePrediction({ home: 3, away: 1 }, { home: 2, away: 0 })).toBe(7);
  });
  it("returns 7 for same GD — correct draw, different scores (2-2 vs 1-1)", () => {
    // both 0 GD — draw correctly predicted but wrong exact
    expect(scorePrediction({ home: 2, away: 2 }, { home: 1, away: 1 })).toBe(7);
  });
  it("returns 7 for same GD — away win (−1 GD)", () => {
    expect(scorePrediction({ home: 1, away: 2 }, { home: 0, away: 1 })).toBe(7);
  });

  // ── Tier 3: correct outcome, wrong goal difference ─────────────────────────
  it("returns 5 for correct home win, different GD", () => {
    expect(scorePrediction({ home: 3, away: 0 }, { home: 1, away: 0 })).toBe(5);
  });
  it("returns 5 for correct away win, different GD", () => {
    // predicted GD = −1; actual GD = −2; same winner (away), different margin
    expect(scorePrediction({ home: 0, away: 1 }, { home: 1, away: 3 })).toBe(5);
  });

  // ── Tier 4: wrong outcome ──────────────────────────────────────────────────
  it("returns 1 for predicted home win, actual draw", () => {
    expect(scorePrediction({ home: 2, away: 0 }, { home: 1, away: 1 })).toBe(1);
  });
  it("returns 1 for predicted draw, actual home win", () => {
    expect(scorePrediction({ home: 1, away: 1 }, { home: 2, away: 0 })).toBe(1);
  });
  it("returns 1 for predicted home win, actual away win", () => {
    expect(scorePrediction({ home: 2, away: 1 }, { home: 0, away: 2 })).toBe(1);
  });
  it("returns 1 for predicted away win, actual draw", () => {
    expect(scorePrediction({ home: 0, away: 1 }, { home: 2, away: 2 })).toBe(1);
  });

  // ── 0-0 edge cases ─────────────────────────────────────────────────────────
  it("returns 10 for exact 0-0", () => {
    expect(scorePrediction({ home: 0, away: 0 }, { home: 0, away: 0 })).toBe(10);
  });
  it("returns 7 for predicted 0-0, actual 1-1 (same GD=0)", () => {
    expect(scorePrediction({ home: 0, away: 0 }, { home: 1, away: 1 })).toBe(7);
  });
});
