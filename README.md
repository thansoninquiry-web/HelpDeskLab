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

See [docs/architecture-helpdesklab.md](docs/architecture-helpdesklab.md) for the module design and
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
- `src/domain/generator/` — seeded ticket generation and ten scenario families
  (PWD-01, NET-01, DHCP-01, M365-01, FS-01, PRN-01, MAIL-01, MAILSEC-01, RDP-01,
  DEP-01) with rubrics and reference paths.
- `src/domain/curriculum/` — the sixteen-module course, its exit criteria, the
  lesson written for each playable module, and the evidence folding that turns
  stored history into requirement progress.
- `src/domain/appearance/` — the workspace theme preference, the dawn-to-dusk
  schedule, and the rules that turn a choice plus the operating system and the
  local clock into a resolved light or dark workspace.
- `src/domain/targets/` — job listing extraction, skill coverage, weighted family
  recommendations, interview templates, and the share-safe export shape.
- `src/domain/scoring/` — declarative rubric specs, safety gates, and the
  evaluator that explains every deduction.
- `src/persistence/` — SQLite driver, schema, migrations, IndexedDB snapshots,
  repositories, and backup/import/reset.
- `src/app/` — database, backup, practice, and settings services (queue,
  workspace actions, scoring, progress, hint prices).
- `src/ui/` — app shell, dashboard, ticket queue, ticket workspace, debrief,
  job targets, progress, and Settings (workspace theme, hint prices per family,
  and a live database panel).

## The workspace theme

**Settings → Appearance** offers System, Light, Dark and Schedule for the
workspace, and a separate choice for the terminal. Both palettes
use the same token names in `src/ui/styles/tokens.css` — the night-shift
workspace is `:root`, and Light is a second set of values under
`:root[data-theme='light']` — so nothing about the shell, the type scale or the
density changes; only the paper does. The choice is stored in the local
database with the rest of your settings and mirrored in `localStorage` so that
the chosen workspace never flashes the other one on the way in. **System is the
default**, so the workspace follows your operating system. Light also pins the
paper workspace, Dark pins the night-shift look the ticket stage and tool
consoles are designed around, and Schedule turns it over at dawn and dusk.

An install that never picked a theme — including one written before System was
the default — has no theme row, and a missing row reads as System. That is the
migration: those installs follow the operating system from their next read,
while an install that explicitly chose Dark keeps its stored choice. The cached
first frame corrects itself to System when the database opens.

A theme audit renders every route in both palettes, resolves each piece of text
against the surface it actually sits on, and fails `npm run check` on a pair
below WCAG AA or on any declaration that would move with the theme
(`tests/ui/themeAudit.test.tsx`).

The **terminal** starts out dark whatever the workspace is doing: its
`--terminal-*` tokens are the night-shift values and are never redeclared in the
light palette, and the terminal pane re-points the shared token names at them.
Choosing **Follow the workspace** paints it with the same paper as everything
else. The terminal choice is stored beside the theme and cached separately, so a
light workspace never flashes a light terminal on the way in.

**Schedule** turns the paper over at dusk and back at dawn on your own clock,
so a desk that sits through a night shift dims without anyone remembering to
flip it. The two boundaries — 07:00 and 19:00 until you change them — live in
the settings table beside the choice, travel with a backup, and are edited in
Settings while Schedule is selected. Dusk before dawn means the light window
runs overnight, and a single wake-up is armed for the next boundary instead of
the clock being polled, so the workspace flips at dawn and dusk even while you
are in the middle of a ticket.

## The course

The dashboard lists the sixteen modules the app is built around, in course order.
Each one names two or three requirements — pass a ticket in two families, write
three troubleshooting notes, verify before your first command, hand off an
outage — and shows how much of that your history already covers. Fifteen modules
are playable today; the one still to come stays in the list, marked planned, with
a note saying what is missing.

Modules 10 and 11 work the mail tenant. **Mail Admin** reads a mailbox record and
traces one message through the fictional tenant, so a delivery can be told from a
hold. **Mail Security** is the quarantine queue: each held message is traced, then
either released because it is expected or left held while its sender is blocked.

