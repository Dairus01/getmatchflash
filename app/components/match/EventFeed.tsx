import type { MatchEvent } from "../../data/matches";

const labels: Record<MatchEvent["action"], [string, string, 1 | 2 | 3]> = {
  goal: ["Goal", "mf-chip-goal", 1], penalty: ["Penalty", "mf-chip-goal", 1], yellow_card: ["Yellow card", "mf-chip-yellow", 2], red_card: ["Red card", "mf-chip-red", 1], substitution: ["Substitution", "mf-chip-sub", 2], injury: ["Injury", "mf-chip-injury", 2], var: ["VAR", "mf-chip-var", 2], var_result: ["VAR result", "mf-chip-var", 1], shot: ["Shot", "mf-chip-shot", 2], corner: ["Corner", "mf-chip-setpiece", 3], free_kick: ["Free kick", "mf-chip-setpiece", 3], throw_in: ["Throw-in", "mf-chip-minor", 3], goal_kick: ["Goal kick", "mf-chip-minor", 3], big_chance: ["Big chance", "mf-chip-chance", 2], near_miss: ["Near miss", "mf-chip-chance", 2], kickoff: ["Period", "mf-chip-period", 2], halftime: ["Period", "mf-chip-period", 2], fulltime: ["Period", "mf-chip-period", 2], additional_time: ["+ Time", "mf-chip-period", 2], jersey: ["Kit", "mf-chip-info", 3], kickoff_team: ["Kickoff", "mf-chip-info", 3], prematch_info: ["Info", "mf-chip-info", 3],
};

export default function EventFeed({ events }: { events: MatchEvent[] }) {
  if (!events.length) return <div className="mf-empty-state">Press “Play Replay” to start streaming this match&apos;s recorded event history.</div>;
  return <div className="mf-feed">
    {events.map((event) => {
      const [label, chip, tier] = labels[event.action];
      const preMatch = event.sec === 0 && ["prematch_info", "jersey", "kickoff_team"].includes(event.action);
      const time = preMatch ? "PRE" : `${Math.floor(event.sec / 60)}'`;
      if (tier === 3) return <div className="mf-event-row-minor" key={event.id}><span className={`mf-kicker-chip ${chip}`}>{label}</span><span className="mf-event-row-text">{event.headline}</span><time>{time}</time></div>;
      return <article className={`mf-card ${tier === 1 ? "mf-card-featured" : ""}`} key={event.id}>
        <div className="mf-card-kicker"><span className={`mf-kicker-chip ${chip}`}>{label}</span><time>{time}</time></div>
        <p className="mf-card-headline">{event.headline}</p>
        {event.action === "goal" && event.scorer && <p className="mf-event-detail">⚽ <b>{event.scorer}</b>{event.goalType ? <small>({event.goalType})</small> : null}</p>}
        {event.action === "substitution" && <p className="mf-sub-row">{event.playerIn ? <span>▲ {event.playerIn}</span> : null}{event.playerOut ? <span>▼ {event.playerOut}</span> : null}</p>}
        {event.action === "jersey" && event.jerseyColor && <p className="mf-event-detail">Kit: {event.jerseyColor}</p>}
        {event.sub && <p className="mf-card-sub">{event.sub}</p>}
        {event.probAfter !== undefined && <p className="mf-prob-strip"><small>Estimated momentum</small> <b>{event.probAfter}%</b></p>}
      </article>;
    })}
  </div>;
}
