import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import {
  addNote,
  askCaller,
  callerPrompts,
  closureOptions,
  formatSimClock,
  openSession,
  resolveAttempt,
  submitCommand,
  verifyCaller,
  type NoteKind,
  type WorkspaceEntry,
  type WorkspaceView,
} from '../../app/practiceService'
import styles from './practice.module.css'

const SEVERITY_LABELS = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
} as const

function EntryLog({ entry }: { entry: WorkspaceEntry }) {
  if (entry.kind === 'command') {
    return (
      <div className={styles.entry}>
        <p className={styles.commandLine}>
          <span className={styles.prompt}>PS C:\Users\helpdesk&gt;</span> {entry.text}
        </p>
        {entry.lines.map((line, index) => (
          <p
            key={`${entry.atMs}-${index}`}
            className={styles.outputLine}
            data-tone={line.tone}
          >
            {line.text || '\u00a0'}
          </p>
        ))}
      </div>
    )
  }

  if (entry.kind === 'ask') {
    return (
      <div className={styles.chatEntry}>
        <p className={styles.chatQuestion}>{entry.question}</p>
        <p className={styles.chatAnswer}>{entry.answer}</p>
      </div>
    )
  }

  if (entry.kind === 'verify') {
    return <p className={styles.verifyEntry}>✓ {entry.summary}</p>
  }

  return (
    <div className={styles.noteEntry}>
      <span className={styles.noteTag}>{entry.noteKind} note</span>
      <p>{entry.text}</p>
    </div>
  )
}

