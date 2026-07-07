import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { classifyFixture, type RawEvent } from "./narrative.js";

type PayloadRow = { payload_json: string };

function actionOf(event: RawEvent) {
  return String(event.Action || "");
}

function participantOf(event: RawEvent) {
  const data = event.Data;
  const nested = data && typeof data === "object" ? (data as Record<string, unknown>).Participant : undefined;
  return event.Participant ?? nested ?? 1;
}

test("real Spain Belgium narrative classification", () => {
  const database = new Database(".data/matchflash.db", { readonly: true });
  const rows = database.prepare("SELECT payload_json FROM events WHERE fixture_id=18218149 ORDER BY id").all() as PayloadRow[];
  database.close();
  const raw = rows.map((row) => JSON.parse(row.payload_json) as RawEvent);
  const stories = classifyFixture(raw, { homeTeam: "Spain", awayTeam: "Belgium" });
  const count = (action: string) => raw.filter((event) => actionOf(event) === action).length;
  const got = (type: string) => stories.filter((story) => story.type === type).length;
  const markers = ["kickoff", "halftime_finalised", "game_finalised", "additional_time"];
  const seen = new Map<string, number>();
  const deduped = raw.filter((event) => {
    const action = actionOf(event);
    if (!markers.includes(action)) return false;
    const key = `${action}:${participantOf(event)}`;
    const now = Number(event.Ts);
    const last = seen.get(key);
    seen.set(key, now);
    return last === undefined || now - last >= 5000;
  }).length;

  assert.equal(got("GOAL"), count("goal"));
  assert.equal(got("CARD"), count("yellow_card") + count("red_card"));
  assert.equal(got("SUBSTITUTION"), count("substitution"));
  assert.equal(got("PERIOD_MARKER"), deduped);
  for (const story of stories.filter((item) => item.type === "BIG_CHANCE" || item.type === "MOMENTUM_SHIFT")) {
    assert.ok(Number.isFinite(story.timestamp));
    assert.ok(["Spain", "Belgium"].includes(story.team));
  }
  console.log({
    rawGoals: count("goal"),
    classifiedGoals: got("GOAL"),
    rawCards: count("yellow_card") + count("red_card"),
    classifiedCards: got("CARD"),
    rawSubs: count("substitution"),
    classifiedSubs: got("SUBSTITUTION"),
    dedupedPeriods: deduped,
    classifiedPeriods: got("PERIOD_MARKER"),
    bigChance: got("BIG_CHANCE"),
    momentum: got("MOMENTUM_SHIFT"),
  });
});
