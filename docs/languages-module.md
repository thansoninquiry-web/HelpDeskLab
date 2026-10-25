# The language tracks

Four short lessons and five decision drills for each of Java, C#/.NET and Python,
all in `src/modules/languages` and reachable at `/languages`. The module is
self-contained: its content, its service and its two tables live in that folder,
and the app touches it through one function (`getLanguageService`).

## What it is, and what it is not

The lab has no evaluator — the shipped policy forbids `eval` and there is no
interpreter in the bundle. So a language track cannot ask you to write code and
run it. It asks the next question instead, the one a code review asks: **what
does this snippet actually do?**

Every drill is a small, complete snippet with one question and one right answer:
what a wrapper comparison prints, what a deleted dict key does to a live
iterator, whether a deferred query sees a row added after it was built. The
wrong options each carry a note explaining the misconception they represent, and
the right one carries the rule to remember. That is a decision drill in the same
shape as `/dsa`, and it is honest about what it measures: recognition and
reasoning, not compilation.

## Routes

| Route | Page |
|-------|------|
| `/languages` | The picker: three tracks, each with lessons read and drills solved |
| `/languages/:trackId` | One track: what it leaves you able to do, its lessons in order, its drills with their state |
| `/languages/:trackId/lessons/:lessonId` | One lesson, with a read mark and the neighbouring lessons |
| `/languages/:trackId/practice/:itemId` | One drill: the snippet, the answer options, and the explained result |

`trackId` is one of `java`, `csharp`, `python`.

## The content is code; only progress is stored

| Where | What |
|-------|------|
| `data/java.ts`, `data/csharp.ts`, `data/python.ts` | One `LanguageTrack` each: lessons, drills, what the track covers |
| `data/tracks.ts` | The three in order, plus lookups by id |
| `logic/progress.ts` | Pure folding of attempts and reads into counts and page rows |
| `persistence/store.ts` | The only SQL in the module |
| `service.ts` | Overview, one track, mark a lesson, score an answer |
| `ui/` | The four pages, the data hook, and the stylesheet |

Two tables hold what the learner did:

```sql
lang_attempts(id, track_id, item_id, choice, correct, created_at)
lang_lesson_reads(track_id, lesson_id, read_at)  -- primary key (track_id, lesson_id)
```

Nothing about the content is in the database, so editing a lesson or a drill is a
code change with no migration. Progress is **folded**, never stored as a flag:
clearing an attempt or importing an older backup moves every number on the page.

### Counts

- **A lesson is read** when the learner marks it. The page cannot tell a skim
  from a careful read, so it asks rather than guessing from scroll position.
- **A drill is solved** once it has been answered correctly at least once, and
  counted once however many attempts it took. Any attempt, right or wrong,
  marks it *tried*.
- The picker's totals are the sum over the three tracks, computed in
  `summarize()` rather than stored.

## Scoring

An answer costs nothing and is never locked: the drill can be retried as often
as the learner likes, and every attempt is kept. `LanguageService.submit` scores
against the item's own `correct` flag and returns the attempt, whether it was
right, and the correct `PracticeChoice` — so the result panel explains the miss
from the same data that scored it. There is no second copy of the key for a page
to disagree with.

`correctChoice()` throws if an item has no right answer. That is unreachable in
practice because the bank test refuses it at build time, but a hand-edited item
must fail loudly rather than silently score every attempt wrong.

## Adding a lesson

1. Add a `LanguageLesson` to the track's `lessons` array, in reading order.
2. Give it a unique `id` (kebab-case), a one-sentence `summary`, an honest
   `minutes`, at least three `sections`, and a `takeaway`.
3. At least one section needs a `code` sample: a lesson with no runtime in it is
   prose pretending to be a language lesson, and the bank test refuses it.
4. Keep a section's paragraph focused on one claim. The `note` field is for the
   caution that belongs beside the section rather than in the prose.

No migration is needed: lesson ids are not constrained.

## Adding a drill

1. Add a `PracticeItem` to `practice`.
2. Exactly one choice is `correct: true`. Three or four choices is the range.
3. Every choice needs a `note` of at least a sentence — the wrong ones are the
   teaching, so a bare "no" is not enough.
4. `rule` is the sentence to remember after the result; `reference` is the
   corrected form when seeing it written out is clearer than describing it.
5. The snippet must be small enough to read on a phone and complete enough to
   have one answer. If two options are defensible, the question is wrong.

## Adding a fourth track

This is a schema change, because `lang_attempts.track_id` and
`lang_lesson_reads.track_id` have a `CHECK` constraint listing the three ids.
Adding `go`, for example, needs:

1. A new `data/go.ts` and its entry in `TRACKS`.
2. A `TrackId` union member in `types.ts`.
3. Migration 18 that rebuilds the two tables with the wider `CHECK` (SQLite
   cannot alter a constraint in place): create the new table, copy the rows,
   drop the old one, rename. Bump `SCHEMA_VERSION` and `REQUIRED_TABLES` if the
   names change.
4. A row in `tests/modules/languages/languages.test.ts` for the track list, and
   routes in the two audit suites if a page needs one.

The constraint is deliberate: it is the difference between a typo (`jav`) and a
stored row nobody can ever read.

## Verification

`tests/modules/languages/languages.test.ts` checks the bank in both directions —
every lesson renders, every drill has exactly one right answer with a note on
each option, no title repeats — and exercises the service over a real in-memory
SQLite database, including the refusals and clearing one track without touching
another. `tests/ui/languagePages.test.tsx` renders all four pages and checks the
read mark, the disabled check button, the wrong-answer explanation and the right
answer. The a11y and theme audits walk `/languages`, one track, one lesson and
one drill, so the new stylesheet is held to the same contrast and geometry rules
as the rest of the app.
