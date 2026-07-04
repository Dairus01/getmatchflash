"use client";

import { use, useMemo } from "react";
import Link from "next/link";
import MatchLayout from "../../components/MatchLayout";
import MatchReplay from "../../components/match/MatchReplay";
import { MATCHES } from "../../data/matches";
import MatchExperience from "../../components/MatchExperience";

export default function MatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const fixtureId = Number(id);
  const match = useMemo(() => MATCHES.find((item) => item.id === Number(id)), [id]);
  if (fixtureId === 18257865 || fixtureId === 18257739) return <MatchLayout><MatchExperience fixtureId={fixtureId} /></MatchLayout>;
  if (!match) return <MatchLayout><div className="mf-match-page mf-not-found"><p>Match not found.</p><Link href="/" className="mf-back-link">← Back to archive</Link></div></MatchLayout>;
  return <MatchLayout><MatchReplay match={match} /></MatchLayout>;
}
