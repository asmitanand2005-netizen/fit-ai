# FitAI — Adaptive Workout Planner

An AI fitness coach that builds personalised training plans from a user's goals, experience, available equipment and time, then supports them with guidance grounded in published exercise-science guidelines.

Built for a hackathon on the brief: *"People often find it difficult to maintain a consistent fitness routine. Build an AI fitness coach that creates personalised workout plans based on user goals, fitness levels, available resources and time constraints, while providing guidance and motivation."*

> This builds on our team's existing FitAI project. This branch adds a retrieval-augmented coaching layer, a corrected movement-pattern taxonomy, exercise demonstration animations, and cumulative progress tracking. Earlier commits retain their original authors.

---

## The idea behind it

The brief says people struggle with **consistency**. That is an adherence problem, not a plan-generation problem — so the design decisions all follow from one position: generating a plan is the easy half, and what the app does when someone misses a week is the half that matters.

Three consequences run through the codebase:

**The language model never writes the programme.** Sets, reps and load come from a deterministic engine. A hallucinated prescription for someone with a shoulder injury is not a bad user experience, it is an injury — so the LLM is confined to parsing input and explaining output, where mistakes are recoverable. There is no code path from the coaching layer to the planner.

**Progress is cumulative, not a streak.** Streaks motivate through loss aversion, which punishes hardest the users this product exists to help. Milestones here are lifetime totals that cannot be lost, and the training calendar shows a gap as a lighter square rather than a reset to zero.

**The coach declines.** It refuses questions it has no source for, and it stops clinical questions before retrieval runs at all. Any retrieval system is easy to make answer; the hard part is making it decline.

---

## Quick start

**Prerequisites:** Node.js 18+ and npm 9+.

```bash
git clone <this-repo>
cd FitAI-Workout_Recommendation_System
npm install
```

**Create `.env.local` in the project root.** This is gitignored, so it does not arrive with a clone — and the app will not start without it:

```env
# Signs local session tokens. Must be at least 32 characters (enforced in lib/env.ts).
JWT_SECRET=replace-with-a-random-string-of-at-least-32-characters

# Leave empty to use the bundled SQLite database at data/users.db
MSSQL_CONNECTION_STRING=
```

Generate a secret with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Then:

```bash
npm run dev          # http://localhost:3000
```

The SQLite schema is created automatically on first run, and the exercise library seeds itself on the first request to `/api/exercises`. There is no migration step.

| Command | Purpose |
|---|---|
| `npm run dev` | Development server |
| `npm run build` && `npm start` | Production build and serve — much faster page loads |
| `npm run eval:coach` | Run the coach evaluation suite |
| `npm run db:setup` | Create database indexes |

---

## Architecture

```
                    ┌─────────────────────────┐
                    │   Next.js App Router     │
                    │  React + Zustand + TW    │
                    └────────────┬─────────────┘
                                 │
                    ┌────────────▼─────────────┐
                    │      Route handlers       │
                    │      app/api/*/route.ts   │
                    └───┬──────────────────┬────┘
                        │                  │
          ┌─────────────▼──────┐   ┌───────▼──────────────┐
          │  Planning engine    │   │   Coaching layer      │
          │  (deterministic)    │   │   (retrieval)         │
          │                     │   │                       │
          │  constraints →      │   │  safety screen →      │
          │  filter → score →   │   │  scope guard →        │
          │  assemble           │   │  retrieve → cite      │
          └─────────┬───────────┘   └───────┬───────────────┘
                    │                       │
                    │        ✗ no path ─────┘
                    │   (the coach cannot alter a plan)
                    │
          ┌─────────▼───────────┐
          │  SQLite / MSSQL      │
          └──────────────────────┘
```

---

## The coaching layer

A retrieval-augmented assistant at `/assistant`. Every answer is composed only from retrieved passages, and every passage used is cited and inspectable in the UI.

**Pipeline:** safety screen → scope guard → retrieve → compose → cite.

