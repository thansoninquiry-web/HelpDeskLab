# HelpDeskLab

A local-first Tier 1 IT help desk training lab: procedurally generated tickets,
a simulated IT environment, and explained scoring — all on your machine.

**Status:** Milestones 0–4 complete. The app shell, local SQLite persistence
(sql.js with IndexedDB snapshots, migrations, export/import/reset), the simulated
IT environment core, the seeded ticket generator, the ticket workspace, and the
explaining scoring engine with a debrief are all in place. Remaining Release 1
work is breadth: more families, variants, and distractors.

See [docs/architecture.md](docs/architecture.md) for the module design and
[docs/roadmap.md](docs/roadmap.md) for release scope.

## Run it

Requires Node.js 20.19 or newer.

```bash
npm install
npm run dev
```

Production build: `npm run build`, then `npm run preview`.

## Checks

```bash
npm run check      # typecheck + lint + unit tests + production build
```

Individual commands: `npm run typecheck`, `npm run lint`, `npm run test:run`.

## Guardrails

- Strict TypeScript with unchecked-index protection.
- ESLint boundary rules enforce `ui → app → domain` and `app → persistence`
  dependency direction; the domain never imports upward.
- Vitest + Testing Library with jsdom, and Node-environment tests for SQLite.
- A Workbox service worker precaches the app shell and assets (including the
  SQLite WASM build) so a production build opens offline after the first visit.

## What exists today

- `src/domain/ports.ts` — repository and snapshot ports.
- `src/domain/environment/` — the simulated world, its network/identity/printer
  tools, and the command reducer.
- `src/domain/generator/` — seeded ticket generation and the three scenario
  families (PWD-01, NET-01, PRN-01) with rubrics and reference paths.
- `src/domain/scoring/` — declarative rubric specs, safety gates, and the
  evaluator that explains every deduction.
- `src/persistence/` — SQLite driver, schema, migrations, IndexedDB snapshots,
  repositories, and backup/import/reset.
- `src/app/` — database, backup, and practice services (queue, workspace actions,
  scoring, progress).
- `src/ui/` — app shell, dashboard, ticket queue, ticket workspace, debrief,
  progress, and a live database panel in Settings.

## The practice loop

Open **Practice** to pull a generated ticket from the queue, investigate the
simulated machine in the terminal, record troubleshooting and customer notes,
verify the caller, then resolve or escalate. Resolving stores the attempt, its
action log, the score, and per-scenario progress in the local SQLite database and
opens a debrief that explains the rubric item by item.

All data in the simulator is fictional. There is no backend, account, or
telemetry.
