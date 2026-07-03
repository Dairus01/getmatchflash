"use client";

import { useEffect, useRef, useState } from "react";
import type { MatchData } from "../../data/matches";

type Speed = 1 | 2 | 10 | 20 | 60;

type Props = {
  match: MatchData;
  elapsed: number;
  playing: boolean;
  complete: boolean;
  speed: Speed;
  onSeek: (seconds: number) => void;
  onPlayingChange: (playing: boolean) => void;
  onSpeedChange: (speed: Speed) => void;
  formatTime: (seconds: number) => string;
};

const speeds: Speed[] = [1, 2, 10, 20, 60];

export default function ReplayControls({ match, elapsed, playing, complete, speed, onSeek, onPlayingChange, onSpeedChange, formatTime }: Props) {
  const track = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const seekFromClientX = (clientX: number) => {
    const bounds = track.current?.getBoundingClientRect();
    if (!bounds) return;
    const offset = Math.min(bounds.width, Math.max(0, clientX - bounds.left));
    onSeek((offset / bounds.width) * match.maxSec);
  };

  useEffect(() => {
    if (!dragging) return;
    const move = (event: MouseEvent) => seekFromClientX(event.clientX);
    const up = () => setDragging(false);
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
  }, [dragging]);

  const progress = (elapsed / match.maxSec) * 100;
  const playLabel = complete ? "Replay Again" : playing ? "Pause" : elapsed === 0 ? "Play Replay" : "Resume";

  return (
    <>
      <div className="mf-progress-row">
        <div className="mf-progress-track" ref={track} onMouseDown={(event) => { event.preventDefault(); setDragging(true); onPlayingChange(false); seekFromClientX(event.clientX); }}>
          <div className="mf-progress-fill" style={{ width: `${progress}%` }} />
          {match.events.filter((event) => event.action === "goal").map((goal) => <span key={goal.id} className="mf-goal-dot" style={{ left: `${(goal.sec / match.maxSec) * 100}%` }} title={`Goal — ${Math.floor(goal.sec / 60)}'`} />)}
          <span className="mf-progress-thumb" style={{ left: `${progress}%` }} />
        </div>
        <output className="mf-progress-time">{formatTime(elapsed)} / {formatTime(match.maxSec)}</output>
      </div>
      <div className="mf-controls-row">
        <button className="mf-play-btn" type="button" onClick={() => complete ? onSeek(0) : onPlayingChange(!playing)}>
          <span aria-hidden="true">{playing ? "Ⅱ" : "▶"}</span>{playLabel}
        </button>
        <div className="mf-speed-select" aria-label="Replay speed">
          {speeds.map((value) => <button key={value} type="button" className={`mf-speed-opt ${speed === value ? "mf-speed-opt-selected" : ""}`} onClick={() => onSpeedChange(value)}>{value}×</button>)}
        </div>
      </div>
    </>
  );
}
