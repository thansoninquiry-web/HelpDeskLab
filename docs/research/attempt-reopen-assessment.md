# Reopening a closed attempt — assessment and design

**Date:** 2026-10-18
**Scope:** whether a scored attempt can be reopened for one more pass, and what
would have to change for the recorded score to stay honest.
**Status:** proposal. No code is changed by this document. Companion to
[workflow-spec.md](../workflow-spec.md) (closing is terminal) and
[architecture.md](../architecture.md) (scores are written once per session).

---

## 1. Recommendation

**Do not make a scored attempt reopenable in place.** Keep the close terminal for
any session that has a score, and keep the score immutable.

**One more pass is already possible, and it is the honest shape:** start a new
attempt at the same ticket. The retry button on the debrief already does this,
but it is mislabelled ("Retry this ticket" / "Reopening…"), it is not numbered,
and the ticket's single `status` field stops describing the closed attempt the
moment a retry opens. Fix those three things and "one more pass" is both
available and auditable without touching the old record.

**Allow recovery, not rescoring.** A session that ended without a score — an
abandoned attempt, or a crash between finishing the session and saving the score
— should return to the queue as a fresh attempt. A session whose log was already
scored is never reopened, because the learner has already been shown the answer.

---

## 2. What the build enforces today

| Fact | Evidence |
| --- | --- |
| Closing is terminal | `resolveAttempt` finishes the session, saves the score, and marks the ticket `completed` (`src/app/practiceService.ts`). `docs/workflow-spec.md` records "Closing is irreversible" and "Closing is terminal and irreversible". |
| A closed session cannot be resumed | `openSession` refuses a session with `endedAt !== null` ("That session is already closed. Open its debrief instead."). |
| There is exactly one score per session | `scores.session_id` is the primary key, `ScoreRepository` exposes only `save`, `findBySession`, `listHistory`, `listRecent`, `listScoredSteps` — no update and no delete (`src/persistence/schema.ts`, `src/domain/ports.ts`, `src/persistence/repositories/scores.ts`). |
| Mistakes before close have a tool | `rewindAttempt` / `reapplyRewind` un-run and restore steps while the attempt is open, folding the world from the log; exams refuse rewinds. |
| The debrief is an answer key | It renders the reference path, every rubric item's result and why, the hint ladders, the critical misses, and the end-state map. |
| Retry already starts a fresh attempt | `startAttempt` does not check `ticket.status`; on a completed ticket it rebuilds the same seed/world, inserts a new session, and flips the ticket to `in_progress`. The debrief button calls it and navigates to the new session (`src/ui/routes/DebriefPage.tsx`). |
| The old score survives a retry | The old session and its row in `scores` are untouched; `loadDebrief` opens by session id. |
| History counts every scored session | `updateProgress` increments attempts and passes, keeps the best score, and moves the Leitner box; total XP sums every scored attempt; curriculum evidence counts every pass. |

Two consequences matter for this assessment:

1. **A "reopen" would not merely continue a log — it would collide with the
   one-score-per-session invariant** that `loadDebrief`, the hint-habit summary,
   and the curriculum evidence all read through.
2. **The retry path is honest but under-described.** The ticket's `status` is a
   single mutable field, so while attempt 2 is open the queue shows the ticket as
   in progress; abandoning attempt 2 marks it `available` again even though a
   scored attempt exists. The score history is the audit record; `status` is not.

---

## 3. Why reopening a scored attempt cannot be honest

1. **The answer is already on screen.** The debrief names the missing critical
   steps, the exact commands, and the hint ladders. A second close on the same
   log is not independent evidence of anything except the ability to follow a
   revealed answer. A training tool can allow that, but it must not count it as
   mastery.
2. **Either score store option damages the record.** Overwriting the existing
   score deletes evidence the app elsewhere treats as immutable. Adding a second
   score for the same session breaks `scores.session_id` as the primary key and
   every reader that assumes one evaluation per log. A third table that
   supersedes scores adds a parallel truth that can disagree with itself.
3. **The derived signals would double-count or need exclusions.** Attempts,
   passes, best score, XP, rank, Leitner scheduling, per-step hint habits, and
   module requirements are all derived from `scores` joined to `sessions`. A
   reopened log would have to be counted once (as the latest evaluation) while
   the original score is still shown — two contradictory answers to "what did
   this attempt score?".
4. **Exam integrity would go with it.** An exam withholds hints until scoring and
   refuses rewinds precisely so it is a one-shot check. Reopening a scored exam
   would let the learner see the debrief and retake the same log.
5. **The capability already exists in a better form.** Rewind covers "I made a
   mistake before closing"; `reviewClosure` shows the would-be score, the
   blocking critical steps, and any pending network bonus before the learner
   commits; retry covers "I want another pass" with a fresh log. The only thing
   missing is resuming the *same* closed log — which is the contaminated case.

**Decision:** no in-place reopen for a scored attempt. If the product insists on
one, it is a learning aid, not an assessment, and §6 describes the least
dishonest version. It is not recommended.

---

## 4. Design: one more pass as a new attempt

### 4.1 Identity and data model

- A **ticket** is a generated scenario instance (seed, variant, public content).
- An **attempt** is a session. Keep that mapping; do not make the ticket carry a
  score.
- Add `sessions.attempt_number INTEGER NOT NULL DEFAULT 1` (migration 9),
  unique per `ticket_id`. `startAttempt` writes `max(attempt_number) + 1` for the
  ticket. Storing it keeps the label stable even if the simulated clock or
  `started_at` ties; deriving it from `started_at, id` is a migration-free
  fallback if a schema change is unwanted.
- No change to `scores`, `sessions.ended_at`, or the action log. The old attempt
  remains exactly as scored.

### 4.2 State transitions

