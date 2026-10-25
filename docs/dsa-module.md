# The algorithm drill

A fourth kind of practice beside the ticket queue and the two administration
consoles: interview-style data-structures-and-algorithms problems, each answered
by choosing the approach and its cost, naming the edge case it has to survive,
and writing the solution out by hand.

It lives at `/dsa` (the library), `/dsa/patterns` (the cue sheet) and
`/dsa/:problemId` (one problem), is self-contained in `src/modules/dsa/`, and
keeps only two tables of its own.

**What it is not: a code judge.** The shipped Content-Security-Policy forbids
`eval` (`script-src` carries `'wasm-unsafe-eval'`, never `'unsafe-eval'`), and a
worker or an iframe is confined to same-origin sources with no way to run the
learner's text. So nothing typed into the editor is executed. The practice is the
decision — the same decision the sheet on the wall asks: *the input is sorted, so
binary search is O(log n) and two pointers is O(n)* — and the reference answers
are what the learner checks their hand-written solution against. Adding a real
runner would mean a second security decision (a WASM interpreter, or relaxing the
policy), not an extra button.

## The loop

1. The library lists seventeen problems with difficulty, topics and solved state,
   and filters by difficulty, topic, free text and unsolved-only. The pattern
   sheet sits beside it for the cue that is not recognised yet.
2. One problem shows the statement, worked examples, constraints, and **what to
   notice first** — the cues an interviewer expects to be picked up.
3. Two questions are answered:
   - **Which approach fits, and at what cost?** Four candidates, one right, each
     with a note explaining why it wins or loses *for this problem*.
   - **Which case does that approach have to get right?** Three candidates, one
     right, each with the failure mode spelled out.
4. The learner writes the solution in the editor. The draft is saved on this
   device as they type (debounced, with a flush when the page closes).
5. **Check answers** records an attempt and shows both notes — the right answer
   and, when it differs, the one that was chosen. Both answers must be right for
   the problem to count as **solved**.
6. **The approaches** reveals two written-up answers per problem — idea,
   complexity, real code and when to prefer it — like two good forum replies.
   Solving the problem reveals them automatically.

## The pattern sheet

`/dsa/patterns` is the sheet the drill is built from: a cue, then the techniques
it licenses and what each costs. It is a reference rather than a quiz because a
cue usually licenses more than one defensible answer — a sorted array makes both
binary search and two pointers right — so asking "which one" would be a trick.

`src/modules/dsa/data/patterns.ts` holds it as three groups of entries:

```ts
interface DsaPatternEntry {
  id: string
  cue: string                 // 'The input is sorted'
  why: string                 // why the cue matters, one line
  tools: {
    name: string
    time: string
    space?: string
    note: string              // when to reach for it
    problemId?: string        // the problem that drills it
  }[]
}
```

The costs keep their caveats on purpose: quickselect and quicksort are average
cases with quadratic tails, and a binary search tree is logarithmic only while it
stays balanced. A sheet that prints O(n) for quickselect without the worst case
is the reason people lose interviews.

The bank test enforces the other half of the bargain: every `problemId` in the
sheet must resolve, and every problem in the bank must be linked from at least
one tool. Adding a problem therefore means adding the cue that points at it.

Every problem is still a decision drill: the cue, the approach and cost, the edge
case, then the hand-written solution. The hints are progressive and the number
used is stored on the attempt. There is
no XP and no rubric category: `RubricCategory` in
`src/domain/scoring/types.ts` is the desk's four-way split (diagnosis,
documentation, resolution, safety), and an algorithm answer has none of those in
a way the Progress breakdown could compare. Attempts are therefore kept inside
this module, and Progress, weak topics and the simulator filter are untouched.
That boundary is deliberate and is the first thing to revisit if the drill is
ever scored.

## Data model

The bank is code, not rows, so editing it needs no migration:

