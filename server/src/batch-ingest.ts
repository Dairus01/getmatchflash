import { mkdir, readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";

const API_BASE = "https://txline-dev.txodds.com/api";
const DATA_DIR = resolve(".data");
const ARCHIVE_DIR = resolve(DATA_DIR, "world_cup_archives");

type Credentials = { jwt: string; apiToken: string };
type FixtureRecord = Record<string, unknown>;

function fixtureIdOf(fixture: FixtureRecord): number | undefined {
  for (const key of ["FixtureId", "fixtureId", "fixture_id", "id"]) {
    const candidate = Number(fixture[key]);
    if (Number.isSafeInteger(candidate)) return candidate;
  }
  return undefined;
}

function fixtureStatusOf(fixture: FixtureRecord): string {
  return String(fixture.status ?? fixture.GameState ?? fixture.State ?? fixture.state ?? "").trim().toLowerCase();
}

function extractFixtures(payload: unknown): FixtureRecord[] {
  if (Array.isArray(payload)) return payload as FixtureRecord[];
  if (!payload || typeof payload !== "object") return [];
  const record = payload as Record<string, unknown>;
  for (const key of ["fixtures", "data", "items", "results"]) {
    const value = record[key];
    if (Array.isArray(value)) return value as FixtureRecord[];
  }
  return [];
}

async function loadCredentials(): Promise<Credentials> {
  return JSON.parse(await readFile(resolve(DATA_DIR, "txline-credentials.json"), "utf8")) as Credentials;
}

async function requestJsonAllowMissing<T>(url: string, credentials: Credentials): Promise<T | undefined> {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${credentials.jwt}`,
      "X-Api-Token": credentials.apiToken,
    },
  });
  if (response.status === 404) return undefined;
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  return (await response.json()) as T;
}

async function requestHistorical(fixtureId: number, credentials: Credentials): Promise<string> {
  const response = await fetch(`${API_BASE}/scores/historical/${fixtureId}`, {
    headers: {
      Accept: "text/event-stream",
      Authorization: `Bearer ${credentials.jwt}`,
      "X-Api-Token": credentials.apiToken,
    },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return await response.text();
}

function parseHistoricalEvents(text: string): FixtureRecord[] {
  return [...text.matchAll(/(?:^|\n)data: (.+)/g)].map((match) => JSON.parse(match[1]) as FixtureRecord);
}

function slugify(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "unknown";
}

function archiveJsonPath(fixture: FixtureRecord): string {
  return resolve(ARCHIVE_DIR, `${slugify(fixture.Participant1)}-${slugify(fixture.Participant2)}-historical.json`);
}

function dedupeFixtures(fixtures: FixtureRecord[]): FixtureRecord[] {
  return [...new Map(fixtures.map((fixture) => [fixtureIdOf(fixture) ?? JSON.stringify(fixture), fixture])).values()];
}

async function discoverFixtures(credentials: Credentials): Promise<FixtureRecord[]> {
  const directDiscovery = await requestJsonAllowMissing<unknown>(`${API_BASE}/fixtures`, credentials);
  if (directDiscovery !== undefined) {
    const fixtures = extractFixtures(directDiscovery);
    if (fixtures.length) return dedupeFixtures(fixtures);
  }

  const today = Math.floor(Date.now() / 86400000);
  const tournamentStart = 20614;
  const starts: number[] = [];
  for (let day = tournamentStart; day <= today; day += 3) starts.push(day);

  const batches = await Promise.all(
    starts.map(async (startEpochDay) => {
      const snapshot = await requestJsonAllowMissing<unknown>(`${API_BASE}/fixtures/snapshot?startEpochDay=${startEpochDay}`, credentials);
      return snapshot === undefined ? [] : extractFixtures(snapshot);
    })
  );

  return dedupeFixtures(batches.flat());
}

async function main() {
  await mkdir(DATA_DIR, { recursive: true });
  await mkdir(ARCHIVE_DIR, { recursive: true });
  const credentials = await loadCredentials();

  try {
    const fixtures = await discoverFixtures(credentials);
    if (!fixtures.length) throw new Error("Fixture discovery returned no fixtures");

    const eligible = fixtures.filter((fixture) => {
      const status = fixtureStatusOf(fixture);
      return !status || status === "finished" || status === "complete" || status === "completed" || status === "final";
    });
    console.log(`DISCOVERY total=${fixtures.length} eligible=${eligible.length} archive_dir=${ARCHIVE_DIR}`);

    let archived = 0;
    let skipped = 0;
    let alreadyStored = 0;
    for (const fixture of eligible) {
      const fixtureId = fixtureIdOf(fixture);
      if (fixtureId === undefined) {
        skipped += 1;
        console.log("SKIP missing_fixture_id");
        continue;
      }

      const jsonPath = archiveJsonPath(fixture);
      const fileExists = await stat(jsonPath).then(() => true).catch(() => false);
      if (fileExists) {
        alreadyStored += 1;
        continue;
      }

      try {
        const text = await requestHistorical(fixtureId, credentials);
        const events = parseHistoricalEvents(text);
        if (!events.length) throw new Error("Historical response contained no SSE data events");

        const archive = {
          fixtureId,
          fixture: {
            id: fixtureId,
            home_team: String(fixture.Participant1 ?? fixture.homeTeam ?? fixture.home_team ?? null),
            away_team: String(fixture.Participant2 ?? fixture.awayTeam ?? fixture.away_team ?? null),
            status: String(fixture.status ?? fixture.GameState ?? "finished"),
            kickoff_at: String(fixture.StartTime ?? fixture.kickoff_at ?? ""),
            raw_json: fixture,
          },
          source: {
            discovery: fixture,
            historical_event_count: events.length,
            exported_at: new Date().toISOString(),
          },
          events,
        };
        await import("node:fs/promises").then((fs) => fs.writeFile(jsonPath, `${JSON.stringify(archive, null, 2)}\n`, "utf8"));
        archived += 1;
        console.log(`ARCHIVE_OK fixture=${fixtureId} events=${events.length} file=${jsonPath}`);
      } catch (error: unknown) {
        skipped += 1;
        console.error(`ARCHIVE_FAIL fixture=${fixtureId} reason=${error instanceof Error ? error.message : String(error)}`);
      }
    }

    console.log(`SUMMARY discovered=${fixtures.length} eligible=${eligible.length} archived=${archived} already_stored=${alreadyStored} skipped=${skipped}`);
  } finally {
  }
}

main().catch((error: unknown) => {
  console.error("BATCH_FATAL", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});