Modules 12 and 13 work the shelves. **Asset Management** reads the register —
`get-asset` logs who holds a machine, or what state a shelf tag is in — and the
deployment queue, then decides whether a machine can leave: the held-machine
ticket is an escalation with the shelf record attached, not a sequence run. **Computer
Deployment** reads the failed run, decides a rerun is safe, finishes the sequence,
and re-reads the record before the machine is issued.

Modules 14 and 15 are the stockroom and the loading bay. **PC Shelf** reads a
site’s bay by state and turns it into a decision: `book-shelf-machine` issues a
ready machine to the account on the ticket, and `hold-shelf-machine` stops a
faulty one leaving. **Ship Manager** tracks movement rather than wishes: a label
moves nothing, a delayed collection is rebooked rather than marked delivered, and
only a shipment the carrier collected can be dispatched and later delivered.

Every playable module has a lesson behind it: open **Lesson** on a module to read
the idea in two short paragraphs, follow one worked example through the
simulator, and use the entry points at the bottom to get into the tickets the
module is judged on. **Practise this module** opens a ticket the module can
actually exercise — the lesson names the starting family, and modules judged on a
single variant (the held shelf, a failed run) start that variant rather than
leaving it to the queue's draw. An available matching ticket already in the queue
is reused, so pressing the button twice does not pile up duplicates. The family
links open the same queue filtered to one family, and **Whole queue** leaves the
choice open. The example never names a specific ticket, because the queue draws a
new variant each time; it shows the shape of the work and why each step matters. The same page shows the module's exit
criteria with your progress already applied. Remote Desktop's lesson adds a
connect-to-close checklist: every step names the evidence it should leave in the
log, and you can tick the steps off while you work. The checklist is guidance,
not progress — nothing is written down, and the log is still what the module
scores.

Progress is read from attempts, notes, sessions and saved listings every time the
dashboard loads, so nothing has to be ticked off by hand and changing a
requirement reapplies to past work.

## The practice loop

Open **Practice** to pull a generated ticket from the queue, or press **Practise**
on a module in the dashboard to start the ticket that module is built around, investigate the
simulated machine in the terminal, record troubleshooting and customer notes,
verify the caller — with a live code read back, or by ringing a line on file when
no code can reach them — then resolve or escalate. Resolving stores the attempt, its
action log, the score, and per-scenario progress in the local SQLite database and
opens a debrief that explains the rubric item by item. The debrief's **attempt
trail** lists every step the attempt took and labels each one with what produced
it: the terminal, the desktop terminal, the console a command was pressed in, the
hints panel, the panel a note was written in, or the identity panel for a code
sent, a code checked, a callback, or a refusal. Beneath it, **Commands by tool**
groups the commands by what ran them and marks each one: the steps whose points
it earned, or a dead end if no step rested on it — including the ones the
simulator refused, and the repeats that proved nothing new. On a ticket where the
caller's story did not hold up, an **Identity check** quotes each claim the
evidence contradicted — the lockout an account read showed was never there, the code
that went to the employee's own phone and never came back — beside the line or
action that answered it. Nothing is reported that the log does not establish: a
claim about an account appears only once the desk has looked it up, and a claim
the record supports stays out. Where the caller broke in rather than waiting to be
asked, a **Pressure on the call** section counts the interruptions and sets each
line beside the step it followed — the unverified change, the note, the refusal
it was answering — so the attempt explains the pressure it was under. On a network ticket, the debrief draws the **map as it stood at the close** — every link lit only where
your log proved it, each row keeping the line that settled it — reports the links
that were proved, and names any that were never tested; proving every link before
the close adds 25 XP.

When a caller has to be refused — they cannot prove who they are, they are asking
for someone else's account, or they are leaning on urgency to skip the checks —
record the refusal with the deny control under the identity panel. The refusal
then holds for the rest of the attempt: the commands that change an account or
what it can reach (`unlock-account`, `reset-password`, `reset-mfa`,
`unblock-signin`, `add-group-member`, `remove-share-deny`) report that the request
was refused and change nothing, whether they are typed in the terminal or run from
a console. Reading is unaffected, and so is work the refusal has nothing to do
with. Close the ticket as denied and reported to Security. A refusal made by
mistake can be un-run from the log like any other step, and the block lifts with
it.

