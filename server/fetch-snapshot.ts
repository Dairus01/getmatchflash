import fs from 'fs';
import Database from 'better-sqlite3';

async function run() {
  const creds = JSON.parse(fs.readFileSync('.data/txline-credentials.json', 'utf8'));
  const res = await fetch('https://txline-dev.txodds.com/api/scores/snapshot/18257865', {
    headers: {
      'Authorization': 'Bearer ' + creds.jwt,
      'X-Api-Token': creds.apiToken
    }
  });
  const events = await res.json();
  const db = new Database('.data/matchflash.sqlite');
  const stmt = db.prepare('INSERT OR IGNORE INTO txline_events (source, fixture_id, stream_event_id, event_type, received_at, payload) VALUES (?, ?, ?, ?, ?, ?)');
  let count = 0;
  for (const e of events) {
    const res = stmt.run('scores', 18257865, String(e.Id || e.id || Math.random()), 'snapshot', new Date().toISOString(), JSON.stringify(e));
    if (res.changes > 0) count++;
  }
  console.log('Inserted', count, 'events from snapshot');
}
run();
