import { Bot, InlineKeyboard } from "grammy";
import Database from "better-sqlite3";
import { readFile, readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { mkdirSync } from "node:fs";
import { eventsToStory } from "./story-engine.js";
import { CONFIRMED_FIXTURES, ensureSchema, voteSummary, type PredictionChoice } from "./match-domain.js";

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) throw new Error("TELEGRAM_BOT_TOKEN is required to run the bot.");

const APP_BASE_URL = (process.env.APP_BASE_URL || "https://getmatchflash.vercel.app").replace(/\/$/, "");
const DB_PATH = resolve(".data/matchflash.sqlite");
const ARCHIVE_DIR = resolve(".data/world_cup_archives");
const ODDS_SHIFT_THRESHOLD = Number(process.env.ODDS_SHIFT_THRESHOLD ?? "8");
const PAGE_SIZE = 6;
const bot = new Bot(token);
mkdirSync(dirname(DB_PATH), { recursive: true });

type Fixture = {
  FixtureId: number;
  Participant1: string;
  Participant2: string;
  Competition?: string;
  StartTime?: string | number;
};
type ArchiveFixture = Omit<Fixture, "StartTime"> & { StartTime: string; archivePath: string };
type ArchiveEvent = {
  Id?: string | number;
  Seq?: number;
  Action?: string;
  Confirmed?: boolean;
  Participant?: number;
  StatusId?: number;
  Clock?: { Seconds?: number };
  Data?: Record<string, unknown>;
  Score?: { Participant1?: { Total?: { Goals?: number } }; Participant2?: { Total?: { Goals?: number } } };
};
type ArchiveFile = {
  fixtureId?: number;
  fixture?: { id?: number; home_team?: string; away_team?: string; kickoff_at?: string };
  events?: ArchiveEvent[];
  source?: { final_score?: { homeGoals?: number; awayGoals?: number } };
};
type EventRow = { id: number; fixture_id: number; payload: string; event_type: string };

let archiveFixtures: ArchiveFixture[] = [];

const db = () => new Database(DB_PATH);

function init() {
  const database = db();
  ensureSchema(database);
  database.exec(`
    CREATE TABLE IF NOT EXISTS bot_subscriptions (
      chat_id INTEGER NOT NULL,
      team TEXT NOT NULL,
      PRIMARY KEY(chat_id, team)
    );
  `);
  database.close();
}

async function loadArchives() {
  let files: string[] = [];
  try { files = (await readdir(ARCHIVE_DIR)).filter((file) => file.endsWith(".json")).sort(); } catch { return; }
  const loaded = await Promise.all(files.map(async (file) => {
    const archive = JSON.parse(await readFile(resolve(ARCHIVE_DIR, file), "utf8")) as ArchiveFile;
    const id = Number(archive.fixtureId ?? archive.fixture?.id);
    const home = String(archive.fixture?.home_team ?? "").trim();
    const away = String(archive.fixture?.away_team ?? "").trim();
    return Number.isSafeInteger(id) && home && away
      ? { FixtureId: id, Participant1: home, Participant2: away, StartTime: archive.fixture?.kickoff_at ?? "", archivePath: resolve(ARCHIVE_DIR, file) } satisfies ArchiveFixture
      : undefined;
  }));
  archiveFixtures = loaded.filter((fixture): fixture is ArchiveFixture => fixture !== undefined)
    .sort((left, right) => matchName(left).localeCompare(matchName(right)));
}

function fixtures() { return archiveFixtures; }
function fixture(id: number) { return fixtures().find((item) => item.FixtureId === id); }
function matchName(item: Fixture) { return `${item.Participant1} vs ${item.Participant2}`; }
function replayLink(id: number) { return `${APP_BASE_URL}/match/${id}`; }
function replayKeyboard(id: number) { return new InlineKeyboard().url("Open full replay", replayLink(id)); }

