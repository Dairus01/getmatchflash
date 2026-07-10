import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import Database from "better-sqlite3";

const API_BASE = "https://txline-dev.txodds.com/api";
const fixtureId = Number(process.argv.find((argument) => argument.startsWith("--fixture="))?.split("=")[1] ?? "18143850");
const durationSeconds = Number(process.argv.find((argument) => argument.startsWith("--duration="))?.split("=")[1] ?? "30");
const dataDirectory = resolve(".data");

type Credentials = { jwt: string; apiToken: string };
type RawRecord = Record<string, unknown>;

const db = new Database(resolve(dataDirectory, "matchflash.sqlite"));
db.exec(`
  CREATE TABLE IF NOT EXISTS txline_events (
    id INTEGER PRIMARY KEY,
    source TEXT NOT NULL,
    fixture_id INTEGER NOT NULL,
    event_id TEXT,
    event_type TEXT NOT NULL,
    received_at TEXT NOT NULL,
    payload TEXT NOT NULL,
    UNIQUE(source, event_id)
  );
`);
const insert = db.prepare(`
  INSERT OR IGNORE INTO txline_events (source, fixture_id, event_id, event_type, received_at, payload)
  VALUES (@source, @fixtureId, @eventId, @eventType, @receivedAt, @payload)
`);

async function credentials(): Promise<Credentials> {
  return JSON.parse(await readFile(resolve(dataDirectory, "txline-credentials.json"), "utf8")) as Credentials;
}

function persist(source: "odds" | "scores", eventId: string | undefined, eventType: string, payload: RawRecord) {
  const recordFixtureId = Number(payload.FixtureId ?? payload.fixtureId ?? fixtureId);
  const result = insert.run({
    source,
    fixtureId: recordFixtureId,
    eventId: eventId ?? `${eventType}:${payload.Ts ?? payload.ts ?? Date.now()}`,
    eventType,
    receivedAt: new Date().toISOString(),
    payload: JSON.stringify(payload),
  });
  if (result.changes) console.log(`PERSISTED ${source} ${eventType} fixture=${recordFixtureId} event=${eventId ?? "none"}`);
}

function consumeSse(source: "odds" | "scores", auth: Credentials) {
  const url = `${API_BASE}/${source}/stream?fixtureId=${fixtureId}`;
  const child = spawn("curl", ["-N", "--http1.1", "--max-time", String(durationSeconds), "-sS", "-H", `Authorization: Bearer ${auth.jwt}`, "-H", `X-Api-Token: ${auth.apiToken}`, url]);
  let buffered = "";
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    buffered += chunk.replace(/\r\n/g, "\n");
    const blocks = buffered.split("\n\n");
    buffered = blocks.pop() ?? "";
    for (const block of blocks) {
      const lines = block.split("\n");
      const eventId = lines.find((line) => line.startsWith("id:"))?.slice(3).trim();
      const eventType = lines.find((line) => line.startsWith("event:"))?.slice(6).trim() ?? "data";
      const text = lines.filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim()).join("\n");
      if (!text) continue;
      try {
        persist(source, eventId, eventType, JSON.parse(text) as RawRecord);
      } catch {
        console.error(`Ignored malformed ${source} SSE block`);
      }
    }
  });
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk: string) => console.error(`${source} stream: ${chunk.trim()}`));
  child.on("close", (code) => console.log(`${source} stream closed (curl exit ${code})`));
  return child;
}

async function main() {
  if (!Number.isSafeInteger(fixtureId)) throw new Error("Provide a numeric --fixture=<id>");
  const auth = await credentials();
  console.log(`Opening real TxLINE SSE streams for fixture ${fixtureId} for ${durationSeconds}s`);
  const streams = [consumeSse("odds", auth), consumeSse("scores", auth)];
  await new Promise<void>((resolve) => setTimeout(resolve, (durationSeconds + 2) * 1000));
  streams.forEach((stream) => stream.kill("SIGTERM"));
  const count = db.prepare("SELECT COUNT(*) AS count FROM txline_events WHERE fixture_id = ?").get(fixtureId) as { count: number };
  console.log(`PERSISTED_EVENT_COUNT fixture=${fixtureId} count=${count.count}`);
  db.close();
}

main().catch((error) => {
  console.error("TxLINE ingestion failed:", error instanceof Error ? error.message : error);
  db.close();
  process.exitCode = 1;
});
