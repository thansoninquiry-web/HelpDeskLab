# Agent instructions — HelpDeskLab

Read this file before the first tool call of a session. Everything in it is
about *how to work here*, not about the product. The product rules are in
[docs/architecture-helpdesklab.md](docs/architecture-helpdesklab.md).

The desk-presence switch and the assumption log it feeds live in `notes/`, which
is ignored by git: they are working notes about one person's desk, so they stay
on the machine that owns them. A clone has this file and no `notes/`, and the
missing `Mode:` line resolves to AFK, which is the safe default.

---

## 1. Desk presence: READY or AFK

The human who owns this repository is sometimes at the desk and sometimes not.
Which one it is decides whether you may stop and ask, or whether you have to keep
working on your own judgement. Resolve the mode before you start, in this order:

1. **[notes/desk-presence.md](notes/desk-presence.md)** → its `Mode:` line is
   `ready`, `afk` or `auto`. A forced `ready` / `afk` wins outright.
2. **`auto`, or the file is missing or unreadable** → compare the machine's local
   clock (`date`) against its `Away:` window. Inside the window is AFK; outside
   it is READY.
3. **No `Away:` window set, or the clock cannot be trusted** → **AFK**. Never
   block a session on a question you could have answered yourself.

Say the resolved mode in one short line before you start work — `Mode: AFK (work
hours, until 17:30)` — so a wrong guess costs the human one sentence to fix.

A fresh message is **not** evidence of presence: requests get sent from a phone
on a break, and the answer would never come. Only the mode in
[notes/desk-presence.md](notes/desk-presence.md) decides, and only a message that
explicitly says the human is back changes it.

If a message sounds like a switch ("heading to work", "brb", "I'm home for the
rest of the day", "stay at the desk"), update
[notes/desk-presence.md](notes/desk-presence.md) — the `Mode:` line, `Updated:`,
and a new row in the switch history — and carry on with whatever you were doing.
A switch is not a reason to stop.

## 2. Work hours

The `Away:` window lives in [notes/desk-presence.md](notes/desk-presence.md), one
line in local time:

```
Away: Mon–Fri 08:30–17:30 · Sat 09:00–13:00
```

A window may name days and times, optionally with a date range for a temporary
shift. When no window covers the present moment — unset, lapsed, or unreadable —
the mode is **AFK**. That is deliberate: working unattended is recoverable, paging
someone who is at their job is not. Set it by editing that line, or tell the
agent — "I'm at work 08:30–17:30 on weekdays" — and it will write it down.

## 3. READY — the human is at the desk

- Ask when a decision is genuinely theirs: which of two designs to take, whether
  to keep or delete something, anything outward-facing. Use `ask_questions` with
  concrete options, recommended one first.
- Prefer one well-formed question over three small ones, and never ask something
  the repository already answers.
- Still write log entries for the choices that a later session would otherwise
  have to re-derive.

## 4. AFK — the human is away

The whole point is that the work does not stop and nobody is paged.

- **Never call `ask_questions`, and never end a turn waiting for an answer.** End
  a turn only when the work is finished, or when nothing further can be done
  safely in this mode.
- When something is unclear, pick the most reasonable reading, note it in the log,
  and keep going.
- Decide in favour of: the smallest change that satisfies the request, the
  project's existing conventions, and the reading that keeps the app consistent
  with its own documentation.
- **Do not** take outward-facing or hard-to-undo actions: no `git push`, no pull
  requests, no deploys or publishing, no sending mail or messages, no deleting
  anything outside the task, no elevated privileges. Queue them instead (§6).
- Do **not** commit unless a commit was explicitly requested before the mode
  changed. Leave the work uncommitted and describe it in the handoff.
- *Do* run the project's checks (`npm run typecheck`, `npm run lint`, the tests
  for what you touched). Fix what you broke; leave failures that came from
  someone else's unfinished work alone and log them.
- Leave the workspace runnable. A half-finished feature must not break typecheck,
  lint, or the existing tests.
- Finish with: the log entries from §5, and — if the task is not fully done — a
  short handoff at the top of the log saying what is finished, what is not, and
  the exact next step.

## 5. The log — [notes/assumption-log.md](notes/assumption-log.md)

One entry per decision that changed what you built, plus anything waiting on the
human.

- Newest entry goes directly under the marker comment; the template is in the
  file.
- Fields: when, mode, the assumption, why, the alternatives you rejected, what
  it affects, and whether it should be revisited.
- Write entries **before** the last tool call of a run — a session that ends
  mid-turn must not lose the reasoning.
- Never put secrets, tokens, or personal data in the log.

## 6. Waiting for the desk

Actions that AFK mode forbids go in the checklist at the top of the log, with
enough detail to be done in one step later. Tick them off in READY mode, when the
human agrees. If the list is non-empty at the end of a run, say so in your last
message so it is visible without opening the file.

## 7. What this file does not change

The dependency direction (`ui → app → domain`, `app → persistence`), the
local-first design, the test expectations, and the "no destructive commands
without being asked" rule apply in both modes. AFK mode loosens *who decides*,
never *what is safe*.
