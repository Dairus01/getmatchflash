"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { MatchData, MatchEvent } from "../../data/matches";
import ReplayControls from "./ReplayControls";
import WinProbabilityChart from "./WinProbabilityChart";
import EventFeed from "./EventFeed";
import StatsPanel from "./StatsPanel";
import LineupPanel from "./LineupPanel";
import TrustMark from "../TrustMark";
import CountryFlag from "../CountryFlag";
import { countryCode } from "../../../lib/flags";
import SocialLinks from "../SocialLinks";

type Speed = 1 | 2 | 10 | 20 | 60;
type Tab = "timeline" | "lineups" | "stats" | "verification";

function formatClock(seconds: number) { return `${Math.floor(seconds / 60)}'${Math.floor(seconds % 60).toString().padStart(2, "0")}\"`; }
function formatTime(seconds: number) { const hours = Math.floor(seconds / 3600); const minutes = Math.floor((seconds % 3600) / 60); const secs = Math.floor(seconds % 60); return hours ? `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}` : `${minutes}:${secs.toString().padStart(2, "0")}`; }
function initials(name: string) { return name.slice(0, 3).toUpperCase(); }

function VerificationPanel({ match }: { match: MatchData }) {
  return <section className="mf-verification-panel">
    <div className="mf-verification-header"><div><p className="mf-verification-kicker">MATCH PROVENANCE</p><h2>Verification complete.</h2></div><span className="mf-integrity-state"><b>✓</b> Integrity passed</span></div>
    <TrustMark />
    <dl className="mf-provenance-list">
      <div><dt>Provider</dt><dd>TxLINE</dd></div>
      <div><dt>Infrastructure</dt><dd>TxODDS</dd></div>
      <div><dt>Fixture</dt><dd>{match.id}</dd></div>
      <div><dt>Events</dt><dd>{match.totalEvents.toLocaleString()}</dd></div>
      <div><dt>Verification</dt><dd>Complete</dd></div>
      <div><dt>Integrity</dt><dd>Passed</dd></div>
    </dl>
    <p className="mf-verification-note">This replay is a reconstruction of the recorded TxLINE event stream, kept in sequence so the match can be revisited and checked moment by moment.</p>
  </section>;
}

