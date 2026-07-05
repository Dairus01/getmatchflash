import { createServer, type ServerResponse } from "node:http";
import { resolve, extname, dirname } from "node:path";
import { mkdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import Database from "better-sqlite3";
import { WebSocketServer, WebSocket } from "ws";
import { eventsToStory, type MatchState, type RawTxlineEvent, type Story } from "./story-engine.js";
import { classifyFixture } from "./narrative.js";
import { confirmedMatches, ensureSchema, publicMatch, voteSummary, type PredictionChoice } from "./match-domain.js";

const PORT = Number(process.env.PORT ?? "3001");
const DB_PATH = resolve(".data/matchflash.sqlite");
const ARCHIVE_DB_PATH = resolve(".data/matchflash.db");
const REPLAY_SPEED = 20;
const PUBLIC_DIR = resolve("public");
mkdirSync(dirname(DB_PATH), { recursive: true });

type StoredEvent = {
  id: number; fixture_id: number; source: "odds" | "scores"; stream_event_id: string | null;
  event_type: string; received_at: string; payload: string;
};
type FixtureRow = { fixture_id: number; snapshot_payload: string };
type ArchivedFixtureRow = { home_team: string | null; away_team: string | null };
type ArchivedEventRow = { payload_json: string };

function database(readonly = false) {
  const db = new Database(DB_PATH, { readonly });
  if (!readonly) ensureSchema(db);
  return db;
}
function corsHeaders(requestOrigin?: string) {
  const configuredOrigins = (process.env.CORS_ORIGIN ?? process.env.FRONTEND_ORIGIN ?? "http://localhost:3000").split(",").map((value) => value.trim());
  const origin = requestOrigin && configuredOrigins.includes(requestOrigin) ? requestOrigin : configuredOrigins[0];
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "Content-Type",
    vary: "Origin",
  };
}

function json(response: ServerResponse, status: number, body: unknown, requestOrigin?: string) {
  response.writeHead(status, { "content-type": "application/json", ...corsHeaders(requestOrigin) });
  response.end(JSON.stringify(body));
}
function sse(response: ServerResponse, event: string, data: unknown, id?: string | null) {
  if (id) response.write(`id: ${id}\n`);
  response.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}
function sleep(milliseconds: number) { return new Promise<void>((resolve) => setTimeout(resolve, milliseconds)); }

function fixtureState(db: Database.Database, fixtureId: number): MatchState | null {
  const row = db.prepare("SELECT fixture_id, snapshot_payload FROM txline_fixtures WHERE fixture_id = ?").get(fixtureId) as FixtureRow | undefined;
  if (!row) return null;
  const fixture = JSON.parse(row.snapshot_payload) as Record<string, unknown>;
  return { fixtureId, homeTeam: String(fixture.Participant1 ?? "Home side"), awayTeam: String(fixture.Participant2 ?? "Away side") };
}

function eventStories(db: Database.Database, fixtureId: number, afterId = 0): Array<{ id: number; story: Story }> {
  const state = fixtureState(db, fixtureId);
  if (!state) return [];
  const allEvents = db.prepare("SELECT * FROM txline_events WHERE fixture_id = ? ORDER BY id").all(fixtureId) as StoredEvent[];
  const stories: Array<{ id: number; story: Story }> = [];
  for (const event of allEvents) {
    const payload = JSON.parse(event.payload) as RawTxlineEvent;
    const story = eventsToStory(payload, state);
    if (story && event.id > afterId) stories.push({ id: event.id, story });
    const market = [payload.SuperOddsType, payload.MarketParameters, payload.MarketPeriod].join("|");
    if (Array.isArray(payload.Prices) && payload.Prices.every((price) => typeof price === "number")) {
      state.odds = { ...state.odds, [market]: payload.Prices as number[] };
    }
  }
  return stories;
}

async function readJson(request: import("node:http").IncomingMessage) {
  let body = "";
  for await (const chunk of request) body += chunk;
  return JSON.parse(body) as unknown;
}