type UpcomingFixture = { FixtureId: number; Participant1: string; Participant2: string; Competition: string; StartTime: string };
function upcomingFixtures(): UpcomingFixture[] {
  return CONFIRMED_FIXTURES.filter((fixture) => new Date(fixture.kickoffAt).getTime() > Date.now()).map((fixture) => ({ FixtureId: fixture.fixtureId, Participant1: fixture.homeTeam, Participant2: fixture.awayTeam, Competition: fixture.competition, StartTime: fixture.kickoffAt }));
}

function upcomingFixture(id: number) { return upcomingFixtures().find((item) => item.FixtureId === id); }

function predictionPicker() {
  const keys = new InlineKeyboard();
  for (const item of upcomingFixtures()) keys.text(matchName(item), `predict:m:${item.FixtureId}`).row();
  return { text: "Choose an upcoming match:\n\nPredictions stay open until kickoff.", keys };
}

function predictionChoices(item: UpcomingFixture) {
  const market = CONFIRMED_FIXTURES.find((fixture) => fixture.fixtureId === item.FixtureId)?.fallbackMarket ?? { home: 50, draw: 25, away: 25 };
  const homeFlag = item.Participant1 === "France" ? "🇫🇷" : item.Participant1 === "Spain" ? "🇪🇸" : "🏳️";
  const awayFlag = item.Participant2 === "England" ? "🏴" : item.Participant2 === "Argentina" ? "🇦🇷" : "🏳️";
  const keys = new InlineKeyboard().text(`${homeFlag} ${item.Participant1}`, `predict:c:${item.FixtureId}:home`).row();
  keys.text("🤝 Draw", `predict:c:${item.FixtureId}:draw`).row();
  keys.text(`${awayFlag} ${item.Participant2}`, `predict:c:${item.FixtureId}:away`);
  return { text: `${matchName(item)}\n${item.Competition}\n\nMarket consensus\n${item.Participant1}: ${market.home}%\nDraw: ${market.draw}%\n${item.Participant2}: ${market.away}%\n\nWho do you think wins?`, keys };
}

function subscribed(chatId: number, item: Fixture) {
  const database = db();
  const teams = database.prepare("SELECT team FROM bot_subscriptions WHERE chat_id=?")
    .all(chatId).map((row: { team: string }) => row.team.toLowerCase());
  database.close();
  return teams.length === 0 || teams.includes(item.Participant1.toLowerCase()) || teams.includes(item.Participant2.toLowerCase());
}

function replayPicker(page = 0, heading = "Choose a match to replay.", list = fixtures()) {
  const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  const safePage = Math.min(Math.max(page, 0), pages - 1);
  const keys = new InlineKeyboard();
  for (const item of list.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE)) {
    keys.text(matchName(item), `replay:m:${item.FixtureId}`).row();
  }
  if (pages > 1) {
    if (safePage > 0) keys.text("‹ Previous", `replay:p:${safePage - 1}`);
    keys.text(`${safePage + 1}/${pages}`, "replay:noop");
    if (safePage < pages - 1) keys.text("Next ›", `replay:p:${safePage + 1}`);
  }
  return { text: `${heading}\n\n${list.length} archived matches available.`, keys };
}

function findMatches(query: string) {
  const normalized = query.trim().toLowerCase();
  return fixtures().filter((item) =>
    !normalized || String(item.FixtureId) === normalized || matchName(item).toLowerCase().includes(normalized));
}

function eventMinute(event: ArchiveEvent) {
  const seconds = Number(event.Clock?.Seconds);
  return Number.isFinite(seconds) && seconds > 0 ? `${Math.max(1, Math.ceil(seconds / 60))}'` : "—";
}

function eventTeam(event: ArchiveEvent, item: Fixture) {
  const participant = Number(event.Data?.Participant ?? event.Participant ?? 1);
  return participant === 2 ? item.Participant2 : item.Participant1;
}