export function TicketWorkspacePage() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const navigate = useNavigate()
  const [workspace, setWorkspace] = useState<WorkspaceView | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [command, setCommand] = useState('')
  const [history, setHistory] = useState<string[]>([])
  const [historyIndex, setHistoryIndex] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [troubleshootingDraft, setTroubleshootingDraft] = useState('')
  const [customerDraft, setCustomerDraft] = useState('')
  const [closureCode, setClosureCode] = useState('resolved-remote')
  const [resolutionNote, setResolutionNote] = useState('')
  const logEnd = useRef<HTMLDivElement | null>(null)

  const prompts = useMemo(() => callerPrompts(), [])
  const closures = useMemo(() => closureOptions(), [])

  useEffect(() => {
    let cancelled = false
    if (!sessionId) {
      return
    }
    openSession(sessionId)
      .then((view) => {
        if (!cancelled) {
          setWorkspace(view)
        }
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setLoadError(caught instanceof Error ? caught.message : 'This session could not be opened.')
        }
      })
    return () => {
      cancelled = true
    }
  }, [sessionId])

  useEffect(() => {
    const target = logEnd.current
    if (target && typeof target.scrollIntoView === 'function') {
      target.scrollIntoView({ block: 'nearest' })
    }
  }, [workspace?.entries.length])

  const run = useCallback(async (operation: () => Promise<WorkspaceView>) => {
    setBusy(true)
    setActionError(null)
    try {
      setWorkspace(await operation())
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : 'That action failed.')
    } finally {
      setBusy(false)
    }
  }, [])

  const onCommand = async (event: FormEvent) => {
    event.preventDefault()
    const input = command.trim()
    if (!input || busy) {
      return
    }
    setHistory((current) => [...current.filter((item) => item !== input), input])
    setHistoryIndex(null)
    setCommand('')
    await run(() => submitCommand(input))
  }

  const onHistory = (direction: 'up' | 'down', event: KeyboardEvent<HTMLInputElement>) => {
    if (history.length === 0) {
      return
    }
    event.preventDefault()
    if (direction === 'up') {
      const next = historyIndex === null ? history.length - 1 : Math.max(0, historyIndex - 1)
      setHistoryIndex(next)
      setCommand(history[next] ?? '')
      return
    }
    if (historyIndex === null) {
      return
    }
    const next = historyIndex + 1
    if (next >= history.length) {
      setHistoryIndex(null)
      setCommand('')
      return
    }
    setHistoryIndex(next)
    setCommand(history[next] ?? '')
  }

  const saveNote = async (noteKind: NoteKind, text: string, clear: () => void) => {
    await run(() => addNote(noteKind, text))
    clear()
  }

  const onResolve = async (event: FormEvent) => {
    event.preventDefault()
    if (!sessionId || busy) {
      return
    }
    setBusy(true)
    setActionError(null)
    try {
      await resolveAttempt({ code: closureCode, note: resolutionNote })
      navigate(`/debrief/${sessionId}`)
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : 'The ticket could not be resolved.')
      setBusy(false)
    }
  }

  if (loadError) {
    return (
      <div className={styles.centerPanel}>
        <h1 className={styles.centerTitle}>Session unavailable</h1>
        <p className={styles.muted}>{loadError}</p>
        <Link className={styles.secondaryButton} to="/practice">
          Back to the queue
        </Link>
      </div>
    )
  }

  if (!workspace) {
    return <p className={styles.muted}>Opening the ticket…</p>
  }

  const { ticket } = workspace

  return (
    <div className={styles.workspace}>
      <section className={styles.ticketPane} aria-label="Ticket">
        <div className={styles.paneHeader}>
          <span className={styles.family}>{ticket.scenarioTitle}</span>
          <span className={styles[`severity_${ticket.severity}`] ?? styles.severity_medium}>
            {SEVERITY_LABELS[ticket.severity]}
          </span>
        </div>
        <h1 className={styles.ticketSubject}>{ticket.subject}</h1>
        <p className={styles.ticketMeta}>
          {ticket.requester.name} · {ticket.requester.department} · {ticket.requester.siteName}
        </p>
        <p className={styles.ticketMeta}>
          {ticket.device.hostname} · {ticket.device.os}
        </p>

        <p className={styles.ticketBody}>{ticket.body}</p>

        <div className={styles.subheading}>
          <h2>Reported symptoms</h2>
        </div>
        <ul className={styles.symptomList}>
          {ticket.symptoms.map((symptom) => (
            <li key={symptom}>{symptom}</li>
          ))}
        </ul>

        <div className={styles.subheading}>
          <h2>Troubleshooting notes</h2>
          <span className={styles.count}>{workspace.troubleshootingNotes.length}</span>
        </div>
        <ul className={styles.savedNotes}>
          {workspace.troubleshootingNotes.length === 0 ? (
            <li className={styles.mutedSmall}>Nothing logged yet. Notes are part of the score.</li>
          ) : (
            workspace.troubleshootingNotes.map((note, index) => (
              <li key={`${index}-${note.slice(0, 12)}`}>{note}</li>
            ))
          )}
        </ul>
        <textarea
          className={styles.noteInput}
          placeholder="What did you check, what did you find, and what did you change?"
          value={troubleshootingDraft}
          onChange={(event) => setTroubleshootingDraft(event.target.value)}
          rows={3}
        />
        <button
          type="button"
          className={styles.secondaryButton}
          disabled={busy}
          onClick={() =>
            void saveNote('troubleshooting', troubleshootingDraft, () => setTroubleshootingDraft(''))
          }
        >
          Log troubleshooting note
        </button>

        <div className={styles.subheading}>
          <h2>Customer notes</h2>
          <span className={styles.count}>{workspace.customerNotes.length}</span>
        </div>
        <ul className={styles.savedNotes}>
          {workspace.customerNotes.length === 0 ? (
            <li className={styles.mutedSmall}>No customer-facing update yet.</li>
          ) : (
            workspace.customerNotes.map((note, index) => (
              <li key={`${index}-${note.slice(0, 12)}`}>{note}</li>
            ))
          )}
        </ul>
        <textarea
          className={styles.noteInput}
          placeholder="Plain-language update for the requester."
          value={customerDraft}
          onChange={(event) => setCustomerDraft(event.target.value)}
          rows={2}
        />
        <button
          type="button"
          className={styles.secondaryButton}
          disabled={busy}
          onClick={() => void saveNote('customer', customerDraft, () => setCustomerDraft(''))}
        >
          Send customer note
        </button>
      </section>

      <section className={styles.terminalPane} aria-label="Simulated terminal">
        <div className={styles.terminalHeader}>
          <span>Simulated terminal</span>
          <span className={styles.terminalClock}>
            {formatSimClock(workspace.simulatedClock)} · {workspace.minutesElapsed} min elapsed
          </span>
        </div>
        <div className={styles.log}>
          <p className={styles.logIntro}>
            Connected to {ticket.device.hostname}. Type <code>help</code> for the available tools.
            Every command advances the simulated clock by one minute.
          </p>
          {workspace.entries.map((entry, index) => (
            <EntryLog key={`${entry.kind}-${entry.atMs}-${index}`} entry={entry} />
          ))}
          <div ref={logEnd} />
        </div>
        <form className={styles.commandForm} onSubmit={(event) => void onCommand(event)}>
          <span className={styles.prompt}>PS&gt;</span>
          <input
            className={styles.commandInput}
            value={command}
            onChange={(event) => setCommand(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowUp') {
                onHistory('up', event)
              } else if (event.key === 'ArrowDown') {
                onHistory('down', event)
              }
            }}
            placeholder="ipconfig /all"
            aria-label="Command"
            autoComplete="off"
            spellCheck={false}
            disabled={busy}
          />
          <button type="submit" className={styles.runButton} disabled={busy}>
            {busy ? 'Running…' : 'Run'}
          </button>
        </form>
        {actionError ? (
          <p className={styles.error} role="alert">
            {actionError}
          </p>
        ) : null}
      </section>

      <aside className={styles.actionPane} aria-label="Support actions">
        <div className={styles.actionBlock}>
          <h2>Verify the caller</h2>
          <p className={styles.mutedSmall}>
            {workspace.hasVerifiedCaller
              ? 'Caller verified. Account changes are now defensible.'
              : 'Do this before any account change.'}
          </p>
          <div className={styles.buttonRow}>
            <button
              type="button"
              className={styles.secondaryButton}
              disabled={busy || workspace.hasVerifiedCaller}
              onClick={() => void run(() => verifyCaller('employee-id'))}
            >
              Badge ID
            </button>
            <button
              type="button"
              className={styles.secondaryButton}
              disabled={busy || workspace.hasVerifiedCaller}
              onClick={() => void run(() => verifyCaller('callback'))}
            >
              Callback
            </button>
            <button
              type="button"
              className={styles.secondaryButton}
              disabled={busy || workspace.hasVerifiedCaller}
              onClick={() => void run(() => verifyCaller('manager'))}
            >
              Manager
            </button>
          </div>
        </div>

        <div className={styles.actionBlock}>
          <h2>Ask the requester</h2>
          <div className={styles.stackedButtons}>
            {prompts.map((prompt) => (
              <button
                key={prompt.intent}
                type="button"
                className={styles.ghostButton}
                disabled={busy}
                onClick={() => void run(() => askCaller(prompt.intent))}
              >
                {prompt.label}
              </button>
            ))}
          </div>
        </div>

        <form className={styles.actionBlock} onSubmit={(event) => void onResolve(event)}>
          <h2>Close the ticket</h2>
          <label className={styles.fieldLabel} htmlFor="closure-code">
            Closure code
          </label>
          <select
            id="closure-code"
            className={styles.select}
            value={closureCode}
            onChange={(event) => setClosureCode(event.target.value)}
          >
            {closures.map((entry) => (
              <option key={entry.code} value={entry.code}>
                {entry.label}
              </option>
            ))}
          </select>
          <label className={styles.fieldLabel} htmlFor="resolution-note">
            Handoff note
          </label>
          <textarea
            id="resolution-note"
            className={styles.noteInput}
            rows={3}
            value={resolutionNote}
            onChange={(event) => setResolutionNote(event.target.value)}
            placeholder="What was reported, what you checked, and what the next team should do"
          />
          <button type="submit" className={styles.primaryButton} disabled={busy}>
            Resolve ticket
          </button>
          <p className={styles.mutedSmall}>
            Required when you escalate: name the report, the evidence, and the next action. Resolving
            closes the session and scores your evidence, notes, and decision.
          </p>
        </form>

        <div className={styles.actionBlock}>
          <h2>Command cheat sheet</h2>
          <dl className={styles.cheatSheet}>
            <dt>ipconfig /all</dt>
            <dd>Adapter, lease, DNS servers</dd>
            <dt>ipconfig /renew</dt>
            <dd>Request a new DHCP lease</dd>
            <dt>nslookup &lt;name&gt;</dt>
            <dd>Test name resolution</dd>
            <dt>ping &lt;host&gt;</dt>
            <dd>Test reachability</dd>
            <dt>set-dns &lt;ip&gt;</dt>
            <dd>Replace the DNS servers</dd>
            <dt>get-account &lt;user&gt;</dt>
            <dd>Directory status and expiry</dd>
            <dt>unlock-account</dt>
            <dd>Clear a lockout</dd>
            <dt>reset-password</dt>
            <dd>Issue a temporary password</dd>
            <dt>get-printers</dt>
            <dd>Printer and spooler state</dd>
            <dt>get-printqueue</dt>
            <dd>Inspect a print queue</dd>
            <dt>restart-spooler</dt>
            <dd>Restart the local spooler</dd>
            <dt>clear-printqueue</dt>
            <dd>Remove stuck jobs</dd>
            <dt>get-dhcp-scope &lt;site&gt;</dt>
            <dd>Scope options and leases</dd>
            <dt>remove-dhcp-lease &lt;site&gt; &lt;ip&gt;</dt>
            <dd>Clear a stale lease</dd>
            <dt>get-signin-log &lt;user&gt;</dt>
            <dd>M365 sign-in and MFA state</dd>
            <dt>reset-mfa &lt;user&gt;</dt>
            <dd>Clear a lost MFA method</dd>
            <dt>unblock-signin &lt;user&gt;</dt>
            <dd>Clear a smart lockout</dd>
            <dt>get-share-access &lt;share&gt;</dt>
            <dd>Effective access on a share</dd>
            <dt>add-group-member &lt;group&gt; &lt;user&gt;</dt>
            <dd>Restore share access</dd>
          </dl>
        </div>
      </aside>
    </div>
  )
}