Replace the informal status mutation with explicit rules:

| Event | Ticket status |
| --- | --- |
| No session ever | `available` |
| Attempt opened | `in_progress` |
| Attempt closed with a score | `completed` |
| Attempt abandoned, and another scored session exists | `completed` |
| Attempt abandoned, and no scored session exists | `available` |
| Server crash left `in_progress` with no open session | reconciled on next read: `completed` if a score exists, else `available` |

`loadQueue` already creates new tickets based on open work; it should keep
reading `status`, but the transition rules above are what write it. If the
project prefers a derived status, compute it from sessions and drop the column
later; that is a larger migration and is not required for the reopen question.

### 4.3 Service API

- Keep `startAttempt(ticketId)` as the only entry point; on a completed ticket it
  creates a new session. Add a guard: if an open session for another ticket
  exists, the current "finish it as abandoned" behaviour stays.
- `loadDebrief(sessionId)` should also return the ticket's attempt number and the
  other attempts on the same ticket (session id, attempt number, total, passed,
  endedAt) so the page can link them. This is a read-only join; no new writes.
- `getWorkspace` should carry `attemptNumber` for the header label.
- `abandonAttempt` uses the status rules above rather than always `available`.
- Add a reconciliation function (called by `loadQueue`/startup) for sessions
  whose ticket says `in_progress` but has no open session; this is the crash path
  and never scores anything retroactively.

### 4.4 Interface

- Debrief button: **Start another attempt** (loading: `Starting attempt 2…`), with
  one sentence beside it: "This opens a new attempt at the same ticket. The score
  above stays in your history."
- Debrief heading/meta: `Attempt 2 of this ticket` and a compact list of earlier
  attempts linking to their debriefs. The first attempt reads `Attempt 1`.
- Workspace header: `Attempt 2` beside the ticket id, so the learner knows which
  log they are writing.
- Retrying an exam: either allow a new exam attempt (the setting decides) and
  label it `Exam · attempt 2`, or hide the button on exam debriefs. Do not resume
  the scored exam.
- No cap of "one more pass" by default. Every attempt is a separate row in
  history; if product wants a cap, cap `attempt_number` and say why in the UI.
  There is no integrity reason for a cap.

### 4.5 What this preserves

- The old score is never replaced; both attempts appear in the debrief list and
  in progress history.
- Attempts and passes count per session as they do today; the best score stays
  the maximum; the Leitner box follows the latest attempt, as it does now.
- Module evidence still sees a pass per attempt; the distinct-families counters
  are unaffected.
- The new log starts from the ticket's generated world, so the learner cannot
  carry state, hints, or drafts from the closed attempt.

---

## 5. Recovery when a close left no score

`resolveAttempt` performs several writes in sequence: append the handoff note,
finish the session, save the score, update the ticket, update scenario stats,
build the debrief. A failure after `finish` leaves a closed session with no
score, while `tickets.status` may still say `in_progress`.

Proposal:

1. Make the close a single transaction where possible: `finish` + `scores.save`
   + ticket status. Scenario stats are derived and can be recomputed from
   `scores` if they fail; they should not decide whether a close happened.
2. On read, reconcile an `in_progress` ticket with no open session to `available`
   (no score) or `completed` (score exists).
3. Never retroactively evaluate a closed log. Recovery starts a new attempt, so
   the recorded score, or the absence of one, stays true.
4. Tests should simulate a close that fails between finishing and scoring and
   assert the ticket is recoverable without a debrief containing a score that
   was never saved.

---

## 6. If same-log reopening is still required (not recommended)

Only acceptable as a **learning log**, never as assessment evidence:

- Keep the original score exactly as stored; the reopened pass is a second,
  labelled event (`assisted: true`) with its own session row, not a rewrite of
  the first.
- Mark it as having been reviewed: the debrief and reference were available
  before the second close.
- Exclude assisted passes from XP, rank, best score, module evidence, hint
  habits, and "families passed". Show them only in the attempt history with a
  clear label.
- Keep the original session's log closed and read-only; the assisted pass starts
  a continuation log that references the original session id.
- Do not offer this for exams.

Even designed this way, it adds a second score path, a new provenance flag, and
exclusion rules in every reader, for a capability the fresh retry already covers.
The honest recommendation remains §4.

---

## 7. Invariants to test when §4 is implemented

1. `startAttempt` on a completed ticket inserts a new session with
   `attempt_number = 2`; the old session's `ended_at`, world, and score row are
   byte-for-byte unchanged.
2. Closing both attempts leaves two score rows joined to the same ticket;
   `loadProgress` reports `attempts = 2`, one pass per passed attempt, and
   `bestScore` as the maximum.
3. The first debrief still loads by session id after the second attempt starts
   and after it closes.
4. Abandoning attempt 2 leaves attempt 1's score intact and sets the ticket to
   `completed`.
5. `reconcileTicketStatus` turns an `in_progress` ticket with a scored closed
   session into `completed` and with none into `available`.
6. No repository method can update or delete a score, or append to an ended
   session.
7. Attempt numbers are unique and monotonic per ticket.
8. An exam attempt cannot be rewound, and retrying it starts a new exam or is
   refused — never resumes the scored log.

---

## 8. Product questions this assessment does not answer

- **Should a retry count toward XP and module evidence?** Today it does. If the
  goal is mastery rather than practice volume, count the best attempt per ticket
  (or per family) instead of summing every retry. That is a scoring-policy
  change, independent of reopening.
- **Should exam debriefs offer another attempt at all?** That is a training
  compliance decision; if yes, each attempt remains one-shot.
- **How many attempts should a ticket offer?** Unlimited is consistent with the
  current queue and the "fresh attempt" copy; a cap is a product choice, not an
  integrity control.