The ticket workspace is one card of tools with a tab for the terminal and a tab
for the consoles, and **Split screen view** in the card header puts both in front
of you at once: the log stays on the left while a tool — the directory, a server
room, the documentation — works on the right. Toggle it off and the single pane
comes back on whichever of the two you were last using. The divider between the
halves can be dragged to give the log or the tool more room; it starts at half
the card and stops before either half falls under a quarter, so nothing becomes
unreadable. With the divider focused, the arrow keys nudge it, Shift moves
further, Home and End take a half to its narrowest and widest, and double-click
(or Enter) puts it back in the middle. With the split on and no
tool open yet, the right half says so and offers the tools menu; the halves stack
instead of squeezing into two narrow columns on a small screen. The choice is
remembered per learner, so the next ticket opens in the layout you left this one
in.

On a phone there is no room for two columns, and stacking them the way a narrow
desktop window does would leave the console at the bottom of a page several
screens long — every command would mean scrolling down to it and back up to read
the output. So at phone width the card becomes exactly one screen tall and the
split becomes a docked console: the tool scrolls in the space above while the
log, the quick commands, and the command line stay put underneath it, next to
the thumb and the keyboard. Nothing is dragged there — there is one column, so
the divider is gone and the saved ratio is ignored — and the quick commands run
in one row that scrolls sideways rather than wrapping over the log. Turn the
split off and the same screen becomes the usual tabbed pane, one tool at a time.

Tools stay open. The first tool you pick fills the half; picking another adds a
tab beside it rather than replacing it, so the directory, the mail admin, and
the map can all be to hand and you move between them with one click. **← All
tools** goes back to the shelf without closing anything, and the **Close**
button in the bar drops the tool that is on screen. Every open tool is reread
after a command, so a tab never shows the machine as it was before the command.
The tools you have open are part of this visit, not of the attempt: a reload
gives you back the split setting but an empty half.

**Remote Desktop** opens a live session on a fake Windows desktop. The Start
menu, Settings, Control Panel, browser, printer app, and Terminal all change the
simulated machine through the same audited commands the side terminal runs — the
Terminal app is that same command pipeline — so a click or a typed command is
recorded in the action log exactly like typing into the Terminal tab. The
Terminal app runs its commands on the machine the session is open on, not on the
ticket's own host, and that work feeds module 8: a session opened, a machine read
before it was changed, and the change written up in the ticket.

More than one desktop can be open at once. A second connect leaves the first
session running, and the bar above the shell lists every open machine, with the
one in view pressed. Choosing another is a recorded step — `use-remote-session`
— so the log, the debrief, and an un-run all agree on which desktop the next
command ran on; ending the one in view hands the shell to another open session,
or back to the machine list when none is left.

Each revealed hint costs points of diagnostic reasoning. **Settings** sets that
price and the per-ticket cap, including making hints free; the values are copied
onto an attempt when it starts, so changing them never re-prices a ticket that is
already open. The same control sets a per-attempt hint budget that rations hints
without charging for them — it caps how many one attempt may reveal, and still
applies when hints are free.

Every step of the log carries an un-run control in the terminal's gutter. A
mistaken check is not abandoned with the ticket: un-running names the cut — this
step and the ones after it — and then takes them off the log with the world they
changed, so a wrong check stops counting towards the score, a revealed hint is
refunded, and an unlocked account goes back to locked. The log keeps one line
saying what went, and the debrief says how many steps went in how many rewinds,
because the score is read from the log as it stands rather than from everything
that was ever tried. A cut made by mistake can itself be put back while it is
still the last work in the log: the marker keeps the steps it took, so they
return with their world, hints, and score instead of being retyped. Once new
work lands after the cut, the cut stands. An attempt sat as an exam cannot be
un-run at all.

**Exam mode** sits beside that price. While it is on, every ticket you open is
sat as an exam: no hint is available for as long as the attempt is open, and the
attempt is priced at the standard rate rather than your own, so two people who
sit the same ticket are scored the same way. The debrief hands the withheld
ladders over afterwards, step by step, so a missed step is still explained.

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
