import Database from "better-sqlite3";
import { loadTxlineCredentials, txlineRequest, TXLINE_API_BASE } from "./txline-client.js";

const DB = ".data/matchflash.db";
const wait = (n: number) => new Promise((r) => setTimeout(r, n));
type FixtureRecord = Record<string, unknown>;

async function run() {
  const c = await loadTxlineCredentials();
  const today = Math.floor(Date.now() / 86400000);
  const tournamentStart = 20614;
  const starts: number[] = [];
  for (let d = tournamentStart; d <= today; d += 3) starts.push(d);

  const seen = new Map<number, FixtureRecord>();
  for (const startEpochDay of starts) {
    const r = await txlineRequest(`${TXLINE_API_BASE}/fixtures/snapshot?startEpochDay=${startEpochDay}`, c);
    console.log(`SNAPSHOT startEpochDay=${startEpochDay} http=${r.status}`);
    if (r.ok) {
      const fs = (await r.json()) as FixtureRecord[];
      for (const f of fs) seen.set(Number(f.FixtureId), f);
    }
    await wait(500);
  }

  console.log(`TOTAL_UNIQUE_FIXTURES_DISCOVERED ${seen.size}`);

  const d = new Database(DB);
  d.exec(
    "CREATE TABLE IF NOT EXISTS fixtures (id INTEGER PRIMARY KEY, home_team TEXT, away_team TEXT, status TEXT, kickoff_at TEXT, raw_json TEXT NOT NULL); CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY, fixture_id INTEGER NOT NULL, type TEXT NOT NULL, payload_json TEXT NOT NULL, received_at TEXT NOT NULL)"
  );

  const now = Date.now();
  const eligible = [...seen.values()].filter(
    (f) => now - Number(f.StartTime) >= 21600000 && now - Number(f.StartTime) <= 1209600000
  );
  console.log(`ELIGIBLE_FOR_HISTORICAL ${eligible.length}`);

  let archived = 0, skipped = 0, alreadyHad = 0;
  for (const f of eligible) {
    const exists = d.prepare("select 1 from events where fixture_id=? limit 1").get(f.FixtureId);
    if (exists) { alreadyHad++; continue; }
    await wait(1500);
    const h = await txlineRequest(`${TXLINE_API_BASE}/scores/historical/${f.FixtureId}`, c);
    if (!h.ok) { console.log(`SKIP fixture=${f.FixtureId} http=${h.status}`); skipped++; continue; }
    const text = await h.text();
    const events = [...text.matchAll(/(?:^|\n)data: (.+)/g)].map((m) => JSON.parse(m[1]));
    const ins = d.prepare("insert into events (fixture_id,type,payload_json,received_at) values (?,?,?,?)");
    d.transaction(() => events.forEach((e) => ins.run(f.FixtureId, "score_update", JSON.stringify(e), new Date().toISOString())))();
    d.prepare("insert or replace into fixtures (id,home_team,away_team,status,kickoff_at,raw_json) values (?,?,?,?,?,?)")
      .run(f.FixtureId, f.Participant1 ?? null, f.Participant2 ?? null, String(f.GameState ?? "finished"), String(f.StartTime), JSON.stringify(f));
    archived++;
    console.log(`ARCHIVE_OK fixture=${f.FixtureId} events=${events.length}`);
  }
  console.log(`FINAL_SUMMARY discovered=${seen.size} eligible=${eligible.length} newly_archived=${archived} already_had=${alreadyHad} skipped=${skipped}`);
  d.close();
}

run().catch((e) => console.error("FATAL", e instanceof Error ? e.message : String(e)));
