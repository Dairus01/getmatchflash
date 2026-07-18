import { readFile } from "fs/promises";
async function checkLive() {
  const creds = JSON.parse(await readFile("server/.data/txline-credentials.json", "utf8"));
  const res = await fetch("https://txline-dev.txodds.com/api/scores/18257865", {
    headers: { "Authorization": `Bearer ${creds.jwt}`, "X-Api-Token": creds.apiToken }
  });
  console.log("Status:", res.status);
  const text = await res.text();
  console.log(text.substring(0, 1000));
}
checkLive();
