/**
 * Typed wrapper for API-Football (api-sports.io).
 *
 * IMPORTANT: never call these functions from page components or during a
 * user request. They are exclusively for the cron sync job (server-side
 * route handler) to keep well under the 100 req/day free-tier limit.
 */

const BASE_URL = "https://v3.football.api-sports.io";

async function apiGet<T>(path: string): Promise<T> {
  const key = process.env.API_FOOTBALL_KEY;
  if (!key) throw new Error("API_FOOTBALL_KEY is not set");

  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, {
    headers: {
      "x-rapidapi-key": key,
      "x-rapidapi-host": "v3.football.api-sports.io",
    },
    // No caching — we are the cache (Postgres)
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`API-Football fetch failed: ${res.status} ${res.statusText} for ${path}`);
  }

  const data = await res.json() as ApiResponse<T>;

  if (data.errors && Object.keys(data.errors).length > 0) {
    throw new Error(`API-Football error: ${JSON.stringify(data.errors)}`);
  }

  return data.response as T;
}

// ─── API response envelope ────────────────────────────────────────────────────

interface ApiResponse<T> {
  response: T;
  errors: Record<string, string> | [];
  results: number;
}

// ─── Fixture types ────────────────────────────────────────────────────────────

export interface ApiFixture {
  fixture: {
    id: number;
    date: string;       // ISO 8601 with offset
    status: {
      short: string;    // NS, 1H, HT, 2H, ET, P, FT, AET, PEN, PST, CANC, ABD…
    };
  };
  league: {
    id: number;
    round: string;      // e.g. "Regular Season - 3"
    season: number;     // e.g. 2024
  };
  teams: {
    home: ApiTeam;
    away: ApiTeam;
  };
  goals: {
    home: number | null;
    away: number | null;
  };
  score: {
    fulltime: {
      home: number | null;
      away: number | null;
    };
  };
}

export interface ApiTeam {
  id: number;
  name: string;
  logo: string;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Fetch all fixtures for a given league + season.
 * This is ~1 request for the entire season (~240 matches for JPL).
 * League 144 = Jupiler Pro League.
 */
export async function fetchFixtures(
  leagueId: number,
  season: number
): Promise<ApiFixture[]> {
  return apiGet<ApiFixture[]>(
    `/fixtures?league=${leagueId}&season=${season}`
  );
}