function archiveEvents(events: ArchiveEvent[]) {
  const discarded = new Set(events.filter((event) => event.Action === "action_discarded").map((event) => String(event.Id)));
  const groups = new Map<string, ArchiveEvent[]>();
  for (const [index, event] of events.entries()) {
    const key = event.Id === undefined ? `unidentified-${index}` : String(event.Id);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)?.push(event);
  }
  const latest = [...groups.entries()].flatMap(([id, group]) => {
    if (discarded.has(id) || group.some((event) => event.Action === "action_discarded")) return [];
    const confirmed = group.filter((event) => event.Confirmed === true);
    const candidates = confirmed.length ? confirmed : group;
    return [candidates.sort((left, right) => (right.Seq ?? 0) - (left.Seq ?? 0))[0]];
  });
  return latest.sort((left, right) => (left.Seq ?? 0) - (right.Seq ?? 0));
}

function scoreOf(archive: ArchiveFile) {
  const final = [...(archive.events ?? [])].reverse().find((event) => event.Action === "game_finalised");
  return {
    home: final?.Score?.Participant1?.Total?.Goals ?? archive.source?.final_score?.homeGoals ?? 0,
    away: final?.Score?.Participant2?.Total?.Goals ?? archive.source?.final_score?.awayGoals ?? 0,
  };
}

function replayMoments(archive: ArchiveFile, item: Fixture) {
  const score = scoreOf(archive);
  return archiveEvents(archive.events ?? []).flatMap((event) => {
    const minute = eventMinute(event);
    const team = eventTeam(event, item);
    switch (event.Action) {
      case "kickoff": return [`${minute}  Kick-off`];
      case "halftime_finalised": return [`${minute}  Half-time`];
      case "status":
        if (event.StatusId === 3) return [`${minute}  Half-time`];
        if (event.StatusId === 6) return [`${minute}  Full time — extra time follows`];
        if (event.StatusId === 8) return [`${minute}  Half-time in extra time`];
        return [];
      case "additional_time": {
        const minutes = Number(event.Data?.Minutes ?? 0);
        return minutes ? [`${minute}  ${minutes} minute${minutes === 1 ? "" : "s"} added`] : [];
      }
      case "goal": return [`${minute}  ⚽ Goal — ${team}`];
      case "penalty": return [`${minute}  Penalty awarded — ${team}`];
      case "yellow_card": return [`${minute}  🟨 Yellow card — ${team}`];
      case "red_card": return [`${minute}  🟥 Red card — ${team}`];
      case "substitution": return [`${minute}  ⇄ Substitution — ${team}`];
      case "var": return [`${minute}  VAR review`];
      case "var_end": return [`${minute}  VAR decision confirmed`];
      case "game_finalised": return [`${minute}  🏁 Full time — ${item.Participant1} ${score.home}–${score.away} ${item.Participant2}`];
      default: return [];
    }
  });
}

async function replayTimeline(item: ArchiveFixture, page = 0) {
  const archive = JSON.parse(await readFile(item.archivePath, "utf8")) as ArchiveFile;
  const moments = replayMoments(archive, item);
  const pages = Math.max(1, Math.ceil(moments.length / PAGE_SIZE));
  const safePage = Math.min(Math.max(page, 0), pages - 1);
  const score = scoreOf(archive);
  const start = safePage * PAGE_SIZE;
  const lines = moments.slice(start, start + PAGE_SIZE);
  const keys = new InlineKeyboard();
  if (safePage > 0) keys.text("‹ Earlier", `replay:t:${item.FixtureId}:${safePage - 1}`);
  keys.text(`${safePage + 1}/${pages}`, "replay:noop");
  if (safePage < pages - 1) keys.text("Later ›", `replay:t:${item.FixtureId}:${safePage + 1}`);
  keys.row().url("Open visual replay", replayLink(item.FixtureId));
  return {
    text: `⚽ Replay — ${matchName(item)}\nFinal score: ${item.Participant1} ${score.home}–${score.away} ${item.Participant2}\n\n${lines.join("\n") || "No key moments were recorded."}`,
    keys,
  };
}

