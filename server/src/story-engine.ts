export type StoryKind =
  | "GOAL"
  | "RED_CARD"
  | "PENALTY"
  | "ODDS_SHIFT"
  | "MOMENTUM_SHIFT"
  | "COMEBACK"
  | "LATE_DRAMA";

export type RawTxlineEvent = Record<string, unknown>;

export type MatchState = {
  fixtureId: number;
  homeTeam?: string;
  awayTeam?: string;
  homeScore?: number;
  awayScore?: number;
  minute?: number;
  /** Latest StablePrice prices, by market signature. */
  odds?: Record<string, number[]>;
};

export type Story = {
  fixtureId: number;
  kind: StoryKind;
  line: string;
  sourceEvent: RawTxlineEvent;
  occurredAt: number | null;
  minute: number | null;
};

/** A match brief is eligible only once per ten minutes of match clock, never per event. */
export function shouldGenerateMatchBrief(lastBriefMinute: number | null, matchMinute: number | null) {
  return matchMinute !== null && (lastBriefMinute === null || matchMinute - lastBriefMinute >= 10);
}

const eventText = (event: RawTxlineEvent) =>
  [event.EventType, event.EventName, event.Type, event.IncidentType, event.Status, event.Description]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();

const numberAt = (event: RawTxlineEvent, ...keys: string[]) => {
  for (const key of keys) {
    const value = Number(event[key]);
    if (Number.isFinite(value)) return value;
  }
  return undefined;
};

const stringAt = (event: RawTxlineEvent, ...keys: string[]) => {
  for (const key of keys) if (typeof event[key] === "string" && event[key]) return event[key] as string;
  return undefined;
};

function fixtureIdFor(event: RawTxlineEvent, state: MatchState) {
  return numberAt(event, "FixtureId", "fixtureId", "fixture_id") ?? state.fixtureId;
}

function teamFor(event: RawTxlineEvent, state: MatchState) {
  const side = stringAt(event, "Side", "TeamSide", "Participant")?.toLowerCase();
  if (side === "home" || side === "1" || side === "part1") return state.homeTeam ?? "Home side";
  if (side === "away" || side === "2" || side === "part2") return state.awayTeam ?? "Away side";
  return stringAt(event, "TeamName", "Team") ?? "A side";
}

function scoreAfter(event: RawTxlineEvent, state: MatchState) {
  const home = numberAt(event, "HomeScore", "homeScore") ?? state.homeScore;
  const away = numberAt(event, "AwayScore", "awayScore") ?? state.awayScore;
  return home === undefined || away === undefined ? undefined : { home, away };
}

function isComeback(event: RawTxlineEvent, state: MatchState) {
  const beforeHome = state.homeScore;
  const beforeAway = state.awayScore;
  const after = scoreAfter(event, state);
  if (beforeHome === undefined || beforeAway === undefined || !after) return false;
  const wasTrailing = beforeHome < beforeAway || beforeAway < beforeHome;
  const nowLevelOrLead = after.home === after.away || (beforeHome < beforeAway ? after.home > after.away : after.away > after.home);
  return wasTrailing && nowLevelOrLead;
}

function oddsMoved(event: RawTxlineEvent, state: MatchState) {
  const prices = event.Prices;
  const market = [event.SuperOddsType, event.MarketParameters, event.MarketPeriod].join("|");
  if (!Array.isArray(prices) || !prices.every((price) => typeof price === "number")) return false;
  const previous = state.odds?.[market];
  if (!previous || previous.length !== prices.length) return true;
  return prices.some((price, index) => Math.abs((price as number) - previous[index]) >= 80);
}

/**
 * Deterministically maps one TxLINE payload to a displayable story. This function
 * is intentionally pure: callers persist the raw event before invoking it.
 */
export function eventsToStory(rawEvent: RawTxlineEvent, matchState: MatchState): Story | null {
  const text = eventText(rawEvent);
  const fixtureId = fixtureIdFor(rawEvent, matchState);
  const minute = numberAt(rawEvent, "Minute", "minute", "MatchMinute") ?? matchState.minute ?? null;
  const occurredAt = numberAt(rawEvent, "Ts", "Timestamp", "timestamp") ?? null;
  const team = teamFor(rawEvent, matchState);
  const late = minute !== null && minute >= 80;
  const goal = /\bgoal\b/.test(text) || rawEvent.IsGoal === true;
  const redCard = /red[ _-]?card|sending.?off/.test(text) || rawEvent.IsRedCard === true;
  const penalty = /penalt/.test(text) || rawEvent.IsPenalty === true;

  let kind: StoryKind;
  let line: string;
  if (goal && isComeback(rawEvent, matchState)) {
    kind = "COMEBACK";
    line = `${team} complete the comeback with a goal${minute === null ? "" : ` in the ${minute}th minute`}.`;
  } else if (late && (goal || redCard || penalty)) {
    kind = "LATE_DRAMA";
    line = `${team} trigger late drama${minute === null ? "" : ` in the ${minute}th minute`}.`;
  } else if (goal) {
    kind = "GOAL";
    line = `${team} find the net${minute === null ? "." : ` in the ${minute}th minute.`}`;
  } else if (redCard) {
    kind = "RED_CARD";
    line = `${team} are down to ten after a red card${minute === null ? "." : ` in the ${minute}th minute.`}`;
  } else if (penalty) {
    kind = "PENALTY";
    line = `${team} have a penalty decision${minute === null ? "." : ` in the ${minute}th minute.`}`;
  } else if (oddsMoved(rawEvent, matchState)) {
    kind = "ODDS_SHIFT";
    line = `TxLINE StablePrice moved in ${String(rawEvent.SuperOddsType ?? "the match market")}.`;
  } else if (/momentum|attack|dangerous|pressure/.test(text)) {
    kind = "MOMENTUM_SHIFT";
    line = `${team} are building momentum${minute === null ? "." : ` in the ${minute}th minute.`}`;
  } else {
    return null;
  }
  return { fixtureId, kind, line, sourceEvent: rawEvent, occurredAt, minute };
}
