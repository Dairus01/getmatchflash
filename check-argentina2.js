const fs = require('fs');
const data = JSON.parse(fs.readFileSync('server/.data/world_cup_archives/argentina-egypt-historical.json', 'utf8'));

let home = 0, away = 0;
for (const e of data.events) {
  if (e.Score) {
    if (e.Score.Home !== home || e.Score.Away !== away) {
      console.log(`Score changed to ${e.Score.Home}-${e.Score.Away} at ${e.Clock ? e.Clock.Seconds : 'unknown'}s`);
      console.log(e);
      home = e.Score.Home;
      away = e.Score.Away;
    }
  }
}
