# REA-style session observation — one ticket

**Date:** 2026-10-17
**Surface:** `https://servicedesk-simulator.com/` v2.7 (landing-page demo + shipped client assets)
**Ticket walked:** INC-7202 — *Password Reset - Emily Chen* (HIGH)
**Purpose:** confirm what the missing-steps gate, the hints, and the call flow
actually do before building our own versions. Companion to
[rea-gap-analysis.md](rea-gap-analysis.md), which recorded the earlier passive
snapshot.

---

## 1. Method and what this can and cannot prove

The REA harness (`observe-web-session`) is not installed in this environment and
there is no signed-in session available, so this run used two sources:

| Source | What it gives |
|---|---|
| **Live UI** — the public "TRY IT YOURSELF" widget, driven ticket INC-7202 end to end at the panel level | Observed: queue mechanics, assigning, Directory actions, hint disclosure, and the absence of a close control |
| **Shipped client assets** — `app-shell-*.js` i18n + logic strings, fetched from the same public deployment | Read: the exact user-facing text of the close gate, hint progression, verification, and call scoring |

Everything below is labelled **Observed** or **In bundle**. No inference from a
chunk name is treated as behaviour, and nothing here is a claim about screens
that were never rendered.

Two limits that matter:

- The landing demo is a **cut-down build**. It has no close control, no notes,
  no calls, and its hint panel is a single static list. Its state also drops
  when the tool tabs are switched.
- The bundle proves *what the product says and checks*, not how often a check
  fires or how the scoring curve feels. Numbers such as “−10 pts” are literal
  strings; the formula behind “losing a share of the points” is not visible.

---

## 2. The walkthrough as observed

1. The ticket opens as a preview: `INC-7202`, `HIGH`, `Open`, unassigned,
   description, requester. A single **I DON'T KNOW** control sits under the
   description.
2. Clicking it expands a titled block, **“Hint How To Resolve”**, with three
   numbered steps: open Directory, find the account and open its
   Authentication tab, unlock and reset. The control becomes **HIDE HINTS**.
   All three steps appear at once — there is no per-step reveal here, and no
   mention of any cost.
3. **ASSIGN TO ME** turns the ticket `In Progress`, shows `You`, swaps the
   control to **UNASSIGN**, and adds a **MY QUEUE (1) · ASSIGNED TO YOU**
   section to the queue. `INCIDENTS` drops from `3 OPEN` to `2 OPEN`.
4. The **DIRECTORY** tab lists six users. Emily Chen's record has
   `PROFILE · GROUPS · LICENSES · DEVICES · AUTHENTICATION · MAILBOX`.
   Profile shows title, employee ID, phone, department, manager, last login,
   and `Account expires: Never`.
5. Authentication shows four actions — `RESET PASSWORD`, `UNLOCK ACCOUNT`,
   `RESET MFA`, `DISABLE ACCOUNT` — the facts `MFA status: Enrolled` and
   `Password expired: No`, and a separate **Identity Verification** block with
   `SEND VERIFICATION CODE`.
6. **RESET PASSWORD** applies immediately. No confirmation, no verification
   step, no warning before the fact. The result modal prints a temporary
   password, adds the state fact that had not been visible anywhere before
   (“her account is locked; this password won't work for sign-in until the
   account is unlocked”), tells you to share it securely, and offers
   **Send to Emily Chen via chat**.
7. **UNLOCK ACCOUNT** applies silently: no toast, no confirmation, and the
   button itself becomes `LOCK ACCOUNT`. The button is the status display.
8. There is no close, note, or resolve control anywhere in the demo build. The
   ticket stays `In Progress` after both fixes.

**So the demo proves queue and Directory mechanics, not the gate, the scored
close, or calls.** That is the honest limit of this run.

---

## 3. The missing-steps gate — what it actually is

**In bundle.** The close dialog has exactly two states:

| State | Strings |
|---|---|
| Unresolved | `This ticket isn't resolved. Closing costs {points} points` · `To resolve it, the ticket still needs:` · `Close Anyway` |
| Resolved | `You fixed this. Close to claim your {points} points` · `Close & Claim Points` |
| Both | `Resolution Notes (optional)` — “What did you do to resolve this ticket?” |

That is a **priced warning, not a block**. The ticket can always be closed; the
gate computes what closing now costs and lists what is still missing. The
reward is claimed at close, on the resolved path.

`MissingStepsNotice` — the chunk name the first report deliberately refused to
trust — belongs to the **report-a-bug / abandon** dialog, not the close path.
That dialog is a form with a **Step** selector (`Reading the ticket`, `Checking
Documentation`, `Using Directory`, `Using Remote Desktop`, `Using Server Room`,
`Chatting on Company Chat`, `On a voice call`, `Resolving / closing ticket`) and
its own pre-submit check:

- `Nothing looks outstanding on this ticket. Closing it normally will award it; reporting hands it in as bugged.`
- `Before you report it — the ticket still needs:`

It also warns that most bug reports are really wrong troubleshooting steps. So
the reference uses the same dry-run idea twice: once to price closing, once to
deter spurious bug reports.

