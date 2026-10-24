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
| `tickets/templates.ts` | The eight practice tickets |
| `tickets/scoring.ts` | Attempt scoring, reuse of the app's thresholds and bands |
| `tickets/registry.ts` | The two-function seam (register + completion check) |
| `persistence/store.ts` | Reads, seeds and writes the `intune_*` tables |
| `service.ts` | Use cases against the store, with the clock injected |
| `ui/` | Devices, device detail, policies, apps and practice tickets |

The app side is `src/app/intuneService.ts`, which hands the module the local
database's `intune` store. Nothing else in the app imports the module.

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
- `intune_events` — every action attempted, including refused ones.
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

Scoring is out of 100: 60 for the expected actions in order (half credit out of
order), 25 for the state check passing, 15 for not damaging a device the ticket
did not ask to destroy. A wipe the ticket never called for costs 40 and a retire
25, which is how "wiped the wrong device" fails an attempt that otherwise read
well. Bands and thresholds are the app's own, imported from
`domain/generator/rubric`, so an Intune score sits beside any other. A finished
attempt also earns XP and counts toward Asset Management — see *Progress* below.

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
- **Curriculum.** Asset Management (module 12) gained two requirements,
  measured by `intuneTicketsResolved` and `intunePasses`. Its summary line, XP
  and the module's progress bar read them like any other measure.

The XP is attributed to the app as a whole; a module's own XP figure still
counts only its ticket families, because a module's scope is a list of family
ids and the Intune templates are not families.

## Adding a ticket template

1. Add an entry to `INTUNE_TICKET_TEMPLATES` in `tickets/templates.ts`.
2. Name a seeded `deviceId` (or add a device to `data/seed.ts` and reset).
3. Write `expectedActions` in the order the reference path takes them.
4. Write `verify(device, state)` so it reads the estate, not a counter.
5. Add the explanation and three hints: a nudge, a narrower nudge, then the step.

No other file changes: the queue page and the completion check read the registry,
and the tests iterate the list.

## Adding an action

Add it to `DEVICE_ACTIONS` in `types.ts`, handle it in `applyDeviceAction`, give
it a label and a confirmation sentence in `ui/DeviceActions.tsx`, and decide
whether it is destructive. `isDestructive` and the scorer's penalty read the same
list, so a new destructive action is priced without touching the scorer.

## Reset

Practising changes the estate for good. The devices page has a two-step reset that
deletes the module's rows and reseeds them; practice attempts go with it.