```ts
interface DsaProblem {
  id: string                    // slug in the URL, e.g. 'pair-sum-sorted'
  title: string
  difficulty: 'easy' | 'medium' | 'hard'
  topics: readonly string[]
  summary: string               // the library's one-line pitch
  statement: readonly string[]  // paragraphs
  examples: { input; output; explanation? }[]
  constraints: readonly string[]
  cues: readonly string[]
  patterns: DsaChoice[]         // four, exactly one correct
  edges: DsaChoice[]            // three, exactly one correct
  hints: readonly string[]
  approaches: DsaApproach[]     // two, with real code
  starter: string               // what the editor opens with
  checks: { args: JsonValue[]; expected: JsonValue }[]
}

interface DsaChoice {
  id: string
  label: string                 // the option as it appears on the radio card
  note: string                  // why it is, or is not, the answer
  correct: boolean
}
```

`checks` exists so the answer key can be proved: the bank test loads each
approach's function from its source and runs every check, so a typo in a printed
solution fails the suite instead of teaching a wrong answer.

The two tables (schema v16, one migration):

| Table | Purpose |
| --- | --- |
| `dsa_attempts` | One row per **Check answers**: problem, both choice ids, solved flag, hints used, the code as submitted, timestamp. |
| `dsa_drafts` | One row per problem: the latest hand-written code and when it was saved. |

Solved state and counts are derived from `dsa_attempts` — there is no solved
flag to get out of step with the history. Deleting attempts (or importing an
older backup) therefore moves the library's counts, as it should.

The module depends on the database only through two functions (`read` and
`write`) declared in `persistence/store.ts`, so it imports no app code and can be
lifted out by moving the folder.

## Adding a problem

1. Add a `DsaProblem` to `src/modules/dsa/data/problems.ts`. Give it a unique
   slug, three or more examples and constraints, at least three cues, at least
   two hints, four pattern choices and three edge choices — exactly one correct in
   each group. Write a `note` on every option: the note is the teaching.
2. Write two approaches with real code and a tradeoff sentence, and set `checks`
   to at least three machine-checkable cases that both approaches must satisfy.
   They may mutate their arguments (a flood fill that sinks cells), because each
   check is run on a fresh copy.
3. Link it from a cue in `src/modules/dsa/data/patterns.ts`, either as a new
   tool on an existing cue or as a new entry. A problem with no cue is a problem
   the sheet cannot teach.
4. Run the tests:

```bash
npx vitest run tests/modules/dsa
```

The bank test proves unique ids, the one-correct-answer rule, the material
minimums, that every approach passes every check, that every sheet link resolves
and that no problem is untaught. If you add a problem whose answer is ambiguous,
fix the problem before fixing the test: an ambiguity here teaches the wrong
lesson.

## Where the pieces are

| Path | What it holds |
| --- | --- |
| `src/modules/dsa/data/problems.ts` | The bank and `findDsaProblem`. |
| `src/modules/dsa/data/patterns.ts` | The cue sheet, its tools and their costs. |
| `src/modules/dsa/logic/progress.ts` | Solved state, counts, topics, library filters. |
| `src/modules/dsa/persistence/store.ts` | The two tables' SQL and row mapping. |
| `src/modules/dsa/service.ts` | Load, save draft, submit and score an attempt, reset. |
| `src/modules/dsa/ui/ProblemsPage.tsx` | The library at `/dsa`. |
| `src/modules/dsa/ui/PatternsPage.tsx` | The pattern sheet at `/dsa/patterns`. |
| `src/modules/dsa/ui/ProblemPage.tsx` | One problem at `/dsa/:problemId`. |
| `src/modules/dsa/ui/useDsa.ts` | Data hooks; the debounced draft save and its flush. |
| `src/app/dsaService.ts` | The app's single seam: hands the module `database.dsa`. |
| `tests/modules/dsa/dsa.test.ts` | Bank invariants, reference code, service and store. |
| `tests/ui/dsaPages.test.tsx` | The two pages, the answer flow and the draft. |

## Notes for a later version

- A real judge needs a sandbox the current policy does not allow. The cheapest
  honest route is a WASM interpreter (QuickJS or similar) inside a same-origin
  worker, with the policy unchanged; relaxing `script-src` is the other route and
  the worse one.
- Attempts carry the submitted code, so a future diff view could show how a
  solution changed between attempts.
- The bank is small on purpose. Seventeen problems cover the sheet's main cues;
  what is still reference-only is marked as such (Dijkstra, tries, the two-heap
  median, string building), and adding one is a data change plus a sheet link.
