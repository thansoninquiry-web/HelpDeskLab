# Intune simulator module (M5)

A self-contained practice console at `/intune`: fifteen fictional devices, twelve
fictional people, two compliance policies and four apps, all local. Actions taken
in the console change the estate and are what the practice tickets are verified
against.

Everything under `src/modules/intune/` is meant to be liftable: it imports the app
only for the scoring thresholds, and the app touches it through two functions.

## Layout

| Path | What it holds |
|------|----------------|
| `types.ts` | The module's vocabulary: devices, users, policies, apps, events, actions |
| `data/seed.ts` | The starting estate, with timestamps relative to first open |
| `logic/compliance.ts` | Policy evaluation, app targeting, version comparison |
| `logic/actions.ts` | The device action engine and its audit events |
| `logic/commands.ts` | The terminal's resolver: what a typed cmdlet reads, and which action it asks for |
| `tickets/templates.ts` | The eight practice tickets |
| `tickets/scoring.ts` | Attempt scoring, reuse of the app's thresholds and bands |
| `tickets/registry.ts` | The two-function seam (register + completion check) |
| `persistence/store.ts` | Reads, seeds and writes the `intune_*` tables |
| `service.ts` | Use cases against the store, with the clock injected |
| `ui/` | Devices, device detail, policies, apps, course and practice tickets |

The app side is `src/app/intuneService.ts`, which hands the module the local
database's `intune` store. Nothing else in the app imports the module.

`/intune/course` is the console's own tab for the lessons its tickets are drawn
from: the three Intune modules in course order, each with its progress and a link
to `/modules/<id>`. It exists so the course is reachable from the console
without opening a ticket first — the reverse of the lesson link each ticket
carries. It keeps no data of its own: the list comes from `loadCurriculum()`
filtered on `practice === 'intune'`, the same field the dashboard uses to decide
where a module is worked, so adding a fourth Intune module needs no change here.

## Data model

Seven tables, all prefixed `intune_` and created by migration 14:

- `intune_users` — twelve people; `status` is `active` or `disabled`, and
  `group_id` is the group their apps would target.
- `intune_devices` — fifteen devices. Stores the device's *raw settings*
  (BitLocker, passcode, encryption, build) rather than a compliance verdict, plus
  the lifecycle (`managed`, `retired`, `wiped`) and `policy_stale`, which is the
  "checked in but not re-judged since the policy changed" fault.
- `intune_device_apps` — install status per device and app.
- `intune_policies` — two policies with a JSON rule list and a grace window.
- `intune_apps` — four apps with the groups they are required for.
- `intune_events` — every action attempted, including refused ones, and the
  `review` rows the read step writes.
- `intune_attempts` — a practice attempt, its finish time and its score JSON.

Compliance is never stored as the truth: it is computed by
`evaluateCompliance` and cached on the row so a list can be read in one query.

A device is **not evaluated** — rather than non-compliant — when it has never
reported, has been silent for more than fourteen days, or has a stale policy
verdict. Pretending otherwise is how real consoles send people to fix a machine
that is simply switched off.

**In grace** means the device is failing a rule but started failing less than the
policy's `graceDays` ago. The clock starts on the first failing evaluation and is
cleared when the device passes again, so a device that breaks next month gets a
fresh window.

## Actions

| Action | Effect |
|--------|--------|
| `sync` | Checks in, applies policy-set settings (BitLocker, passcode, encryption), collects pending installs, clears a stale policy verdict, re-judges. **Fails** on a device silent for more than fourteen days. |
| `restart` | Checks in and requeues failed installs. Fails on a silent device. |
| `assign-apps` | Queues the apps the device's group requires; the next sync installs them. |
| `reassign-user` | Changes the primary user. Refuses a disabled account. |
| `remove-group` | Drops the group and the assignments that came with it. |
| `retire` | Removes company data and assignments; the device stays with its owner. |
| `wipe` | Factory reset. Owner, group and check-in are cleared. Irreversible. |

**Read the device record** is not a device action: it changes nothing, and it is
available before any fix from the ticket panel. It writes a `review` event and
answers with the verdict and the failing reasons, which is the console's own
record of "I looked before deciding". Reading after the first fix is still
recorded, but it no longer counts as reading first.

