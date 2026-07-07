export type RawEvent = Record<string, unknown>;
export type MatchState = {
  homeTeam: string;
  awayTeam: string;
  preceding?: RawEvent[];
  momentum?: { side?: number; score?: number };
};
export type StoryType = "GOAL" | "CARD" | "PENALTY" | "SUBSTITUTION" | "BIG_CHANCE" | "MOMENTUM_SHIFT" | "PERIOD_MARKER";
export type Story = {
  type: StoryType;
  timestamp: number;
  team: string;
  cardType?: "yellow" | "red";
  action: string;
  raw: RawEvent;
};

const ACTIONS_WITH_POSSESSION = ["attack_possession", "danger_possession", "high_danger_possession"];

function actionOf(event: RawEvent) {
  return String(event.Action || "");
}

function participantOf(event: RawEvent) {
  const nested = event.Data;
  const nestedParticipant = nested && typeof nested === "object"
    ? (nested as Record<string, unknown>).Participant
    : undefined;
  return event.Participant ?? nestedParticipant;
}

function team(event: RawEvent, state: MatchState) {
  return Number(participantOf(event)) === 2 ? state.awayTeam : state.homeTeam;
}

function timestampOf(event: RawEvent) {
  return Number(event.Ts);
}

export function classifyEvent(event: RawEvent, state: MatchState): Story | null {
  const action = actionOf(event);
  const base = { timestamp: timestampOf(event), team: team(event, state), action, raw: event };
  if (!Number.isFinite(base.timestamp)) return null;
  if (action === "goal") return { ...base, type: "GOAL" };
  if (action === "yellow_card" || action === "red_card") {
    return { ...base, type: "CARD", cardType: action === "red_card" ? "red" : "yellow" };
  }
  if (action === "penalty") return { ...base, type: "PENALTY" };
  if (action === "substitution") return { ...base, type: "SUBSTITUTION" };
  if (["kickoff", "halftime_finalised", "game_finalised", "additional_time"].includes(action)) {
    return { ...base, type: "PERIOD_MARKER" };
  }

  const preceding = state.preceding ?? [];
  if (
    action === "shot" &&
    preceding.some((previous) =>
      ["danger_possession", "high_danger_possession"].includes(actionOf(previous)) &&
      Number(participantOf(previous)) === Number(participantOf(event)) &&
      timestampOf(event) - timestampOf(previous) <= 15000,
    )
  ) {
    return { ...base, type: "BIG_CHANCE" };
  }
  return null;
}

export function classifyFixture(events: RawEvent[], state: MatchState): Story[] {
  const stories: Story[] = [];
  let preceding: RawEvent[] = [];
  let momentum = { ...state.momentum };
  const last = new Map<string, number>();

  for (const event of [...events].sort((a, b) => timestampOf(a) - timestampOf(b))) {
    const normal = classifyEvent(event, { ...state, preceding, momentum });
    if (normal) {
      const key = `${normal.type}:${normal.team}:${normal.action}`;
      const cooldown = normal.type === "PERIOD_MARKER" ? 5000 : normal.type === "BIG_CHANCE" ? 90000 : 0;
      if (!cooldown || normal.timestamp - (last.get(key) ?? -Infinity) >= cooldown) {
        stories.push(normal);
        last.set(key, normal.timestamp);
      }
    }

    const action = actionOf(event);
    if (ACTIONS_WITH_POSSESSION.includes(action)) {
      const side = Number(participantOf(event));
      const recent = preceding.filter((previous) =>
        timestampOf(event) - timestampOf(previous) <= 300000 &&
        ACTIONS_WITH_POSSESSION.includes(actionOf(previous)),
      );
      const own = recent.filter((previous) => Number(participantOf(previous)) === side).length;
      const score = recent.length ? own / recent.length : 0;
      if (recent.length >= 12 && score >= 0.72 && momentum.side !== side) {
        stories.push({ type: "MOMENTUM_SHIFT", timestamp: timestampOf(event), team: team(event, state), action, raw: event });
        momentum = { side, score };
      }
    }
    preceding = [...preceding, event].filter((previous) => timestampOf(event) - timestampOf(previous) <= 300000);
  }
  return stories;
}
