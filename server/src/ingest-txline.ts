import { mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import Database from "better-sqlite3";

const API_BASE = "https://txline-dev.txodds.com/api";
const DATA_DIRECTORY = resolve(".data");
const DB_PATH = resolve(DATA_DIRECTORY, "matchflash.sqlite");
const durationSeconds = Number(process.argv.find((argument) => argument.startsWith("--duration="))?.split("=")[1] ?? "60");

type Credentials = { jwt: string; apiToken: string };
type Fixture = { FixtureId: number; [key: string]: unknown };
type SseEvent = { id?: string; type: string; data: string };

function requirePositiveSeconds(value: number) {
  if (!Number.isFinite(value) || value <= 0) throw new Error("Provide a positive --duration=<seconds>");
}

async function loadCredentials(): Promise<Credentials> {
  return JSON.parse(await readFile(resolve(DATA_DIRECTORY, "txline-credentials.json"), "utf8")) as Credentials;
}

function parseSseBlock(block: string): SseEvent | undefined {
  let id: string | undefined;
  let type = "message";
  const data: string[] = [];
  for (const line of block.split("\n")) {
    if (line.startsWith("id:")) id = line.slice(3).trim();
    else if (line.startsWith("event:")) type = line.slice(6).trim() || "message";
    else if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
  }
  return data.length ? { id, type, data: data.join("\n") } : undefined;
}

function findFixtureId(value: unknown): number | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  for (const key of ["FixtureId", "fixtureId", "fixture_id"]) {
    const candidate = Number(record[key]);
    if (Number.isSafeInteger(candidate)) return candidate;
  }
  for (const nested of Object.values(record)) {
    const fixtureId = findFixtureId(nested);
    if (fixtureId !== undefined) return fixtureId;
  }
  return undefined;
}

async function request(url: string, credentials: Credentials, signal?: AbortSignal): Promise<Response> {
  return fetch(url, {
    headers: {
      Accept: "text/event-stream",
      Authorization: `Bearer ${credentials.jwt}`,
      "X-Api-Token": credentials.apiToken,
    },
    signal,
  });
}

async function main() {
  requirePositiveSeconds(durationSeconds);
  await mkdir(DATA_DIRECTORY, { recursive: true });
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
      fixture_id INTEGER NOT NULL REFERENCES txline_fixtures(fixture_id),
      stream_event_id TEXT,
      event_type TEXT NOT NULL,
      received_at TEXT NOT NULL,
      payload TEXT NOT NULL,
      UNIQUE(source, stream_event_id)
    );
    CREATE INDEX IF NOT EXISTS txline_events_fixture_received_at
      ON txline_events(fixture_id, received_at);
  `);
  const upsertFixture = db.prepare(`
    INSERT INTO txline_fixtures (fixture_id, snapshot_payload, observed_at)
    VALUES (?, ?, ?)
    ON CONFLICT(fixture_id) DO UPDATE SET snapshot_payload = excluded.snapshot_payload, observed_at = excluded.observed_at
  `);
  const insertEvent = db.prepare(`
    INSERT OR IGNORE INTO txline_events
      (source, fixture_id, stream_event_id, event_type, received_at, payload)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  try {
    const credentials = await loadCredentials();
    const snapshotResponse = await request(`${API_BASE}/fixtures/snapshot`, credentials);
    if (!snapshotResponse.ok) throw new Error(`Fixture snapshot failed: HTTP ${snapshotResponse.status}`);
    const fixtures = await snapshotResponse.json() as Fixture[];
    const fixtureIds = new Set(fixtures.map((fixture) => Number(fixture.FixtureId)).filter(Number.isSafeInteger));
    if (!fixtureIds.size) throw new Error("Fixture snapshot did not contain usable FixtureId values");
    const observedAt = new Date().toISOString();
    const persistFixtures = db.transaction((items: Fixture[]) => {
      for (const fixture of items) upsertFixture.run(fixture.FixtureId, JSON.stringify(fixture), observedAt);
    });
    persistFixtures(fixtures.filter((fixture) => fixtureIds.has(Number(fixture.FixtureId))));
    console.log(`FIXTURE_SNAPSHOT fixture_ids=${[...fixtureIds].join(",")} count=${fixtureIds.size}`);

    const deadline = Date.now() + durationSeconds * 1000;
    let persisted = 0;
    const consume = async (source: "odds" | "scores", requestedFixtureId: number) => {
      while (Date.now() < deadline) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), Math.max(1, deadline - Date.now()));
        try {
          const streamUrl = new URL(`${API_BASE}/${source}/stream`);
          streamUrl.searchParams.set("fixtureId", String(requestedFixtureId));
          const response = await request(streamUrl.toString(), credentials, controller.signal);
          if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);
          console.log(`STREAM_CONNECTED source=${source} fixture_id=${requestedFixtureId}`);
          const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
          let buffered = "";
          while (Date.now() < deadline) {
            const { done, value } = await reader.read();
            if (done) break;
            buffered += value.replace(/\r\n/g, "\n");
            const blocks = buffered.split("\n\n");
            buffered = blocks.pop() ?? "";
            for (const block of blocks) {
              const event = parseSseBlock(block);
              if (!event) continue;
              let payload: unknown;
              try { payload = JSON.parse(event.data); } catch { continue; }
              const fixtureId = findFixtureId(payload);
              if (fixtureId === undefined || !fixtureIds.has(fixtureId)) continue;
              const result = insertEvent.run(source, fixtureId, event.id ?? null, event.type, new Date().toISOString(), JSON.stringify(payload));
              if (result.changes) {
                persisted += 1;
                console.log(`EVENT_PERSISTED source=${source} fixture_id=${fixtureId} type=${event.type} id=${event.id ?? "none"}`);
              }
            }
          }
          await reader.cancel();
        } catch (error: unknown) {
          if (Date.now() < deadline && !(error instanceof DOMException && error.name === "AbortError")) {
            console.error(`STREAM_RETRY source=${source} fixture_id=${requestedFixtureId} reason=${error instanceof Error ? error.message : String(error)}`);
            await new Promise((resolve) => setTimeout(resolve, 1_000));
          }
        } finally {
          clearTimeout(timeout);
        }
      }
    };

    await Promise.all([...fixtureIds].flatMap((id) => [consume("odds", id), consume("scores", id)]));
    const total = db.prepare("SELECT COUNT(*) AS count FROM txline_events WHERE fixture_id IN (SELECT fixture_id FROM txline_fixtures)").get() as { count: number };
    console.log(`INGESTION_SUMMARY newly_persisted=${persisted} total_persisted=${total.count} database=${DB_PATH}`);
    if (!persisted && !total.count) throw new Error("No matching live SSE event was received before the deadline");
  } finally {
    db.close();
  }
}

main().catch((error) => {
  console.error("TxLINE ingestion failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
