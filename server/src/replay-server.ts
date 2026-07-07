import { createServer, type ServerResponse } from "node:http";
import { resolve } from "node:path";
import Database from "better-sqlite3";

const PORT = Number(process.env.PORT ?? "3001");
const DB_PATH = resolve(".data/matchflash.sqlite");
const REPLAY_SPEED = 10;

type ReplayEvent = {
  id: number;
  fixture_id: number;
  source: "odds" | "scores";
  stream_event_id: string | null;
  event_type: string;
  received_at: string;
  payload: string;
};

function writeSse(response: ServerResponse, event: string, data: unknown, id?: string | null) {
  if (id) response.write(`id: ${id}\n`);
  response.write(`event: ${event}\n`);
  response.write(`data: ${JSON.stringify(data)}\n\n`);
}

function sleep(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

async function replayFixture(response: ServerResponse, fixtureId: number) {
  const db = new Database(DB_PATH, { readonly: true });
  const events = db.prepare(`
    SELECT id, fixture_id, source, stream_event_id, event_type, received_at, payload
    FROM txline_events WHERE fixture_id = ? ORDER BY received_at, id
  `).all(fixtureId) as ReplayEvent[];
  db.close();

  if (!events.length) {
    response.statusCode = 404;
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ error: `No captured TxLINE events for fixture ${fixtureId}` }));
    return;
  }

  response.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive",
    "x-accel-buffering": "no",
  });
  response.flushHeaders();
  writeSse(response, "replay-start", { fixtureId, speed: REPLAY_SPEED, capturedEventCount: events.length });

  let previousAt = Date.parse(events[0].received_at);
  for (const event of events) {
    const currentAt = Date.parse(event.received_at);
    const delay = Math.max(0, (currentAt - previousAt) / REPLAY_SPEED);
    if (delay) await sleep(delay);
    previousAt = currentAt;
    writeSse(response, "txline", {
      fixtureId: event.fixture_id,
      source: event.source,
      streamEventId: event.stream_event_id,
      eventType: event.event_type,
      receivedAt: event.received_at,
      payload: JSON.parse(event.payload),
    }, String(event.id));
  }
  writeSse(response, "replay-complete", { fixtureId, replayedEventCount: events.length });
  response.end();
}

const server = createServer((request, response) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
  const match = url.pathname.match(/^\/replay\/(\d+)$/);
  if (request.method !== "GET" || !match) {
    response.writeHead(404, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "Use GET /replay/:fixtureId" }));
    return;
  }
  void replayFixture(response, Number(match[1])).catch((error: unknown) => {
    console.error("Replay failed:", error);
    if (!response.headersSent) response.writeHead(500, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "Replay failed" }));
  });
});

server.listen(PORT, () => console.log(`REPLAY_SERVER_READY port=${PORT} speed=${REPLAY_SPEED}x database=${DB_PATH}`));