**Prerequisites are separate from the gate.** Two other checks exist:
`Assign the ticket to yourself to close it.` and, on some variants,
`A server room action is required first.` / `Chat alone cannot resolve this
issue. You must go to the Server Room first to fix the equipment.`

---

## 4. Hints — progressive in the product, free of charge

**Observed in the demo:** one toggle, whole list, no cost.

**In bundle (the real build):** the panel is a walkthrough, not a list:

| String | Meaning |
|---|---|
| `Step-by-step walkthrough` | Panel title |
| `Reveal next step ({current}/{total})` | One step per click, with progress |
| `Show me the next step` / `Previous step` | Navigation, so you can go back |
| `Reveal summary` / `Summary` | A summary exists behind the steps |
| `Two ways to fix this. Pick your approach:` | Path choice before the steps |
| `Guide the user over chat or a call` / `Remote in and do it yourself` | The two paths |
| `Hints don't affect your score` | Explicit, in the UI |

Path choice is not cosmetic: `Chat alone cannot resolve this issue…` and
`A server room action is required first.` show the walkthrough adapting to the
fault.

**This contradicts the assumption behind our hint economy.** We charge 5 points
of diagnostic reasoning per hint (cap 15). The reference tells the learner hints
are free and puts the entire penalty budget on *procedure* instead — see below.
Neither is wrong, but ours is now a deliberate divergence, not parity, and the
copy should not imply otherwise.

---

## 5. Call flow — identity is the gate, and it is scored

**In bundle.** Calls are the one place where the reference is strict, and it is
strict with points rather than with blockers.

Identity verification:

- `Send Verification Code`; `Code sent to {name}`.
- `Ask the caller to read back the code they received, then enter it here to confirm their identity.`
- Chat path: `Enter the code the user sent you in Company Chat…`, with the
  caller opening `Hi! I just got the verification code on my phone — here it is:`
- Only one code is live: `The active verification code went to {name} — not this ticket`
  — so sending to the wrong recipient (or reading it to the wrong person) is
  detectable, and `Deny (Social Engineering)` exists.
- Skipping verification is priced: `Password/MFA reset performed before identity
  verification — procedure violation (-10 pts). Verify the user first.` and
  `For skipping the verification, you lose {penalty} of the {total} points that
  resolving it correctly would have given you.`
- There is a matching diagnosis penalty for out-of-order work: `For skipping the
  diagnosis, you lose {penalty} of the {total} points…`

Call outcomes:

- `Call with {name} ended without a ticket, no points earned. Fill in Ticket Info during the call to score.`
- `Follow-up call ended without any action on {ticketId}. -10 points`
- `Good call. You hung up on a suspicious caller instead of bypassing security. +10 points`
- `Correct. You refused to bypass security procedures. +{points} points`
- `De-escalation bonus! +{points} points for handling an angry caller!`
- Voicemail converts: `Ticket {id} created from voicemail +{points} pts`
- Voice is optional at the interface level: `Voice not working. Type instead`.

The shape is consistent across all three features: **the action is never
blocked; the consequence is named and priced.** Hints are the free path;
verification, ordering, and documentation quality are where points are lost.

---

## 6. What this changes for our build

1. **Hints.** Our 5-point-per-hint model is defensible but is not parity. Two
   options: keep it and stop describing hints as reference-like, or move the
   cost to procedure (unverified reset, out-of-order fix) and make hints free.
   The second matches the evidence and keeps the pressure on judgement rather
   than on curiosity.
2. **Pre-close notice.** Ours already does the confirmed shape: `reviewClosure`
   previews the score, lists the blocking items with their hints, and offers
   "Close anyway and score". The one difference is framing — the reference
   prices the *loss* against points it is about to award ("Closing costs N
   points"), while we show a projected total. Both are honest; theirs is easier
   to read at a glance, ours ties to the pass band. No change is required, but
   the copy could name the gap (for example, points given up) next to the total.
3. **Verification.** The single-active-code, recipient-scoped rule plus
   `Deny (Social Engineering)` is a better safety gate than our badge/callback
   check, and it is cheap: one code record, one expected recipient, one denial
   outcome. Add the wrong-recipient message as a distinct failure, not a generic
   error.
4. **Calls.** Score calls on what the call produced — ticket created or ticket
   actioned — and price the two failure modes we already model: ending with
   nothing, and bypassing verification. A de-escalation bonus is the cheapest
   emotional-safety signal in their whole design.
5. **Do not copy** the tier/points shop, the certificate ladder, or the bug-report
   form. We do not need a `MissingStepsNotice`; our debrief already knows the
   unmet items.

---

## 7. Still unobserved

- The close dialog rendered, its actual point numbers, and whether the unmet
  list is per-item or per-category.
- The hint walkthrough rendered: how many steps a real variant has, whether the
  summary is free, and whether path choice is reversible.
- A real call: turn-taking, whether the caller is scripted or generated, how the
  ticket form during a call is scored, and what ends a call early.
- Whether `Close Anyway` can still claim any points.

Each needs a signed-in session; none should be designed against until then.
