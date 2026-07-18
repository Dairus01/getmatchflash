import Database from "better-sqlite3";
import { parseTimeline, buildLiveMatchData } from "./event-parser";
import type { MatchEvent, MatchData } from "../../app/data/matches";

export type MatchStatus = "upcoming" | "live" | "completed";
export type PredictionChoice = "home" | "draw" | "away";

export type FixtureRecord = {
  fixtureId: number;
  homeTeam: string;
  awayTeam: string;
  competition: string;
  kickoffAt: string;
  status: MatchStatus;
  market: { home: number; draw: number; away: number };
  score: { home: number; away: number };
  latestEvent: string | null;
  events: MatchEvent[];
  replayData: MatchData | null;
};

export const CONFIRMED_FIXTURES = [
  {
    fixtureId: 18257865,
    homeTeam: "France",
    awayTeam: "England",
    competition: "World Cup 2026",
    kickoffAt: "2026-07-18T19:00:00.000Z",
    fallbackMarket: { home: 50, draw: 24, away: 26 },
  },
  {
    fixtureId: 18257739,
    homeTeam: "Spain",
    awayTeam: "Argentina",
    competition: "World Cup 2026",
    kickoffAt: "2026-07-19T19:00:00.000Z",
    fallbackMarket: { home: 42, draw: 31, away: 27 },
  },
] as const;

type TxlineFixture = Record<string, unknown>;
type OddsRow = { payload: string };
type EventRow = { payload: string };

