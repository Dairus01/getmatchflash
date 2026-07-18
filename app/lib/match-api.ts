import type { MatchEvent, MatchData } from "../data/matches";

export type MatchStatus = "upcoming" | "live" | "completed";
export type PredictionChoice = "home" | "draw" | "away";

export type MatchMarket = { home: number; draw: number; away: number };
export type CommunitySummary = {
  total: number;
  counts: MatchMarket;
  percentages: MatchMarket;
};

export type MatchSnapshot = {
  fixtureId: number;
  homeTeam: string;
  awayTeam: string;
  competition: string;
  kickoffAt: string;
  status: MatchStatus;
  market: MatchMarket;
  score: { home: number; away: number };
  latestEvent: string | null;
  community: CommunitySummary;
  events: MatchEvent[];
  replayData: MatchData | null;
};

const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001").replace(/\/$/, "");

async function requestJson<T>(url: string, init: RequestInit, label: string): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) throw new Error(`${label} returned ${response.status}`);
  return response.json() as Promise<T>;
}

export async function fetchMatch(fixtureId: number, initOpts: RequestInit = { cache: "no-store" }, signal?: AbortSignal) {
  const result = await requestJson<{ match: MatchSnapshot }>(
    `${API_URL}/api/matches/${fixtureId}`,
    { signal, ...initOpts },
    "Match API",
  );
  return result.match;
}

export async function fetchMatches(state?: MatchStatus, signal?: AbortSignal) {
  const path = state === "upcoming" ? "/api/upcoming" : state === "live" ? "/api/live" : "/api/matches";
  const result = await requestJson<{ matches: MatchSnapshot[] }>(
    `${API_URL}${path}`,
    { signal, cache: "no-store" },
    "Match API",
  );
  return result.matches;
}

export async function castVote(fixtureId: number, choice: PredictionChoice) {
  const voterId = typeof window === "undefined" ? undefined : (() => {
    const key = "matchflash-voter-id";
    const existing = window.localStorage.getItem(key);
    if (existing) return existing;
    const created = crypto.randomUUID();
    window.localStorage.setItem(key, created);
    return created;
  })();
  return requestJson<CommunitySummary & { choice: PredictionChoice }>(
    `${API_URL}/api/matches/${fixtureId}/votes`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ choice, voterId }),
    },
    "Vote API",
  );
}
