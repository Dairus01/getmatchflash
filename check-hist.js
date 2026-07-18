import { readFile } from "fs/promises";
async function checkLive() {
  const creds = JSON.parse(await readFile("server/.data/txline-credentials.json", "utf8"));
  const res = await fetch("https://txline-dev.txodds.com/api/scores/historical/18257865", {
    headers: { "Authorization": `Bearer ${creds.jwt}`, "X-Api-Token": creds.apiToken }
  });
  console.log("Status:", res.status);
  const text = await res.text();
  console.log("Length:", text.length);
  if(text.length > 0) {
    const lines = text.split("\n").filter(l => l.startsWith("data: ")).map(l => l.substring(6));
    console.log("Events count:", lines.length);
    if(lines.length > 0) {
      console.log("Last event:", JSON.parse(lines[lines.length - 1]));
    }
  }
}
checkLive();