async function matchActionMenu(item: ArchiveFixture) {
  const archive = JSON.parse(await readFile(item.archivePath, "utf8")) as ArchiveFile;
  const events = archive.events?.length ?? 0;
  const keys = new InlineKeyboard()
    .text("▶ Replay Match", `match:replay:${item.FixtureId}`)
    .text("📊 Statistics", `match:stats:${item.FixtureId}`).row()
    .text("👥 Lineups", `match:lineups:${item.FixtureId}`)
    .url("🔗 Open Website", replayLink(item.FixtureId));
  return {
    text: `${matchName(item)}\nDate: ${item.StartTime ? new Date(item.StartTime).toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" }) : "Verified archive"}\nEvents: ${events.toLocaleString()}\n\nChoose an action:`,
    keys,
  };
}

async function archivedStats(item: ArchiveFixture) {
  const archive = JSON.parse(await readFile(item.archivePath, "utf8")) as ArchiveFile;
  const score = scoreOf(archive);
  const events = archiveEvents(archive.events ?? []);
  const count = (action: string) => events.filter((event) => event.Action === action).length;
  const keys = new InlineKeyboard().text("‹ Match actions", `replay:m:${item.FixtureId}`).url("Open Website", replayLink(item.FixtureId));
  return { text: `📊 Statistics — ${matchName(item)}\n\nScore: ${score.home}–${score.away}\nShots: ${count("shot")} recorded events\nCorners: ${count("corner")}\nCards: ${count("yellow_card") + count("red_card")}\nGoals: ${count("goal")}`, keys };
}

async function archivedLineups(item: ArchiveFixture) {
  const archive = JSON.parse(await readFile(item.archivePath, "utf8")) as ArchiveFile;
  const players = (archive as ArchiveFile & { lineups?: { home?: string[]; away?: string[] } }).lineups;
  const keys = new InlineKeyboard().text("‹ Match actions", `replay:m:${item.FixtureId}`).url("Open Website", replayLink(item.FixtureId));
  return { text: `👥 Lineups — ${matchName(item)}\n\n${item.Participant1}\n${players?.home?.join(", ") || "Starting XI available on the website."}\n\n${item.Participant2}\n${players?.away?.join(", ") || "Starting XI available on the website."}`, keys };
}

bot.catch((error) => console.error("Telegram bot error:", error.message));

bot.command("start", async (ctx) => {
  const { text, keys } = replayPicker(0, "Welcome to MatchFlash. Choose a verified match replay, or use /replay <team> to search.");
  await ctx.reply(text, { reply_markup: keys });
});

bot.command("replay", async (ctx) => {
  const query = ctx.match?.trim() ?? "";
  const matches = findMatches(query);
  if (matches.length === 1) {
    const { text, keys } = await replayTimeline(matches[0]);
    await ctx.reply(text, { reply_markup: keys });
    return;
  }
  if (query && matches.length === 0) {
    await ctx.reply(`No archived replay matches “${query}”. Use /matches to browse all available matches.`);
    return;
  }
  const { text, keys } = replayPicker(0, query ? `More than one replay matches “${query}”. Choose one.` : "Choose a match to replay.", matches);
  await ctx.reply(text, { reply_markup: keys });
});

bot.command("matches", async (ctx) => {
  const { text, keys } = replayPicker();
  await ctx.reply(text, { reply_markup: keys });
});

bot.callbackQuery(/^replay:m:(\d+)$/, async (ctx) => {
  const item = fixture(Number(ctx.match[1]));
  if (item) {
    const { text, keys } = await matchActionMenu(item);
    await ctx.editMessageText(text, { reply_markup: keys });
  }
  else await ctx.editMessageText("That replay is no longer available. Use /matches to choose another.");
  await ctx.answerCallbackQuery();
});

bot.callbackQuery(/^match:replay:(\d+)$/, async (ctx) => {
  const item = fixture(Number(ctx.match[1]));
  if (item) { const { text, keys } = await replayTimeline(item); await ctx.editMessageText(text, { reply_markup: keys }); }
  await ctx.answerCallbackQuery();
});

