"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import CountryFlag from "./CountryFlag";
import { fetchMatches, type MatchSnapshot } from "../lib/match-api";

const fallbackFixtures: MatchSnapshot[] = [];

function formatKickoff(value: string) {
  return new Intl.DateTimeFormat("en", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function countdown(value: string) {
  const difference = Math.max(0, new Date(value).getTime() - Date.now());
  const hours = Math.floor(difference / 3_600_000);
  const days = Math.floor(hours / 24);
  return days ? `${days}d ${hours % 24}h` : `${hours}h ${Math.floor((difference % 3_600_000) / 60_000)}m`;
}

export default function UpcomingMatches() {
  const [matches, setMatches] = useState<MatchSnapshot[]>(fallbackFixtures);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const load = () => fetchMatches("upcoming", controller.signal).then((items) => { const active = items.filter((item) => item.status === "upcoming" || item.status === "live"); setMatches(active); setConnected(true); }).catch(() => undefined);
    void load();
    const timer = window.setInterval(load, 30_000);
    return () => { controller.abort(); window.clearInterval(timer); };
  }, []);

  return <section id="upcoming" className="mf-upcoming-section" aria-labelledby="upcoming-title">
    <div className="mf-section-heading">
      <div><p className="mf-cinematic-eyebrow">NEXT ON THE PITCH</p><h2 id="upcoming-title">Upcoming Matches</h2></div>
      <p>Predict the next chapter before it happens.</p>
    </div>
    <div className="mf-upcoming-grid">
      {matches.length === 0 ? (
        <div className="mf-no-upcoming" style={{ gridColumn: "1 / -1", padding: "2rem", textAlign: "center", background: "var(--bg-glass)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border-light)" }}>
          <p style={{ color: "var(--text-secondary)", fontSize: "1.125rem" }}>{connected ? "There are no upcoming matches available at this time." : "Loading upcoming matches..."}</p>
        </div>
      ) : (
        matches.map((match) => <Link href={`/match/${match.fixtureId}`} className="mf-upcoming-card" key={match.fixtureId}>
          <div className="mf-upcoming-card-top"><span className="mf-upcoming-status"><i /> {match.status === "live" ? "Live now" : "Upcoming"}</span><span>{match.competition}</span></div>
          <div className="mf-upcoming-teams">
            <span><CountryFlag country={match.homeTeam} size="card" />{match.homeTeam}</span>
            <b>vs</b>
            <span><CountryFlag country={match.awayTeam} size="card" />{match.awayTeam}</span>
          </div>
          <div className="mf-upcoming-card-bottom"><span>{formatKickoff(match.kickoffAt)}</span><strong>{match.status === "live" ? "Open live match" : `Starts in ${countdown(match.kickoffAt)}`}</strong></div>
        </Link>)
      )}
    </div>
    <p className={`mf-data-note ${connected ? "mf-data-note-live" : ""}`}><i /> {connected ? "Live from MatchFlash API" : "Fixture schedule cached for preview · API reconnecting"}</p>
  </section>;
}
