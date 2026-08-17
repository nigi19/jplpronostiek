#!/usr/bin/env python3
"""
Fetch Jupiler Pro League fixtures from SofaScore and POST them to the app's import endpoint.

Requires:
  pip install curl_cffi

Usage:
  python scripts/sofascore_sync.py

Environment variables (set in .env or GitHub Actions secrets):
  SOFASCORE_TOURNAMENT_ID  - SofaScore unique tournament ID for JPL (default: 38)
  APP_URL                  - Base URL of the deployed app (e.g. https://pronostiek.vercel.app)
  IMPORT_SECRET            - Shared secret matching IMPORT_SECRET in the app's env vars

To find the correct SOFASCORE_TOURNAMENT_ID:
  Open https://www.sofascore.com/football/belgium/jupiler-pro-league
  The number at the end of the URL is the tournament ID (e.g. /jupiler-pro-league-38 → 38)
"""

import os
import sys
import json
import datetime
import logging
from typing import Any, Optional

try:
    from curl_cffi import requests as curl_requests
except ImportError:
    print("ERROR: curl_cffi is required. Run: pip install curl_cffi", file=sys.stderr)
    sys.exit(1)

import urllib.request

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("sofascore_sync")

BASE_URL = "https://www.sofascore.com/api/v1"
TOURNAMENT_ID = int(os.environ.get("SOFASCORE_TOURNAMENT_ID", "38"))
APP_URL = os.environ.get("APP_URL", "http://localhost:3000").rstrip("/")
IMPORT_SECRET = os.environ.get("IMPORT_SECRET", "")


def api_get(path: str) -> Any:
    """GET a SofaScore API path, returning parsed JSON. Raises on error."""
    url = f"{BASE_URL}{path}"
    resp = curl_requests.get(
        url,
        impersonate="chrome",
        headers={
            "Referer": "https://www.sofascore.com/",
            "Origin": "https://www.sofascore.com",
            "Accept": "application/json",
        },
        timeout=30,
    )
    if resp.status_code != 200:
        raise RuntimeError(f"SofaScore {path} → HTTP {resp.status_code}: {resp.text[:200]}")
    return resp.json()


def get_current_season() -> dict:
    """Return the most recent (highest ID) season for our tournament."""
    data = api_get(f"/unique-tournament/{TOURNAMENT_ID}/seasons")
    seasons = data.get("seasons", [])
    if not seasons:
        raise RuntimeError(f"No seasons found for tournament {TOURNAMENT_ID}")
    # Seasons are returned newest-first
    return seasons[0]


def get_rounds(season_id: int) -> list[int]:
    """Return a sorted list of round numbers (e.g. [1, 2, ... 34]) for the season."""
    data = api_get(f"/unique-tournament/{TOURNAMENT_ID}/season/{season_id}/rounds")
    rounds = data.get("rounds", [])
    numbers = sorted(set(r.get("round") for r in rounds if r.get("round") is not None))
    return numbers


def fetch_round(season_id: int, round_number: int) -> list[dict]:
    """Fetch all events for a given round number. Returns raw SofaScore events."""
    data = api_get(
        f"/unique-tournament/{TOURNAMENT_ID}/season/{season_id}/events/round/{round_number}"
    )
    return data.get("events", [])


FINISHED_TYPES = {"finished"}
FINISHED_CODES = {100}


def normalize_status(event: dict) -> str:
    status = event.get("status") or {}
    if status.get("type") in FINISHED_TYPES or status.get("code") in FINISHED_CODES:
        return "finished"
    stype = status.get("type", "")
    if stype in ("inprogress", "in_progress"):
        return "in_progress"
    return "scheduled"


def normalize_event(event: dict, round_number: int) -> Optional[dict]:
    """Convert a SofaScore event to our import schema. Returns None for non-regular-season events."""
    fixture_id = event.get("id")
    if not fixture_id:
        return None

    home = event.get("homeTeam") or {}
    away = event.get("awayTeam") or {}
    home_score = event.get("homeScore") or {}
    away_score = event.get("awayScore") or {}
    ts = event.get("startTimestamp")

    if not ts:
        return None

    kickoff = datetime.datetime.fromtimestamp(ts, tz=datetime.timezone.utc).isoformat()
    status = normalize_status(event)

    home_goals = home_score.get("current") if status == "finished" else None
    away_goals = away_score.get("current") if status == "finished" else None

    return {
        "fixtureId": fixture_id,
        "round": round_number,
        "homeTeamId": home.get("id"),
        "homeTeamName": home.get("name", "Unknown"),
        "homeTeamLogo": f"https://api.sofascore.app/api/v1/team/{home.get('id')}/image" if home.get("id") else None,
        "awayTeamId": away.get("id"),
        "awayTeamName": away.get("name", "Unknown"),
        "awayTeamLogo": f"https://api.sofascore.app/api/v1/team/{away.get('id')}/image" if away.get("id") else None,
        "kickoff": kickoff,
        "status": status,
        "homeGoals": home_goals,
        "awayGoals": away_goals,
    }


def post_to_app(payload: dict) -> None:
    """POST the normalized payload to the app's import endpoint."""
    url = f"{APP_URL}/api/admin/import"
    body = json.dumps(payload).encode("utf-8")

    req = urllib.request.Request(
        url,
        data=body,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {IMPORT_SECRET}",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            result = json.loads(resp.read().decode())
            log.info("Import response: %s", result)
    except urllib.error.HTTPError as e:
        body_text = e.read().decode()
        raise RuntimeError(f"Import endpoint returned HTTP {e.code}: {body_text}") from e


def main() -> None:
    if not IMPORT_SECRET:
        log.error("IMPORT_SECRET is not set. Aborting.")
        sys.exit(1)

    log.info("Fetching seasons for tournament %d…", TOURNAMENT_ID)
    season = get_current_season()
    season_id = season["id"]
    season_year = season.get("year", "?")
    log.info("Current season: %s (id=%d)", season_year, season_id)

    log.info("Fetching round list…")
    round_numbers = get_rounds(season_id)
    if not round_numbers:
        log.error("No rounds found for season %d. Check SOFASCORE_TOURNAMENT_ID.", season_id)
        sys.exit(1)
    log.info("Found %d rounds: %s to %s", len(round_numbers), round_numbers[0], round_numbers[-1])

    all_fixtures: list[dict] = []
    for rnd in round_numbers:
        log.info("Fetching round %d…", rnd)
        try:
            events = fetch_round(season_id, rnd)
        except Exception as e:
            log.warning("Round %d fetch failed: %s — skipping", rnd, e)
            continue

        for event in events:
            normalized = normalize_event(event, rnd)
            if normalized:
                all_fixtures.append(normalized)

    log.info("Total fixtures collected: %d", len(all_fixtures))

    if not all_fixtures:
        log.error("No fixtures collected. Check tournament/season IDs.")
        sys.exit(1)

    payload = {
        "tournamentId": TOURNAMENT_ID,
        "seasonId": season_id,
        "seasonYear": season_year,
        "fixtures": all_fixtures,
    }

    log.info("Posting %d fixtures to %s/api/admin/import…", len(all_fixtures), APP_URL)
    post_to_app(payload)
    log.info("Done.")


if __name__ == "__main__":
    main()