**Retrieval is TF-IDF, written from scratch** (`lib/coach/retrieval.ts`). For a corpus of 22 short passages, lexical scoring is as accurate as embeddings, adds no dependency, needs no model download that could fail on demo day, and — unlike a dense retriever — can show exactly which terms caused a match. The index is built once at module load. Above a few hundred documents this choice would need revisiting.

**The corpus** (`lib/coach/corpus.ts`) is 22 hand-curated passages from the WHO 2020 physical activity guidelines, ACSM's *Guidelines for Exercise Testing and Prescription* and its progression position stand, the ISSN protein position stand, and PAR-Q+. It is deliberately small and hand-written rather than scraped: retrieval quality stays auditable by reading one file.

**The safety gate** (`lib/coach/safety.ts`) runs *before* retrieval across 8 rule categories. Clinical red flags — cardiac symptoms, neurological signs, acute injury, extreme restriction — stop the request outright and refer the user to a clinician. Pregnancy and managed conditions attach a caution banner instead. The gate is keyword-based on purpose: it is auditable, it cannot be talked out of a refusal by rephrasing, and it fails closed.

**The scope guard** refuses product recommendations and meal planning explicitly, because lexical retrieval cannot separate *"how much protein do I need"* from *"which protein powder should I buy"* — both are dominated by the same term.

**Composition is extractive by default**, selecting the sentences from retrieved passages that address the question. Setting `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` enables an LLM pass for fluency over the same passages, with a timeout and a fallback to extractive if it fails. The model is a writer, never a source. **The app works fully with no API key.**

### Evaluation

```bash
npm run eval:coach
```

20 cases through the live pipeline: 12 that should answer (11 asserting *which* passage ranks first), 4 that should decline, 4 that should be blocked. Currently 20/20.

The suite found four real defects during development — *"what rep range builds muscle?"* was retrieving the protein passage, and *"my bench hasn't gone up in a month"* matched nothing at all. Both looked fine under manual clicking.

**What 20/20 does not mean:** that the coach is accurate in general. It means twenty chosen cases behave as specified, and it catches regressions when the corpus or threshold changes.

---

## Movement-pattern taxonomy

Every exercise is classified into one of 8 mechanical patterns — push, pull, squat, hinge, lunge, core, cardio, mobility (`lib/ai/movement-patterns.ts`). Pattern is what constraint filtering and exercise substitution reason over, and what the demonstration animations are keyed to.

The seed data originally had this badly wrong: of 106 exercises, exactly **one** was labelled SQUAT and three HINGE, with squats and deadlifts sitting under PUSH and PULL. Nothing crashed and plans still generated — the substitution logic was simply reasoning over incorrect data. The same array was also duplicated across two files, so a partial fix would have left the bug half-alive.

Both copies are corrected and asserted identical. An idempotent backfill on `/api/exercises` repairs databases seeded before the fix, and classifies any exercise outside the seed (for example synced from the wger API) so no row can hold a pattern the rest of the app does not understand.

## Exercise animations

Eight looping SVG figures, one per movement pattern, rendered from `components/exercise/pattern-animation.tsx`. Keying on pattern rather than exercise means 8 figures cover the whole library. No media files, no licensing question, no network request, and they stay sharp at any size. `prefers-reduced-motion` is respected.

Each limb chain is **rooted at the ankle and built upward**, so a planted foot is fixed by construction and the hip position falls out of the chain — no inverse kinematics. The first implementation rooted chains at the hip and was visibly broken in six of eight figures.

## Progress tracking

**Cumulative milestones** (`lib/ai/achievements.ts`) across four tracks — sessions, total load moved, repetitions, and distinct movements performed. All lifetime totals, computed from logged sets in the database on each request rather than kept as a running counter, so they cannot drift out of sync with the sets they describe. They live in the database rather than browser storage because an achievement a cleared browser can erase is not unlosable.

**Training calendar** (`components/analytics/training-calendar.tsx`) — a 53-week heatmap with hover detail, a legend and a table view. Colour is a single-hue sequential ramp encoding magnitude through lightness, which survives colour vision deficiency. Rest days use a neutral grey rather than the palest step of the ramp, so "no training" is separable from "light training" by hue and not only by a lightness difference at the edge of perception.