bot.callbackQuery(/^match:stats:(\d+)$/, async (ctx) => {
  const item = fixture(Number(ctx.match[1]));
  if (item) { const { text, keys } = await archivedStats(item); await ctx.editMessageText(text, { reply_markup: keys }); }
  await ctx.answerCallbackQuery();
});

bot.callbackQuery(/^match:lineups:(\d+)$/, async (ctx) => {
  const item = fixture(Number(ctx.match[1]));
  if (item) { const { text, keys } = await archivedLineups(item); await ctx.editMessageText(text, { reply_markup: keys }); }
  await ctx.answerCallbackQuery();
});

bot.callbackQuery(/^replay:t:(\d+):(\d+)$/, async (ctx) => {
  const item = fixture(Number(ctx.match[1]));
  if (item) {
    const { text, keys } = await replayTimeline(item, Number(ctx.match[2]));
    await ctx.editMessageText(text, { reply_markup: keys });
  }
  await ctx.answerCallbackQuery();
});

bot.callbackQuery(/^replay:p:(\d+)$/, async (ctx) => {
  const { text, keys } = replayPicker(Number(ctx.match[1]));
  await ctx.editMessageText(text, { reply_markup: keys });
  await ctx.answerCallbackQuery();
});

bot.callbackQuery("replay:noop", async (ctx) => {
  await ctx.answerCallbackQuery();
});

bot.command("live", async (ctx) => {
  const database = db();
  ensureSchema(database);
  const live = CONFIRMED_FIXTURES.map((fixture) => database.prepare("SELECT snapshot_payload FROM txline_fixtures WHERE fixture_id=?").get(fixture.fixtureId) as { snapshot_payload?: string } | undefined)
    .filter(Boolean)
    .map((row) => { try { return JSON.parse(row?.snapshot_payload ?? "{}"); } catch { return null; } })
    .filter((fixture): fixture is Record<string, unknown> => Boolean(fixture && /live|progress|half/i.test(String(fixture.GameState ?? fixture.Status ?? ""))));
  database.close();
  await ctx.reply(live.length ? live.map((fixture) => `${fixture.Participant1} vs ${fixture.Participant2}\nLive probability is updating from TxODDS.`).join("\n\n") : "No match is live right now. Use /predict for the next fixtures.");
});

bot.command("follow", async (ctx) => {
  const team = ctx.match?.trim();
  if (!team) return ctx.reply("Usage: /follow <team>");
  const database = db();
  database.prepare("INSERT OR IGNORE INTO bot_subscriptions (chat_id,team) VALUES (?,?)").run(ctx.chat.id, team);
  database.close();
  return ctx.reply(`Following ${team}.`);
});

bot.command("unfollow", async (ctx) => {
  const team = ctx.match?.trim();
  if (!team) return ctx.reply("Usage: /unfollow <team>");
  const database = db();
  database.prepare("DELETE FROM bot_subscriptions WHERE chat_id=? AND lower(team)=lower(?)").run(ctx.chat.id, team);
  database.close();
  return ctx.reply(`Unfollowed ${team}.`);
});

bot.command("predict", async (ctx) => {
  const { text, keys } = predictionPicker();
  return ctx.reply(text, { reply_markup: keys });
});

bot.callbackQuery(/^predict:m:(\d+)$/, async (ctx) => {
  const item = upcomingFixture(Number(ctx.match[1]));
  if (!item) { await ctx.editMessageText("That fixture has kicked off. Live predictions are available from /live."); await ctx.answerCallbackQuery(); return; }
  const { text, keys } = predictionChoices(item);
  await ctx.editMessageText(text, { reply_markup: keys });
  await ctx.answerCallbackQuery();
});