async function replay(response: ServerResponse, fixtureId: number, requestedSpeed = REPLAY_SPEED, requestOrigin?: string) {
  const speed = [2, 10, 20, 60].includes(requestedSpeed) ? requestedSpeed : REPLAY_SPEED;
  const archive = new Database(ARCHIVE_DB_PATH, { readonly: true });
  const fixture = archive.prepare("SELECT home_team, away_team FROM fixtures WHERE id = ?").get(fixtureId) as ArchivedFixtureRow | undefined;
  const rawEvents = archive.prepare("SELECT payload_json FROM events WHERE fixture_id = ? ORDER BY id").all(fixtureId) as ArchivedEventRow[];
  archive.close();
  if (!fixture || !rawEvents.length) return json(response, 404, { error: `No archived events for fixture ${fixtureId}` }, requestOrigin);

  const stories = classifyFixture(rawEvents.map(({ payload_json }) => JSON.parse(payload_json)), {
    homeTeam: fixture.home_team ?? "Home side",
    awayTeam: fixture.away_team ?? "Away side",
  });
  response.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache, no-transform", connection: "keep-alive", "x-accel-buffering": "no", ...corsHeaders(requestOrigin) });
  response.flushHeaders();
  sse(response, "replay-start", { fixtureId, speed, capturedEventCount: rawEvents.length, storyCount: stories.length });
  let previousAt = stories[0]?.timestamp ?? 0;
  for (const story of stories) {
    const currentAt = story.timestamp;
    await sleep(Math.max(0, (currentAt - previousAt) / speed));
    previousAt = currentAt;
    sse(response, "story", story);
  }
  sse(response, "replay-complete", { fixtureId, replayedEventCount: rawEvents.length, storyCount: stories.length });
  response.end();
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
  const requestOrigin = request.headers.origin;
  const replayMatch = url.pathname.match(/^\/replay\/(\d+)$/);
  const storyMatch = url.pathname.match(/^\/api\/stories\/(\d+)$/);
const leaderboardMatch = url.pathname.match(/^\/api\/leaderboard\/(\d+)$/);
  const archiveSearch = url.pathname === "/api/archive/search";
  const matchDetail = url.pathname.match(/^\/api\/matches\/(\d+)$/);
  const matchVotes = url.pathname.match(/^\/api\/matches\/(\d+)\/votes$/);
  const matchProbability = url.pathname.match(/^\/api\/matches\/(\d+)\/probabilities$/);
  try {
    if (request.method === "OPTIONS") {
      response.writeHead(204, corsHeaders(requestOrigin));
      return response.end();
    }
    if (request.method === "GET" && url.pathname === "/api/fixtures") {
      const db = database();
      const fixtures = (db.prepare("SELECT snapshot_payload FROM txline_fixtures ORDER BY fixture_id").all() as Array<{ snapshot_payload: string }>).map((row) => JSON.parse(row.snapshot_payload));
      db.close();
      return json(response, 200, { source: "txline-captured-snapshot", fixtures }, requestOrigin);
    }
    if (request.method === "GET" && (url.pathname === "/api/matches" || url.pathname === "/api/upcoming" || url.pathname === "/api/live")) {
      const db = database(false);
      const matches = confirmedMatches(db).map((match) => ({ ...match, community: voteSummary(db, match.fixtureId) }));
      db.close();
      const requestedState = url.searchParams.get("state");
      const state = url.pathname === "/api/upcoming" ? "upcoming" : url.pathname === "/api/live" ? "live" : requestedState;
      return json(response, 200, { matches: state ? matches.filter((match) => match.status === state) : matches }, requestOrigin);
    }
    if (request.method === "GET" && matchDetail) {
      const db = database(false);
      const match = publicMatch(db, Number(matchDetail[1]));
      db.close();
      return match ? json(response, 200, { match }, requestOrigin) : json(response, 404, { error: "Match not found" }, requestOrigin);
    }
    if (request.method === "GET" && matchProbability) {
      const db = database(false);
      const match = publicMatch(db, Number(matchProbability[1]));
      db.close();
      return match ? json(response, 200, { fixtureId: match.fixtureId, market: match.market, status: match.status }, requestOrigin) : json(response, 404, { error: "Match not found" }, requestOrigin);
    }
    if (request.method === "GET" && matchVotes) {
      const db = database(false);
      const summary = voteSummary(db, Number(matchVotes[1]));
      db.close();
      return json(response, 200, { fixtureId: Number(matchVotes[1]), ...summary }, requestOrigin);
    }
    if (request.method === "POST" && matchVotes) {
      const body = await readJson(request) as Record<string, unknown>;
      const choice = body.choice;
      const voterId = typeof body.voterId === "string" && body.voterId.trim() ? body.voterId.trim().slice(0, 120) : null;
      if (!(["home", "draw", "away"] as string[]).includes(String(choice))) return json(response, 400, { error: "choice must be home, draw, or away" }, requestOrigin);
      const db = database(false);
      const fixtureId = Number(matchVotes[1]);
      if (!publicMatch(db, fixtureId)) { db.close(); return json(response, 404, { error: "Match not found" }, requestOrigin); }
      if (voterId) db.prepare("INSERT INTO community_votes (fixture_id, choice, voter_id, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(fixture_id, voter_id) DO UPDATE SET choice = excluded.choice, created_at = excluded.created_at").run(fixtureId, choice, voterId, new Date().toISOString());
      else db.prepare("INSERT INTO community_votes (fixture_id, choice, voter_id, created_at) VALUES (?, ?, NULL, ?)").run(fixtureId, choice, new Date().toISOString());
      const summary = voteSummary(db, fixtureId);
      db.close();
      return json(response, 201, { fixtureId, choice: choice as PredictionChoice, ...summary }, requestOrigin);
    }
    if (request.method === "GET" && (url.pathname === "/api/archive" || archiveSearch)) {
      let archive: Database.Database;
      try { archive = new Database(ARCHIVE_DB_PATH, { readonly: true }); } catch { return json(response, 200, { fixtures: [] }, requestOrigin); }
      const team = url.searchParams.get("team")?.trim(); const date = url.searchParams.get("date")?.trim();
      let sql = "SELECT f.id, f.home_team AS homeTeam, f.away_team AS awayTeam, f.kickoff_at AS kickoffAt, COUNT(e.id) AS eventCount FROM fixtures f JOIN events e ON e.fixture_id = f.id";
      const where:string[]=["CAST(f.kickoff_at AS INTEGER) < CAST(strftime('%s', 'now') AS INTEGER) * 1000"]; const args:unknown[]=[]; if(team){where.push("(lower(f.home_team) LIKE ? OR lower(f.away_team) LIKE ?)");args.push(`%${team.toLowerCase()}%`,`%${team.toLowerCase()}%`)}if(date){where.push("f.kickoff_at LIKE ?");args.push(`${date}%`)}sql+=" WHERE "+where.join(" AND ");sql+=" GROUP BY f.id HAVING COUNT(e.id) > 0 ORDER BY f.kickoff_at DESC";
      const fixtures=archive.prepare(sql).all(...args);archive.close();return json(response,200,{fixtures},requestOrigin);
    }
    if (request.method === "GET" && storyMatch) {
      const db = database();
      const stories = eventStories(db, Number(storyMatch[1])).map(({ id, story }) => ({ id, ...story }));
      db.close();
      return json(response, 200, { fixtureId: Number(storyMatch[1]), stories }, requestOrigin);
    }
    if (request.method === "GET" && replayMatch) return await replay(response, Number(replayMatch[1]), Number(url.searchParams.get("speed") ?? REPLAY_SPEED), requestOrigin);
    if (request.method === "POST" && url.pathname === "/api/predict") {
      const body = await readJson(request) as Record<string, unknown>;
      const fixtureId = Number(body.fixtureId), homeScore = Number(body.homeScore), awayScore = Number(body.awayScore);
      const predictor = typeof body.predictor === "string" ? body.predictor.trim() : "";
      if (!Number.isSafeInteger(fixtureId) || !Number.isInteger(homeScore) || !Number.isInteger(awayScore) || homeScore < 0 || awayScore < 0 || !predictor) {
        return json(response, 400, { error: "fixtureId, predictor, and non-negative integer homeScore/awayScore are required" }, requestOrigin);
      }
      const db = database(false);
      db.exec("CREATE TABLE IF NOT EXISTS predictions (id INTEGER PRIMARY KEY, fixture_id INTEGER NOT NULL, predictor TEXT NOT NULL, home_score INTEGER NOT NULL, away_score INTEGER NOT NULL, created_at TEXT NOT NULL)");
      const result = db.prepare("INSERT INTO predictions (fixture_id, predictor, home_score, away_score, created_at) VALUES (?, ?, ?, ?, ?)").run(fixtureId, predictor, homeScore, awayScore, new Date().toISOString());
      db.close();
      return json(response, 201, { id: result.lastInsertRowid, fixtureId, predictor, homeScore, awayScore }, requestOrigin);
    }
    if (request.method === "GET" && leaderboardMatch) {
      const db = database(false);
      db.exec("CREATE TABLE IF NOT EXISTS predictions (id INTEGER PRIMARY KEY, fixture_id INTEGER NOT NULL, predictor TEXT NOT NULL, home_score INTEGER NOT NULL, away_score INTEGER NOT NULL, created_at TEXT NOT NULL)");
      const predictions = db.prepare("SELECT predictor, home_score AS homeScore, away_score AS awayScore, created_at AS createdAt FROM predictions WHERE fixture_id = ? ORDER BY created_at ASC").all(Number(leaderboardMatch[1]));
      db.close();
      return json(response, 200, { fixtureId: Number(leaderboardMatch[1]), predictions }, requestOrigin);
    }
    if (request.method === "GET" && !url.pathname.startsWith("/api/") && !url.pathname.startsWith("/replay/") && !url.pathname.startsWith("/live/")) {
      const relative = url.pathname === "/" ? "index.html" : url.pathname.replace(/^\/+/, "");
      if (relative.includes("..")) return json(response, 400, { error: "Invalid path" }, requestOrigin);
      const file = resolve(PUBLIC_DIR, relative);
      const content = await readFile(file);
      const mime = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8" }[extname(file)] ?? "application/octet-stream";
      response.writeHead(200, { "content-type": mime, "cache-control": "no-store" });
      return response.end(content);
    }
    return json(response, 404, { error: "Not found" }, requestOrigin);
  } catch (error: unknown) {
    console.error("API request failed:", error);
    return json(response, 500, { error: "Internal server error" }, requestOrigin);
  }
});