Two things the console deliberately cannot do: install an OS update (a build
number is the user's to fix) and act on a device that is retired or wiped. Both
refusals are recorded as events, which is what makes the wrong path visible in
the activity log rather than silent.

## Tickets

Eight templates, each naming one seeded device and the reference path. A ticket
is complete when `template.verify(device, state)` is true — a state check, not a
keystroke check, so any path that reaches the end state resolves it.

| Ticket | Device | Reference path |
|--------|--------|----------------|
| Laptop non-compliant | LT-2207 | sync |
| Portal app will not install | LT-2402 | restart, sync |
| Lost phone needs a wipe | IPH-3390 | wipe |
| No check-in for a month | WS-1120 | sync (fails), retire |
| New starter needs the standard apps | IPH-3366 | assign-apps, sync |
| Leaver device still enrolled | AND-4455 | retire |
| Stuck on "not evaluated" | WS-1264 | sync |
| Wrong primary user | WS-1301 | reassign-user |

Every reference path also starts with *Read the device record*, which changes
nothing and is not listed in the table because it applies to all eight; the table
names the console actions that follow it.

Scoring is out of 100: 10 for reading the record before the first fix, 55 for the
expected actions in order (half credit out of order), 20 for the state check
passing, 15 for not damaging a device the ticket did not ask to destroy. A wipe
the ticket never called for costs 40 and a retire 25, which is how "wiped the
wrong device" fails an attempt that otherwise read well. Bands and thresholds are
the app's own, imported from `domain/generator/rubric`, so an Intune score sits
beside any other.

The same points are split into the app's rubric categories: reading first is
**diagnosis** (10), the expected actions and the state check are **resolution**
(75), and the no-damage rule is **safety** (15). The destructive charge is taken
out of safety, the category it damages, as the evaluator does with a procedure
violation. Documentation carries no points because the console has no notes step;
it reads `not scored in the console` rather than a fabricated zero. The split is
stored in the attempt's score JSON and published with its history, so a console
attempt joins the weak-topic ranking and the category breakdown on Progress.  A finished attempt also earns XP, counts toward Asset Management, and feeds
  the three console modules — see *Progress* below.

## Progress: XP, stats and the curriculum

An Intune attempt is not a ticket session, so it is never written into
`sessions` or `scores`: a session without a world would appear in the practice
queue and open a debrief with nothing to show. Instead [progress.ts](src/modules/intune/progress.ts)
publishes finished attempts in the same shapes those tables produce, and
`src/app/intuneProgress.ts` is the one reader the rest of the app uses.

- **XP and rank.** A finished attempt earns `difficulty × 30 + (passed ? 40 : 10)
  + (strong ? 30 : 0)`, from `domain/progress/xp.ts` — the same function the
  ticket evaluator now uses, so all three surfaces pay the same. Re-checking an
  attempt updates its row rather than paying twice; starting a new attempt after
  finishing one pays again.
- **Scenario stats.** Attempts fold into `scenario_stats` through
  `domain/progress/leitner.ts`, the rule the practice service used to keep to
  itself: attempts, passes, best score, review box and due date all match a ticket
  family. The Progress table lists each template under its ticket title and links
  the row to `/intune/tickets`.
- **Weak topics.** The Progress page ranks the merged ticket and console history,
  so a template averaging below 90 appears in *Focus next* with the rubric
  category that costs the most marks. Because the template id is not a practice
  family, that row opens `/intune/tickets` rather than a queue filter.
- **Simulator tags.** Every row in *Focus next* and *By scenario* carries a
  `Service desk` or `Intune` tag, derived from the same reader that decides where
  the row links. A merged history therefore says which simulator the attempt was
  made in without the learner having to recognise the template id.
- **Simulator filter.** Each of those two lists has an *All / Service desk /
  Intune* filter. The two controls share one piece of page state, so narrowing
  one narrows the other, and the section counts, the "only" note and the empty
  copy all follow the choice. The receipt and rank above them stay lifetime
  figures, and the filter is not persisted: a reload opens on *All*.
- **Curriculum.** The console carries coursework of its own. Modules 17–19 are
  judged entirely here, grouped by the decisions the templates already cover:
  *Intune: Device Compliance* (`intuneReadBeforeFix`, a compliant end state, a
  refreshed verdict, full diagnostic marks), *Intune: App Deployment* (a fixed
  install, the full required set, no destructive action) and *Intune: Device
  Lifecycle* (a leaver retired, a lost phone wiped, a stale record cleared, a
  wrong owner corrected, three lifecycle decisions in total). Each requirement
  reads a counter filled from the stored score JSON — the read step, the
  category split, the safety mark, and passes split by template. Asset
  Management (module 12) keeps its two broader console requirements.

A module's XP is the sum over its scope, and the console modules name their
tickets in `intuneTemplates` instead of the service-desk family ids. Attempts
are already keyed by template id in the merged history, so a console lesson's
"XP on these tickets" line adds up the same way a ticket module's does.

The lessons live in `domain/curriculum/lessons.ts` beside the others and use a
third practice kind, `{ kind: 'intune', templateId }`. The lesson page links to
`/intune/tickets?template=<id>`, which the queue reads to open on that ticket
with a fresh attempt. The console is still not a ticket session: nothing here
writes into `sessions` or `scores`.

## Phone width

The console is fluid rather than a separate phone layout. The filter bar wraps,
each field can shrink, and below 480px each filter takes a row of its own because
three 11rem fields cannot share a phone's width. A wide table scrolls inside its
`.tableWrap` — the page never scrolls sideways — and the phone block tightens the
cell padding so the device table's five columns spend their width on values. The
action bar, its confirmation dialogs, the section navigation and the ticket rows
all wrap; the estate cards stack through `minmax(min(16rem, 100%), 1fr)` so a
fixed floor cannot widen the page at a larger text size.

[`tests/ui/intuneNarrow.test.ts`](tests/ui/intuneNarrow.test.ts) holds this at
390px: it reads the root size, the gutter and the text scale out of the
stylesheets, works out that the content column is 358px at the default size and
354px at Large, and checks every floor and wrapper against those numbers.

## Adding a ticket template

1. Add an entry to `INTUNE_TICKET_TEMPLATES` in `tickets/templates.ts`.
2. Name a seeded `deviceId` (or add a device to `data/seed.ts` and reset).
3. Write `expectedActions` in the order the reference path takes them.
4. Write `verify(device, state)` so it reads the estate, not a counter.
5. Add the explanation and three hints: a nudge, a narrower nudge, then the step.
6. Optional, for coursework: give it a counter in `MODULE_MEASURES`, fill that
   counter from `passesByTemplate` (or its category) in
   `modules/intune/progress.ts` and `domain/curriculum/evidence.ts`, then name
   the counter in a requirement and add the template id to that module's
   `intuneTemplates`. Modules 17–19 are written this way.

No other file changes: the queue page and the completion check read the registry,
and the tests iterate the list. Do not add the read step to `expectedActions`: it
is scored once for every template, before the path, so listing it would make the
read compete with the fix for the action points.

## Adding an action

Add it to `DEVICE_ACTIONS` in `types.ts`, handle it in `applyDeviceAction`, give
it a label and a confirmation sentence in `ui/DeviceActions.tsx`, and decide
whether it is destructive. `isDestructive` and the scorer's penalty read the same
list, so a new destructive action is priced without touching the scorer.

## Reset

Practicing changes the estate for good. The devices page has a two-step reset that
deletes the module's rows and reseeds them; practice attempts go with it.

## Terminal

`/intune/terminal` is the estate as a shell. It is a second way to the same
service, not a second implementation: every command resolves against the loaded
estate in `logic/commands.ts`, prints, or asks the page to run exactly one action
through `IntuneService.act`, which is what the action bar calls too. So a sync
typed at the prompt writes the same `intune_events` row, moves the same device,
and scores the same as the button.

Two rules hold the shell to the rest of the console:

- **Nothing destructive.** `Retire-Device` and `Wipe-Device` are refused with a
  pointer to the device page. Wiping a phone is still a two-step decision stated
  in full sentences, and a terminal that does it on one line would undercut that.
- **Reading counts.** `Get-Device` prints the record and records the read, the
  same event the *Read the device record* button writes, so working from the
  terminal cannot cost a learner the diagnosis points the button would have
  earned. `Get-Devices`, `Get-Compliance`, `Get-Apps` and `Get-Policies` are
  plain reads and record nothing.

The pane itself is `ui/components/CommandConsole.tsx`: prompt, scrollback, up and
down to recall, `help`, `Clear-Host`. It knows nothing about Intune, so the Azure
console beside it borrows the same component and supplies its own prompt.
