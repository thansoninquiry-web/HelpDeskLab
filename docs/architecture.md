# Proposed architecture — independent helpdesk simulator

Status: **proposal for review.** Nothing in this document has been implemented
as part of the audit. It describes how *our* simulator could be built from the
observed workflows in [workflow-spec.md](workflow-spec.md) without copying the
reference product's code, content, branding, markup or assets. Its information
density, shell structure and tools-menu colour informed our own visual
language; the tokens that implement that language, and the contrast rule they
are held to, are documented in
[architecture-helpdesklab.md §8](architecture-helpdesklab.md#visual-language).

Audience: whoever approves the audit and roadmap.

> This file is the **proposal** for the next stage. The architecture that the
> current application already implements is documented separately in
> [architecture-helpdesklab.md](architecture-helpdesklab.md).

---

## 1. Goals and non-goals

### Goals

1. **Practice a realistic first-line queue**, not a quiz: claim, diagnose, act,
   confirm, close, with a simulated estate behind every ticket.
2. **Offline by default.** No account, no backend, no telemetry, no network
   request after first load. All progress lives in the browser.
3. **Deterministic.** A seed reproduces a ticket, its world, its scoring and its
   hints. Tests can replay any scenario.
4. **Original content and presentation.** Our own company, tickets, prose,
   colour values and component design; the reference's dense shell and
   mono-led typography are matched by re-implementing them, never by copying
   its markup or assets.
5. **Explainable scoring.** Every point is tied to a rubric item the learner can
   read afterwards.
6. **Cheap to extend.** New tools and ticket families are content + a reducer,
   not a new app.

### Non-goals (v1)

- AI voice calls, AI interviewers, or any LLM dependency.
- Accounts, sync, leaderboards, classrooms, payments, certificates with public
  verification.
- Pixel parity with any existing product.
- Mobile-first layout (responsive but desktop-first).

Those are sequenced in [implementation-roadmap.md](implementation-roadmap.md).

---

## 2. Design principles

| Principle | Consequence |
| --- | --- |
| Pure domain core | No React, no storage, no `window`, no clock/random globals inside `domain/` |
| One direction of dependency | `ui → app → domain`; `app → persistence`; `persistence` imports domain types only |
| World, not screens | Tools mutate a typed world; the UI renders it. A ticket never calls a tool directly |
| Content is data | Families, variants, hints, rubrics and interview banks are typed data validated at build/test time |
| Every action is an event | An append-only action log makes replay, debrief and testing possible |
| Tools mirror the terminal | A console action runs the same audited command the learner could type; a parity test fails when a scored reference command has no console action (including the ones that need a value typed in) |
| Determinism is testable | Seeded RNG + injected clock; same seed ⇒ byte-identical world and score |
| Local-first privacy | Export/import is an explicit file the user chooses; raw pasted text never leaves the device |

These mirror the layered shape already used in this workspace
(`src/domain`, `src/app`, `src/persistence`, `src/ui`), so the proposal can be
implemented incrementally rather than as a rewrite.

---

## 3. System view

```
┌──────────────────────────────────────────────────────────────┐
│ ui/            React routes, consoles, panels, a11y          │
│   components/  terminal, ticket pane, tables, dialogs        │
└───────────────▲──────────────────────────────────────────────┘
                │ view models + intents (no SQL, no rules)
┌───────────────┴──────────────────────────────────────────────┐
│ app/           use cases: start ticket, run command, resolve │
│   services     queue selection, scoring, backup, interview   │
└───────┬───────────────────────────────┬──────────────────────┘
        │                               │
┌───────▼──────────────┐      ┌─────────▼──────────────────────┐
│ domain/              │      │ persistence/                   │
│  world/  reducer     │      │  SQLite (sql.js WASM)          │
│  generator/          │      │  IndexedDB snapshot store      │
│  scoring/            │      │  repositories + migrations     │
│  progress/           │      └────────────────────────────────┘
│  interview/          │
└──────────────────────┘
```

**Flow for one action**

1. UI emits an intent (typed command or tool action).
2. `app/commandService` loads the session + world, calls
   `domain.world.applyCommand`.
3. The reducer returns `{ world, output, effects }`. Effects are declarative
   (`unlock_account`, `reboot_device`, `send_chat`, `award_points`), not
   callbacks.
4. `app/resolutionService` evaluates the ticket's completion predicate against
   the new world + confirmations, updates the ticket state, and persists the
   action and outcome in one transaction.
5. UI re-renders from the returned view model.

No component ever mutates state directly; no reducer ever touches SQLite.

---

## 4. Domain model

### 4.1 World

```ts
type World = {
  seed: number
  clock: number              // injected, never Date.now() inside domain
  company: Company           // fictional tenant, departments, sites
  directory: DirectoryState  // users, groups, licences, MFA, mailbox links
  network: NetworkState      // devices, links, DNS/DHCP, statuses
  servers: ServerState
  assets: AssetState
  mail: MailState            // mailboxes, rules, quarantine, blocklist
  shipments: ShipmentState
  endpoints: EndpointState   // per-host settings, installed software, logs
  chat: ChatState
}
```

Every mutation goes through a command reducer. Commands are small and typed:

```ts
type Command =
  | { kind: 'directory.resetPassword'; userId: UserId }
  | { kind: 'directory.unlock'; userId: UserId }
  | { kind: 'network.reboot'; deviceId: DeviceId }
  | { kind: 'endpoint.setTimeZone'; hostId: HostId; zone: string }
  | { kind: 'mail.trace'; mailboxId: MailboxId; window: TraceWindow }
  ...
```

The reducer returns output lines/panels for the console plus effects. This is the
same pattern used by terminal-style tools today and keeps tools independent.

### 4.2 Ticket

```ts
type Ticket = {
  id: TicketId
  seed: number
  familyId: FamilyId          // e.g. ACCESS_LOCKOUT
  variantId: VariantId
  difficulty: 1 | 2 | 3
  category: Category          // Network | Hardware | Software | Access | Security | Email
  priority: 'critical' | 'high' | 'medium' | 'low'
  requesterId: UserId
  subject: string
  description: string         // generated, never user-pasted
  createdAt: number
  status: 'available' | 'in_progress' | 'resolved' | 'closed' | 'escalated'
  assignee: 'player' | null
  resolution: ResolutionState // hypothesis, actions taken, notes
  basePoints: number
}
```

**Completion is a predicate, not a button.** Each family declares:

```ts
type CompletionRule = {
  world: (w: World, t: Ticket) => boolean   // the fault is actually gone
  requires?: ('confirm_with_user' | 'post_announcement' | 'identity_verified')[]
}
```

A ticket becomes `resolved` when the predicate passes *and* required
confirmations exist. This reproduces the observed behaviour where a fix in a tool
automatically flips the ticket, while tickets that end in chat need the
confirmation before they can close. The UI still exposes an explicit close step.

### 4.3 Rubric

```ts
type RubricItem = {
  id: string
  weight: number                 // points
  check: (evidence: Evidence) => boolean
  label: string                  // learner-facing explanation
  critical?: boolean             // e.g. verify identity before reset
}
```

`Evidence` is derived from the action log + final world, not from the UI. A
`-10` identity violation is a negative-weight item with `critical: false`
(the ticket can still pass). This keeps scoring reproducible and lets the
debrief explain every line.

Network tickets are also read against the Server Room map at close. Every link
proved by a recorded check pays a 25 XP bonus; when even one link is unproved,
no bonus is paid and the debrief separates the links that were never tested from
those that were tested and failed.

The same read happens before the close is committed. `reviewClosure` scores the
attempt as it stands and returns the map summary with it, so the confirmation
panel can name the links still missing (each with the check that would prove it)
and the bonus that closing now would leave unclaimed. A review that would pass
but has an unproved map is still shown, because the bonus is all-or-nothing and
the decision to give it up belongs to the learner; the panel is retired as soon
as any new step changes the evidence, so it can never quote a count the log no
longer supports.

The same dry run is read continuously, not only when the learner asks for it.
The workspace shows a **projected close** in the stage bar: the total the close
would write, with the code and handoff note as they stand, and the process cost
and hint penalty named against it — already deducted, because they are already
out of the number. It is recomputed after any step and after a short pause in
typing, from the same evaluator the close uses, so the forecast cannot drift
from what the button would charge. Nothing is charged until the close is
committed: the projection is a read, like the review, and a dry run that fails
shows no number rather than one nobody would be charged.

---

## 5. Generation and content

### 5.1 Families and variants

```
domain/generator/
  catalog/
    access/lockout.ts
    access/newHire.ts
    network/wifiDown.ts
    network/vpn.ts
    hardware/printer.ts
    hardware/monitor.ts
    software/timezone.ts
    email/quota.ts
    email/quarantine.ts
    security/socialEngineering.ts
  builder.ts        // variant + seed → ticket, world patch, rubric, hints
  selection.ts      // weighted, duplicate-aware choice
  fairness.ts       // static lint run in tests
```

A variant declares the fault it injects, the delta from the base world, the
rubric, and a hint chain. Every rubric item owns a three-step chain — the
evidence to gather, how to read it, and the finding it should produce — so hints
are revealed one rung at a time with a known point cost and a visible count
remaining.

A variant can put its difficulty in the request rather than the fault.
`PWD-01/pressured-lockout` is an ordinary locked account with a caller who names
the fix, demands it now, and refuses the questions. The rubric makes the
directory lookup and the caller verification critical and ordered before any
change, so an obedient fix that skips them fails on evidence rather than on
taste. The caller's scripted replies carry the same intent, so asking a question
presses harder instead of releasing the pressure.

The pressure on that ticket does not stop at the request: the caller breaks in
with lines of their own when the desk stalls or plays into their hands. The rule
for when a line is due is `src/domain/environment/pressure.ts`, decided from the
call so far — steps taken without identifying anyone, minutes of the desk's
time, running the reset they asked for, or changing the account before the lookup
that would have justified it — so the same attempt earns the same lines in the
same order however it is read. The lines are the variant's own content, held
beside its request text and carried on the generated ticket, so a second
pressured ticket needs no entry in the service: `PRN-01/angry-caller` reuses the
stopped-spooler fault and declares its own script, where restarting before
reading the queue earns the sharpest line, a stall earns the clock, and carrying
on after either warning climbs the ladder. Each line is appended as an
`ask-user` action, the kind an answered question already uses. That is what keeps
a call turn out of a migration: it is in the action log, it reads back after a
reload, and a line that has been said cannot be said twice. Being spoken to costs
nothing — the mistakes the caller is pleased about are priced by the rubric, not
by the interruption.

The debrief turns that same log into a pressure report. `pressureReport` in
`src/domain/tickets/pressureReport.ts` counts each break-in the log still holds
and names the action immediately before it — the command, note, identity check or
refusal the caller was answering — so an attempt explains how hard it was pushed
without a second record that could drift from the trail. It is derived on read,
not stored with the score, so a debrief opened months later reports the same
beats as the one shown at the close.

Nothing the learner does can make a silent minute happen, so the caller cannot
rely on the desk acting: the workspace asks whether a line is due on a timer
(`callerInterjection`, every twenty seconds), which is what turns a stall into an
interruption rather than a remark the desk earns by doing something else. The
tick returns the attempt only when the caller actually spoke, and the panel keeps
the read it already had if its own newer view has a later step, so a command
completing while a tick was in flight is never undone by it. Escalation is
written as sequencing rather than as more triggers: a line may declare
`onceSaid`, meaning it is the answer to having already been warned, so the
author writes `unverified change → ignored warning → hands over the password` as
three lines in that order. Both the wrong-action reactions and the stall lines
stand down once the caller has been verified, and a refused request ends the
script outright: the desk has answered the call, so there is nothing left to
press for.

An impersonation puts the difficulty in who is asking. `PWD-01/impersonated-caller`
is an ordinary active account with someone on the phone claiming to be its owner
and asking for the unlock and the reset that owner would want. The variant sets
`callerImpersonating` on the world, which is the whole mechanism: the identity
gate still sends the live code to the employee on the ticket, and the read-back
answers `not-the-caller` whoever is asking and whatever digits they try, because
the only number that would verify is in a phone the caller is not holding. The
rubric pays for the refusal and the report to Security and prices a reset as a
critical miss, so the attempt passes by noticing that the gate cannot be
satisfied and acting on that rather than on the caller's story.

A variant can also put the caller's claims on the world (`callerClaims`), each
naming the account it is about and the directory state it implies, or flagging
itself as a claim about who is on the line. `contradictedClaims` in the
verification domain sets those claims beside the evidence the attempt's log
actually established: the directory rows a successful `get-account` read
recorded, and the gate's own findings when a code goes to the employee's own
contact and never comes back or a callback is told the request is not theirs.
The claim to be the employee can only be answered by the gate; a claim about an
account is only answered if the learner looked that account up, because a
statement no one checked is not a contradiction. The gate and the debrief quote
the claim and the evidence together for as long as those actions remain in the
log. A claim the record supports is not reported, and a later unlock cannot
rewrite history: the row kept is the first read of that account, before any
change the attempt made.

The hardest version of the same question puts the request in chat rather than on
the phone. `PWD-01/chat-relay-reset` has a helpdesk colleague relaying a reset
for their manager: the request comes from an internal account, cites the owner’s
employee ID, and sounds like the routine favour one desk does for another. None
of that is authority over someone else’s password. The mailbox is the second
witness, and the one the chat cannot fake: the account doing the asking has an
external forward on its own mailbox, so `get-mailbox` shows the helper’s mail
leaving the organisation while the helper asks for someone else’s credentials,
and a `get-account` on the requested account shows it active. The person in chat
is not the colleague whose phone takes the code either, so the gate cannot be
read back; the debrief quotes the lockout claim and the claim to be the
colleague beside the directory row and the failed read-back that answered them.
The refusal is not a judgement about the story’s plausibility but about the two
things a chat thread cannot supply: the owner’s request, and proof that the
account asking is being used by its owner.

A callback is the second way to prove who is on the line, and
`PWD-01/callback-verification` is where it is the only one. The variant sets
`mobileOutOfAction` on the world, so the handset that would take a code still
takes one and still rings, but nothing can come back from it: the code gate
answers `unreachable` however the caller replies, and a call to that line gets
no answer. Contacts carry the methods they support and whether they currently
reach the person, so the desk line on file is the one path through, and its
`callback` method is the evidence the rubric asks for: the item checks for a
`verify-caller` action whose recorded method is `callback`, and a read-back
cannot stand in for it however the digits arrived. The weight is the item's own
rather than a share of the code gate's, both because the check is a separate
act and because placing the call is what makes the unlock defensible.

`M365-01/mfa-method-lost` is the other ticket where a code cannot be the proof:
the user has replaced their handset, so the only registered method points at a
phone they no longer hold. The same `mobileOutOfAction` flag puts the desk line
on file beside the dead mobile and makes the code gate answer `unreachable`,
which leaves the callback as the check the rubric names. The MFA reset is checked
in order behind that call, because clearing MFA hands account access to whoever
is on the line, and a reset placed first is both a failed step and an
unverified account change.

The variant prices nothing for the call, but the ordinary ticket does. When the
caller's own handset could have taken a code, the evaluator reads the first
successful `verify-caller` action and charges
`CALLBACK_OVER_CODE_PENALTY` (5, safety) if it was a callback: the gate still
opens, because the call is a real check, but the code proves the person on the
line holds the handset while a callback only reaches whoever answers the line
on file. The price is read from the log and from the world, never from what the
panel claims, and a callback that follows a code read-back costs nothing
because the gate was already cleared by the stronger check.

Badge and manager checks no longer exist as ways through. A badge number is a
fact the caller can recite without holding anything, so it was removed rather
than priced; a code sent to the manager is answered `wrong-recipient`, and a
callback to the manager `wrong-contact`, because neither proves who is on the
line, and both stay in the panel as the dead ends they are.

Replay pins the variant, not just the seed: a stored ticket carries its
`variantId`, and replay passes it to the generator. Without that, adding a
variant to a family would silently move old tickets onto a scenario they were
never scored against.

Four families put the work in a console rather than the terminal: `MAIL-01`
(mailboxes and delivery), `MAILSEC-01` (quarantine decisions), `RDP-01` (remote
desktop support) and `DEP-01` (imaging and deployment). Their reference paths are
built only from commands a console offers, so the tool is the intended route and
the terminal is an alternative rather than the only way through. A read that the
rubric pays for is a console action, not just a line in a record: Mail Admin
logs `get-mailbox`, Mail Security logs `trace-message`, Remote Desktop logs
`get-remote-machine`, and Computer Deployment logs `get-deployment`, so the
read-only step that has to come before a change reaches the ticket evidence the
same way a typed command does. Those four reads are also in the evaluator's
evidence set, which is what keeps a mail or deployment fix from being priced as
a change made before anyone looked. Every command declares whether it reads or
changes, so ordering is never guessed from whether a run reported an effect:
`ipconfig /all` looks, `/renew` changes the lease, and a change that had nothing
left to do is still a change.

`RDP-01` works on a second machine at the caller's site, because the machine the
console runs on can never be its own session target. The variant marks that
machine as the caller's handover unit, clears any session left on it, and puts
its hostname in the `{targetHostname}` slot, so the ticket names the machine the
learner has to connect to. The machine is chosen from the site and the device
kind rather than from the random stream, so the build, the reference path and
the rubric all name the same machine. `DEP-01` is about a shelf machine instead
of the caller's device: one variant reruns a failed imaging sequence and the
other finds a damage hold and hands it to Field Services without imaging over
it. Console parity resolves each reference step against the world as the replay
has reached it, so a desktop action that only exists once a session is open is
still reachable from the console in the order the reference uses it.

### 5.2 Fairness lint

Property tests assert, per family × variant × sample of seeds:

- the fault is observable through at least one tool;
- the rubric is satisfiable by commands the app exposes;
- the completion predicate is false before the fix and true after;
- no hint references a tool or field that does not exist;
- ticket text does not leak the answer verbatim;
- the same seed produces identical output.

This is where most simulation bugs get caught, before UI work.

---

## 6. Queue weighting (including job targets)

Base selection is a weighted sample over eligible families, filtered by
difficulty pool and Training-Focus-style categories. Two multipliers make it
personal without a server:

```
weight(family) =
    baseWeight
  × demand(family)          // target-listing mentions, normalised
  × weakness(family)        // 1 + (1 − normalisedScore) × k
  × recencyPenalty          // last-played / duplicate avoidance
```

- `demand` comes from the local job-target feature: deterministic keyword
  extraction maps listing text to families and skills.
- `weakness` uses per-family accuracy and rubric misses, not just pass rate.
- Weights are recomputed on read; there is no background job.
- A visible "why this ticket" line explains the multiplier, so the weighting is
  inspectable rather than magic.

This is the main original differentiator relative to the reference product,
which documents a manual category filter plus an automatic difficulty ramp.

---

## 7. Persistence

- **Engine:** SQLite compiled to WASM (sql.js), persisted as a snapshot in
  IndexedDB. No OPFS requirement, so it works in every supported browser.
- **Why SQLite:** relational queries over progress/history, migrations, and a
  single-file export. It also matches the existing local-first codebase.
- **Write path:** one transaction per action batch; snapshot persisted
  debounced (for example 300 ms) and on `visibilitychange`.
- **Schema (proposed):** `tickets`, `sessions`, `actions`, `scores`,
  `scenario_stats`, `settings`, `job_targets`, `job_target_skills`,
  `interview_sessions`. Raw listing text lives only in `job_targets.raw_text`
  and is excluded from share exports by construction (no column in the export
  mapper).
- **Backup:** export/import the SQLite bytes with a schema-version guard and a
  transactional restore. No cloud.

**Threat model:** another local user of the same browser profile can read the
data; we do not claim encryption at rest. The README states this plainly.
Pasted listing text is real user data: never log it, never include it in demo
files or commits, and strip it from share exports.

---

## 8. UI architecture

| Surface | Composition | Notes |
| --- | --- | --- |
| Dashboard | Queue list, My Queue, points/tier strip, daily limits | Queue is the primary navigation |
| Ticket workspace | A service-desk stage: ticket card and case file in the left rail, one bordered tool console on the right | Tools open in place from the header menu or the Tools tab; the ticket stays visible while a console is used; the terminal keeps its own tab |
| Consoles | Directory, Server room, Remote Desktop, Computer Deployment, Printers, File shares, Documentation, Mail Admin, Mail Security, Assets, PC Shelf, Ship Manager (all delivered) | One `ToolConsole` pane renders any projection + action list, registered in `domain/environment/consoles.ts`; a console whose records are short declares a tile grid and keeps the rows as the default read, so the Directory has a List/Grid switch over one selection and one action list; an action may declare inputs it cannot run without, and offers as chips only values the attempt already holds — a mailbox’s listed message ids, the printers its desktop lists, the leases a scope check printed; a console may declare state filters, and the Directory’s read the live world so locked, password-expired, and disabled accounts narrow without a second listing to keep in step (the records still print no state, and the audited command remains the evidence); a Directory record also carries the desk’s closed history with that account, built from the newest ended sessions so past commands and ticket closes show as a per-account timeline while an open attempt stays out of it; a console may declare itself a picker, and only Remote Desktop does, so each machine row carries the button that connects while the record opens below it; the shelf in `domain/environment/tools.ts` lists exactly the registered consoles |
| Remote Desktop | A live session opens on a fake Windows shell (`ui/components/FakeDesktop.tsx`): Start menu, Settings, Control Panel, an intranet browser, a printer app, and a Terminal | Its projection (`domain/environment/remoteDesktop.ts`) carries the machine, its site printers, and the audited `remote-*` action ids; every control runs the same command the terminal would, and the Terminal app submits through the same service as the side terminal, recorded under the `remote-desktop-terminal` source and run against the session's machine rather than the ticket host, so `hostname` and `ipconfig` describe the desktop in front of the learner; the log records that machine's hostname with the command, so the workspace and the debrief name the desktop the output came from. Several sessions can be open at once: `world.remoteFocus` names the desktop in view, connecting to a machine that is already open brings it to the front instead of refusing, and `use-remote-session` switches between them as a recorded read-only step the replay can fold, so a rewind restores the machine that was in front at that point. The session bar lists the open desktops and their focused one, and ending the desktop in view falls back to the newest open session; a session recorded against the console's own machine is not a desktop at all |
| Debrief | Score, rubric checklist with evidence, each revealed hint rung priced beside the step it unstuck, attempt trail labelling every step with its source (terminal, console, hints, notes panel, identity panel) and, for a command, the machine it acted on, the caller's break-ins with the step each one followed, commands grouped by tool with the rubric credit each one earned or a dead-end verdict, the network map as it stood at the close, model steps, notes | Read-only replay of the action log; hint rungs are re-priced from the log so an old debrief reads the same, and a score whose log is missing reconciles its hint count against the steps instead of showing two different numbers |
| Progress | Accuracy, per-family breakdown, streak, weak areas, and a per-step hint habit: which rubric steps were bought with a rung and which were worked out alone | The habit is rebuilt from the stored rubrics and the logged hints (`domain/progress/hints.ts`), so a rewind, a retry, or an older attempt is reflected without a table of its own; only scored attempts count, because only they keep the rubric that names their steps |
| Job targets | Paste, extract, coverage, interview prep | Local text only |
| Settings | Hint price, cap and per-attempt budget, categories, export/import/reset | No account |

The visual system is dark by default: a near-black stage with hairline panels,
cyan signal colour, condensed uppercase display type (Barlow Condensed), Inter
for prose and JetBrains Mono for identifiers. All three fonts are bundled under
`public/fonts/`, so the look survives offline. Light mode re-declares the same
tokens in `tokens.css`; it is a paper alternative, not a second design.

The terminal is a parser over the same `World`, not a shell on a real host:
`applyCommand` looks the command up in a registry and each definition reads the
device, site, directory or network it needs. A command typed in a shell writes
the hostname of the machine it acted on beside its source, and both the workspace
log and the debrief trail read that record rather than inferring a host — so an
`ipconfig` from a Remote Desktop session is filed under the desktop it described,
and the side terminal under the ticket's own machine. A Remote Desktop console
action is filed under the machine whose row it was run from, while still running
in the desk's own context, so connecting from a machine's row does not read as
already sitting at it. A console whose records are not machines names none: it
read or changed a record through the desk's tools. Rows logged before this was
recorded, and hand-written logs, read as no machine rather than as a guess. The
curriculum decides remote work from that machine — anything other than the
console's own — rather than from the surface the command was typed in. The
Workstation group covers the everyday shell surface — `hostname`, `whoami`, `ver`,
`echo`, `dir`, `type`,
`tree`, `systeminfo`, `tasklist`, `netstat`, `tracert`, and `net user` — alongside
the domain commands. Because every console and the terminal share one state,
a `tasklist` that omits `spoolsv.exe` and a stopped spooler are the same fact,
not two storylines.

The command reference is generated, not maintained by hand: the terminal's
`help` and the workspace cheat sheet both read `COMMAND_GROUPS` and the
registry, so they list the same commands in the same groups with the same usage
lines. A guard asserts it from both ends — every runnable command (`session`
excluded, because `help` is how the reference is asked for) appears exactly
once, and each usage line names a command the parser still resolves — so a
renamed, retyped, or retired command cannot linger in either place. The
workspace test renders the panel and looks for rows the old hand-kept list never
carried, which is what makes a hardcoded list fail rather than merely differ. In
the workspace the sheet opens on the groups the ticket's scenario family is
worked with — network and workstation for a name-resolution ticket, mail for a
trace — and the rest of the reference waits behind a full-reference toggle. The
map is a toolset, not the answer path: a group leads because the work lives
there, never because one check demands a particular command.

The shelf and the shipping desk are commands, not just read-outs: `get-shelf`
counts a bay, `book-shelf-machine` issues a ready machine (only a ready one, only
to an account that holds no machine and only a tag that is not already on an
outbound shipment), and `hold-shelf-machine` records the reason a machine must
not go out. Shipping is a small state machine — preparing → in transit →
delivered — with a delayed collection rebooked into preparing instead of being
recorded as delivered, and every step writes a tracking event onto the shipment.
The PC Shelf and Ship Manager consoles run the same commands from their action
lists, and the effects (`machine_issued`, `shelf_held`, `shipment_dispatched`,
`shipment_delivered`, `shipment_rebooked`) are what modules 14 and 15 count, so a
console button and a typed command are the same evidence.

The asset register is read the same way. Asset Management's records are a
projection, and a projection is not evidence, so `get-asset <hostname-or-tag>`
is the audited form of the same lookup: it answers for an in-service machine
(holder, site, domain state, address) and for a shelf machine (state, note, booked
run, open shipment), and every record's read button runs it. The lookup is
read-only and names no procurement fact the world does not hold, so the log shows
a register read without implying a check of the machine itself.

Interaction rules learned from the audit that we should adopt (behaviour, not
visuals):

- Assignment is a deliberate step; the queue is the job.
- Hints are revealed progressively, one rung of a three-step chain at a time, at a visible point cost with the remaining count shown before the click.
- A hint costs points of diagnostic reasoning, never hidden state: the price per rung, the cap per ticket, and how many hints one attempt may take come from Settings (5, 15 and unlimited by default; a price of zero makes every rung free). Every rubric item in every family carries at least two rungs, so the ladder can be worked step by step and the cap is reachable on every ticket; a guard in the hint tests holds the families to that, and to distinct rungs rather than a repeat. The price is set per scenario family — one default, with an override for any family priced differently — and an override is keyed by family id, so a family added later inherits the default rather than needing a migration. The values are copied onto the attempt when it starts along with where they came from (the default, a family's own price, or the exam rate) and the default they departed from, so changing them never re-prices a ticket in flight; the debrief re-prices its rungs from the recorded policy and names the family price that applied, whichever way Settings reads now.
- The budget is how hints are rationed: it caps the hints one attempt may reveal, is counted separately from the price, and still applies when hints are free. Running out of budget blocks further hints without deducting a point.
- Destructive closes show the consequence on the button and in the dialog.
- Tools that own a session (Remote Desktop) open on the desktop, and require an explicit disconnect before the machine record returns.
- An action that needs a value offers the values the attempt already holds as chips, read from what the console shows or from the learner’s own logged commands (`ConsoleEvidence`). Nothing is preselected, a chip only fills the box, and a value the check exists to reveal — who can reach a share, which lease is stale — is never among them.
- Empty states teach the next step instead of saying "no data".
- Confirmations are in place ("Account unlocked."), not global toasts.

---

## 9. Testing strategy

| Layer | Approach |
| --- | --- |
| Domain | Unit tests per command; property tests over seeds; golden-seed fixtures |
| Generator | Fairness lint across sampled seeds; snapshot of ticket text |
| Scoring | Table-driven rubric cases, including negative items and boundary points |
| Persistence | Repository round-trips on in-memory SQLite; migration tests vN→vN+1 |
| App services | Integration tests for start → act → resolve → score |
| Console parity | Replay every family variant's reference path through console actions alone and require full marks with nothing typed in the terminal |
| UI | Testing Library on routes; keyboard-only pass for dialogs and tables |
| Content | Spell/link checks; no real personal data; listing text never in fixtures |
| Hint quality | Every hint in every variant is checked against vocabulary derived from the code — command registry, usage switches, world fields, and the `label : value` lines the reference paths actually print — so a hint cannot name a command, switch, field or setting the simulation does not have. The guard is itself tested with invented content, so it cannot pass vacuously (`domain/generator/hintLint.ts`) |

Determinism checks compare a serialized world + score for a fixed seed.

---

## 10. Deliberate divergences from the reference product

| Area | Reference (publicly observed) | Ours |
| --- | --- | --- |
| Accounts | Firebase auth, cloud sync | Local only, no account |
| Calls | AI voice, paid tier | Typed caller dialogue (deterministic), free |
| Interview | AI interviewer + scored transcript | Template banks + rubric, deterministic |
| Queue control | Manual category filter + auto ramp | Weakness × job-demand weighting, explained |
| Certificates | Public verification links | Local milestone badges only (v1) |
| Classroom | Teacher dashboard, assignments | Out of scope |
| Content | Their company, tickets, prose | Original fictional company and content |

---

## 11. Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Simulation becomes a quiz with one right click | Completion predicates tied to world state; require confirmations; fairness lint |
| Ticket text leaks the answer | Lint for hint/keyword leakage; test readability |
| Determinism drifts | No `Date.now()`/`Math.random()` in domain; seeded RNG + injected clock |
| Scope creep across twelve tools | Ship the loop + three consoles first (see roadmap) |
| Storing real job listings | Local-only, gitignored path, no raw text in exports, README warning |
| Unintentional similarity to the reference | Original content, our own component library, reviewed copy, no asset reuse |

---

## 12. Open architectural questions

1. Should ticket text be generated at claim time or at queue-fill time?
   (Claim-time is cheaper; queue-fill time allows a stable list.)
2. Do we need a generic "confirmation" evidence type, or per-family predicates
   plus a small set of named confirmations? (Proposal: the latter.)
3. Is the action log the sole source of truth for debrief, or do we also store a
   final world snapshot? (Proposal: both, with the log authoritative.)
4. How far should the fake desktop grow? It ships the Start menu, Settings,
   Control Panel, an intranet browser, a printer app, and a Terminal that shares
   the side terminal's command pipeline; chat and mail are the reference's next
   candidates.
5. Do job-target weights belong in the queue service or in a separate scoring
   service? (Proposal: a pure `recommendation` module consumed by the queue.)
