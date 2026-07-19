"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import MatchLayout from "../components/MatchLayout";
import CountryFlag from "../components/CountryFlag";
import { MATCHES } from "../data/matches";

const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001").replace(/\/$/, "");

type LiveCompleted = {
  fixtureId: number;
  homeTeam: string;
  awayTeam: string;
  competition: string;
  kickoffAt: string;
  finalScore: [number, number];
  totalEvents: number;
};

export default function ArchivePage() {
  const [query, setQuery] = useState("");
  const [liveCompleted, setLiveCompleted] = useState<LiveCompleted[]>([]);

  useEffect(() => {
    fetch(`${API_URL}/api/completed`, { cache: "no-store" })
      .then((r) => r.ok ? r.json() as Promise<{ matches: LiveCompleted[] }> : Promise.resolve({ matches: [] }))
      .then(({ matches }) => {
        // Only include matches not already in the static bundle
        const staticIds = new Set(MATCHES.map((m) => m.id));
        setLiveCompleted(matches.filter((m) => !staticIds.has(m.fixtureId)));
      })
      .catch(() => undefined);
  }, []);

  // Merge: live-completed first (most recent, not yet in bundle), then static archive
  const staticMatches = MATCHES.filter((match) =>
    !query ||
    match.home.toLowerCase().includes(query.toLowerCase()) ||
    match.away.toLowerCase().includes(query.toLowerCase()),
  );
  const filteredLive = liveCompleted.filter((m) =>
    !query ||
    m.homeTeam.toLowerCase().includes(query.toLowerCase()) ||
    m.awayTeam.toLowerCase().includes(query.toLowerCase()),
  );
  const totalCount = filteredLive.length + staticMatches.length;

  return (
    <MatchLayout>
      <div className="mf-home mf-archive-index">
        <Link href="/" className="mf-back-link">← Match centre</Link>
        <section className="mf-archive-index-hero">
          <p className="mf-cinematic-eyebrow">THE RECORD, OPENED</p>
          <h1>World Cup Archive</h1>
          <p>Replay every verified moment from the MatchFlash archive, reconstructed from TxLINE event history.</p>
          <label className="mf-search-wrap">
            <span className="mf-search-label">Search the archive</span>
            <input className="mf-search-input" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search a team" />
          </label>
        </section>
        <div className="mf-archive-head">
          <h2 className="mf-archive-title">Completed matches</h2>
          <span className="mf-archive-count">{totalCount} MATCHES</span>
        </div>
        <div className="mf-match-grid">
          {/* Live-captured matches (not yet in the static bundle) */}
          {filteredLive.map((match) => (
            <article className="mf-match-card mf-match-card-live" key={match.fixtureId}>
              <div className="mf-card-top">
                <span>{new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(match.kickoffAt))}</span>
                <span>{match.totalEvents.toLocaleString()} EVENTS</span>
              </div>
              <div className="mf-match-teams">
                <span className="mf-card-team"><CountryFlag country={match.homeTeam} size="card" />{match.homeTeam}</span>
                <span className="mf-vs">{match.finalScore[0]}–{match.finalScore[1]}</span>
                <span className="mf-card-team"><CountryFlag country={match.awayTeam} size="card" />{match.awayTeam}</span>
              </div>
              <div className="mf-match-meta">
                <span>Live-captured · full event history</span>
                <span className="mf-verified-badge"><b>✓</b> TxLINE verified</span>
              </div>
              <Link href={`/match/${match.fixtureId}`} className="mf-view-btn">
                <span>▶</span> View replay <span className="mf-view-arrow">↗</span>
              </Link>
            </article>
          ))}
          {/* Static archive bundle */}
          {staticMatches.map((match) => (
            <article className="mf-match-card" key={match.id}>
              <div className="mf-card-top">
                <span>{match.date}</span>
                <span>{match.totalEvents.toLocaleString()} EVENTS</span>
              </div>
              <div className="mf-match-teams">
                <span className="mf-card-team"><CountryFlag country={match.home} size="card" />{match.home}</span>
                <span className="mf-vs">vs</span>
                <span className="mf-card-team"><CountryFlag country={match.away} size="card" />{match.away}</span>
              </div>
              <div className="mf-match-meta">
                <span>Full event history captured</span>
                <span className="mf-verified-badge"><b>✓</b> TxLINE verified</span>
              </div>
              <Link href={`/match/${match.id}`} className="mf-view-btn">
                <span>▶</span> View replay <span className="mf-view-arrow">↗</span>
              </Link>
            </article>
          ))}
        </div>
      </div>
    </MatchLayout>
  );
}
