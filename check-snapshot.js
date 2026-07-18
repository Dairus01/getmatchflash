import { readFile } from "fs/promises";
async function checkLive() {
  const creds = JSON.parse(await readFile("server/.data/txline-credentials.json", "utf8"));
  const res = await fetch("https://txline-dev.txodds.com/api/fixtures/snapshot", {
    headers: { "Authorization": `Bearer ${creds.jwt}`, "X-Api-Token": creds.apiToken }
  });
  const fixtures = await res.json();
  const f = fixtures.find(x => x.FixtureId === 18257865);
  console.log(JSON.stringify(f, null, 2));
}
checkLive();
