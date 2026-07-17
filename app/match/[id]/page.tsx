import { Suspense } from "react";
import Link from "next/link";
import MatchLayout from "../../components/MatchLayout";
import MatchReplay from "../../components/match/MatchReplay";
import { MATCHES } from "../../data/matches";
import MatchExperience from "../../components/MatchExperience";
import { fetchMatch } from "../../lib/match-api";

async function LiveMatchLoader({ fixtureId }: { fixtureId: number }) {
  const liveMatch = await fetchMatch(fixtureId, { next: { revalidate: 60 } });
  if (!liveMatch) {
    return (
      <div className="mf-experience-page mf-not-found">
        <p>Match not found.</p>
        <Link href="/" className="mf-back-link">← Back to match centre</Link>
      </div>
    );
  }
  return <MatchExperience initialMatch={liveMatch} />;
}

export default async function MatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const fixtureId = Number(id);
  const match = MATCHES.find((item) => item.id === Number(id));

  if (fixtureId === 18257865 || fixtureId === 18257739) {
    return (
      <MatchLayout>
        <Suspense fallback={<div className="mf-experience-page"><p className="mf-loading-line" /> <p className="mf-loading-line mf-loading-line-short" /></div>}>
          <LiveMatchLoader fixtureId={fixtureId} />
        </Suspense>
      </MatchLayout>
    );
  }

  if (!match) {
    return (
      <MatchLayout>
        <div className="mf-match-page mf-not-found">
          <p>Match not found.</p>
          <Link href="/" className="mf-back-link">← Back to archive</Link>
        </div>
      </MatchLayout>
    );
  }

  return (
    <MatchLayout>
      <MatchReplay match={match} />
    </MatchLayout>
  );
}
