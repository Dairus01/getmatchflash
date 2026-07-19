/**
 * live-capture.ts — Permanent TxOdds live event capture daemon.
 *
 * Runs forever on the VPS via PM2. Subscribes to both "scores" and "odds"
 * SSE streams for every fixture in CONFIRMED_FIXTURES, persists every event
 * to matchflash.sqlite with deduplication, and on game_finalised immediately
 * writes the archive JSON and reruns generate-archive-data.cjs.
 *
 * Key differences from ingest-txline.ts:
 *  - No --duration limit (runs until PM2 stops it)
 *  - Auto-reconnects inside the process (exponential back-off, max 30 s)
 *  - Calls the immediate-archive path on game_finalised
 *  - Refreshes fixture metadata from the snapshot every SNAPSHOT_INTERVAL_MS
 *  - Logs a health-check line every HEALTH_LOG_INTERVAL_MS
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { execSync } from "node:child_process";
import Database from "better-sqlite3";
import { CONFIRMED_FIXTURES } from "./match-domain.js";

// ─── Config ──────────────────────────────────────────────────────────────────

const API_BASE = "https://txline-dev.txodds.com/api";
const DATA_DIR = resolve(".data");
const DB_PATH = resolve(DATA_DIR, "matchflash.sqlite");
const ARCHIVE_DIR = resolve(DATA_DIR, "world_cup_archives");
const CREDS_PATH = resolve(DATA_DIR, "txline-credentials.json");
const GENERATE_SCRIPT = resolve("../scripts/generate-archive-data.cjs");

const SNAPSHOT_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
const HEALTH_LOG_INTERVAL_MS = 60 * 1000;     // 1 minute
const MAX_RECONNECT_DELAY_MS = 30_000;
const INITIAL_RECONNECT_DELAY_MS = 1_000;

// ─── Types ───────────────────────────────────────────────────────────────────

type Credentials = { jwt: string; apiToken: string };

// ─── State ───────────────────────────────────────────────────────────────────

const capturedCount: Record<number, number> = {};
const archivedFixtures = new Set<number>();

// ─── Database ────────────────────────────────────────────────────────────────

function openDb(): Database.Database {
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.exec(`
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
    CREATE TABLE IF NOT EXISTS predictions (
      id INTEGER PRIMARY KEY,
      fixture_id INTEGER NOT NULL,
      predictor TEXT NOT NULL,
      home_score INTEGER NOT NULL,
      away_score INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
  return db;
}

// ─── Credentials ─────────────────────────────────────────────────────────────

async function loadCredentials(): Promise<Credentials> {
  return JSON.parse(await readFile(CREDS_PATH, "utf8")) as Credentials;
}

// ─── SSE parsing ─────────────────────────────────────────────────────────────

function parseSseBlock(block: string): { id?: string; type: string; data: string } | undefined {
  let id: string | undefined;
  let type = "message";
  const lines: string[] = [];
  for (const line of block.split("\n")) {
    if (line.startsWith("id:")) id = line.slice(3).trim();
    else if (line.startsWith("event:")) type = line.slice(6).trim() || "message";
    else if (line.startsWith("data:")) lines.push(line.slice(5).trimStart());
  }
  return lines.length ? { id, type, data: lines.join("\n") } : undefined;
}

// ─── Archive helpers ──────────────────────────────────────────────────────────

function slugify(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "unknown";
}

async function archiveFixture(fixtureId: number): Promise<void> {
  if (archivedFixtures.has(fixtureId)) return;
  archivedFixtures.add(fixtureId);

  try {
    const db = new Database(DB_PATH, { readonly: true });
    const fixtureRow = db
      .prepare("SELECT snapshot_payload FROM txline_fixtures WHERE fixture_id = ?")
      .get(fixtureId) as { snapshot_payload: string } | undefined;
    if (!fixtureRow) { db.close(); return; }

    const fixture = JSON.parse(fixtureRow.snapshot_payload) as Record<string, unknown>;
    const homeTeam = String(fixture.Participant1 ?? "Home");
    const awayTeam = String(fixture.Participant2 ?? "Away");

    const eventRows = db
      .prepare("SELECT payload FROM txline_events WHERE fixture_id = ? AND source = 'scores' ORDER BY id ASC")
      .all(fixtureId) as { payload: string }[];
    const events = eventRows.map((r) => JSON.parse(r.payload));
    db.close();

    if (!events.length) return;

    const finalEvent = [...events].reverse().find((e) => e.Action === "game_finalised") ?? events.at(-1);
    const score = finalEvent?.Score;
    const homeGoals: number | null = score?.Participant1?.Total?.Goals ?? null;
    const awayGoals: number | null = score?.Participant2?.Total?.Goals ?? null;

    const archive = {
      fixtureId,
      fixture: {
        id: fixtureId,
        home_team: homeTeam,
        away_team: awayTeam,
        status: "completed",
        kickoff_at: String(fixture.StartTime ?? ""),
        raw_json: fixture,
      },
      source: {
        exported_at: new Date().toISOString(),
        historical_event_count: events.length,
        final_action: finalEvent?.Action ?? null,
        final_score: { homeTeam, awayTeam, homeGoals, awayGoals },
        capture_mode: "live-stream",
      },
      events,
    };

    const filename = `${slugify(homeTeam)}-${slugify(awayTeam)}-historical.json`;
    const outPath = resolve(ARCHIVE_DIR, filename);
    await mkdir(ARCHIVE_DIR, { recursive: true });
    await writeFile(outPath, `${JSON.stringify(archive, null, 2)}\n`, "utf8");
    log(`MATCH_ARCHIVED fixture_id=${fixtureId} events=${events.length} score=${homeGoals}-${awayGoals} file=${filename}`);

    // Regenerate the Next.js matches.ts bundle
    try {
      execSync(`node "${GENERATE_SCRIPT}"`, { stdio: "pipe" });
      log(`ARCHIVE_DATA_REGENERATED fixture_id=${fixtureId}`);
    } catch (genErr) {
      logError("GENERATE_SCRIPT_FAILED", genErr);
    }
  } catch (err) {
    logError(`ARCHIVE_ERROR fixture_id=${fixtureId}`, err);
    archivedFixtures.delete(fixtureId); // allow retry
  }
}

// ─── Snapshot refresh ─────────────────────────────────────────────────────────

async function refreshSnapshot(credentials: Credentials): Promise<void> {
  try {
    const response = await fetch(`${API_BASE}/fixtures/snapshot`, {
      headers: {
        Authorization: `Bearer ${credentials.jwt}`,
        "X-Api-Token": credentials.apiToken,
      },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const fixtures = await response.json() as Array<Record<string, unknown>>;
    const db = openDb();
    const upsert = db.prepare(`
      INSERT INTO txline_fixtures (fixture_id, snapshot_payload, observed_at)
      VALUES (?, ?, ?)
      ON CONFLICT(fixture_id) DO UPDATE
        SET snapshot_payload = excluded.snapshot_payload,
            observed_at = excluded.observed_at
    `);
    const observedAt = new Date().toISOString();
    for (const fixture of fixtures) {
      const fixtureId = Number(fixture.FixtureId);
      if (Number.isSafeInteger(fixtureId)) upsert.run(fixtureId, JSON.stringify(fixture), observedAt);
    }
    db.close();
    log(`SNAPSHOT_REFRESHED fixtures=${fixtures.length}`);
  } catch (err) {
    logError("SNAPSHOT_REFRESH_FAILED", err);
  }
}

// ─── SSE stream consumer ──────────────────────────────────────────────────────

async function consumeStream(
  source: "scores" | "odds",
  fixtureId: number,
  getCredentials: () => Promise<Credentials>,
): Promise<void> {
  let reconnectDelay = INITIAL_RECONNECT_DELAY_MS;

  // Runs until game_finalised is received (scores stream) or indefinitely (odds stream)
  while (true) {
    const db = openDb();
    const insertEvent = db.prepare(`
      INSERT OR IGNORE INTO txline_events
        (source, fixture_id, stream_event_id, event_type, received_at, payload)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    try {
      const credentials = await getCredentials();
      const url = `${API_BASE}/${source}/stream?fixtureId=${fixtureId}`;
      const response = await fetch(url, {
        headers: {
          Accept: "text/event-stream",
          Authorization: `Bearer ${credentials.jwt}`,
          "X-Api-Token": credentials.apiToken,
        },
      });

      if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);

      log(`STREAM_CONNECTED source=${source} fixture_id=${fixtureId}`);
      reconnectDelay = INITIAL_RECONNECT_DELAY_MS; // reset backoff on successful connect

      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = "";
      let streamDone = false;

      while (!streamDone) {
        const { value, done } = await reader.read();
        if (done) throw new Error("stream closed by server");

        buffer += value.replace(/\r\n/g, "\n");
        const blocks = buffer.split("\n\n");
        buffer = blocks.pop() ?? "";

        for (const block of blocks) {
          const msg = parseSseBlock(block);
          if (!msg) continue;

          let payload: Record<string, unknown>;
          try { payload = JSON.parse(msg.data); } catch { continue; }

          const result = insertEvent.run(
            source,
            fixtureId,
            msg.id ?? null,
            msg.type,
            new Date().toISOString(),
            JSON.stringify(payload),
          );
          if (result.changes > 0) {
            capturedCount[fixtureId] = (capturedCount[fixtureId] ?? 0) + 1;
          }

          // Detect match end on scores stream → trigger immediate archive
          if (source === "scores" && payload.Action === "game_finalised") {
            log(`GAME_FINALISED source=${source} fixture_id=${fixtureId}`);
            db.close();
            await archiveFixture(fixtureId);
            // Re-open for any remaining events, then exit cleanly
            streamDone = true;
            break;
          }
        }
      }

      return; // game_finalised received — exit loop, stream is done
    } catch (err) {
      logError(`STREAM_DISCONNECTED source=${source} fixture_id=${fixtureId} reconnect_in=${reconnectDelay}ms`, err);
    } finally {
      try { db.close(); } catch { /* already closed */ }
    }

    await sleep(reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY_MS);
  }
}