---

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 13.5 (App Router), React 18, TypeScript 5.2 | UI and API in one project, so types are shared rather than duplicated |
| Styling | Tailwind CSS, Radix UI primitives | Radix gives accessible behaviour; Tailwind gives the look |
| Client state | Zustand 5 | Selector-level subscriptions without Redux ceremony |
| Database | SQLite (`better-sqlite3`), MSSQL adapter | Zero setup; synchronous driver, so no async overhead on an embedded DB |
| Auth | `jose` JWT, bcryptjs, Next middleware | `jose` uses Web Crypto, so JWT verification runs in the Edge runtime where `jsonwebtoken` cannot |
| Validation | Zod | One schema gives both the runtime check and the inferred type |
| Charts | Recharts; hand-built SVG for calendar and animations | A grid of rectangles is simpler written directly than configured |

**Everything added in this branch has zero new runtime dependencies** — no vector database, no embedding model, no animation library. That is why the coach responds in single-digit milliseconds and why nothing new can fail without a network.

---

## Measured

| Metric | Value | How to reproduce |
|---|---|---|
| Coach response | ~2.5 ms median | 5 runs per question after warm-up, measured in-browser end-to-end including HTTP |
| Coach evaluation | 20/20 | `npm run eval:coach` |
| Corpus size | 22 passages | `lib/coach/corpus.ts` |
| Seeded exercises | 106 across 8 patterns | `app/api/exercises/route.ts` |

Response time is low because there is no LLM call and no network hop in the default path: the index is prebuilt, and a query is a sparse dot product against 22 vectors.

---

## Known limitations

Stated plainly, because they are the honest answer to "what would you do next?"

- **The corpus is 22 passages.** Enough to be honest, not enough to be broadly useful. Scaling it is where the retrieval approach would need revisiting.
- **Streak and habit data live in browser storage**, so they are per-browser and do not follow a user across devices. The cumulative milestones were deliberately put in the database instead.
- **The multi-armed bandit needs data it does not have.** With few users over a short period it is effectively exploration-only; the reward estimates are not yet meaningful.
- **Rate limiting is in-memory**, so it is per-process and resets on restart. Redis is the answer for multiple instances.
- **SQLite is single-writer** and needs a persistent filesystem, so this will not run on serverless platforms without swapping the database layer. The MSSQL adapter exists for that.
- **Two charts on `/habits` use placeholder values** rather than logged data. The panel above them does not.
- **No adaptation loop yet.** The highest-value next feature: *"my shoulder hurts today"* / *"I only have 20 minutes"* → re-solve under changed constraints and show a diff of what changed and why.

---

## Project structure

```
app/
  api/
    coach/            Retrieval-augmented coaching endpoint
    achievements/     Cumulative totals and per-day activity
    exercises/        Exercise library, seeding and pattern backfill
    plans/ workout/   Plan generation and set logging
  assistant/          Coach chat UI
  library/            Exercise library with pattern filter and animations
  habits/             Habit insights, milestones, training calendar
components/
  analytics/          Training calendar, achievements panel
  exercise/           Movement-pattern animations
  ui/                 Radix + shadcn primitives
lib/
  ai/
    movement-patterns.ts    Canonical taxonomy and classifier
    achievements.ts         Cumulative milestone tracks
    enhanced-plan-generator.ts, hybrid-engine.ts, bandit.ts
  coach/
    corpus.ts               22 cited guideline passages
    retrieval.ts            TF-IDF index and scoring
    safety.ts               Pre-retrieval safety gate and scope guard
    answer.ts               Extractive and LLM composition
    eval-questions.ts       Evaluation cases
scripts/
  eval-coach.ts       Evaluation harness
```

---

## Disclaimer

This is a hackathon project, not a medical device. It provides general fitness guidance drawn from published population-level recommendations, and it is not a substitute for advice from a qualified healthcare professional. The coach refers clinical questions to one rather than answering them.

## Licence

MIT — see [LICENSE](LICENSE).
