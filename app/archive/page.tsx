"use client";

import Link from "next/link";
import { useState } from "react";
import MatchLayout from "../components/MatchLayout";
import CountryFlag from "../components/CountryFlag";
import { MATCHES } from "../data/matches";

export default function ArchivePage() {
  const [query, setQuery] = useState("");
  const matches = MATCHES.filter((match) => `${match.home} ${match.away}`.toLowerCase().includes(query.toLowerCase()));
  return <MatchLayout><div className="mf-home mf-archive-index"><Link href="/" className="mf-back-link">← Match centre</Link><section className="mf-archive-index-hero"><p className="mf-cinematic-eyebrow">THE RECORD, OPENED</p><h1>World Cup Archive</h1><p>Replay every verified moment from the MatchFlash archive, reconstructed from TxLINE event history.</p><label className="mf-search-wrap"><span className="mf-search-label">Search the archive</span><input className="mf-search-input" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search a team" /></label></section><div className="mf-archive-head"><h2 className="mf-archive-title">Completed matches</h2><span className="mf-archive-count">{matches.length} MATCHES</span></div><div className="mf-match-grid">{matches.map((match) => <article className="mf-match-card" key={match.id}><div className="mf-card-top"><span>{match.date}</span><span>{match.totalEvents.toLocaleString()} EVENTS</span></div><div className="mf-match-teams"><span className="mf-card-team"><CountryFlag country={match.home} size="card" />{match.home}</span><span className="mf-vs">vs</span><span className="mf-card-team"><CountryFlag country={match.away} size="card" />{match.away}</span></div><div className="mf-match-meta"><span>Full event history captured</span><span className="mf-verified-badge"><b>✓</b> TxLINE verified</span></div><Link href={`/match/${match.id}`} className="mf-view-btn"><span>▶</span> View replay <span className="mf-view-arrow">↗</span></Link></article>)}</div></div></MatchLayout>;
}

