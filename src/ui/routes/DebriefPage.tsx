import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import {
  CATEGORY_LABELS,
  closureLabel,
  loadDebrief,
  startAttempt,
  type CategoryScoreKeys,
  type DebriefItem,
  type DebriefView,
  type StepSource,
  type TrailEntry,
} from '../../app/practiceService'
import { familyLabel } from '../components/familyLabels'
import { SOURCE_LABELS, STEP_SOURCES } from '../components/sourceLabel'
import { TopologyMap } from '../components/TopologyMap'
import { PageHeader } from '../components/PageHeader'
import styles from './practice.module.css'

const BAND_LABELS = {
  strong: 'Strong pass',
  pass: 'Pass',
  fail: 'Needs another attempt',
} as const

/**
 * One step of the trail. Every row says which tool or panel produced it: a
 * command as it was typed, a hint with the step it unstuck and what its rung
 * cost, a note in the learner's own words, and an identity check with its
 * outcome.
 */
function TrailStep({ entry }: { entry: TrailEntry }) {
  if (entry.kind === 'command') {
    return (
      <>
        <code className={styles.trailCommand}>{entry.command}</code>
        {entry.machine ? (
          <span className={styles.trailMachine}>on {entry.machine}</span>
        ) : null}
        {entry.ok ? null : (
          <span className={styles.trailRejected}>rejected — no result recorded</span>
        )}
      </>
    )
  }

  if (entry.kind === 'hint') {
    return (
      <>
        <span className={styles.trailDetail}>Revealed a hint on “{entry.label}”</span>
        <span className={styles.trailCost}>
          {entry.cost === 0 ? 'free' : `−${entry.cost} pts`}
        </span>
      </>
    )
  }

  if (entry.kind === 'note') {
    return <span className={styles.trailText}>{entry.text}</span>
  }

  return (
    <>
      <span className={styles.trailDetail}>{entry.label}</span>
      <span className={styles.trailText} data-ok={entry.ok}>
        {entry.ok ? '✓' : '✗'} {entry.summary}
      </span>
    </>
  )
}

/** A command row, with the credit the debrief worked out for it. */
type CommandRow = Extract<TrailEntry, { kind: 'command' }>

/**
 * The commands an attempt ran, in the order each tool was first used. Grouping
 * keeps a typed `get-account` apart from the same read pressed in the Directory,
 * so a learner can see which tool was doing the work and which was guessing.
 */
function commandGroups(trail: readonly TrailEntry[]): { source: StepSource; commands: CommandRow[] }[] {
  const groups = new Map<StepSource, CommandRow[]>()
  for (const entry of trail) {
    if (entry.kind !== 'command') {
      continue
    }
    const rows = groups.get(entry.source) ?? []
    rows.push(entry)
    groups.set(entry.source, rows)
  }
  return [...groups].map(([source, commands]) => ({ source, commands }))
}

/**
 * What one command did for the score: the steps it earned, or a plain statement
 * that it was a dead end — and whether the simulator even accepted it.
 */
function creditText(entry: CommandRow): { tone: 'earned' | 'dead'; text: string } {
  if (entry.credit.length > 0) {
    return { tone: 'earned', text: `Earned credit — ${entry.credit.join('; ')}` }
  }
  return {
    tone: 'dead',
    text: entry.ok ? 'Dead end — no step of the rubric rested on it' : 'Dead end — the simulator refused it',
  }
}

/** How one tool's commands landed, for the heading beside its name. */
function groupCountText(commands: readonly CommandRow[]): string {
  const earned = commands.filter((entry) => entry.credit.length > 0).length
  const dead = commands.length - earned
  return [
    `${commands.length} command${commands.length === 1 ? '' : 's'}`,
    `${earned} earned credit`,
    `${dead} dead end${dead === 1 ? '' : 's'}`,
  ].join(' · ')
}

/** What the rungs revealed on one step cost together. */
function hintCostOf(item: DebriefItem): number {
  return item.hintsTaken.reduce((sum, rung) => sum + rung.cost, 0)
}

/** How one price reads in a sentence: "3 points a rung, capped at 9". */
function hintRateText(policy: DebriefView['hintPolicy']): string {
  if (policy.perHint <= 0 || policy.cap <= 0) {
    return 'free'
  }
  return `${policy.perHint} point${policy.perHint === 1 ? '' : 's'} a rung, capped at ${policy.cap}`
}

