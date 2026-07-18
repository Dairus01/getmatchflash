import { mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import Database from "better-sqlite3";

const API_BASE = "https://txline-dev.txodds.com/api";
const DATA_DIRECTORY = resolve(".data");
const DB_PATH = resolve(DATA_DIRECTORY, "matchflash.sqlite");

type Credentials = { jwt: string; apiToken: string };

async function loadCredentials(): Promise<Credentials> {
  return JSON.parse(await readFile(resolve(DATA_DIRECTORY, "txline-credentials.json"), "utf8")) as Credentials;
}

function parseSseBlock(block: string) {
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

async function downloadHistorical(fixtureId: number) {
  const credentials = await loadCredentials();
  console.log(`Downloading historical events for fixture ${fixtureId}...`);

  const url = `${API_BASE}/scores/historical?fixtureId=${fixtureId}`;
  const response = await fetch(url, {
    headers: {
      Accept: "text/event-stream",
      Authorization: `Bearer ${credentials.jwt}`,
      "X-Api-Token": credentials.apiToken,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch historical data: ${response.status} ${response.statusText}`);
  }

  if (!response.body) {
    throw new Error("No response body");
  }

  const db = new Database(DB_PATH);
  const insertEvent = db.prepare(`
    INSERT OR IGNORE INTO txline_events
      (source, fixture_id, stream_event_id, event_type, received_at, payload)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  let buffer = "";
  let persisted = 0;
  const decoder = new TextDecoder();
  const reader = response.body.getReader();

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    
    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split("\n\n");
    buffer = blocks.pop() ?? "";

    db.transaction(() => {
      for (const block of blocks) {
        if (!block.trim()) continue;
        const msg = parseSseBlock(block);
        if (!msg) continue;
        const receivedAt = new Date().toISOString();
        const result = insertEvent.run("scores", fixtureId, msg.id ?? null, msg.type, receivedAt, msg.data);
        if (result.changes > 0) persisted++;
      }
    })();
  }
  
  db.close();
  console.log(`Successfully downloaded and persisted ${persisted} events for fixture ${fixtureId}.`);
}

const fixtureId = Number(process.argv[2]);
if (!fixtureId || !Number.isSafeInteger(fixtureId)) {
  console.error("Usage: npx tsx src/download-historical.ts <fixtureId>");
  process.exit(1);
}

downloadHistorical(fixtureId).catch(console.error);
