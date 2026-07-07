import { createServer } from "node:http";
import Database from "better-sqlite3";
import { classifyFixture, type RawEvent } from "./narrative.js";

const port = Number(process.env.PORT ?? "3002");
const speeds = new Set([2, 10, 20, 60]);
const sleep = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

type EventRow = { payload_json: string };

function recordValue(record: RawEvent, key: string) {
  return record[key];
}

function teams(raw: RawEvent[]) {
  for (const event of raw) {
    const groups = recordValue(event, "Lineups");
    if (!Array.isArray(groups) || groups.length < 2) continue;
    const home = groups[0];
    const away = groups[1];
    if (!home || typeof home !== "object" || !away || typeof away !== "object") continue;
    const homeName = (home as Record<string, unknown>).preferredName;
    const awayName = (away as Record<string, unknown>).preferredName;
    if (homeName && awayName) return { homeTeam: String(homeName), awayTeam: String(awayName) };
  }
  const first = raw[0];
  return {
    homeTeam: `Participant ${recordValue(first ?? {}, "Participant1Id") ?? 1}`,
    awayTeam: `Participant ${recordValue(first ?? {}, "Participant2Id") ?? 2}`,
  };
}

createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", "http://localhost");
  const match = url.pathname.match(/^\/replay\/(\d+)$/);
  if (!match) {
    response.writeHead(404).end();
    return;
  }
  const speed = Number(url.searchParams.get("speed") ?? 20);
  if (!speeds.has(speed)) {
    response.writeHead(400, { "content-type": "application/json" }).end(JSON.stringify({ error: "speed must be 2, 10, 20, or 60" }));
    return;
  }

  const database = new Database(".data/matchflash.db", { readonly: true });
  const rows = database.prepare("select payload_json from events where fixture_id=? order by id").all(Number(match[1])) as EventRow[];
  const raw = rows.map((row) => JSON.parse(row.payload_json) as RawEvent);
  database.close();
  if (!raw.length) {
    response.writeHead(404).end();
    return;
  }

  const stories = classifyFixture(raw, teams(raw));
  response.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
  response.write(`event: replay-start\ndata: ${JSON.stringify({ fixtureId: Number(match[1]), speed, storyCount: stories.length })}\n\n`);
  let previous = stories[0]?.timestamp;
  for (const story of stories) {
    await sleep(Math.max(0, (story.timestamp - (previous ?? story.timestamp)) / speed));
    previous = story.timestamp;
    response.write(`event: story\ndata: ${JSON.stringify(story)}\n\n`);
  }
  response.write(`event: replay-complete\ndata: ${JSON.stringify({ fixtureId: Number(match[1]), storyCount: stories.length })}\n\n`);
  response.end();
}).listen(port, () => console.log(`REPLAY_READY port=${port}`));