/**
 * The price line under a step's rungs. A hint that cost nothing says so — either
 * the attempt ran with free hints or the cap was already reached — and one that
 * did cost points repeats the rate the attempt was scored at.
 */
function hintPriceText(item: DebriefItem, policy: DebriefView['hintPolicy']): string {
  const cost = hintCostOf(item)
  if (cost > 0) {
    return `−${cost} pts of diagnostic reasoning · ${policy.perHint} each, capped at ${policy.cap}`
  }
  return policy.perHint > 0
    ? `free — the ${policy.cap}-point cap was already reached`
    : 'free on this attempt'
}

/**
 * What the step would have handed the learner unaided. A passing check names the
 * finding; otherwise the most explicit rung they never took is still owed to
 * them, and if they took the whole ladder the step's own lesson is what to hold
 * on to. Never repeats a rung the block above already printed.
 */
/** Old scores stored prefixed evidence; new ones store plain findings. */
function findingText(line: string): string {
  const text = line.replace(/^(met|missing): /, '')
  return text.startsWith('You ') ? `${text[0]?.toLowerCase()}${text.slice(1)}` : text
}

function unaidedText(item: DebriefItem): string {
  // `gaps` is missing on scores written before findings replaced check flags.
  const gaps = item.gaps ?? item.evidence.filter((line) => line.startsWith('missing:'))
  if (gaps.length === 0) {
    const found = item.evidence[0]
    if (found) {
      return `you found it — ${findingText(found)}`
    }
  }

  const taken = new Set(item.hintsTaken.map((rung) => rung.rung))
  const owed = item.hints.filter((_hint, index) => !taken.has(index + 1)).at(-1)
  return owed ? `still owed to you: ${owed}` : `the lesson: ${item.why}`
}

/** `2 of 3` when the ladder is known, just the rung when it is not. */
function rungLabel(item: DebriefItem, rung: number): string {
  return rung <= item.hints.length ? `Rung ${rung} of ${item.hints.length}` : `Rung ${rung}`
}