const sockets = new Map<number, Set<WebSocket>>();
const latestEventId = new Map<number, number>();
const websocket = new WebSocketServer({ noServer: true });

server.on("upgrade", (request, socket, head) => {
  const pathname = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`).pathname;
  const match = pathname.match(/^\/live\/(\d+)$/);
  if (!match) return socket.destroy();
  websocket.handleUpgrade(request, socket, head, (client) => websocket.emit("connection", client, Number(match[1])));
});

websocket.on("connection", (client: WebSocket, fixtureId: number) => {
  const db = database();
  const snapshot = eventStories(db, fixtureId).slice(-20);
  const latest = db.prepare("SELECT COALESCE(MAX(id), 0) AS id FROM txline_events WHERE fixture_id = ?").get(fixtureId) as { id: number };
  db.close();
  latestEventId.set(fixtureId, latest.id);
  for (const { id, story } of snapshot) client.send(JSON.stringify({ mode: "snapshot", eventId: id, story }));
  const clients = sockets.get(fixtureId) ?? new Set<WebSocket>();
  clients.add(client); sockets.set(fixtureId, clients);
  client.on("close", () => clients.delete(client));
});

setInterval(() => {
  const db = database();
  for (const [fixtureId, clients] of sockets) {
    const afterId = latestEventId.get(fixtureId) ?? 0;
    const incoming = eventStories(db, fixtureId, afterId);
    for (const { id, story } of incoming) {
      for (const client of clients) if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify({ mode: "live", eventId: id, story }));
      latestEventId.set(fixtureId, id);
    }
  }
  db.close();
}, 500).unref();

server.listen(PORT, () => console.log(`API_SERVER_READY port=${PORT} database=${DB_PATH}`));
