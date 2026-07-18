const fs = require('fs');
const data = JSON.parse(fs.readFileSync('server/.data/world_cup_archives/argentina-egypt-historical.json', 'utf8'));
const events = data.events.filter(e => e.Clock && e.Clock.Seconds >= 800 && e.Clock.Seconds <= 1000);
console.log(JSON.stringify(events, null, 2));
