"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import CountryFlag from "./CountryFlag";
import { castVote, fetchMatch, type MatchSnapshot, type PredictionChoice } from "../lib/match-api";



function formatDate(value: string) { return new Intl.DateTimeFormat("en", { weekday: "long", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value)); }
function formatCountdown(value: string) { const ms = Math.max(0, new Date(value).getTime() - Date.now()); const hours = Math.floor(ms / 3_600_000); return `${Math.floor(hours / 24)}d ${hours % 24}h ${Math.floor((ms % 3_600_000) / 60_000)}m`; }
function label(choice: PredictionChoice, match: MatchSnapshot) { return choice === "home" ? `${match.homeTeam} win` : choice === "away" ? `${match.awayTeam} win` : "Draw"; }

function VotePanel({ match, onVote }: { match: MatchSnapshot; onVote: (choice: PredictionChoice) => Promise<void> }) {
  const [selected, setSelected] = useState<PredictionChoice | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const vote = async (choice: PredictionChoice) => { setSelected(choice); setPending(true); setError(""); try { await onVote(choice); } catch { setError("Your vote could not be saved. Try again."); } finally { setPending(false); } };
  return <section className="mf-vote-panel" aria-labelledby="community-title">
    <div className="mf-panel-heading"><div><p>Community Prediction</p><h2 id="community-title">Call it before kickoff.</h2></div><span>{match.community.total} votes</span></div>
    <div className="mf-vote-options">{(["home", "draw", "away"] as PredictionChoice[]).map((choice) => <button key={choice} type="button" disabled={pending} className={selected === choice ? "is-selected" : ""} onClick={() => vote(choice)}><span>{label(choice, match)}</span><b>{match.community.percentages[choice]}%</b></button>)}</div>
    <div className="mf-community-bars">{(["home", "draw", "away"] as PredictionChoice[]).map((choice) => <div key={choice}><span>{label(choice, match)}</span><i><em style={{ width: `${match.community.percentages[choice]}%` }} /></i></div>)}</div>
    {error && <p className="mf-form-error" role="alert">{error}</p>}
  </section>;
}

function MarketBars({ match }: { match: MatchSnapshot }) {
  return <section className="mf-market-panel" aria-labelledby="market-title"><div className="mf-panel-heading"><div><p>TxODDS market</p><h2 id="market-title">Market Consensus</h2></div><span>Updated continuously</span></div><div className="mf-market-layout"><div className="mf-market-donut" style={{ background: `conic-gradient(var(--mf-market) 0 ${match.market.home}%, var(--mf-flash) ${match.market.home}% ${match.market.home + match.market.draw}%, var(--mf-positive) ${match.market.home + match.market.draw}% 100%)` }}><span>1X2</span></div><div className="mf-market-bars">{(["home", "draw", "away"] as PredictionChoice[]).map((choice) => <div key={choice}><div><span>{label(choice, match)}</span><strong>{match.market[choice]}%</strong></div><i><em className={`mf-market-fill-${choice}`} style={{ width: `${match.market[choice]}%` }} /></i></div>)}</div></div><p className="mf-provenance-line"><i /> Probability supplied by TxODDS · fixture {match.fixtureId}</p></section>;
}

