#!/usr/bin/env node
/**
 * Converts the saved TxLINE historical feeds into the compact, browser-ready
 * replay data used by the MatchFlash archive. Run after adding archive JSON.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const archiveDir = path.join(__dirname, '..', 'server', '.data', 'world_cup_archives');
const outputPath = path.join(__dirname, '..', 'app', 'data', 'matches.ts');

const KEEP = new Set([
  'venue', 'pitch', 'weather', 'jersey', 'kickoff_team', 'kickoff',
  'halftime_finalised', 'status', 'game_finalised', 'additional_time',
  'goal', 'shot', 'corner', 'free_kick', 'throw_in', 'goal_kick',
  'high_danger_possession', 'possible', 'yellow_card', 'red_card',
  'substitution', 'injury', 'var', 'var_end', 'penalty',
]);

const EVENT_ACTIONS = new Set([
  'prematch_info', 'jersey', 'kickoff_team', 'kickoff', 'halftime',
  'fulltime', 'additional_time', 'goal', 'penalty', 'yellow_card',
  'red_card', 'substitution', 'injury', 'shot', 'corner', 'free_kick',
  'throw_in', 'goal_kick', 'big_chance', 'near_miss', 'var', 'var_result',
]);

function nameOf(value) {
  if (!value) return undefined;
  const parts = value.split(', ');
  return parts.length === 2 ? `${parts[1]} ${parts[0]}` : value;
}

function playerMap(events) {
  const lineupEvent = events.find((event) => event.Action === 'lineups' && Array.isArray(event.Lineups));
  const players = {};
  for (const team of lineupEvent?.Lineups ?? []) {
    for (const row of team.lineups ?? []) {
      const player = row.player;
      if (player?.normativeId) {
        players[player.normativeId] = {
          name: nameOf(player.preferredName) ?? 'Unknown player',
          number: String(row.rosterNumber ?? ''),
          positionId: [34, 35, 36, 37].includes(row.positionId) ? row.positionId : 36,
          dob: player.dateOfBirth ?? null,
          photo: player.photo ?? player.image ?? undefined,
          starter: Boolean(row.starter),
        };
      }
    }
  }
  return players;
}

function lineups(events, players) {
  const lineupEvent = events.find((event) => event.Action === 'lineups' && Array.isArray(event.Lineups));
  const finalEvent = [...events].reverse().find((event) => event.Action === 'game_finalised');
  if (!lineupEvent?.Lineups || lineupEvent.Lineups.length < 2) return undefined;
  const playerStats = Object.assign({}, ...(Object.values(finalEvent?.PlayerStats ?? {})));
  const mapTeam = (team) => {
    const members = team.lineups ?? [];
    const starters = members.filter((member) => member.starter);
    const mapPlayer = (member) => {
      const base = players[member.player?.normativeId];
      const stats = playerStats[member.player?.normativeId] ?? {};
      return {
        id: member.player?.normativeId ?? 0,
        name: base?.name ?? 'Unknown player',
        number: base?.number ?? '',
        positionId: base?.positionId ?? 36,
        dob: base?.dob ?? null,
        ...(base?.photo ? { photo: base.photo } : {}),
        goals: stats.goals ?? 0,
        yellowCards: stats.yellowCards ?? 0,
        redCards: stats.redCards ?? 0,
      };
    };
    const count = (positionId) => starters.filter((member) => member.positionId === positionId).length;
    return {
      formation: `${count(35)}-${count(36)}-${count(37)}`,
      starters: starters.map(mapPlayer),
      bench: members.filter((member) => !member.starter).map(mapPlayer),
    };
  };
  return { home: mapTeam(lineupEvent.Lineups[0]), away: mapTeam(lineupEvent.Lineups[1]) };
}

function deduplicate(events) {
  const discarded = new Set(events.filter((event) => event.Action === 'action_discarded').map((event) => event.Id));
  const groups = new Map();
  for (const event of events) {
    if (!groups.has(event.Id)) groups.set(event.Id, []);
    groups.get(event.Id).push(event);
  }
  const output = [];
  for (const [id, group] of groups) {
    if (discarded.has(id) || group.some((event) => event.Action === 'action_discarded')) continue;
    group.sort((a, b) => (a.Seq ?? 0) - (b.Seq ?? 0));
    const confirmed = group.filter((event) => event.Confirmed === true);
    const candidates = confirmed.length ? confirmed : group;
    output.push(candidates.reduce((best, event) =>
      Object.keys(event.Data ?? {}).length >= Object.keys(best.Data ?? {}).length ? event : best));
  }
  return output;
}

function resolveTimes(events) {
  let last = 0;
  return events.map((event) => {
    const clock = event.Clock?.Seconds;
    if (Number.isFinite(clock) && clock >= last) last = clock;
    return { event, sec: Number.isFinite(clock) ? clock : last };
  });
}

function eventText(event, team, opponent, players) {
  const data = event.Data ?? {};
  const player = players[data.PlayerId];
  const inPlayer = players[data.PlayerInId];
  const outPlayer = players[data.PlayerOutId];
  const participant = data.Participant ?? event.Participant ?? 1;
  const currentTeam = participant === 1 ? team.home : team.away;
  const period = { 2: 'first half', 4: 'second half', 7: 'first half of extra time', 9: 'second half of extra time' }[event.StatusId] ?? 'this period';
  const base = { participant, action: undefined, headline: '', sub: undefined };

  switch (event.Action) {
    case 'venue': return { ...base, action: 'prematch_info', headline: `Venue: ${data.Type === 'neutral' ? 'Neutral ground' : data.Type ?? 'Stadium'}.`, sub: 'Match officials make final preparations.' };
    case 'pitch': return { ...base, action: 'prematch_info', headline: `Pitch: ${(data.Conditions ?? []).join(', ') || 'Not recorded'}.` };
    case 'weather': return { ...base, action: 'prematch_info', headline: `Conditions: ${(data.Conditions ?? []).join(', ') || 'Not recorded'}.` };
    case 'jersey': return { ...base, action: 'jersey', headline: `${currentTeam} in ${data.Color ?? 'their match kit'}.`, jerseyColor: data.Color };
    case 'kickoff_team': return { ...base, action: 'kickoff_team', headline: `${currentTeam} kick off.` };
    case 'kickoff': return { ...base, action: 'kickoff', headline: event.Clock?.Seconds >= 6300 ? 'Extra time, second half!' : event.Clock?.Seconds >= 5400 ? 'Extra time, first half!' : event.Clock?.Seconds >= 2700 ? 'Second half kickoff!' : 'Kickoff!', sub: `${team.home} vs ${team.away} — play is underway.` };
    case 'halftime_finalised': return { ...base, action: 'halftime', headline: 'Half time.', sub: 'The referee brings the half to a close.' };
    case 'status': {
      if (event.StatusId === 3) return { ...base, action: 'halftime', headline: 'Half time.', sub: 'The referee brings the first half to a close.' };
      if (event.StatusId === 6) return { ...base, action: 'fulltime', headline: 'Full time — extra time!', sub: 'Ninety minutes could not separate the teams.' };
      if (event.StatusId === 8) return { ...base, action: 'halftime', headline: 'Half time in extra time.' };
      return null;
    }
    case 'game_finalised': return { ...base, action: 'fulltime', headline: 'Final whistle!', sub: 'The match is over. Full time.' };
    case 'additional_time': return data.Minutes ? { ...base, action: 'additional_time', headline: `${data.Minutes} minute${data.Minutes === 1 ? '' : 's'} of added time.`, sub: `Referee signals added time in the ${period}.`, addedMinutes: data.Minutes } : null;
    case 'goal': return { ...base, action: 'goal', headline: player ? `${player.name} scores for ${currentTeam}!` : `Goal! ${currentTeam} score!`, sub: 'The net ripples — a pivotal moment in the replay.', scorer: player?.name, goalType: data.GoalType };
    case 'shot': return { ...base, action: 'shot', headline: player ? `${player.name} has an effort for ${currentTeam}.` : `${currentTeam} attempt a shot.`, shotOutcome: data.Outcome ?? 'Blocked' };
    case 'corner': return { ...base, action: 'corner', headline: `Corner kick awarded to ${currentTeam}.` };
    case 'free_kick': return { ...base, action: 'free_kick', headline: `Free kick to ${currentTeam}.` };
    case 'throw_in': return { ...base, action: 'throw_in', headline: `Throw-in for ${currentTeam}.` };
    case 'goal_kick': return { ...base, action: 'goal_kick', headline: `Goal kick for ${currentTeam}.` };
    case 'high_danger_possession': return { ...base, action: 'big_chance', headline: `Big chance for ${currentTeam}!`, sub: `${currentTeam} are in a very dangerous position.` };
    case 'possible': return data.Goal ? { ...base, action: 'near_miss', headline: `So close for ${currentTeam}!`, sub: 'Officials pause to check the situation.' } : null;
    case 'yellow_card': return { ...base, action: 'yellow_card', headline: player ? `Yellow card — ${player.name} (${currentTeam}).` : `Yellow card shown to ${currentTeam}.`, cardPlayer: player?.name };
    case 'red_card': return { ...base, action: 'red_card', headline: player ? `Red card — ${player.name} (${currentTeam}) is sent off.` : `Red card for ${currentTeam}.`, cardPlayer: player?.name };
    case 'substitution': return { ...base, action: 'substitution', participant, headline: inPlayer && outPlayer ? `${inPlayer.name} on for ${outPlayer.name} (${currentTeam}).` : `${currentTeam} make a substitution.`, playerIn: inPlayer?.name, playerOut: outPlayer?.name };
    case 'injury': return { ...base, action: 'injury', participant, headline: player ? `${player.name} (${currentTeam}) receives treatment.` : `${currentTeam} player receives treatment.`, injuryPlayer: player?.name, injuryOutcome: data.Outcome };
    case 'var': return { ...base, action: 'var', headline: 'VAR review in progress.', sub: 'The video assistant is checking the incident.', varType: data.Type };
    case 'var_end': return { ...base, action: 'var_result', headline: data.Outcome === 'Overturned' ? 'VAR — original decision overturned!' : 'VAR — decision confirmed.', varOutcome: data.Outcome };
    case 'penalty': return { ...base, action: 'penalty', headline: `Penalty to ${currentTeam}!` };
    default: return null;
  }
}

function estimatedProbability(events, maxSec) {
  let score = [0, 0];
  const pressure = [0, 0];
  const cards = [0, 0];
  return events.map(({ event, sec }) => {
    const part = (event.Data?.Participant ?? event.Participant ?? 1) === 2 ? 1 : 0;
    if (event.Action === 'goal') score[part] += 1;
    if (event.Action === 'shot') pressure[part] += event.Data?.Outcome === 'OnTarget' ? 2.5 : 1;
    if (event.Action === 'high_danger_possession') pressure[part] += 2.5;
    if (event.Action === 'possible' && event.Data?.Goal) pressure[part] += 1.5;
    if (event.Action === 'corner') pressure[part] += 0.4;
    if (event.Action === 'red_card') cards[part] += 1;
    if (!['goal', 'shot', 'high_danger_possession', 'possible', 'corner', 'red_card'].includes(event.Action)) return undefined;
    const timeWeight = 15 + 40 * Math.min(1, sec / Math.max(maxSec, 1));
    const raw = 50 + (score[0] - score[1]) * timeWeight + (pressure[0] - pressure[1]) * 0.8 - (cards[0] - cards[1]) * 12;
    return Math.max(2, Math.min(98, Math.round(raw)));
  });
}

function possession(events) {
  const moments = events.filter(({ event }) => event.Action === 'possession' && Number.isFinite(event.Clock?.Seconds) && (event.Participant === 1 || event.Participant === 2));
  const duration = [0, 0];
  for (let i = 0; i < moments.length - 1; i += 1) {
    const start = moments[i].event.Clock.Seconds;
    const end = moments[i + 1].event.Clock.Seconds;
    duration[moments[i].event.Participant - 1] += Math.max(0, Math.min(end - start, 60));
  }
  const total = duration[0] + duration[1];
  return total ? [Math.round((duration[0] / total) * 100), Math.round((duration[1] / total) * 100)] : [50, 50];
}

function buildMatch(file) {
  const data = JSON.parse(fs.readFileSync(path.join(archiveDir, file), 'utf8'));
  const raw = data.events ?? [];
  const fixture = data.fixture ?? {};
  const teams = { home: fixture.home_team ?? 'Home', away: fixture.away_team ?? 'Away' };
  const players = playerMap(raw);
  const resolved = resolveTimes(deduplicate(raw).sort((a, b) => (a.Seq ?? 0) - (b.Seq ?? 0)));
  const meaningful = resolved.filter(({ event }) => KEEP.has(event.Action));
  const maxSec = Math.max(1, ...meaningful.map(({ sec }) => sec));
  const probabilities = estimatedProbability(meaningful, maxSec);
  const events = [];
  let score = [0, 0];
  let lastHalfTime = -1;
  for (let i = 0; i < meaningful.length; i += 1) {
    const { event, sec } = meaningful[i];
    if ((event.Action === 'halftime_finalised' || (event.Action === 'status' && event.StatusId === 3)) && sec === lastHalfTime) continue;
    if (event.Action === 'halftime_finalised' || (event.Action === 'status' && event.StatusId === 3)) lastHalfTime = sec;
    const text = eventText(event, teams, undefined, players);
    if (!text || !EVENT_ACTIONS.has(text.action)) continue;
    const result = { id: `ev_${event.Id}_${event.Seq ?? i}`, sec, ...text };
    if (result.action === 'goal') {
      score[result.participant === 2 ? 1 : 0] += 1;
      result.scoreAfter = [...score];
    }
    if (probabilities[i] !== undefined) result.probAfter = probabilities[i];
    events.push(result);
  }
  const final = [...raw].reverse().find((event) => event.Action === 'game_finalised') ?? {};
  const finalScore = [
    final.Score?.Participant1?.Total?.Goals ?? score[0],
    final.Score?.Participant2?.Total?.Goals ?? score[1],
  ];
  const count = (action, participant, predicate = () => true) => events.filter((event) => event.action === action && event.participant === participant && predicate(event)).length;
  const possessionShare = possession(resolved);
  const goalsByPeriod = (from, to, team) => events.filter((event) => event.action === 'goal' && event.participant === team && event.sec >= from && event.sec < to).length;
  const stats = {
    home: { shots: count('shot', 1), shotsOnTarget: count('shot', 1, (event) => event.shotOutcome === 'OnTarget' || event.shotOutcome === 'Woodwork'), possession: possessionShare[0], yellowCards: final.Score?.Participant1?.Total?.YellowCards ?? count('yellow_card', 1), redCards: final.Score?.Participant1?.Total?.RedCards ?? count('red_card', 1), corners: final.Score?.Participant1?.Total?.Corners ?? count('corner', 1) },
    away: { shots: count('shot', 2), shotsOnTarget: count('shot', 2, (event) => event.shotOutcome === 'OnTarget' || event.shotOutcome === 'Woodwork'), possession: possessionShare[1], yellowCards: final.Score?.Participant2?.Total?.YellowCards ?? count('yellow_card', 2), redCards: final.Score?.Participant2?.Total?.RedCards ?? count('red_card', 2), corners: final.Score?.Participant2?.Total?.Corners ?? count('corner', 2) },
  };
  return {
    id: data.fixtureId ?? fixture.id,
    home: teams.home,
    away: teams.away,
    date: new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(Number(fixture.kickoff_at))),
    maxSec,
    totalEvents: data.source?.historical_event_count ?? raw.length,
    finalScore,
    periodBreakdown: { h1: { home: goalsByPeriod(0, 2700, 1), away: goalsByPeriod(0, 2700, 2) }, h2: { home: goalsByPeriod(2700, 5400, 1), away: goalsByPeriod(2700, 5400, 2) }, et: { home: goalsByPeriod(5400, Infinity, 1), away: goalsByPeriod(5400, Infinity, 2) } },
    finalStats: stats,
    lineups: lineups(raw, players),
    events,
  };
}

const source = `// AUTO-GENERATED by scripts/generate-archive-data.cjs. Do not edit by hand.\n\nexport type MatchAction = ${[...EVENT_ACTIONS].map((action) => `'${action}'`).join(' | ')};\n\nexport interface LineupPlayer { id: number; name: string; number: string; positionId: 34 | 35 | 36 | 37; dob: string | null; photo?: string; goals: number; yellowCards: number; redCards: number; }\nexport interface TeamLineup { formation: string; starters: LineupPlayer[]; bench: LineupPlayer[]; }\nexport interface MatchEvent { id: string; sec: number; participant: 1 | 2; action: MatchAction; headline: string; sub?: string; scorer?: string; goalType?: string; shotOutcome?: 'OnTarget' | 'OffTarget' | 'Blocked' | 'Woodwork'; cardPlayer?: string; playerIn?: string; playerOut?: string; scoreAfter?: [number, number]; probAfter?: number; addedMinutes?: number; jerseyColor?: string; varType?: string; varOutcome?: string; injuryPlayer?: string; injuryOutcome?: string; }\nexport interface MatchData { id: number; home: string; away: string; date: string; maxSec: number; totalEvents: number; finalScore: [number, number]; periodBreakdown: { h1: { home: number; away: number }; h2: { home: number; away: number }; et: { home: number; away: number } }; finalStats: { home: { shots: number; shotsOnTarget: number; possession: number; yellowCards: number; redCards: number; corners: number }; away: { shots: number; shotsOnTarget: number; possession: number; yellowCards: number; redCards: number; corners: number } }; lineups?: { home: TeamLineup; away: TeamLineup }; events: MatchEvent[]; }\n\nexport const MATCHES: MatchData[] = ${JSON.stringify(fs.readdirSync(archiveDir).filter((file) => file.endsWith('.json')).sort().map(buildMatch), null, 2)};\n`;

fs.writeFileSync(outputPath, source);
console.log(`Generated ${outputPath} from ${fs.readdirSync(archiveDir).filter((file) => file.endsWith('.json')).length} archives.`);
