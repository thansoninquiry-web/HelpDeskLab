import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router'
import { CommandConsole } from '../../../ui/components/CommandConsole'
import { blank, muted, type ConsoleResponse } from '../../shared/console'
import { TOPOLOGY, deviceById } from '../data/topology'
import { runTool, equipmentRead } from '../logic/tools'
import type { NetlabScore } from '../logic/scoring'
import { CHECKS, FIX_LABELS, type FixId } from '../types'
import { NetlabNav } from './NetlabNav'
import { useIncident } from './useNetlab'
import styles from './netlab.module.css'

const CATEGORY_LABELS: Record<string, string> = {
  physical: 'Physical and link',
  switching: 'Switching and VLANs',
  addressing: 'Addressing and DHCP',
  wireless: 'Wireless',
  services: 'Services',
  routing: 'Routing',
  wan: 'Circuit and WAN',
}

const CATEGORY_ORDER = ['diagnosis', 'resolution', 'safety', 'documentation'] as const

const CATEGORY_NAMES: Record<(typeof CATEGORY_ORDER)[number], string> = {
  diagnosis: 'Diagnosis',
  resolution: 'Resolution',
  safety: 'Safety',
  documentation: 'Documentation',
}

const EQUIPMENT = ['modem-1', 'fw-edge', 'srv-dc01', 'ap-staff', 'ap-student'] as const