// ─── Utilities ───────────────────────────────────────────────────────────────

function log(message: string): void {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

function logError(message: string, err: unknown): void {
  const reason = err instanceof Error ? err.message : String(err);
  console.error(`[${new Date().toISOString()}] ${message} reason=${reason}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
  await mkdir(ARCHIVE_DIR, { recursive: true });

  const fixtureIds = CONFIRMED_FIXTURES.map((f) => f.fixtureId).join(",");
  log(`LIVE_CAPTURE_STARTING fixtures=${fixtureIds}`);

  // Credentials factory — reloads from disk on each reconnect (picks up refreshed JWTs)
  const getCredentials = (): Promise<Credentials> => loadCredentials();

  // Initial snapshot to seed fixture metadata
  await refreshSnapshot(await getCredentials());

  // Periodic snapshot refresh
  setInterval(async () => {
    const creds = await getCredentials().catch(() => null);
    if (creds) await refreshSnapshot(creds);
  }, SNAPSHOT_INTERVAL_MS).unref();

  // Health check log every minute
  setInterval(() => {
    for (const fixture of CONFIRMED_FIXTURES) {
      const count = capturedCount[fixture.fixtureId] ?? 0;
      log(`HEALTH fixture_id=${fixture.fixtureId} ${fixture.homeTeam} vs ${fixture.awayTeam} events_this_session=${count}`);
    }
  }, HEALTH_LOG_INTERVAL_MS).unref();

  // Start stream consumers for every confirmed fixture (scores + odds)
  const streams = CONFIRMED_FIXTURES.flatMap((fixture) => [
    consumeStream("scores", fixture.fixtureId, getCredentials),
    consumeStream("odds", fixture.fixtureId, getCredentials),
  ]);

  await Promise.allSettled(streams);
  log("LIVE_CAPTURE_ALL_STREAMS_COMPLETE — PM2 will restart if needed");
}

main().catch((err) => {
  logError("LIVE_CAPTURE_FATAL", err);
  process.exitCode = 1;
});
