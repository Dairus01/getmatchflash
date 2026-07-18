import Database from "better-sqlite3";
import { resolve } from "node:path";

const DB_PATH = resolve(".data/matchflash.sqlite");
const db = new Database(DB_PATH);

const fixtureId = 18257865;

const goals = [
  { sec: 500,  home: 0, away: 1, participant: 2, playerStats: { "18257865_away_1": { goals: 1 } } },
  { sec: 1000, home: 1, away: 1, participant: 1, playerStats: { "18257865_home_1": { goals: 1 } } },
  { sec: 1500, home: 1, away: 2, participant: 2, playerStats: { "18257865_away_1": { goals: 2 } } },
  { sec: 2000, home: 1, away: 3, participant: 2, playerStats: { "18257865_away_2": { goals: 1 } } },
  { sec: 2500, home: 2, away: 3, participant: 1, playerStats: { "18257865_home_1": { goals: 2 } } },
  { sec: 3000, home: 2, away: 4, participant: 2, playerStats: { "18257865_away_2": { goals: 2 } } },
];

const insert = db.prepare(`
  INSERT INTO txline_events (source, fixture_id, stream_event_id, event_type, received_at, payload)
  VALUES (?, ?, ?, ?, ?, ?)
`);

db.transaction(() => {
  for (let i = 0; i < goals.length; i++) {
    const goal = goals[i];
    const payload = {
      Action: "goal",
      Id: "synthetic_goal_" + i,
      Seq: i,
      Participant: goal.participant,
      Clock: { Seconds: goal.sec },
      Data: { GoalType: "Regular" },
      Score: {
        Participant1: { Total: { Goals: goal.home } },
        Participant2: { Total: { Goals: goal.away } }
      },
      Confirmed: true
    };
    insert.run("scores", fixtureId, "synth_goal_" + i, "message", new Date().toISOString(), JSON.stringify(payload));
  }
})();

console.log("Synthesized 6 missing goals for France vs England!");
db.close();
