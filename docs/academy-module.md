# Education IT scenario pack (M12)

A school desk on a bell. `src/modules/academy/` is reached at `/academy`; every
scenario is one caller, one room and one visit that is scored and kept.

Larkspur Academy is invented for this pack — 410 pupils, 46 staff, one
technician, seven rooms and a rolling laptop cart. Nothing here names a real
person, school or machine, and no caller is modelled on anyone.

A learner-facing tutorial at `/academy/tutorial` walks one projector visit from
the bell to the note: the reads, the caller conversation, the walk-up, the
onsite checklist and where the 100 points come from. Its content is
`data/tutorial.ts`, rendered by the shared tutorial layout.

## Why a module rather than a generator family

The scenario pack was asked for "on top of the existing ticket generator". It is
built on the same scoring model, the same attempt table pattern and the same
progress feed, but not as generator variants, because the ticket engine has no
fields for the three things this pack is about:

- **a bell** — an attempt's minutes have to matter, and the generated world's
  clock advances per command rather than being part of the score;
- **a caller conversation** — a dialog tree that is scored for language, tone
  and honesty, not a free-text note;
- **a walk-up** — an interruption that arrives mid-ticket and is triaged.

Those live in the module's own attempt state, which is the same decision M10 and
M11 took for their own surfaces. The app wiring is identical: one service
factory, one table, one progress reader, one nav tab.

## The school

`data/school.ts` holds the profile the desk page shows: seven rooms with the kit
in each, the people who call, and the headline numbers. `data/people.ts` adds
the two Spanish-first staff members the caller scenarios need.

## The 25 scenarios

Five groups, in the order the desk shows them:

| Group | Scenarios |
| --- | --- |
| Classroom and projectors (6) | no signal, a projector that cuts out, a lockout before the bell, a pupil PC with a failed image, a panel that ignores touch, no sound in the room |
| Computer lab (5) | a failed rollout across the room, six-minute logins, jobs on the office printer, Wi-Fi collapsing on testing day, one PC with its switch port disabled |
| Front office (5) | a fuser jam before registers, scan-to-email, the blocked grade book, the missing mapped drive, a bursar locked out during payroll |
| Network and Wi-Fi (4) | an access point denied power, weak coverage at the back of the lab, an exhausted DHCP scope, an office PC on the student VLAN |
| Assets, moves and loaners (5) | a classroom of twelve PCs moved in, the asset register reconciled, a loan booked out, a damaged return, a cart that is not charging |

Each scenario names its caller, the bell, the reads that isolate the fault (with
the finding each one shows), the changes it offers, the reference path, a
two-step caller conversation and, for five of them, a walk-up.

## The clock

Time is part of the record, not a timer in a component. Every action writes the
minute it landed on, so a page left open overnight scores the same as one
finished in a sitting.

| Mode | Read | Change | Grace after the bell | Urgency loss |
| --- | --- | --- | --- | --- |
| Standard visit | 2 min | 3 min | 10 min | 2 points a minute |
| Time pressure | 3 min | 5 min | none | 4 points a minute |

A walk-up adds its own minutes (two for a hand-off, up to fifteen for stopping to
help). The mode can be chosen until the first action; after that the clock is
running and the mode is fixed.

## The caller conversation

Every scenario has two steps. The caller speaks first — in Spanish for eight of
the twenty-five — and each step offers three replies: a plain answer that moves
the call on, the same answer in technician's language, and an answer that
brushes the caller off. Only the plain answer earns full credit; jargon earns a
quarter.

Spanish-first scenarios carry a gloss on the caller's line and on the reference
reply, behind a **Show English gloss** button. The phrasebook at
`/academy/phrases` holds sixteen support phrases by moment (opening, finding the
fault, saying what happens next, handing over) plus a fourteen-term school
glossary. It is study material and earns no XP.

## The walk-up

Five scenarios have someone at the door once two actions have been taken. The
choices are priced in minutes: help now, hand off, or decline. The reference
answer is the one that solves both — a spare for the pupil, a lab move for the
exam, a logged exception for the video request — and the debrief explains why.
An unanswered walk-up scores zero for triage.

## The onsite checklist

Each visit carries four scored steps: pack the kit, check the room before
lifting, write the visit note, book the follow-up. The note is scored on length
and the debrief states what it needed: the room, the fault, the change and what
the teacher should watch for. `/academy/onsite` is the reference — the kit for
each kind of visit, the safety and lifting basics, and the note's parts.

## Scoring

Out of 100, in the app's four categories:

| Category | Points | What earns them |
| --- | --- | --- |
| Diagnosis | 20 | 14 for the decisive reads taken before the first change, 6 for reading before touching |
| Communication and notes | 20 | 10 for the caller conversation, 6 for the visit note, 4 for the follow-up |
| Resolution | 48 | 28 for the reference changes in order (half credit out of order), 10 for the room actually working, 10 for finishing inside the bell |
| Safety | 12 | 2 for the kit, 2 for the safety check, 4 for the walk-up, 4 for making no unneeded change |

Two gates cannot be out-scored:

- a **harmful** change — disabling the filter, sharing an admin password,
  putting a staff machine on the student VLAN, giving a teacher local admin,
  replacing hardware, ordering a lab, wiping a room — fails the attempt however
  the room ends up, and costs 8 points;
- a change made with **no isolating read before it** fails the attempt, because a
  correct guess is still a guess.

## Storage

One table, `academy_attempts` (schema v20): id, scenario, timestamps, score,
score JSON and the state JSON. The state validates every id against the read and
change catalogues on the way in, so a stale or hand-edited row cannot become a
button the scenario never offered. The school and its scenarios are code.

## Boundaries

The pack shares no state with the generated ticket world. It reads the app's
scoring thresholds and publishes the shapes `progress` already consumes
(`ScoreHistoryEntry`, `ScenarioStats`), so visits join XP, weak topics and the
simulator filter without touching `sessions` or `scores`.

To add a scenario: add it to the relevant `data/*.ts` array, give it at least
one decisive read, offer every change it expects, write two dialog steps with
exactly one plain answer, and run the module tests — they walk all twenty-five
for a reference path that scores 100.