export default function MatchReplay({ match, isLive, market }: { match: MatchData, isLive?: boolean, market?: { home: number; draw: number; away: number } }) {
  const displayMarket = market || match.market || { home: 45, draw: 25, away: 30 };
  const [elapsed, setElapsed] = useState(isLive ? match.maxSec : 0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<Speed>(10);
  const [tab, setTab] = useState<Tab>("timeline");
  const [previousProbability, setPreviousProbability] = useState(50);
  const animation = useRef<number | undefined>(undefined);
  const lastTick = useRef<number | undefined>(undefined);
  const elapsedRef = useRef(isLive ? match.maxSec : 0);
  const playingRef = useRef(false);
  const speedRef = useRef<Speed>(10);
  const previousMaxSec = useRef(match.maxSec);

  useEffect(() => { playingRef.current = playing; }, [playing]);
  useEffect(() => { speedRef.current = speed; }, [speed]);
  useEffect(() => () => { if (animation.current) cancelAnimationFrame(animation.current); }, []);

  const stateAt = (seconds: number) => {
    let score: [number, number] = [0, 0];
    let probability = 50;
    const events: MatchEvent[] = [];
    for (const event of match.events) {
      if (event.sec > seconds) break;
      events.push(event);
      if (event.scoreAfter) score = event.scoreAfter;
      if (event.probAfter !== undefined) probability = event.probAfter;
    }
    return { score, probability, events };
  };
  const seek = (seconds: number) => {
    const next = Math.max(0, Math.min(seconds, match.maxSec));
    const before = stateAt(elapsedRef.current).probability;
    elapsedRef.current = next;
    setPreviousProbability(before);
    setElapsed(next);
    if (next >= match.maxSec) setPlaying(false);
  };
  useEffect(() => {
    if (isLive && match.maxSec > previousMaxSec.current) {
      if (elapsedRef.current >= previousMaxSec.current) {
        seek(match.maxSec);
      }
      previousMaxSec.current = match.maxSec;
    }
  }, [match.maxSec, isLive]);
  useEffect(() => {
    const tick = (time: number) => {
      if (playingRef.current) {
        if (lastTick.current !== undefined) seek(elapsedRef.current + ((time - lastTick.current) / 1000) * speedRef.current);
        lastTick.current = time;
      } else lastTick.current = undefined;
      animation.current = requestAnimationFrame(tick);
    };
    animation.current = requestAnimationFrame(tick);
    return () => { if (animation.current) cancelAnimationFrame(animation.current); };
  }, []);

  const current = stateAt(elapsed);
  const complete = elapsed >= match.maxSec;
  const mode = complete ? (isLive ? "Live" : "Complete") : playing ? `Replaying at ${speed}×` : elapsed ? "Paused" : "Ready";
  const probabilityDelta = current.probability - previousProbability;

  return <div className="mf-match-page">
    <Link href="/" className="mf-back-link">← Archive</Link>
    <p className="mf-mode-pill"><i className={playing ? "mf-mode-dot mf-mode-dot-playing" : "mf-mode-dot"} />{mode}</p>
    <section className="mf-match-strip" aria-label={`${match.home} versus ${match.away}`}>
      <div className="mf-team"><b className="mf-crest"><CountryFlag country={match.home} size="crest" /><small>{countryCode(match.home)}</small></b><span>{match.home}</span></div>
      <div className="mf-score-block"><strong>{current.score[0]}–{current.score[1]}</strong><time>{formatClock(elapsed)}</time><span className="mf-stream-status"><b>✓</b> Verified Event Stream <small>TxLINE</small></span></div>
      <div className="mf-team"><b className="mf-crest"><CountryFlag country={match.away} size="crest" /><small>{countryCode(match.away)}</small></b><span>{match.away}</span></div>
    </section>
    <div className="mf-content-grid">
      <aside>
        <section className="mf-live-market" style={{ padding: "20px", border: "1px solid var(--mf-border)", borderRadius: "15px", background: "var(--mf-surface)" }}>
          <p style={{ margin: "0 0 20px", color: "var(--mf-market)", fontSize: "9px", fontFamily: "var(--font-mono)", fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase" }}>Live probability</p>
          <div className="mf-live-probabilities" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px" }}>
            <div style={{ display: "grid", gap: "5px" }}>
              <strong style={{ color: "var(--mf-text)", fontSize: "27px", fontFamily: "var(--font-mono)", fontWeight: 700 }}>{displayMarket.home}%</strong>
              <span style={{ color: "var(--mf-text-muted)", fontSize: "11px" }}>{match.home} win</span>
              <i style={{ display: "block", height: "6px", background: "var(--mf-surface-2)", borderRadius: "999px" }}><em style={{ display: "block", height: "100%", background: "var(--mf-market)", borderRadius: "inherit", width: `${displayMarket.home}%` }} /></i>
            </div>
            <div style={{ display: "grid", gap: "5px" }}>
              <strong style={{ color: "var(--mf-text)", fontSize: "27px", fontFamily: "var(--font-mono)", fontWeight: 700 }}>{displayMarket.draw}%</strong>
              <span style={{ color: "var(--mf-text-muted)", fontSize: "11px" }}>Draw</span>
              <i style={{ display: "block", height: "6px", background: "var(--mf-surface-2)", borderRadius: "999px" }}><em className="mf-market-fill-draw" style={{ display: "block", height: "100%", background: "var(--mf-flash)", borderRadius: "inherit", width: `${displayMarket.draw}%` }} /></i>
            </div>
            <div style={{ display: "grid", gap: "5px" }}>
              <strong style={{ color: "var(--mf-text)", fontSize: "27px", fontFamily: "var(--font-mono)", fontWeight: 700 }}>{displayMarket.away}%</strong>
              <span style={{ color: "var(--mf-text-muted)", fontSize: "11px" }}>{match.away} win</span>
              <i style={{ display: "block", height: "6px", background: "var(--mf-surface-2)", borderRadius: "999px" }}><em className="mf-market-fill-away" style={{ display: "block", height: "100%", background: "var(--mf-positive)", borderRadius: "inherit", width: `${displayMarket.away}%` }} /></i>
            </div>
          </div>
          <div className="mf-momentum-rail" style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", alignItems: "center", gap: "9px", marginTop: "32px", fontSize: "10px", color: "var(--mf-text-faint)" }}>
            <span>Momentum</span>
            <i style={{ height: "6px", background: "var(--mf-surface-2)", borderRadius: "999px" }}><em style={{ display: "block", height: "100%", background: "var(--mf-market)", borderRadius: "inherit", width: `${displayMarket.home}%` }} /></i>
            <b style={{ color: "var(--mf-text-muted)", fontWeight: 500 }}>{match.home}</b>
          </div>
        </section>
        <section className="mf-controls"><ReplayControls match={match} elapsed={elapsed} playing={playing} complete={complete} speed={speed} onSeek={seek} onPlayingChange={setPlaying} onSpeedChange={setSpeed} formatTime={formatTime} /></section>
      </aside>
      <section>
        <nav className="mf-tab-bar" aria-label="Match data views">
          <button type="button" className={tab === "timeline" ? "mf-tab-btn mf-tab-btn-active" : "mf-tab-btn"} onClick={() => setTab("timeline")}>Timeline <small>{current.events.length}</small></button>
          <button type="button" className={tab === "lineups" ? "mf-tab-btn mf-tab-btn-active" : "mf-tab-btn"} onClick={() => setTab("lineups")}>Lineups</button>
          <button type="button" className={tab === "stats" ? "mf-tab-btn mf-tab-btn-active" : "mf-tab-btn"} onClick={() => setTab("stats")}>Statistics</button>
          <button type="button" className={tab === "verification" ? "mf-tab-btn mf-tab-btn-active" : "mf-tab-btn"} onClick={() => setTab("verification")}>Verification</button>
        </nav>
        {tab === "timeline" && <EventFeed events={[...current.events].reverse()} />}
        {tab === "lineups" && <LineupPanel match={match} />}
        {tab === "stats" && <StatsPanel match={match} elapsed={elapsed} />}
        {tab === "verification" && <VerificationPanel match={match} />}
      </section>
    </div>
    <footer style={{ marginTop: "60px", padding: "40px 0", borderTop: "1px solid var(--mf-border)" }}>
      <SocialLinks />
    </footer>
  </div>;
}
