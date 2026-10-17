# HelpDeskLab

A local-first Tier 1 IT help desk training lab: procedurally generated tickets,
a simulated IT environment, and explained scoring — all on your machine.

**Status:** Milestones 0–4, M6, and the M7 job-targets surface are complete. The
app shell, local SQLite persistence (sql.js with IndexedDB snapshots, migrations,
export/import/reset), the simulated IT environment core, the seeded ticket
generator across six families, the ticket workspace, the explaining scoring
engine, and the job target tracker with skills coverage and interview prep are
all in place. Remaining Release 1 work is the fairness lint and per-variant
fixtures (M5) plus the R1 sign-off pass.

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
- `src/domain/generator/` — seeded ticket generation and six scenario families
  (PWD-01, NET-01, DHCP-01, M365-01, FS-01, PRN-01) with rubrics and reference paths.
- `src/domain/targets/` — job listing extraction, skill coverage, weighted family
  recommendations, interview templates, and the share-safe export shape.
- `src/domain/scoring/` — declarative rubric specs, safety gates, and the
  evaluator that explains every deduction.
- `src/persistence/` — SQLite driver, schema, migrations, IndexedDB snapshots,
  repositories, and backup/import/reset.
- `src/app/` — database, backup, and practice services (queue, workspace actions,
  scoring, progress).
- `src/ui/` — app shell, dashboard, ticket queue, ticket workspace, debrief,
  job targets, progress, and a live database panel in Settings.

## The practice loop

Open **Practice** to pull a generated ticket from the queue, investigate the
simulated machine in the terminal, record troubleshooting and customer notes,
verify the caller, then resolve or escalate. Resolving stores the attempt, its
action log, the score, and per-scenario progress in the local SQLite database and
opens a debrief that explains the rubric item by item.

All data in the simulator is fictional. There is no backend, account, or
telemetry.

## Job targets and listing text

**Job targets** stores the listings you are chasing so the practice queue can
point at the families those listings ask for. The pasted listing text lives only
in this browser's local SQLite database. It is included in the full `.sqlite`
backup (which stays on your machine) and deliberately excluded from the
**Export for sharing** file, which contains only company, title, URL, status,
extracted skills, and matched families.

Treat listing text as someone else's copyrighted material and as potentially
personal data:

- Do not commit raw listings to this repository, a gist, an issue, or a demo.
- Do not paste a listing into a public chat or an external AI tool.
- If you ever dump listings to disk, keep them under `data/job-listings/`, which
  is gitignored; the app itself stores them in IndexedDB, not in files.
- Share the generated JSON export, not the database file, when showing the
  feature to someone else.
