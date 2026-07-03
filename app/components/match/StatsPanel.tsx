import type { MatchData } from "../../data/matches";

function Bar({ label, home, away, suffix = "" }: { label: string; home: number; away: number; suffix?: string }) {
  const total = home + away;
  const left = total ? (home / total) * 100 : 50;
  return <div className="mf-stat-row">
    <div className="mf-stat-values"><b>{home}{suffix}</b><span>{label}</span><b>{away}{suffix}</b></div>
    <div className="mf-stat-track"><i style={{ width: `${left}%` }} /><i style={{ width: `${100 - left}%` }} /></div>
  </div>;
}

export default function StatsPanel({ match, elapsed }: { match: MatchData; elapsed: number }) {
  const goals = match.events.filter((event) => event.action === "goal" && event.sec <= elapsed);
  const homeGoals = goals.filter((event) => event.participant === 1);
  const awayGoals = goals.filter((event) => event.participant === 2);
  const stats = match.finalStats;
  return <section className="mf-stats-panel">
    <div className="mf-stats-teams"><strong>{match.home.slice(0, 3).toUpperCase()}</strong><span>vs</span><strong>{match.away.slice(0, 3).toUpperCase()}</strong></div>
    <div className="mf-goals-summary">
      <div className="mf-goals-total"><b>{match.finalScore[0]}</b><span>Total goals</span><b>{match.finalScore[1]}</b></div>
      <div className="mf-periods"><span>H1&nbsp; {match.periodBreakdown.h1.home}<br />H2&nbsp; {match.periodBreakdown.h2.home}{(match.periodBreakdown.et.home || match.periodBreakdown.et.away) ? <><br />ET&nbsp; {match.periodBreakdown.et.home}</> : null}</span><span>{match.periodBreakdown.h1.away}&nbsp; H1<br />{match.periodBreakdown.h2.away}&nbsp; H2{(match.periodBreakdown.et.home || match.periodBreakdown.et.away) ? <><br />{match.periodBreakdown.et.away}&nbsp; ET</> : null}</span></div>
      {(homeGoals.length > 0 || awayGoals.length > 0) && <div className="mf-scorers"><div>{homeGoals.map((goal) => <span key={goal.id}>⚽ {goal.scorer ?? "Goal"} <small>{Math.floor(goal.sec / 60)}'</small></span>)}</div><div>{awayGoals.map((goal) => <span key={goal.id}><small>{Math.floor(goal.sec / 60)}'</small> {goal.scorer ?? "Goal"} ⚽</span>)}</div></div>}
    </div>
    <p className="mf-stats-note">Recorded event totals · possession estimated from TxLINE possession intervals</p>
    <Bar label="Shots" home={stats.home.shots} away={stats.away.shots} />
    <Bar label="Shots on target" home={stats.home.shotsOnTarget} away={stats.away.shotsOnTarget} />
    <Bar label="Possession" home={stats.home.possession} away={stats.away.possession} suffix="%" />
    <Bar label="Yellow cards" home={stats.home.yellowCards} away={stats.away.yellowCards} />
    <Bar label="Red cards" home={stats.home.redCards} away={stats.away.redCards} />
    <Bar label="Corners" home={stats.home.corners} away={stats.away.corners} />
  </section>;
}
