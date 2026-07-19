# MatchFlash

<p align="center">
  <img src="./matchflash-logo.png" width="112" alt="MatchFlash logo" />
</p>

<h1 align="center">Every Moment. On Record.</h1>

<p align="center">
  A replayable football archive built with TxLINE and TxODDS.
</p>

<p align="center">
  <a href="#why-matchflash">Why MatchFlash</a> ·
  <a href="#the-experience">The experience</a> ·
  <a href="#how-txline-powers-matchflash">Architecture</a> ·
  <a href="#run-locally">Run locally</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/TxLINE-verified%20data-111827?style=flat-square" alt="TxLINE verified data" />
  <img src="https://img.shields.io/badge/TxODDS-data%20infrastructure-111827?style=flat-square" alt="TxODDS data infrastructure" />
  <img src="https://img.shields.io/badge/Next.js-15-black?style=flat-square&logo=next.js" alt="Next.js 15" />
  <img src="https://img.shields.io/badge/TypeScript-5.8%2B-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript" />
</p>

> Built for the **TxLINE World Cup Hackathon 2026**.

## Table of contents

- [The short version](#the-short-version)
- [Why MatchFlash](#why-matchflash)
- [The experience](#the-experience)
- [What makes it different](#what-makes-it-different)
- [How TxLINE powers MatchFlash](#how-txline-powers-matchflash)
- [Live match intelligence](#live-match-intelligence)
- [Telegram bot architecture](#telegram-bot-architecture)
- [Technical implementation](#technical-implementation)
- [API surface](#api-surface)
- [Why MatchFlash matters](#why-matchflash-matters)
- [Future opportunities](#future-opportunities)
- [Demo and links](#demo-and-links)
- [Run locally](#run-locally)
- [Feedback for TxLINE](#feedback-for-txline)
- [Roadmap](#roadmap)
- [License](#license)

## The short version

Most sports products answer:

> “What is happening right now?”

MatchFlash answers:

> “What happened, why did it happen, and how did the match evolve?”

MatchFlash turns the temporary live feed into a permanent, replayable sports record. A fan can search for a match, open the archive, and move from kickoff to full time while the score, event stream, estimated momentum, lineups, formations, and statistics change with the match clock.

This is not another final-score screen. It is a match history you can enter.

## Why MatchFlash

Goals are remembered. The build-up to the goal usually is not.

Live feeds are excellent at telling fans what just happened, but they disappear into a stream of updates. MatchFlash preserves the sequence: the pressure, the cards, the substitutions, the tactical shape, the momentum swing, and the final whistle.

The product is designed around three ideas:

1. **A match should be replayable.** Pause it, resume it, change the speed, or scrub directly to the moment that changed everything.
2. **A replay should be explainable.** The timeline is connected to lineups, formations, statistics, player context, and a visual momentum signal.
3. **A record should be trustworthy.** Every replay carries its TxLINE provenance, fixture identity, event count, and verification state.

## The experience

### Enter the archive

The landing page is an invitation into a living sports record: a cinematic match-film hero, restrained motion, an archive search, and replay cards that make historical discovery feel editorial rather than administrative.

Search by team, browse completed fixtures, and open a full match replay from a single interaction.

### Replay the match

The replay view keeps the match clock at the center of the experience. Fans can:

- play, pause, resume, and scrub through the match;
- switch replay speed from a calm review to a fast catch-up;
- revisit goals, cards, penalties, substitutions, shots, corners, free kicks, VAR moments, and big chances;
- watch the score and estimated win-probability signal change as the replay advances;
- jump between the timeline, lineups, statistics, and verification views.

### Read the match as it unfolded

The dynamic event timeline transforms raw event data into readable match stories. It distinguishes the moments that matter from the noise around them, including:

- goals and scoring context;
- yellow and red cards;
- substitutions and injuries;
- penalties, VAR decisions, corners, free kicks, and shots;
- periods, half-time, added time, and full-time;
- momentum shifts derived from sustained attacking pressure.

### See the shape of the game

The lineup viewer presents starters and bench players on a visual pitch, with formations and player context. The statistics view pairs match totals with the replay state, so a fan can understand not only the final numbers but also the story that produced them.

Recorded views include shots, shots on target, possession, cards, corners, goals, and period-by-period scoring. Possession is estimated from TxLINE possession intervals where that source data is available.

### Verify the record

The verification view makes provenance visible instead of hiding it in an implementation detail. It identifies:

| Signal | What the fan can understand |
| --- | --- |
| Provider | The replay is sourced from TxLINE event history |
| Infrastructure | TxODDS provides the underlying sports-data layer |
| Fixture | The exact fixture identifier behind the record |
| Events | How much recorded match history is in the replay |
| Integrity | Whether the replay has passed its validation state |

The result is a sports experience with an audit trail: every moment has a place in the record.

### Screenshots

**Landing Page**
![Landing Page](./public/image.png)

**Match Timeline & Replay**
![Timeline View](./public/image%20copy.png)

**Match Statistics**
![Statistics View](./public/image%20copy%202.png)

**Lineups & Formations**
![Lineups View](./public/image%20copy%203.png)

## What makes it different

Flashscore, SofaScore, ESPN, and traditional score apps are optimized for the present: live scores, current tables, alerts, and quick match facts. MatchFlash is designed for the moment after the moment.

| Existing category | MatchFlash adds |
| --- | --- |
| Live score | A replayable sequence from kickoff to full time |
| Match center | A searchable, persistent archive of complete match histories |
| Event feed | A readable story layer that connects events to momentum and context |
| Final statistics | Statistics that can be revisited alongside the replay clock |
| Historical results | An interactive way to explore how the result came to be |

MatchFlash creates a category between a live score product and a sports documentary: **interactive match history**.

That makes it useful to the fan who missed a match, the supporter who wants to relive a turning point, the analyst studying pressure patterns, and the publisher looking for richer match context.

## How TxLINE powers MatchFlash

TxLINE is the foundational data layer. MatchFlash uses the TxLINE ecosystem to acquire fixture context, consume live event streams, retrieve historical score sequences, and validate the provenance of the resulting archive.

### Data flow

```text
┌──────────────────────────────┐
│ TxLINE + TxODDS               │
│ fixtures · scores · odds      │
│ historical feeds · validation │
└──────────────┬───────────────┘
               │ authenticated snapshots and streams
               ▼
┌──────────────────────────────┐
│ Ingestion engine              │
│ SSE parsing · deduplication   │
│ fixture routing · retries     │
└──────────────┬───────────────┘
               │ normalized event records
               ▼
┌──────────────────────────────┐
│ SQLite archive                │
│ fixtures · events · snapshots │
│ provenance-ready history      │
└──────────────┬───────────────┘
               │ ordered match history
               ▼
┌──────────────────────────────┐
│ Replay and story engines      │
│ clock · speed · narratives    │
│ momentum · stats projection   │
└──────────────┬───────────────┘
               │ JSON, SSE, WebSocket
               ▼
┌──────────────────────────────┐
│ MatchFlash experience         │
│ archive · replay · lineups    │
│ statistics · verification     │
└──────────────────────────────┘
```

### Integration responsibilities

- **Live match ingestion:** consume TxLINE score and odds streams, parse server-sent events, associate payloads with fixture IDs, and persist them with source and stream identifiers.
- **Historical archives:** discover eligible fixtures and retrieve historical score updates so completed matches remain available after the live window has passed.
- **Replay reconstruction:** order captured events, deduplicate discarded or superseded actions, normalize them into browser-ready match events, and expose them on a controllable replay clock.
- **Story generation:** turn low-level event payloads into human-readable moments such as “Goal”, “Penalty”, “VAR review”, and “Momentum shift”.
- **Validation and provenance:** preserve the fixture identity, event count, source, and validation state so the UI can explain where a replay came from.

The official integration contract is kept in [`docs/txline-openapi.yaml`](./docs/txline-openapi.yaml), making the data dependency inspectable and reproducible.

## Live match intelligence

MatchFlash is built for both sides of the sports-data lifecycle.

During a match, the ingestion layer connects to TxLINE score and odds streams, retries interrupted connections, identifies the fixture inside each payload, and persists new events without duplicating the same source event. The API server then turns new records into stories and broadcasts them to connected clients over WebSocket.

After the match, the same event history becomes replay input. The replay service emits a `replay-start` event, streams each story at a selectable speed, and closes with `replay-complete`. The front end can therefore preserve the timing and order of a live feed even when the fan is watching hours, days, or years later.

```text
TxLINE stream
    │
    ├── scores / odds SSE
    ▼
Ingest + deduplicate
    │
    ├── SQLite event history
    ├── WebSocket live updates
    └── SSE replay stream
             │
             ▼
      MatchFlash timeline
```

This is the core product promise: a live moment can become a permanent, interactive memory.

## Telegram bot architecture

The Telegram bot makes the archive useful where fans already talk about football. It shares the same fixture records and story model as the web experience, while adapting the interaction for chat: compact pages, inline keyboards, and direct links back to the visual replay.

```text
Telegram user
      │ commands, searches, button taps
      ▼
grammY bot service
      │
      ├── fixture picker and team search
      ├── paginated replay moments
      ├── match statistics and predictions
      └── team subscriptions
      │
      ├── SQLite: fixtures, events, subscriptions
      ├── TxLINE story engine
      └── MatchFlash web replay link
```

The bot supports `/replay` for searching archived matches, `/matches` for browsing, `/live` for live fixtures, `/predict` for upcoming matches, and `/subscribe` for team-focused notifications. Inline keyboards keep the path from discovery to replay short, while the “Open full replay” action hands off to the richer MatchFlash interface.

Live notifications are filtered against the same normalized story events used by the API, so a goal or meaningful market movement can be surfaced in Telegram without creating a second interpretation of the match.

## Technical implementation

### Frontend

- **Next.js 15** and **React 19** for the product shell and route-level experiences.
- **TypeScript** for shared match, event, lineup, statistics, and API types.
- **GSAP + ScrollTrigger** for the cinematic hero, scroll-driven archive reveal, pointer-responsive depth, and reduced-motion-aware transitions.
- A component structure that separates the archive, replay controls, event feed, momentum chart, lineup viewer, statistics panel, trust mark, and theme controls.
- **Framer Motion compatibility:** the interaction model is intentionally component-friendly, so future product surfaces can add Framer Motion primitives where they improve local interaction feedback without replacing the current GSAP page choreography.

### Backend

- **Node.js** HTTP services for the API, replay, ingestion, and bot surfaces.
- **SQLite via better-sqlite3** for captured fixtures, source events, archive events, community votes, and replay-ready records.
- A deterministic **replay engine** that rehydrates ordered events into timed story output at 2×, 10×, 20×, or 60× speed.
- A **story engine** that classifies raw TxLINE payloads into displayable moments and detects sustained pressure as momentum shifts.
- **WebSocket** live updates for connected match clients and **SSE** for replay delivery.
- A Telegram bot surface for browsing archived fixtures, reading replay moments, and opening the full visual replay.

### Infrastructure

- **Vercel** is the intended deployment surface for the Next.js frontend.
- **GitHub** holds the application, integration contract, scripts, and reproducible implementation history.
- A **VPS automation** path can run the Node ingestion, archive, replay, and Telegram services continuously.
- Local development keeps frontend and backend concerns separate: Next.js runs on port `3000`, while the API defaults to port `3001`.

### Repository map

```text
app/                     Next.js pages and MatchFlash UI components
server/src/              TxLINE ingestion, API, replay, bot, and story services
server/public/           Lightweight server-served experience assets
scripts/                 Archive-to-browser data generation
docs/                    TxLINE OpenAPI contract and integration references
public/                  Hero media and public frontend assets
```

## API surface

### MatchFlash service endpoints

| Endpoint | Purpose |
| --- | --- |
| `GET /api/fixtures` | Return captured TxLINE fixture snapshots |
| `GET /api/matches` | List confirmed matches, optionally filtered by `state` |
| `GET /api/upcoming` | Return upcoming matches |
| `GET /api/live` | Return live matches |
| `GET /api/matches/{fixtureId}` | Return one public match snapshot |
| `GET /api/matches/{fixtureId}/probabilities` | Return current match-market data |
| `GET /api/archive` | List completed archived fixtures with event counts |
| `GET /api/archive/search?team=...&date=...` | Search the historical archive |
| `GET /api/stories/{fixtureId}` | Return normalized stories for a live/captured fixture |
| `GET /replay/{fixtureId}?speed=20` | Stream a replay over Server-Sent Events |
| `GET /live/{fixtureId}` | Subscribe to live story updates over WebSocket |
| `GET /api/matches/{fixtureId}/votes` | Read community prediction totals |
| `POST /api/matches/{fixtureId}/votes` | Record a home/draw/away community vote |
| `POST /api/predict` | Store a score prediction |
| `GET /api/leaderboard/{fixtureId}` | Read score predictions for a fixture |

### TxLINE endpoints

The exact request and response shapes are documented in [`docs/txline-openapi.yaml`](./docs/txline-openapi.yaml). Credentials are never committed to the repository.

| Endpoint | Purpose |
| --- | --- |
| `POST /auth/guest/start` | Start a TxLINE guest session |
| `POST /api/token/activate` | Activate an access token for the selected service |
| `GET /api/fixtures/snapshot` | Discover current fixtures |
| `GET /api/fixtures/validation?fixtureId={id}` | Retrieve fixture validation/proof data |
| `GET /api/scores/historical/{fixtureId}` | Retrieve a historical score-update sequence |
| `GET /api/scores/stream` | Consume live score events |
| `GET /api/odds/stream` | Consume live odds events |
| `GET /api/scores/updates/{epochDay}/{hourOfDay}/{interval}` | Read time-bucketed score updates |
| `GET /api/odds/updates/{epochDay}/{hourOfDay}/{interval}` | Read time-bucketed odds updates |
| `[Endpoint placeholder]` | Exact endpoint and purpose to confirm before final submission |
| `[Endpoint placeholder]` | Exact endpoint and purpose to confirm before final submission |

> **Integration note:** TxLINE’s historical score endpoint currently requires the fixture start time to be between 6 hours and 2 weeks in the past. The archive ingestion process respects that window and stores the resulting event history locally for durable replay.

## Why MatchFlash matters

Football is experienced in real time, but remembered in fragments: a goal, a red card, a late substitution, a scoreline shared after the final whistle. MatchFlash keeps the full shape of the match available.

Replayability matters because the important moment is not always the loudest one. A supporter may want to revisit the goal; an analyst may want to study the pressure that preceded it; a fan who missed the match may want the entire story in fifteen minutes. One event history can serve all three.

Archives matter because sports data should compound. Every completed fixture becomes more valuable when it can be searched, compared, narrated, embedded, and revisited. MatchFlash turns a feed that would otherwise disappear into a durable cultural record.

Provenance matters because a beautiful replay is only as trustworthy as the events underneath it. TxLINE gives MatchFlash the foundation for fixture context, live updates, historical sequences, and validation. The product keeps that origin visible so fans can understand what they are watching and teams can build on a dependable record.

Access matters too. The web experience is designed for immersive exploration; the Telegram bot is designed for the places where football conversations already happen. A supporter can search for a match, browse key moments, follow a team, and open the full visual replay without changing the underlying source of truth.

Together, these choices make MatchFlash feel less like a score utility and more like a new way to enter football history: cinematic when discovery matters, precise when analysis matters, and portable when sharing matters.

## Future opportunities

Sports history has long-tail value. A live match has one peak audience; a well-preserved match can be revisited by fans, publishers, analysts, broadcasters, and communities for years.

### Premium sports archives

Offer deeper archive access, advanced filters, full-resolution event context, landmark-match collections, and private team or competition libraries.

### AI-generated match narratives

Turn a replay into a concise match report, a minute-by-minute story, a tactical explainer, or a “what changed the game?” briefing. The verified event sequence gives narrative generation a reliable source of truth.

### Media and journalism tools

Provide publishers with embeddable replay timelines, verified event cards, match retrospectives, and fast post-match packages that go beyond the final score.

### Betting intelligence products

TxODDS market movement and TxLINE event history can be combined into post-match analysis: what happened before a price moved, which events changed the state of the match, and how the market reacted.

This is an analytics and historical-context opportunity, not a promise of betting outcomes.

### Fan engagement platforms

Clubs, leagues, broadcasters, and tournament operators can use replayable history for anniversary content, supporter education, match rooms, and interactive archive campaigns.

### Telegram replay bots

The Telegram surface lowers the access barrier: a supporter can search for a team, choose a fixture, browse key moments, and open the visual replay without starting on the website.

### Historical analytics platforms

As the archive grows, the same event model can support searchable tactical patterns, player histories, competition comparisons, and longitudinal match intelligence.

## Demo and links

| Resource | Link |
| --- | --- |
| Demo video | [YouTube Video](https://youtu.be/o4CqM7dh-p4) <br/> [Local MP4](./public/mathchflash.mp4) |
| Live application | [https://getmatchflash.vercel.app/](https://getmatchflash.vercel.app/) |
| Source code | [https://github.com/Dairus01/getmatchflash](https://github.com/Dairus01/getmatchflash) |
| TxLINE OpenAPI contract | [`docs/txline-openapi.yaml`](./docs/txline-openapi.yaml) |
| Hackathon submission | _Pending submission_ |

The intended demo flow is short and legible:

1. Start on the cinematic landing page.
2. Search the archive for a team.
3. Open a match and start the replay.
4. Pause at a goal or momentum shift.
5. Compare the timeline with the lineup and statistics views.
6. End on the verification panel and show the TxLINE provenance.

## Run locally

### Prerequisites

- Node.js 20 or later
- npm
- Optional TxLINE credentials for live ingestion
- Optional Telegram bot token for the Telegram surface

### Install

```bash
git clone https://github.com/Dairus01/getmatchflash.git
cd getmatchflash
npm install
cd server
npm install
cd ..
```

### Configure

Create local environment files from the checked-in examples:

```bash
cp .env.example .env.local
cp server/.env.example server/.env
```

Set `NEXT_PUBLIC_API_URL`, `CORS_ORIGIN`, and `FRONTEND_ORIGIN` for your environment. Add TxLINE credentials only to the local `.data/` files expected by the ingestion scripts. Never commit `.env`, `.env.local`, wallet files, credentials, or production tokens.

### Start the frontend

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Start the API server

```bash
cd server
npm run api:server
```

The API defaults to [http://localhost:3001](http://localhost:3001).

### Use the TxLINE ingestion path

The server scripts provide separate stages for bootstrapping access, capturing live streams, and building the historical archive:

```bash
cd server
npm run bootstrap:txline
npm run ingest:txline
npm run archive:ingest
```

After adding or updating saved archive JSON, regenerate the compact browser dataset:

```bash
node scripts/generate-archive-data.cjs
```

### Validate the implementation

```bash
cd server
npm run typecheck
npm test
cd ..
npm run build
```

## Feedback for TxLINE

### What worked well

- **Schema consistency:** normalized fixture and event payloads made it practical to build one replay model across live and historical data.
- **Documentation quality:** the OpenAPI contract and endpoint details gave the integration a clear starting point.
- **Integration speed:** guest access, token activation, fixture snapshots, and streaming endpoints made it possible to move from first request to product behavior quickly.
- **Historical data access:** historical score sequences created the foundation for a product that remains useful after the final whistle.

### Future improvements

- A longer or configurable historical-access window would make archive backfills less time-sensitive and enable a deeper World Cup record.
- Stable pagination and bulk export primitives would help applications ingest entire competitions efficiently.
- A first-class event identity or replay cursor across score and odds streams would simplify cross-stream deduplication and deterministic reconstruction.
- More explicit versioning for schema changes would help downstream products safely evolve their normalizers.
- A documented sandbox fixture set with predictable event sequences would make automated integration tests easier for hackathon teams and production partners.

## Roadmap

- [ ] Replace demo link placeholders with the deployed application, video, and repository URLs.
- [ ] Expand archive coverage beyond the current captured fixtures.
- [ ] Add richer cross-match archive search and competition filters.
- [ ] Add narrative export for publishers and fan communities.
- [ ] Add replay embeds for articles, social posts, and club sites.
- [ ] Connect verified event history to historical analytics and comparison views.

## License

MatchFlash is released under the [MIT License](./LICENSE).

---

<p align="center">
  <strong>MatchFlash</strong><br />
  Replay the moments. Verify the history.
</p>