export function ensureSchema(database: Database.Database) {
  database.pragma("journal_mode = WAL");
  database.exec(`
    CREATE TABLE IF NOT EXISTS txline_fixtures (
      fixture_id INTEGER PRIMARY KEY,
      snapshot_payload TEXT NOT NULL,
      observed_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS txline_events (
      id INTEGER PRIMARY KEY,
      source TEXT NOT NULL CHECK (source IN ('odds', 'scores')),
      fixture_id INTEGER NOT NULL,
      stream_event_id TEXT,
      event_type TEXT NOT NULL,
      received_at TEXT NOT NULL,
      payload TEXT NOT NULL,
      UNIQUE(source, stream_event_id)
    );
    CREATE INDEX IF NOT EXISTS txline_events_fixture_id ON txline_events(fixture_id, id);
    CREATE TABLE IF NOT EXISTS community_votes (
      id INTEGER PRIMARY KEY,
      fixture_id INTEGER NOT NULL,
      choice TEXT NOT NULL CHECK (choice IN ('home', 'draw', 'away')),
      voter_id TEXT,
      created_at TEXT NOT NULL,
      UNIQUE(fixture_id, voter_id)
    );
    CREATE INDEX IF NOT EXISTS community_votes_fixture_id ON community_votes(fixture_id);
    CREATE TABLE IF NOT EXISTS predictions (
      id INTEGER PRIMARY KEY,
      fixture_id INTEGER NOT NULL,
      predictor TEXT NOT NULL,
      home_score INTEGER NOT NULL,
      away_score INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
}

function numberValue(value: unknown, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function fixtureIdOf(payload: TxlineFixture) {
  return numberValue(payload.FixtureId ?? payload.fixtureId ?? payload.fixture_id, -1);
}

function fixtureName(payload: TxlineFixture, key: "Participant1" | "Participant2", fallback: string) {
  return String(payload[key] ?? payload[key.toLowerCase()] ?? fallback);
}

function kickoffOf(payload: TxlineFixture, fallback: string) {
  const value = payload.StartTime ?? payload.startTime ?? payload.kickoffAt;
  if (typeof value === "number" || /^\d+$/.test(String(value ?? ""))) {
    const milliseconds = numberValue(value) < 10_000_000_000 ? numberValue(value) * 1000 : numberValue(value);
    return new Date(milliseconds).toISOString();
  }
  return typeof value === "string" && value ? value : fallback;
}

function stateOf(payload: TxlineFixture, kickoffAt: string): MatchStatus {
  const state = String(payload.GameState ?? payload.Status ?? payload.status ?? "").toLowerCase();
  if (/finish|complete|full.?time|ended|cancel/.test(state) || [4, 5, 6, 7, 8, 9].includes(numberValue(payload.GameState, -1))) return "completed";
  if (/live|progress|half.?time|playing/.test(state) || [2, 3].includes(numberValue(payload.GameState, -1))) return "live";
  const kickoffMilliseconds = Date.parse(kickoffAt);
  if (kickoffMilliseconds > Date.now()) return "upcoming";
  // Increased fallback to 24 hours to handle long-running devnet simulations
  return Date.now() - kickoffMilliseconds > 24 * 60 * 60 * 1000 ? "completed" : "live";
}

function normalizeMarket(values: unknown, fallback: { home: number; draw: number; away: number }) {
  if (!Array.isArray(values) || values.length < 3) return fallback;
  const numbers = values.slice(0, 3).map((value) => numberValue(value, -1));
  if (numbers.some((value) => value < 0)) return fallback;
  const total = numbers.reduce((sum, value) => sum + value, 0);
  if (total <= 0) return fallback;
  return {
    home: Math.round((numbers[0] / total) * 100),
    draw: Math.round((numbers[1] / total) * 100),
    away: Math.max(0, 100 - Math.round((numbers[0] / total) * 100) - Math.round((numbers[1] / total) * 100)),
  };
}

function latestOdds(database: Database.Database, fixtureId: number, fallback: { home: number; draw: number; away: number }) {
  const rows = database.prepare("SELECT payload FROM txline_events WHERE fixture_id = ? AND source = 'odds' ORDER BY id DESC LIMIT 20").all(fixtureId) as OddsRow[];
  for (const row of rows) {
    try {
      const payload = JSON.parse(row.payload) as Record<string, unknown>;
      const probabilities = payload.Pct ?? payload.Percentages ?? payload.probabilities;
      if (Array.isArray(probabilities)) return normalizeMarket(probabilities, fallback);
    } catch { /* keep the last valid market */ }
  }
  return fallback;
}

function scoreOf(payload: TxlineFixture) {
  const score = (payload.Score ?? payload.score) as Record<string, unknown> | undefined;
  const home = (score?.Participant1 ?? score?.home) as Record<string, unknown> | undefined;
  const away = (score?.Participant2 ?? score?.away) as Record<string, unknown> | undefined;
  const homeTotal = home?.Total as Record<string, unknown> | undefined;
  const awayTotal = away?.Total as Record<string, unknown> | undefined;
  return {
    home: Math.max(0, Math.trunc(numberValue(payload.HomeScore ?? home?.Goals ?? homeTotal?.Goals, 0))),
    away: Math.max(0, Math.trunc(numberValue(payload.AwayScore ?? away?.Goals ?? awayTotal?.Goals, 0))),
  };
}

function latestScore(database: Database.Database, fixtureId: number, payload: TxlineFixture) {
  const row = database.prepare("SELECT payload FROM txline_events WHERE fixture_id = ? AND source = 'scores' AND payload LIKE '%\"Score\"%' ORDER BY id DESC LIMIT 1").get(fixtureId) as EventRow | undefined;
  if (row) {
    try {
      const eventPayload = JSON.parse(row.payload) as TxlineFixture;
      const s = scoreOf(eventPayload);
      if (s.home > 0 || s.away > 0 || Object.keys(eventPayload.Score || {}).length > 0) return s;
    } catch {}
  }
  return scoreOf(payload);
}

function latestEvent(database: Database.Database, fixtureId: number) {
  const row = database.prepare("SELECT payload FROM txline_events WHERE fixture_id = ? AND source = 'scores' ORDER BY id DESC LIMIT 1").get(fixtureId) as EventRow | undefined;
  if (!row) return null;
  try {
    const payload = JSON.parse(row.payload) as Record<string, unknown>;
    const action = String(payload.Action ?? payload.action ?? payload.Type ?? "update").replaceAll("_", " ");
    return action.charAt(0).toUpperCase() + action.slice(1);
  } catch { return null; }
}

function recordFrom(database: Database.Database, fixture: typeof CONFIRMED_FIXTURES[number], payload?: TxlineFixture): FixtureRecord {
  const kickoffAt = kickoffOf(payload ?? {}, fixture.kickoffAt);
  let status = stateOf(payload ?? {}, kickoffAt);
  const homeTeam = fixtureName(payload ?? {}, "Participant1", fixture.homeTeam);
  const awayTeam = fixtureName(payload ?? {}, "Participant2", fixture.awayTeam);
  
  // Override status if we have a game_finalised event in the database
  const finalisedCount = (database.prepare("SELECT COUNT(*) AS c FROM txline_events WHERE fixture_id = ? AND source = 'scores' AND payload LIKE '%game_finalised%'").get(fixture.fixtureId) as { c: number }).c;
  if (finalisedCount > 0) status = "completed";

  const eventRows = database.prepare("SELECT payload FROM txline_events WHERE fixture_id = ? ORDER BY id ASC").all(fixture.fixtureId) as EventRow[];
  const rawEvents = eventRows.map((r) => {
    try { return JSON.parse(r.payload); } catch { return null; }
  }).filter(Boolean);
  
  // Fetch 1X2 odds events for real probability data
  const oddsRows = database.prepare("SELECT payload FROM txline_events WHERE fixture_id = ? AND source = 'odds' AND payload LIKE '%1X2_PARTICIPANT_RESULT%' ORDER BY id ASC").all(fixture.fixtureId) as EventRow[];
  const oddsEvents = oddsRows.map((r) => {
    try { return JSON.parse(r.payload); } catch { return null; }
  }).filter(Boolean);

  const events = parseTimeline(rawEvents, { home: homeTeam, away: awayTeam }).slice(-20);
  const replayData = status !== "upcoming" ? buildLiveMatchData(rawEvents, { fixtureId: fixture.fixtureId, homeTeam, awayTeam, kickoffAt: fixture.kickoffAt }, oddsEvents) : null;

  return {
    fixtureId: fixture.fixtureId,
    homeTeam,
    awayTeam,
    competition: String(payload?.CompetitionName ?? payload?.Competition ?? fixture.competition),
    kickoffAt,
    status,
    market: latestOdds(database, fixture.fixtureId, fixture.fallbackMarket),
    score: latestScore(database, fixture.fixtureId, payload ?? {}),
    latestEvent: latestEvent(database, fixture.fixtureId),
    events,
    replayData,
  };
}

export function confirmedMatches(database: Database.Database) {
  const rows = database.prepare("SELECT snapshot_payload FROM txline_fixtures WHERE fixture_id IN (?, ?) ORDER BY fixture_id").all(...CONFIRMED_FIXTURES.map((fixture) => fixture.fixtureId)) as Array<{ snapshot_payload: string }>;
  const snapshots = new Map<number, TxlineFixture>();
  for (const row of rows) {
    try {
      const payload = JSON.parse(row.snapshot_payload) as TxlineFixture;
      snapshots.set(fixtureIdOf(payload), payload);
    } catch { /* fallback fixture remains available */ }
  }
  return CONFIRMED_FIXTURES.map((fixture) => recordFrom(database, fixture, snapshots.get(fixture.fixtureId)));
}

export function voteSummary(database: Database.Database, fixtureId: number) {
  const counts = database.prepare("SELECT choice, COUNT(*) AS count FROM community_votes WHERE fixture_id = ? GROUP BY choice").all(fixtureId) as Array<{ choice: PredictionChoice; count: number }>;
  const total = counts.reduce((sum, row) => sum + row.count, 0);
  const count = (choice: PredictionChoice) => counts.find((row) => row.choice === choice)?.count ?? 0;
  const percent = (choice: PredictionChoice) => total ? Math.round((count(choice) / total) * 100) : 0;
  return { total, counts: { home: count("home"), draw: count("draw"), away: count("away") }, percentages: { home: percent("home"), draw: percent("draw"), away: total ? 100 - percent("home") - percent("draw") : 0 } };
}

export function publicMatch(database: Database.Database, fixtureId: number) {
  const match = confirmedMatches(database).find((item) => item.fixtureId === fixtureId);
  if (!match) return null;
  return { ...match, community: voteSummary(database, fixtureId) };
}