function UpcomingView({ initial, onRefresh }: { initial: MatchSnapshot; onRefresh: () => Promise<MatchSnapshot | undefined> }) {
  const [match, setMatch] = useState(initial);
  useEffect(() => { const timer = window.setInterval(() => { onRefresh().then((next) => { if (next) setMatch(next); }); }, 30_000); return () => window.clearInterval(timer); }, [onRefresh]);
  const handleVote = async (choice: PredictionChoice) => { const result = await castVote(match.fixtureId, choice); setMatch((current) => ({ ...current, community: { total: result.total, counts: result.counts, percentages: result.percentages } })); };
  return <div className="mf-experience-page"><Link href="/" className="mf-back-link">← Match centre</Link><p className="mf-mode-pill"><i className="mf-mode-dot" /> Upcoming</p><section className="mf-experience-hero"><p className="mf-cinematic-eyebrow">WORLD CUP 2026</p><h1>{match.homeTeam} <span>vs</span> {match.awayTeam}</h1><p className="mf-experience-kickoff">Kickoff · {formatDate(match.kickoffAt)}</p><div className="mf-countdown"><small>Starts in</small><strong>{formatCountdown(match.kickoffAt)}</strong></div><div className="mf-experience-teams"><span><CountryFlag country={match.homeTeam} size="crest" />{match.homeTeam}</span><b>0 — 0</b><span><CountryFlag country={match.awayTeam} size="crest" />{match.awayTeam}</span></div></section><div className="mf-experience-grid"><MarketBars match={match} /><VotePanel match={match} onVote={handleVote} /></div><p className="mf-transition-note">This fixture will switch to Live automatically when the TxLINE state changes.</p></div>;
}

function LiveView({ initial }: { initial: MatchSnapshot }) {
  const [match, setMatch] = useState(initial);
  const [choice, setChoice] = useState<PredictionChoice | null>(null);
  useEffect(() => { const timer = window.setInterval(() => { fetchMatch(match.fixtureId).then(setMatch).catch(() => undefined); }, 10_000); return () => window.clearInterval(timer); }, [match.fixtureId]);
  const vote = async (next: PredictionChoice) => { const result = await castVote(match.fixtureId, next); setChoice(next); setMatch((current) => ({ ...current, community: { total: result.total, counts: result.counts, percentages: result.percentages } })); };
  return <div className="mf-experience-page"><Link href="/" className="mf-back-link">← Match centre</Link><p className="mf-mode-pill mf-mode-pill-live"><i className="mf-mode-dot mf-mode-dot-playing" /> Live now</p><section className="mf-live-hero"><div><p className="mf-cinematic-eyebrow">{match.competition}</p><h1>{match.homeTeam} <span>vs</span> {match.awayTeam}</h1><p className="mf-live-feed-label">Live event stream · TxLINE verified</p></div><div className="mf-live-score"><strong>{match.score.home} — {match.score.away}</strong><span>LIVE</span></div></section><div className="mf-live-grid"><section className="mf-live-market"><p>Live probability</p><div className="mf-live-probabilities">{(["home", "draw", "away"] as PredictionChoice[]).map((key) => <div key={key}><strong>{match.market[key]}%</strong><span>{label(key, match)}</span><i><em style={{ width: `${match.market[key]}%` }} /></i></div>)}</div><div className="mf-momentum-rail"><span>Momentum</span><i><em style={{ width: `${match.market.home}%` }} /></i><b>{match.homeTeam}</b></div></section><section className="mf-live-events"><div className="mf-panel-heading"><div><p>Latest event</p><h2>Live event feed</h2></div><span><i /> Polling every 10s</span></div><article><strong>{match.latestEvent ?? "Waiting for the next on-pitch update"}</strong><p>{match.latestEvent ? "The latest verified TxLINE event has moved the match state." : "The stream is connected. New goals, shots, cards and VAR moments will appear here."}</p></article></section></div><section className="mf-live-vote"><div><p>Community prediction</p><h2>Keep your call live.</h2></div><div>{(["home", "draw", "away"] as PredictionChoice[]).map((key) => <button key={key} type="button" className={choice === key ? "is-selected" : ""} onClick={() => vote(key)}>{label(key, match)} <b>{match.community.percentages[key]}%</b></button>)}</div></section></div>;
}

export default function MatchExperience({ initialMatch }: { initialMatch: MatchSnapshot }) {
  const [match, setMatch] = useState<MatchSnapshot>(initialMatch);
  const refresh = () => fetchMatch(initialMatch.fixtureId).then((next) => { if (next) setMatch(next); return next; }).catch(() => undefined);
  return match.status === "live" ? <LiveView initial={match} /> : <UpcomingView initial={match} onRefresh={refresh} />;
}