export function DebriefPage() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const navigate = useNavigate()
  const [debrief, setDebrief] = useState<DebriefView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [retrying, setRetrying] = useState(false)

  useEffect(() => {
    let cancelled = false
    if (!sessionId) {
      return
    }
    loadDebrief(sessionId)
      .then((view) => {
        if (cancelled) {
          return
        }
        if (!view) {
          setError('That debrief could not be found. It may have been removed with a database reset.')
        }
        setDebrief(view)
        setLoading(false)
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : 'The debrief could not be loaded.')
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [sessionId])

  const onRetry = async () => {
    if (!debrief) {
      return
    }
    setRetrying(true)
    try {
      const workspace = await startAttempt(debrief.ticket.id)
      navigate(`/ticket/${workspace.sessionId}`)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The ticket could not be reopened.')
      setRetrying(false)
    }
  }

  if (loading) {
    return <p className={styles.muted}>Scoring the attempt…</p>
  }

  if (error || !debrief) {
    return (
      <div className={styles.centerPanel}>
        <h1 className={styles.centerTitle}>Debrief unavailable</h1>
        <p className={styles.muted}>{error}</p>
        <Link className={styles.secondaryButton} to="/practice">
          Back to the queue
        </Link>
      </div>
    )
  }

  const categories = Object.entries(debrief.categoryScores) as Array<
    [CategoryScoreKeys, { earned: number; possible: number }]
  >
  const stepsMet = debrief.items.filter((item) => item.passed).length
  const commands = debrief.trail.filter((entry): entry is CommandRow => entry.kind === 'command')
  const creditedCommands = commands.filter((entry) => entry.credit.length > 0).length

  return (
    <>
      <PageHeader
        eyebrow={`${debrief.ticket.scenarioTitle} · ${debrief.ticket.variantLabel}`}
        title="Debrief"
        description="The scoring engine read your action log, notes, end state, and closure decision. Every point below is explained."
      />

      <div className={styles.debrief}>
        <section className={styles.scoreHero} data-band={debrief.band} aria-label="Score">
          <div>
            <div className={styles.scoreValue}>{debrief.total}</div>
            <span className={styles.scoreBand} data-band={debrief.band}>
              {BAND_LABELS[debrief.band]}
            </span>
          </div>
          <div className={styles.scoreMeta}>
            <span>
              Closed as: <strong>{closureLabel(debrief.decision.code)}</strong>
            </span>
            <span>
              XP: <strong>{debrief.xp}</strong>
            </span>
            {debrief.exam ? (
              <span>
                Exam: <strong>no hints taken</strong>
              </span>
            ) : debrief.hintsUsed > 0 ? (
              <span>
                Hints: <strong>{debrief.hintsUsed}</strong>
                {debrief.hintPolicy.budget > 0 ? ` of ${debrief.hintPolicy.budget}` : ''}
                {debrief.hintPenalty > 0
                  ? ` (−${debrief.hintPenalty} pts of diagnostic reasoning)`
                  : ' (free)'}
              </span>
            ) : null}
            <span>
              Ticket: <strong>{debrief.ticket.subject}</strong>
            </span>
            <span>
              Requester: <strong>{debrief.ticket.requester.name}</strong>
            </span>
          </div>
          <div className={styles.debriefActions}>
            <button
              type="button"
              className={styles.primaryButton}
              onClick={() => void onRetry()}
              disabled={retrying}
            >
              {retrying ? 'Reopening…' : 'Retry this ticket'}
            </button>
            <Link className={styles.secondaryButton} to="/practice">
              Back to the queue
            </Link>
          </div>
        </section>

        {debrief.criticalFailures.length > 0 ? (
          <div className={styles.criticalAlert} role="alert">
            <p className={styles.criticalAlertTitle}>
              Critical steps missed · {debrief.criticalFailures.length}
            </p>
            <ul className={styles.criticalAlertList}>
              {debrief.criticalFailures.map((failure) => (
                <li key={failure}>{failure}</li>
              ))}
            </ul>
            <p className={styles.criticalAlertNote}>
              The attempt cannot pass until those are done, even if the final state looked
              correct.
            </p>
          </div>
        ) : null}

        <section className={styles.sectionBlock} aria-label="Category scores">
          <div className={styles.sectionHeader}>
            <h2>By category</h2>
            <span className={styles.sectionNote}>{categories.length} categories</span>
          </div>
          <div className={styles.categoryGrid}>
            {categories.map(([category, score]) => {
              const percent = score.possible === 0 ? 0 : Math.round((score.earned / score.possible) * 100)
              return (
                <div key={category} className={styles.categoryCard}>
                  <h3>{CATEGORY_LABELS[category]}</h3>
                  <p className={styles.categoryValue}>
                    {score.earned}/{score.possible}
                  </p>
                  <div className={styles.bar}>
                    <div className={styles.barFill} style={{ width: `${percent}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        {debrief.topology ? (
          <section className={styles.sectionBlock} aria-label="Network proof">
            <div className={styles.sectionHeader}>
              <h2>Network proof</h2>
              <span className={styles.sectionNote}>
                {debrief.topology.provedLinks} of {debrief.topology.totalLinks} links proved
              </span>
            </div>
            {debrief.topologyMap ? (
              <>
                <p className={styles.muted}>
                  The map as it stood when you closed the ticket. A link is lit only where your
                  own log proved it, and each row keeps the line that settled it.
                </p>
                <TopologyMap topology={debrief.topologyMap} />
              </>
            ) : null}
            {debrief.topology.bonusXp > 0 ? (
              <p className={styles.muted}>
                Every link on the map was proved before you closed, so the network bonus is
                included: +{debrief.topology.bonusXp} XP.
              </p>
            ) : (
              <>
                <p className={styles.muted}>
                  Not every link on the map was proved before you closed, so the network bonus
                  was not awarded. Each one below is a check you can still run in the Server Room.
                </p>
                <ul className={styles.feedbackList}>
                  {debrief.topology.untested.map((link) => (
                    <li key={`untested-${link.label}`}>
                      Not tested: <strong>{link.label}</strong> — <code>{link.command}</code>
                    </li>
                  ))}
                  {debrief.topology.failed.map((link) => (
                    <li key={`failed-${link.label}`}>
                      Tested and failed: <strong>{link.label}</strong> —{' '}
                      <code>{link.command}</code>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        ) : null}

        {debrief.violations.length > 0 ? (
          <section className={styles.sectionBlock} aria-label="Procedure penalties">
            <div className={styles.sectionHeader}>
              <h2>Procedure cost</h2>
              <span className={styles.sectionNote}>
                {debrief.violations.length}{' '}
                {debrief.violations.length === 1 ? 'penalty' : 'penalties'} · −
                {debrief.procedurePenalty} pts
              </span>
            </div>
            <ul className={styles.feedbackList}>
              {debrief.violations.map((violation) => (
                <li key={violation.id}>
                  −{violation.points} from {CATEGORY_LABELS[violation.category]} —{' '}
                  <strong>{violation.label}</strong>. {violation.detail}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {debrief.exam ? (
          <section className={styles.sectionBlock} aria-label="Exam attempt">
            <div className={styles.sectionHeader}>
              <h2>Exam attempt</h2>
              <span className={styles.sectionNote}>Hints withheld until the close</span>
            </div>
            <p className={styles.muted}>
              This ticket was sat as an exam, so no hint was available while it was open and it
              was priced at the exam rate of {debrief.hintPolicy.perHint} point
              {debrief.hintPolicy.perHint === 1 ? '' : 's'} a rung, capped at{' '}
              {debrief.hintPolicy.cap}, rather than your own setting. Every ladder the exam
              withheld is listed under the steps below, so the steps you missed are yours to
              study now.
            </p>
          </section>
        ) : null}

        {debrief.identityFindings.length > 0 ? (
          <section className={styles.sectionBlock} aria-label="Identity check">
            <div className={styles.sectionHeader}>
              <h2>Identity check</h2>
              <span className={styles.sectionNote}>
                {debrief.identityFindings.length}{' '}
                {debrief.identityFindings.length === 1 ? 'claim' : 'claims'} contradicted
              </span>
            </div>
            <p className={styles.muted}>
              What the caller said, set beside what the record showed. These are the claims
              that did not hold up, not a suspicion the desk acted on.
            </p>
            <ul className={styles.identityFindings}>
              {debrief.identityFindings.map((finding) => (
                <li key={finding.id}>
                  <span className={styles.identityClaim}>“{finding.claim}”</span>
                  {finding.evidence}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {debrief.pressure.interruptions > 0 ? (
          <section className={styles.sectionBlock} aria-label="Caller pressure">
            <div className={styles.sectionHeader}>
              <h2>Pressure on the call</h2>
              <span className={styles.sectionNote}>
                {debrief.pressure.interruptions}{' '}
                {debrief.pressure.interruptions === 1 ? 'interruption' : 'interruptions'}
              </span>
            </div>
            <p className={styles.muted}>
              The caller did not wait to be asked. Each line below is something they broke in
              with, and the step it followed — the attempt’s own account of the pressure it was
              under, read from the call log.
            </p>
            <ul className={styles.pressureBeats}>
              {debrief.pressure.beats.map((beat, index) => (
                <li key={`${beat.atMs}-${index}`}>
                  <span className={styles.pressureLine}>“{beat.message}”</span>
                  <span className={styles.pressureAfter}>{beat.after}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className={styles.sectionBlock} aria-label="What your attempt showed">
          <div className={styles.sectionHeader}>
            <h2>What your attempt showed</h2>
            <span className={styles.sectionNote}>
              {stepsMet} of {debrief.items.length} steps met
            </span>
          </div>
          {/*
            * Where the price came from, when it was not the default. The family
            * price is pinned on the attempt, so this stays true after the family
            * is re-priced or the default moves.
            */}
          {debrief.hintPricing.source === 'family' && debrief.hintPricing.familyId !== null ? (
            <p className={styles.muted} role="note">
              <strong>Hints were priced for {familyLabel(debrief.hintPricing.familyId)}</strong>,
              not at the default: {hintRateText(debrief.hintPricing.policy)}. The default then
              was {hintRateText(debrief.hintPricing.defaultPolicy)}. This is the price the
              attempt started with, so changing Settings since does not re-price it.
            </p>
          ) : null}
          {debrief.rewinds > 0 ? (
            <p className={styles.muted}>
              {debrief.rewoundSteps} step{debrief.rewoundSteps === 1 ? '' : 's'} went in{' '}
              {debrief.rewinds} rewind{debrief.rewinds === 1 ? '' : 's'} while this attempt was
              open, so the score below is read from the log as it stands — not from every step
              that was ever tried.
            </p>
          ) : null}
          {/*
            * The score and the steps are read from different places: the charge from
            * the stored evaluation, the rungs from the action log. When the log is
            * gone, saying nothing would leave the count above and the steps below
            * disagreeing, so the difference is stated once, in the steps' own terms.
            */}
          {debrief.unaccountedHints > 0 ? (
            <p className={styles.hintGap} role="note">
              <strong>
                {debrief.unaccountedHints} hint
                {debrief.unaccountedHints === 1 ? '' : 's'}
              </strong>{' '}
              {debrief.unaccountedHints === 1 ? 'was' : 'were'} revealed and{' '}
              {debrief.unaccountedHintCost > 0
                ? `cost ${debrief.unaccountedHintCost} point${
                    debrief.unaccountedHintCost === 1 ? '' : 's'
                  } of diagnostic reasoning`
                : 'cost nothing'}{' '}
              on this attempt, but its action log no longer records which step each rung
              unstuck. The count beside the score is the one that was charged; no step below
              can claim {debrief.unaccountedHints === 1 ? 'it' : 'them'}.
            </p>
          ) : null}
          <ul className={styles.itemList} aria-label="Attempt findings">
            {debrief.items.map((item) => (
              <li key={item.id} className={styles.item} data-passed={item.passed}>
                <div className={styles.itemHeader}>
                  <span className={styles.itemTitle}>
                    {item.passed ? '✓' : '✗'} {item.label}
                    {item.critical ? <span className={styles.criticalTag}>Critical</span> : null}
                  </span>
                  <span className={styles.itemWeight}>
                    {CATEGORY_LABELS[item.category]} · {item.weight} pts
                  </span>
                </div>
                <p className={styles.itemWhy}>{item.why}</p>

                {item.hintsTaken.length > 0 ? (
                  <div className={styles.hintUse} aria-label={`Hints taken on ${item.label}`}>
                    <p className={styles.hintUseHeader}>
                      {item.hintsTaken.length === 1
                        ? 'Hint taken on this step'
                        : `${item.hintsTaken.length} hints taken on this step`}
                      {' · '}
                      {hintPriceText(item, debrief.hintPolicy)}
                    </p>
                    <ol className={styles.hintRungList}>
                      {item.hintsTaken.map((rung, index) => (
                        <li key={`${index}-${rung.rung}`} className={styles.hintRung}>
                          <span className={styles.hintRungStep}>
                            {rungLabel(item, rung.rung)}
                          </span>
                          <span className={styles.hintRungCost}>
                            {rung.cost === 0 ? 'free' : `−${rung.cost} pts`}
                          </span>
                          <span className={styles.hintRungText}>{rung.text}</span>
                        </li>
                      ))}
                    </ol>
                    <p className={styles.hintUnaided}>
                      Unaided · worth {item.weight} pts — {unaidedText(item)}
                    </p>
                  </div>
                ) : null}

                {/*
                  * A step with no rungs on it reads as unaided only when the attempt's
                  * log accounts for every hint it charged. With rungs missing from the
                  * log we cannot know which step they unstuck, so this step does not get
                  * to claim the learner never took one.
                  */}
                {!item.passed &&
                item.hints.length > 0 &&
                item.hintsTaken.length === 0 &&
                debrief.unaccountedHints === 0 ? (
                  <div
                    className={styles.itemHints}
                    aria-label={`Hints available on ${item.label}`}
                  >
                    <p className={styles.itemHintsHeader}>
                      Hints this step would have given you
                    </p>
                    <ol className={styles.itemHintList}>
                      {item.hints.map((hint, index) => (
                        <li key={hint} className={styles.itemHint}>
                          <span className={styles.itemHintRung}>
                            Rung {index + 1} of {item.hints.length}
                          </span>
                          <span className={styles.itemHintText}>{hint}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                ) : null}
                <p className={styles.itemEvidence}>
                  {item.evidence.join(' · ')}
                </p>
              </li>
            ))}
          </ul>
        </section>

        {/*
          * Every step a tool or a panel produced, in order, each labelled with
          * the surface that produced it — not just the commands, so a hint, a
          * note and an identity check are as readable as a typed command is.
          */}
        <section className={styles.sectionBlock} aria-label="Attempt trail">
          <div className={styles.sectionHeader}>
            <h2>Attempt trail</h2>
            <span className={styles.sectionNote}>
              {debrief.trail.length === 0
                ? 'no steps logged'
                : `${debrief.trail.length} steps logged`}
            </span>
          </div>
          {debrief.trail.length === 0 ? (
            <p className={styles.muted}>No step was logged on this attempt.</p>
          ) : (
            <>
              <p className={styles.trailOrigin}>
                Logged from:{' '}
                {STEP_SOURCES.map((source) => ({
                  source,
                  count: debrief.trail.filter((entry) => entry.source === source).length,
                }))
                  .filter((row) => row.count > 0)
                  .map((row) => `${row.count} ${SOURCE_LABELS[row.source]}`)
                  .join(' · ')}
              </p>
              <ol className={styles.trailList}>
                {debrief.trail.map((entry, index) => (
                  <li key={`${entry.atMs}-${index}`} className={styles.trailItem}>
                    <span className={styles.trailStep}>
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <span className={styles.trailBody}>
                      <span className={styles.sourceTag} data-source={entry.source}>
                        {SOURCE_LABELS[entry.source]}
                      </span>
                      <TrailStep entry={entry} />
                    </span>
                  </li>
                ))}
              </ol>
            </>
          )}
        </section>

        {/*
          * The trail above says what happened; this says what it was worth. The
          * same commands are read again, grouped by the tool that ran them, so a
          * learner sees which tool earned their points and which kept guessing.
          */}
        {commands.length > 0 ? (
          <section className={styles.sectionBlock} aria-label="Commands by tool">
            <div className={styles.sectionHeader}>
              <h2>Commands by tool</h2>
              <span className={styles.sectionNote}>
                {creditedCommands} of {commands.length} earned credit
              </span>
            </div>
            <p className={styles.muted}>
              A command earns credit when it helped prove a step the attempt earned: a step that
              takes two actions credits both, while running the same read again proves nothing
              new. Anything else was a dead end — the simulator answered it, but the score did not
              depend on it.
            </p>
            {commandGroups(debrief.trail).map((group) => (
              <div
                key={group.source}
                className={styles.toolGroup}
                aria-label={`${SOURCE_LABELS[group.source]} commands`}
              >
                <div className={styles.toolGroupHeader}>
                  <span className={styles.sourceTag} data-source={group.source}>
                    {SOURCE_LABELS[group.source]}
                  </span>
                  <span className={styles.toolGroupCount}>
                    {groupCountText(group.commands)}
                  </span>
                </div>
                <ul className={styles.creditList}>
                  {group.commands.map((entry, index) => {
                    const verdict = creditText(entry)
                    return (
                      <li
                        key={`${entry.atMs}-${index}`}
                        className={styles.creditItem}
                        data-credit={verdict.tone}
                      >
                        <code className={styles.creditCommand}>{entry.command}</code>
                        {entry.machine ? (
                          <span className={styles.creditMachine}>on {entry.machine}</span>
                        ) : null}
                        {entry.ok ? null : (
                          <span className={styles.trailRejected}>rejected</span>
                        )}
                        <span className={styles.creditVerdict}>{verdict.text}</span>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))}
          </section>
        ) : null}

        <section className={styles.sectionBlock} aria-label="Feedback">
          <div className={styles.sectionHeader}>
            <h2>What to take away</h2>
            <span className={styles.sectionNote}>{debrief.feedback.length} points</span>
          </div>
          <ul className={styles.feedbackList}>
            {debrief.feedback.map((line, index) => (
              <li key={`${index}-${line.slice(0, 18)}`}>{line}</li>
            ))}
          </ul>
        </section>

        <section className={styles.sectionBlock} aria-label="Reference path">
          <div className={styles.sectionHeader}>
            <h2>One clean path through this ticket</h2>
            <span className={styles.sectionNote}>{debrief.reference.length} steps</span>
          </div>
          <ol className={styles.referenceList}>
            {debrief.reference.map((step, index) => (
              <li key={`${index}-${step.label}`}>
                <span className={styles.referenceStep}>{String(index + 1).padStart(2, '0')}</span>
                <span>
                  {step.label}
                  {step.detail ? ` — ${step.detail}` : ''}
                </span>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </>
  )
}