bot.callbackQuery(/^predict:c:(\d+):(home|draw|away)$/, async (ctx) => {
  const [, id, choice] = ctx.match as [string, string, PredictionChoice];
  const database = db();
  ensureSchema(database);
  database.prepare("INSERT INTO community_votes (fixture_id, choice, voter_id, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(fixture_id, voter_id) DO UPDATE SET choice = excluded.choice, created_at = excluded.created_at")
    .run(Number(id), choice, `telegram:${ctx.from.id}`, new Date().toISOString());
  const summary = voteSummary(database, Number(id));
  database.close();
  await ctx.answerCallbackQuery({ text: "Prediction recorded" });
  const item = [...upcomingFixtures(), ...fixtures()].find((fixture) => fixture.FixtureId === Number(id));
  const home = item?.Participant1 ?? "Home";
  const away = item?.Participant2 ?? "Away";
  await ctx.editMessageText(`Prediction recorded: ${choice === "home" ? home : choice === "away" ? away : "Draw"}.\n\nCommunity prediction\n${home}: ${summary.percentages.home}%\nDraw: ${summary.percentages.draw}%\n${away}: ${summary.percentages.away}%`);
});

bot.command("leaderboard", async (ctx) => {
  const item = upcomingFixtures()[0];
  if (!item) return ctx.reply("No upcoming fixture is available yet.");
  const database = db();
  const rows = database.prepare("SELECT choice, COUNT(*) AS count FROM community_votes WHERE fixture_id=? GROUP BY choice ORDER BY count DESC")
    .all(item.FixtureId) as { choice: string; count: number }[];
  database.close();
  return ctx.reply(rows.length
    ? `Community prediction — ${matchName(item)}\n${rows.map((row) => `${row.choice}: ${row.count}`).join("\n")}`
    : "No predictions yet.");
});

let latestId = 0;

async function alert() {
  const database = db();
  const rows = database.prepare("SELECT id,fixture_id,payload,event_type FROM txline_events WHERE id>? ORDER BY id")
    .all(latestId) as EventRow[];
  for (const row of rows) {
    latestId = row.id;
    const item = fixture(row.fixture_id);
    if (!item) continue;
    const story = eventsToStory(JSON.parse(row.payload), { fixtureId: item.FixtureId, homeTeam: item.Participant1, awayTeam: item.Participant2 });
    if (!story || !["GOAL", "RED_CARD", "PENALTY", "ODDS_SHIFT"].includes(story.kind)) continue;
    if (story.kind === "ODDS_SHIFT" && !meaningfulOdds(JSON.parse(row.payload))) continue;
    const chats = database.prepare("SELECT DISTINCT chat_id FROM bot_subscriptions").all() as { chat_id: number }[];
    for (const { chat_id } of chats) {
      if (subscribed(chat_id, item)) await bot.api.sendMessage(chat_id, `${story.kind === "GOAL" ? "⚽ " : ""}${matchName(item)}\n${story.line}`, { reply_markup: replayKeyboard(item.FixtureId) });
    }
  }
  database.close();
}

function meaningfulOdds(payload: { Pct?: unknown[] }) {
  return (payload.Pct ?? []).map(Number).some((value) => Number.isFinite(value) && Math.abs(value - 50) >= ODDS_SHIFT_THRESHOLD);
}

async function main() {
  init();
  await loadArchives();
  if (!archiveFixtures.length) console.warn("No replay archives found; upcoming prediction flow remains available.");
  await bot.api.setMyCommands([
    { command: "replay", description: "Open or search a match replay" },
    { command: "matches", description: "Browse all archived matches" },
    { command: "live", description: "Check live-feed availability" },
    { command: "follow", description: "Follow a team for live alerts" },
    { command: "unfollow", description: "Stop following a team" },
    { command: "predict", description: "Make a score prediction" },
    { command: "leaderboard", description: "View recent predictions" },
  ]);
  void bot.start({ onStart: () => console.log(`TELEGRAM_BOT_READY archives=${archiveFixtures.length}`) });
  const alertTimer = setInterval(() => {
    void alert().catch((error: unknown) => console.error("Telegram alert error:", error instanceof Error ? error.message : String(error)));
  }, 500);
  const stop = () => {
    clearInterval(alertTimer);
    bot.stop();
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
}

void main().catch((error: unknown) => {
  console.error("TELEGRAM_BOT_FATAL", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
