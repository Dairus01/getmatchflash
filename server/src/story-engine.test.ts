import assert from "node:assert/strict";
import test from "node:test";
import { eventsToStory, shouldGenerateMatchBrief, type MatchState } from "./story-engine.js";

const state: MatchState = { fixtureId: 18218149, homeTeam: "Australia", awayTeam: "Brazil", homeScore: 0, awayScore: 1 };

// Exact StablePrice payload captured by Step 3 from fixture 18218149.
const capturedOdds = {
  FixtureId: 18218149, MessageId: "1837162186:00003:000160-10021-stab", Ts: 1783696666767,
  Bookmaker: "TXLineStablePriceDemargined", SuperOddsType: "ASIANHANDICAP_PARTICIPANT_GOALS",
  MarketParameters: "line=-1.75", PriceNames: ["part1", "part2"], Prices: [3454, 1408], Pct: ["NA", "NA"],
};

test("classifies the captured TxLINE StablePrice payload as an odds shift", () => {
  const story = eventsToStory(capturedOdds, state);
  assert.equal(story?.kind, "ODDS_SHIFT");
  assert.equal(story?.fixtureId, 18218149);
  assert.match(story?.line ?? "", /StablePrice/);
});

test("classifies score incidents deterministically", () => {
  assert.equal(eventsToStory({ FixtureId: 1, EventType: "GOAL", Side: "home", HomeScore: 1, AwayScore: 0, Minute: 14 }, { ...state, fixtureId: 1, homeScore: 0, awayScore: 0 })?.kind, "GOAL");
  assert.equal(eventsToStory({ FixtureId: 1, EventType: "GOAL", Side: "home", HomeScore: 1, AwayScore: 1, Minute: 64 }, { ...state, fixtureId: 1 })?.kind, "COMEBACK");
  assert.equal(eventsToStory({ FixtureId: 1, EventType: "RED_CARD", Side: "away", Minute: 52 }, { ...state, fixtureId: 1 })?.kind, "RED_CARD");
  assert.equal(eventsToStory({ FixtureId: 1, EventType: "PENALTY", Side: "home", Minute: 31 }, { ...state, fixtureId: 1 })?.kind, "PENALTY");
  assert.equal(eventsToStory({ FixtureId: 1, EventType: "GOAL", Side: "away", Minute: 88 }, { ...state, fixtureId: 1 })?.kind, "LATE_DRAMA");
  assert.equal(eventsToStory({ FixtureId: 1, EventType: "dangerous attack", Side: "home", Minute: 19 }, { ...state, fixtureId: 1 })?.kind, "MOMENTUM_SHIFT");
});

test("only schedules a match brief every ten minutes of match time", () => {
  assert.equal(shouldGenerateMatchBrief(null, 1), true);
  assert.equal(shouldGenerateMatchBrief(30, 39), false);
  assert.equal(shouldGenerateMatchBrief(30, 40), true);
});
