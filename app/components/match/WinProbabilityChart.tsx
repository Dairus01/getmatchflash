import { useMemo } from "react";
import type { MatchData } from "../../data/matches";

const toY = (probability: number) => 55 - probability * 0.5;

export default function WinProbabilityChart({ match, elapsed, probability }: { match: MatchData; elapsed: number; probability: number }) {
  const points = useMemo(() => {
    const width = 360;
    const result: [number, number][] = [[0, toY(50)]];
    let last = 50;
    for (const event of match.events) {
      if (event.sec > elapsed || event.probAfter === undefined) continue;
      const x = (event.sec / match.maxSec) * width;
      result.push([x, toY(last)], [x, toY(event.probAfter)]);
      last = event.probAfter;
    }
    const x = (elapsed / match.maxSec) * width;
    if (result.at(-1)?.[0] !== x) result.push([x, toY(probability)]);
    return result;
  }, [elapsed, match, probability]);
  const line = points.map(([x, y]) => `${x},${y}`).join(" ");
  const currentX = (elapsed / match.maxSec) * 360;
  return <svg width="100%" height="60" viewBox="0 0 360 60" preserveAspectRatio="none" className="mf-chart-svg" aria-label="Estimated match momentum chart">
    <defs><linearGradient id="momentum-area" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--mf-market)" stopOpacity=".26" /><stop offset="100%" stopColor="var(--mf-market)" stopOpacity="0" /></linearGradient></defs>
    <line x1="0" y1={toY(50)} x2="360" y2={toY(50)} className="mf-chart-baseline" />
    <polygon points={`${line} ${currentX},60 0,60`} fill="url(#momentum-area)" />
    <polyline points={line} fill="none" className="mf-chart-line" />
    {elapsed > 0 && <circle cx={currentX} cy={toY(probability)} r="3" className="mf-chart-dot" />}
  </svg>;
}
