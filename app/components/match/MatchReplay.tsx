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

export default function MatchReplay({ match }: { match: MatchData }) {
  const [elapsed, setElapsed] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<Speed>(10);
  const [tab, setTab] = useState<Tab>("timeline");
  const [previousProbability, setPreviousProbability] = useState(50);
  const animation = useRef<number | undefined>(undefined);
  const lastTick = useRef<number | undefined>(undefined);
  const elapsedRef = useRef(0);
  const playingRef = useRef(false);
  const speedRef = useRef<Speed>(10);

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
  const mode = complete ? "Complete" : playing ? `Replaying at ${speed}×` : elapsed ? "Paused" : "Ready";
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
        <section className="mf-chart-panel">
          <p>{match.home} estimated match-momentum probability</p>
          <strong>{current.probability}% {probabilityDelta !== 0 && <small className={probabilityDelta > 0 ? "mf-positive" : "mf-negative"}>{probabilityDelta > 0 ? "▲" : "▼"} {Math.abs(probabilityDelta)} pts</small>}</strong>
          <WinProbabilityChart match={match} elapsed={elapsed} probability={current.probability} />
          <footer><span>Kickoff</span><span>{formatClock(elapsed)}</span></footer>
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
  </div>;
}