function ScorePanel({
  score,
  busy,
  onRestart,
}: {
  score: NetlabScore
  busy: boolean
  onRestart: () => void
}) {
  return (
    <section
      className={styles.score}
      data-passed={score.passed}
      aria-label="Attempt score"
    >
      <div className={styles.scoreTotal}>
        <strong>{score.total}</strong>
        <span className={styles.count}>
          out of 100 · {score.band} {score.passed ? '· passed' : '· not passed'}
        </span>
      </div>

      <h3 className={styles.panelTitle}>By category</h3>
      <dl className={styles.categories}>
        {CATEGORY_ORDER.map((category) => {
          const entry = score.categoryScores[category]
          return (
            <div key={category}>
              <dt>{CATEGORY_NAMES[category]}</dt>
              <dd>
                {entry.possible === 0
                  ? 'not scored here'
                  : `${Math.round(entry.earned)} / ${entry.possible}`}
              </dd>
            </div>
          )
        })}
      </dl>

      <h3 className={styles.panelTitle}>What made the score</h3>
      <ul className={styles.items}>
        {score.items.map((item) => (
          <li key={item.id} data-passed={item.passed}>
            <span>
              <span className={styles.mark} aria-hidden="true">
                {item.passed ? '✓' : '✗'}
              </span>{' '}
              {item.label}
              <br />
              <span className={styles.incidentSymptom}>{item.detail}</span>
            </span>
            <span className={styles.mono}>
              {Math.round(item.earned)}/{Math.round(item.possible)}
            </span>
          </li>
        ))}
      </ul>

      <div className={styles.explain}>
        {score.explanation.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
      </div>

      <div className={styles.row}>
        <button type="button" className={styles.button} disabled={busy} onClick={onRestart}>
          Try again
        </button>
        <span className={styles.count}>
          A new attempt starts from the fault as it was seeded.
        </span>
      </div>
    </section>
  )
}

export function NetlabIncidentPage() {
  const { incidentId = '' } = useParams()
  const { data, error, busy, recordCheck, applyFix, check, restart } = useIncident(incidentId)
  const [selected, setSelected] = useState<string | null>(null)
  const [readout, setReadout] = useState<{ label: string; lines: string[] } | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [hints, setHints] = useState(0)
  /**
   * The incident the page's other state belongs to. A route change resets the
   * readout and the hint count during the render that follows it, rather than in
   * an effect that would render once with the previous incident's readout.
   */
  const [shown, setShown] = useState(incidentId)
  if (shown !== incidentId) {
    setShown(incidentId)
    setSelected(null)
    setReadout(null)
    setMessage(null)
    setHints(0)
  }

  const estate = data?.estate ?? null
  const attempt = data?.attempt ?? null
  const incident = data?.incident ?? null
  const score = data?.score ?? null
  const scored = score !== null

  const devices = useMemo(
    () =>
      TOPOLOGY.devices.filter(
        (device) => device.kind === 'client' || device.kind === 'switch' || device.kind === 'router',
      ),
    [],
  )
  const activeDevice = selected ?? incident?.subjectId ?? 'pc-staff-01'
  const active = deviceById(activeDevice)

  const prompt =
    active?.kind === 'switch' ? 'sw-core#' : active?.kind === 'router' ? 'rtr-core#' : 'C:\\Users\\lab>'

  const log = useMemo(() => {
    if (!attempt) {
      return []
    }
    return [
      ...attempt.state.checks.map((entry) => ({
        at: entry.at,
        kind: 'read' as const,
        label: `Read: ${CHECKS[entry.id].label}`,
        meta: deviceById(entry.deviceId)?.name ?? entry.deviceId,
      })),
      ...attempt.state.changes.map((entry) => ({
        at: entry.at,
        kind: 'change' as const,
        label: FIX_LABELS[entry.fix],
        meta: 'change',
      })),
    ].sort((left, right) => left.at - right.at)
  }, [attempt])

  const respond = async (input: string): Promise<ConsoleResponse> => {
    if (!estate) {
      return { lines: [muted('The estate is still opening. Try again in a moment.')] }
    }
    const outcome = runTool({ estate, deviceId: activeDevice }, input)
    if (outcome.check && attempt && !scored) {
      await recordCheck(outcome.check, activeDevice)
      return {
        lines: [
          ...outcome.lines,
          blank(),
          muted(`Read recorded: ${CHECKS[outcome.check].label}.`),
        ],
        cleared: outcome.cleared,
      }
    }
    return { lines: outcome.lines, cleared: outcome.cleared }
  }

  const readEquipment = async (deviceId: string) => {
    if (!estate) {
      return
    }
    const read = equipmentRead(estate, deviceId)
    if (!read) {
      return
    }
    setReadout({ label: read.label, lines: read.lines.map((entry) => entry.text) })
    if (attempt && !scored) {
      await recordCheck(read.check, deviceId)
      setMessage(`Read recorded: ${read.label}.`)
    }
  }

  const runFix = async (fix: FixId) => {
    const result = await applyFix(fix)
    setMessage(result?.summary ?? null)
  }

  if (error) {
    return (
      <div className={styles.page}>
        <p className={styles.empty} role="alert">
          {error}
        </p>
        <Link className={styles.link} to="/networking/incidents">
          Back to the incident list
        </Link>
      </div>
    )
  }

  if (!incident || !estate || !attempt) {
    return (
      <div className={styles.page}>
        <p className={styles.empty}>Opening the incident…</p>
      </div>
    )
  }

  const subject = deviceById(incident.subjectId)

  return (
    <div className={styles.page}>
      <header>
        <p className={styles.count}>
          {CATEGORY_LABELS[incident.category] ?? incident.category} · difficulty{' '}
          {incident.difficulty} · attempt {new Date(attempt.startedAt).toLocaleTimeString()}
        </p>
        <h1>{incident.title}</h1>
        <p className={styles.lead}>{incident.symptom}</p>
        <blockquote className={styles.report}>{incident.report}</blockquote>
        <p className={styles.note}>
          Affected device:{' '}
          <Link className={styles.link} to={`/networking/devices/${incident.subjectId}`}>
            {subject?.name ?? incident.subjectId}
          </Link>{' '}
          · {subject?.area ?? 'on site'}
        </p>
      </header>

      <NetlabNav />

      {message ? (
        <p className={styles.note} role="status">
          {message}
        </p>
      ) : null}

      <div className={styles.layout}>
        <div className={styles.stack}>
          <section className={styles.panel} aria-labelledby="equipment-heading">
            <h2 id="equipment-heading" className={styles.panelTitle}>
              Read the equipment
              <span className={styles.count}>
                {scored ? 'attempt scored' : 'each read is recorded'}
              </span>
            </h2>
            <p className={styles.note}>
              Status pages are reads, not changes. A read before the first change is what
              the diagnosis is scored on.
            </p>
            <div className={styles.row}>
              {EQUIPMENT.map((deviceId) => {
                const read = equipmentRead(estate, deviceId)
                if (!read) {
                  return null
                }
                return (
                  <button
                    key={deviceId}
                    type="button"
                    className={styles.buttonQuiet}
                    onClick={() => void readEquipment(deviceId)}
                  >
                    {read.label}
                  </button>
                )
              })}
            </div>
            {readout ? (
              <>
                <p className={styles.count}>{readout.label}</p>
                <pre className={styles.readOut}>{readout.lines.join('\n')}</pre>
              </>
            ) : null}
          </section>

          <section className={styles.panel} aria-labelledby="tools-heading">
            <h2 id="tools-heading" className={styles.panelTitle}>
              Tools
              <span className={styles.count}>
                {active?.kind === 'switch' || active?.kind === 'router'
                  ? 'device CLI'
                  : 'Windows tools'}
              </span>
            </h2>
            <label className={styles.field}>
              <span>Run against</span>
              <select
                value={activeDevice}
                onChange={(event) => setSelected(event.target.value)}
              >
                {devices.map((device) => (
                  <option key={device.id} value={device.id}>
                    {device.name}
                    {device.vlanId ? ` · VLAN ${device.vlanId}` : ''}
                  </option>
                ))}
              </select>
            </label>
            <CommandConsole
              key={activeDevice}
              title={active?.name ?? 'Lab tools'}
              subtitle={
                active?.kind === 'switch' || active?.kind === 'router'
                  ? `${active.name} · read-only IOS shell`
                  : `${active?.name ?? 'Client'} · simulated Windows tools`
              }
              prompt={prompt}
              intro={[
                muted(
                  active?.kind === 'switch' || active?.kind === 'router'
                    ? 'Read-only shell. Configuration is refused; changes go through the action bar.'
                    : 'Every command reads the simulated machine. Type help for the list.',
                ),
              ]}
              suggestions={
                active?.kind === 'switch'
                  ? [
                      'show interfaces status',
                      'show interfaces trunk',
                      'show vlan',
                      'show mac address-table',
                    ]
                  : active?.kind === 'router'
                    ? ['show ip interface brief', 'show ip dhcp pool', 'show ip route']
                    : ['ipconfig /all', 'ping 10.10.10.1', 'nslookup srv-files', 'tracert 1.1.1.1']
              }
              busy={busy}
              run={respond}
            />
          </section>
        </div>

        <div className={styles.stack}>
          <section className={styles.panel} aria-labelledby="actions-heading">
            <h2 id="actions-heading" className={styles.panelTitle}>
              Change something
              <span className={styles.count}>{attempt.state.fixes.length} made</span>
            </h2>
            {scored ? (
              <p className={styles.note}>
                This attempt has been scored. Try again below to start from the seeded
                fault.
              </p>
            ) : null}
            <ul className={styles.actionList}>
              {incident.fixOptions.map((option) => {
                const done = attempt.state.fixes.includes(option.id)
                return (
                  <li key={option.id} className={styles.action} data-risk={option.risk === true}>
                    <span className={styles.actionBody}>
                      <span className={styles.actionLabel}>{option.label}</span>
                      <span className={styles.actionDetail}>{option.detail}</span>
                    </span>
                    {done ? (
                      <span className={styles.done}>Done</span>
                    ) : (
                      <button
                        type="button"
                        className={option.risk ? styles.buttonDanger : styles.button}
                        disabled={busy || scored}
                        onClick={() => void runFix(option.id)}
                      >
                        Apply
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>
          </section>

          <section className={styles.panel} aria-labelledby="log-heading">
            <h2 id="log-heading" className={styles.panelTitle}>
              What this attempt did
              <span className={styles.count}>{log.length} steps</span>
            </h2>
            {log.length === 0 ? (
              <p className={styles.empty}>Nothing yet. Read something first.</p>
            ) : (
              <ol className={styles.log}>
                {log.map((entry, index) => (
                  <li
                    key={`${entry.at}-${entry.kind}-${index}`}
                    className={styles.logItem}
                    data-kind={entry.kind}
                  >
                    <span className={styles.logRead}>{entry.label}</span>
                    <span className={styles.logMeta}>{entry.meta}</span>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section className={styles.panel} aria-labelledby="hints-heading">
            <h2 id="hints-heading" className={styles.panelTitle}>
              Hints
              <span className={styles.count}>{hints} of 3 shown</span>
            </h2>
            {hints > 0 ? (
              <ul className={styles.hintList}>
                {incident.hints.slice(0, hints).map((hint, index) => (
                  <li key={hint} className={styles.hint}>
                    {index + 1}. {hint}
                  </li>
                ))}
              </ul>
            ) : (
              <p className={styles.note}>
                Hints do not change the score, but the reference path does not need them.
              </p>
            )}
            {hints < incident.hints.length ? (
              <div className={styles.row}>
                <button
                  type="button"
                  className={styles.buttonQuiet}
                  onClick={() => setHints((count) => count + 1)}
                >
                  Reveal hint {hints + 1}
                </button>
              </div>
            ) : null}
          </section>

          {scored ? (
            <ScorePanel
              score={score}
              busy={busy}
              onRestart={() => {
                setReadout(null)
                setMessage(null)
                setHints(0)
                void restart()
              }}
            />
          ) : (
            <section className={styles.panel} aria-labelledby="check-heading">
              <h2 id="check-heading" className={styles.panelTitle}>
                Close the incident
              </h2>
              <p className={styles.note}>
                The check reads the estate, not the buttons: the fault has to be actually
                gone, and the reads before the first change are what the diagnosis is
                scored on.
              </p>
              <div className={styles.row}>
                <button
                  type="button"
                  className={styles.button}
                  disabled={busy}
                  onClick={() => void check()}
                >
                  {busy ? 'Checking…' : 'Check my work'}
                </button>
              </div>
            </section>
          )}

          <section className={styles.panel} aria-labelledby="concepts-heading">
            <h2 id="concepts-heading" className={styles.panelTitle}>
              The ideas behind it
            </h2>
            <p className={styles.note}>
              Reading the card after a wrong attempt is usually worth more than a third
              guess.
            </p>
            <div className={styles.conceptLinks}>
              {incident.conceptIds.map((conceptId) => (
                <Link
                  key={conceptId}
                  className={styles.conceptChip}
                  to={`/networking/concepts#${conceptId}`}
                >
                  {conceptId.replace(/-/g, ' ')}
                </Link>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

