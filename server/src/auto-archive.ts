import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import Database from "better-sqlite3";
import { execSync } from "node:child_process";

const DB_PATH = resolve(".data/matchflash.sqlite");
const ARCHIVE_DIR = resolve(".data/world_cup_archives");
mkdirSync(ARCHIVE_DIR, { recursive: true });

function runAutoArchive() {
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");

  // Find fixtures that have a game_finalised event
  const finalisedRows = db.prepare(`
    SELECT DISTINCT fixture_id
    FROM txline_events
    WHERE source = 'scores' AND event_type = 'message' AND payload LIKE '%game_finalised%'
  `).all() as { fixture_id: number }[];

  let archivedCount = 0;

  for (const row of finalisedRows) {
    const fixtureId = row.fixture_id;
    const fixtureRow = db.prepare("SELECT snapshot_payload FROM txline_fixtures WHERE fixture_id = ?").get(fixtureId) as { snapshot_payload: string } | undefined;
    if (!fixtureRow) continue;
    
    const fixture = JSON.parse(fixtureRow.snapshot_payload);
    const homeTeam = String(fixture.Participant1 ?? "Home");
    const awayTeam = String(fixture.Participant2 ?? "Away");
    
    const filename = `${homeTeam.toLowerCase().replace(/ /g, "-")}-${awayTeam.toLowerCase().replace(/ /g, "-")}-historical.json`;
    const filepath = resolve(ARCHIVE_DIR, filename);
    
    // Check if it's already archived
    try {
      // If the file exists and is not empty, skip
      if (require("node:fs").statSync(filepath).size > 0) continue;
    } catch {
      // File doesn't exist, proceed to archive
    }

    console.log(`Archiving completed match: ${homeTeam} vs ${awayTeam} (${fixtureId})...`);

    // Fetch all events
    // Fetch all events
    const eventRows = db.prepare(`
      SELECT payload FROM txline_events 
      WHERE fixture_id = ? AND source = 'scores' 
      ORDER BY id ASC
    `).all(fixtureId) as { payload: string }[];

    const eventsArray = eventRows.map(r => JSON.parse(r.payload));
    
    // Write to the JSON archive format matching existing files
    const archiveData = {
      fixtureId: fixtureId,
      fixture: {
        id: fixtureId,
        home_team: homeTeam,
        away_team: awayTeam,
        status: "completed",
        kickoff_at: String(fixture.StartTime),
        raw_json: fixture
      },
      events: eventsArray,
      source: { historical_event_count: eventsArray.length }
    };
    
    writeFileSync(filepath, JSON.stringify(archiveData, null, 2));
    console.log(`Saved ${eventsArray.length} events to ${filename}`);
    archivedCount++;
  }

  db.close();

  if (archivedCount > 0) {
    console.log(`Archived ${archivedCount} new matches. Running generate-archive-data.cjs to update frontend...`);
    try {
      execSync("node ../scripts/generate-archive-data.cjs", { stdio: "inherit" });
      console.log("Archive data generation complete.");
    } catch (err) {
      console.error("Failed to generate archive data:", err);
    }
  } else {
    console.log(`[${new Date().toISOString()}] No new completed matches to archive.`);
  }
}

// Run immediately, then every 5 minutes
runAutoArchive();
setInterval(runAutoArchive, 5 * 60 * 1000);
