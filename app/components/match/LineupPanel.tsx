"use client";

import { useState } from "react";
import type { LineupPlayer, MatchData, TeamLineup } from "../../data/matches";
import CountryFlag from "../CountryFlag";

function shortName(name: string) { const parts = name.split(" "); return parts.length > 1 ? `${parts[0][0]}. ${parts.slice(1).join(" ")}` : name; }
function age(dob: string | null, date: string) { if (!dob) return null; const match = new Date(date); const birth = new Date(dob); return match.getFullYear() - birth.getFullYear() - (match < new Date(match.getFullYear(), birth.getMonth(), birth.getDate()) ? 1 : 0); }
function playerInitials(name: string) { return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase(); }
function PlayerAvatar({ player, side, bench = false }: { player: LineupPlayer; side: "home" | "away"; bench?: boolean }) {
  const [broken, setBroken] = useState(false);
  return <span className={`${bench ? "lp-bench-circle" : "lp-circle"} ${bench ? `lp-bench-circle-${side}` : `lp-circle-${side}`} lp-avatar`}>
    {player.photo && !broken ? <img src={player.photo} alt="" onError={() => setBroken(true)} /> : <span>{playerInitials(player.name)}</span>}
  </span>;
}
function Player({ player, date, side }: { player: LineupPlayer; date: string; side: "home" | "away" }) { return <div className="lp-player"><span className="lp-player-avatar"><PlayerAvatar player={player} side={side} />{player.number && <small>{player.number}</small>}{(player.goals || player.yellowCards || player.redCards) ? <i>{player.goals ? "⚽" : player.redCards ? "🟥" : "🟨"}</i> : null}</span><b>{shortName(player.name)}</b>{age(player.dob, date) !== null && <small>{age(player.dob, date)}y</small>}</div>; }
function Half({ lineup, team, date, side, flipped }: { lineup: TeamLineup; team: string; date: string; side: "home" | "away"; flipped?: boolean }) {
  const group = (position: number) => lineup.starters.filter((player) => player.positionId === position);
  const rows = flipped ? [group(37), group(36), group(35), group(34)] : [group(34), group(35), group(36), group(37)];
  const header = <header className="lp-half-header"><b><CountryFlag country={team} size="inline" />{team}</b><span>{lineup.formation}</span></header>;
  return <div className="lp-half">{flipped ? <header className="lp-half-header lp-half-header-hidden" aria-hidden="true"><b>{team}</b><span>{lineup.formation}</span></header> : header}<div className="lp-half-rows">{rows.map((players, index) => <div className="lp-row" key={index}>{players.map((player) => <Player key={player.id} player={player} date={date} side={side} />)}</div>)}</div>{flipped && header}</div>;
}
function Bench({ players, team, date, side }: { players: LineupPlayer[]; team: string; date: string; side: "home" | "away" }) { return <div className="lp-bench-col"><b><CountryFlag country={team} size="inline" />{team}</b>{players.map((player) => <div className="lp-bench-player" key={player.id}><PlayerAvatar player={player} side={side} bench /><span><strong>{player.name}</strong><small>{({ 34: "GK", 35: "DEF", 36: "MID", 37: "FWD" } as Record<number, string>)[player.positionId]}{age(player.dob, date) !== null ? ` · ${age(player.dob, date)}y` : ""}</small></span></div>)}</div>; }

export default function LineupPanel({ match }: { match: MatchData }) {
  if (!match.lineups) return <div className="lp-empty">Lineup data is not available for this match.</div>;
  return <div className="lp-wrap"><div className="lp-pitch"><div className="lp-field-deco"><i /><i /><i /><i /></div><Half lineup={match.lineups.home} team={match.home} date={match.date} side="home" /><Half lineup={match.lineups.away} team={match.away} date={match.date} side="away" flipped /></div><div className="lp-bench-section"><header>Bench</header><div className="lp-bench-grid"><Bench players={match.lineups.home.bench} team={match.home} date={match.date} side="home" /><Bench players={match.lineups.away.bench} team={match.away} date={match.date} side="away" /></div></div></div>;
}
