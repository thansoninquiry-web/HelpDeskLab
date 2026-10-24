import { useEffect, useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'
import {
  DESKTOP_ACTIONS,
  type ConsoleLine,
  type DesktopPrinterView,
  type DesktopView,
} from '../../app/practiceService'
import styles from './FakeDesktop.module.css'

export interface DesktopCommandOutput {
  command: string
  ok: boolean
  lines: ConsoleLine[]
}

interface FakeDesktopProps {
  desktop: DesktopView
  busy: boolean
  /** Runs one audited desktop action and returns the command's output. */
  onRun: (
    actionId: string,
    inputs?: readonly string[],
  ) => Promise<DesktopCommandOutput | null>
  /**
   * Runs a command typed into the desktop terminal. It is the same pipeline as
   * the side terminal, so the output is the command's real output, not a copy.
   */
  onCommand: (input: string) => Promise<DesktopCommandOutput | null>
  /** Closes the shell and shows the Remote Desktop machine record instead. */
  onShowRecords: () => void
  /**
   * Brings another open session to the front. False when the switch could not
   * be made, so the shell stays on the desktop it is already showing.
   */
  onSelectSession: (hostname: string) => Promise<boolean>
}

type AppId = 'explorer' | 'settings' | 'control' | 'browser' | 'printers' | 'terminal'

const APP_TITLES: Record<AppId, string> = {
  explorer: 'This PC',
  settings: 'Settings',
  control: 'Control Panel',
  browser: 'Microsoft Edge',
  printers: 'Printers & scanners',
  terminal: 'Terminal',
}

const APPS: ReadonlyArray<{ id: AppId; label: string; glyph: GlyphName; detail: string }> = [
  { id: 'explorer', label: 'This PC', glyph: 'drives', detail: 'Disks and device details' },
  { id: 'settings', label: 'Settings', glyph: 'gear', detail: 'System, network, accounts' },
  { id: 'control', label: 'Control Panel', glyph: 'sliders', detail: 'Classic device tools' },
  { id: 'browser', label: 'Microsoft Edge', glyph: 'globe', detail: 'The company intranet' },
  { id: 'printers', label: 'Printers', glyph: 'printer', detail: 'Queues and the spooler' },
  { id: 'terminal', label: 'Terminal', glyph: 'prompt', detail: 'The same tools as the Terminal tab' },
]

/**
 * Which drawing a desktop tile leads with, on the shell's 24px grid.
 *
 * These used to be typed characters — ▤ for a drive, ⚙ for settings, 🖨 for a
 * printer — and a typed glyph is only as present as the font the browser
 * happens to fall back to. A phone whose chain misses one showed an empty tile,
 * which on the desktop meant an app you could not see to open. Drawn strokes
 * render wherever the rest of the shell's icons do, at any text size.
 */
type GlyphName =
  | 'drives'
  | 'gear'
  | 'sliders'
  | 'globe'
  | 'printer'
  | 'prompt'
  | 'system'
  | 'refresh'
  | 'apps'

/** One desktop icon, drawn by the size its tile gives it. */
function Glyph({ name, size = 20 }: { name: GlyphName; size?: number }) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.6,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  }

  if (name === 'drives') {
    return (
      <svg {...common}>
        <rect x="3" y="4" width="18" height="6.5" rx="1.6" />
        <rect x="3" y="13.5" width="18" height="6.5" rx="1.6" />
        <path d="M6.6 7.25h.01M6.6 16.75h.01" />
      </svg>
    )
  }

  if (name === 'gear') {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="3.1" />
        <path d="M12 2.6v2.1M12 19.3v2.1M2.6 12h2.1M19.3 12h2.1M5.4 5.4l1.5 1.5M17.1 17.1l1.5 1.5M18.6 5.4l-1.5 1.5M6.9 17.1l-1.5 1.5" />
      </svg>
    )
  }

  if (name === 'sliders') {
    return (
      <svg {...common}>
        <path d="M4 7h8M17 7h3M4 12h3M11 12h9M4 17h9M17 17h3" />
        <circle cx="15" cy="7" r="2" />
        <circle cx="9" cy="12" r="2" />
        <circle cx="15" cy="17" r="2" />
      </svg>
    )
  }

  if (name === 'globe') {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="8.6" />
        <path d="M3.4 12h17.2" />
        <path d="M12 3.4c2.4 2.4 3.6 5.2 3.6 8.6s-1.2 6.2-3.6 8.6c-2.4-2.4-3.6-5.2-3.6-8.6S9.6 5.8 12 3.4Z" />
      </svg>
    )
  }

  if (name === 'printer') {
    return (
      <svg {...common}>
        <path d="M7 9V4h10v5" />
        <rect x="4" y="9" width="16" height="7" rx="1.6" />
        <path d="M7 16h10v5H7z" />
      </svg>
    )
  }

  if (name === 'prompt') {
    return (
      <svg {...common}>
        <path d="M5 7.5 9.5 12 5 16.5" />
        <path d="M12.5 17h6" />
      </svg>
    )
  }

  if (name === 'system') {
    return (
      <svg {...common}>
        <rect x="3" y="4.5" width="18" height="12" rx="1.6" />
        <path d="M9 20h6M12 16.5V20" />
      </svg>
    )
  }

  if (name === 'refresh') {
    return (
      <svg {...common}>
        <path d="M20 12a8 8 0 1 1-2.4-5.7" />
        <path d="M20 4v4.2h-4.2" />
      </svg>
    )
  }

  return (
    <svg {...common}>
      <rect x="4" y="4" width="7" height="7" rx="1" />
      <rect x="13" y="4" width="7" height="7" rx="1" />
      <rect x="4" y="13" width="7" height="7" rx="1" />
      <rect x="13" y="13" width="7" height="7" rx="1" />
    </svg>
  )
}

type BrowserPage = 'home' | 'support' | 'software'

function clockText(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function updateText(desktop: DesktopView): string {
  if (desktop.pendingReboot) {
    return 'Updates installed · restart pending'
  }
  return desktop.lastUpdateDays === 0
    ? 'Up to date'
    : `Last checked ${desktop.lastUpdateDays} day${desktop.lastUpdateDays === 1 ? '' : 's'} ago`
}

function jobSummary(printer: DesktopPrinterView): string {
  if (printer.jobs.length === 0) {
    return 'No jobs waiting'
  }
  return `${printer.jobs.length} job${printer.jobs.length === 1 ? '' : 's'} waiting`
}

function Meter({ value, label }: { value: number; label: string }) {
  return (
    <div className={styles.meter}>
      <div className={styles.meterTrack} aria-hidden="true">
        <span className={styles.meterFill} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
      </div>
      <span className={styles.meterLabel}>
        {label}: {value}% free
      </span>
    </div>
  )
}

/**
 * A fake Windows shell for one connected machine.
 *
 * Everything it shows comes from the Remote Desktop projection, and every
 * control on it runs one of the audited `remote-*` commands. That is deliberate:
 * flipping a switch here is evidence in the ticket log, not a browser preference,
 * so the debrief and the rubric see it exactly as if the command were typed.
 */
export function FakeDesktop({
  desktop,
  busy,
  onRun,
  onCommand,
  onShowRecords,
  onSelectSession,
}: FakeDesktopProps) {
  const [app, setApp] = useState<AppId | null>(null)
  const [startOpen, setStartOpen] = useState(false)
  const [browserPage, setBrowserPage] = useState<BrowserPage>('home')
  const [pending, setPending] = useState<string | null>(null)
  const [output, setOutput] = useState<DesktopCommandOutput | null>(null)
  const [terminalEntries, setTerminalEntries] = useState<DesktopCommandOutput[]>([])
  const [terminalInput, setTerminalInput] = useState('')
  const [terminalBusy, setTerminalBusy] = useState(false)
  const [terminalHistory, setTerminalHistory] = useState<string[]>([])
  const [terminalHistoryIndex, setTerminalHistoryIndex] = useState<number | null>(null)
  /** The machine a session switch is being made to, while it is in flight. */
  const [switching, setSwitching] = useState<string | null>(null)
  const terminalEnd = useRef<HTMLDivElement | null>(null)

  // The newest output is the one that matters, so the log follows it.
  useEffect(() => {
    const target = terminalEnd.current
    if (target && typeof target.scrollIntoView === 'function') {
      target.scrollIntoView({ block: 'nearest' })
    }
  }, [terminalEntries.length, app])

  const run = async (key: string, actionId: string, inputs?: readonly string[]) => {
    if (busy || pending) {
      return
    }
    setPending(key)
    const result = await onRun(actionId, inputs)
    setPending(null)
    if (result) {
      setOutput(result)
    }
  }

  const open = (next: AppId) => {
    setStartOpen(false)
    setApp(next)
  }

  /**
   * Another session, already open, in front. The desktop itself comes back from
   * the console once the switch lands, so this only holds the button still while
   * it does.
   */
  const switchTo = async (hostname: string) => {
    if (busy || switching !== null) {
      return
    }
    setSwitching(hostname)
    await onSelectSession(hostname)
    setSwitching(null)
  }

  const prompt = `PS C:\\Users\\${desktop.userAccount}>`

  /**
   * Typing here is exactly as audited as typing in the side terminal: the
   * command is parsed, applied, and logged by the same service, and the shell
   * shows the output that command produced.
   */
  const submitTerminal = async (event: FormEvent) => {
    event.preventDefault()
    const input = terminalInput.trim()
    if (!input || busy || terminalBusy) {
      return
    }

    setTerminalHistory((current) => [...current.filter((item) => item !== input), input])
    setTerminalHistoryIndex(null)
    setTerminalInput('')
    setTerminalBusy(true)
    const result = await onCommand(input)
    setTerminalBusy(false)
    if (result) {
      setTerminalEntries((current) => [...current, result])
    }
  }

  const recallTerminalHistory = (
    direction: 'up' | 'down',
    event: KeyboardEvent<HTMLInputElement>,
  ) => {
    if (terminalHistory.length === 0) {
      return
    }
    event.preventDefault()
    if (direction === 'up') {
      const next =
        terminalHistoryIndex === null
          ? terminalHistory.length - 1
          : Math.max(0, terminalHistoryIndex - 1)
      setTerminalHistoryIndex(next)
      setTerminalInput(terminalHistory[next] ?? '')
      return
    }
    if (terminalHistoryIndex === null) {
      return
    }
    const next = terminalHistoryIndex + 1
    if (next >= terminalHistory.length) {
      setTerminalHistoryIndex(null)
      setTerminalInput('')
      return
    }
    setTerminalHistoryIndex(next)
    setTerminalInput(terminalHistory[next] ?? '')
  }

  const defaultPrinter = desktop.printers.find((printer) => printer.isDefault) ?? null
  const staticNetwork = desktop.ipMode === 'static'
  const spoolerRunning = desktop.spoolerStatus === 'running'

  return (
    // The marker is what the phone dock reads to give the desktop the screen room
    // a desktop needs: the card is otherwise sized for a log, not for a window.
    <section
      className={styles.desktop}
      data-desktop=""
      aria-label={`Remote desktop for ${desktop.hostname}`}
    >
      <div className={styles.sessionBar}>
        <span className={styles.sessionBadge}>
          <span className={styles.sessionDot} aria-hidden="true" />
          Remote session · {desktop.hostname}
        </span>
        {/*
         * More than one machine can be connected at a time. When it is, the bar
         * carries the others: switching is a recorded step of the attempt, and
         * the terminal that follows types on whichever desktop is in front.
         */}
        {desktop.openDesktops.length > 1 ? (
          <span className={styles.sessionTabs} role="group" aria-label="Open remote sessions">
            {desktop.openDesktops.map((open) => (
              <button
                key={open.entryId}
                type="button"
                className={styles.sessionTab}
                aria-pressed={open.focused}
                disabled={busy || switching !== null}
                onClick={() => void switchTo(open.hostname)}
              >
                {open.hostname}
                {switching === open.hostname ? ' …' : ''}
              </button>
            ))}
          </span>
        ) : null}
        <span className={styles.sessionWho}>
          {desktop.userName} · {desktop.siteName}
        </span>
        <button type="button" className={styles.sessionButton} onClick={onShowRecords}>
          Machine record
        </button>
      </div>

      <div className={styles.screen}>
        <div className={styles.wallpaper} aria-hidden="true" />

        <div className={styles.icons} aria-label="Desktop icons">
          {APPS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              className={styles.desktopIcon}
              onClick={() => open(entry.id)}
            >
              <span className={styles.iconGlyph} aria-hidden="true">
                <Glyph name={entry.glyph} />
              </span>
              <span className={styles.iconLabel}>{entry.label}</span>
            </button>
          ))}
        </div>

        {desktop.signedIn ? null : (
          <div className={styles.signedOut} role="status">
            <strong>Nobody is signed in.</strong>
            <span>The machine is at the Windows sign-in screen.</span>
          </div>
        )}

        {app ? (
          <section className={styles.window} role="dialog" aria-label={APP_TITLES[app]}>
            <header className={styles.titleBar}>
              <span className={styles.titleText}>{APP_TITLES[app]}</span>
              <button
                type="button"
                className={styles.closeButton}
                aria-label={`Close ${APP_TITLES[app]}`}
                onClick={() => setApp(null)}
              >
                ×
              </button>
            </header>
            <div className={styles.windowBody}>
              {app === 'explorer' ? (
                <div className={styles.appColumn}>
                  <div className={styles.appHeading}>
                    <h3>This PC</h3>
                    <span>{desktop.os}</span>
                  </div>
                  <div className={styles.driveCard}>
                    <div className={styles.driveHeader}>
                      <span className={styles.driveName}>Local Disk (C:)</span>
                      <span className={styles.driveMeta}>{desktop.diskFreePercent}% free</span>
                    </div>
                    <Meter value={desktop.diskFreePercent} label="C:" />
                    <p className={styles.smallText}>Updates: {updateText(desktop)}</p>
                    <div className={styles.buttonRow}>
                      <button
                        type="button"
                        className={styles.primaryButton}
                        disabled={busy || pending !== null}
                        onClick={() =>
                          void run(DESKTOP_ACTIONS.cleanup, DESKTOP_ACTIONS.cleanup)
                        }
                      >
                        {pending === DESKTOP_ACTIONS.cleanup ? 'Cleaning…' : 'Free up space'}
                      </button>
                      <button
                        type="button"
                        className={styles.secondaryButton}
                        disabled={busy || pending !== null}
                        onClick={() =>
                          void run(DESKTOP_ACTIONS.checkUpdates, DESKTOP_ACTIONS.checkUpdates)
                        }
                      >
                        {pending === DESKTOP_ACTIONS.checkUpdates ? 'Checking…' : 'Check for updates'}
                      </button>
                    </div>
                    {desktop.pendingReboot ? (
                      <button
                        type="button"
                        className={styles.linkButton}
                        disabled={busy || pending !== null}
                        onClick={() => void run('reboot', 'reboot')}
                      >
                        Restart now to finish installing updates
                      </button>
                    ) : null}
                  </div>
                  <dl className={styles.factGrid}>
                    <div>
                      <dt>Device name</dt>
                      <dd>{desktop.hostname}</dd>
                    </div>
                    <div>
                      <dt>Domain</dt>
                      <dd>{desktop.domain}</dd>
                    </div>
                    <div>
                      <dt>Site</dt>
                      <dd>{desktop.siteName}</dd>
                    </div>
                    <div>
                      <dt>Signed in</dt>
                      <dd>{desktop.signedIn ? desktop.userName : 'Nobody'}</dd>
                    </div>
                  </dl>
                </div>
              ) : null}

              {app === 'settings' ? (
                <div className={styles.appColumn}>
                  <div className={styles.appHeading}>
                    <h3>Settings</h3>
                    <span>{desktop.hostname}</span>
                  </div>

                  <div className={styles.settingsSection}>
                    <h4>System</h4>
                    <Meter value={desktop.diskFreePercent} label="Storage" />
                    <p className={styles.smallText}>{updateText(desktop)}</p>
                    <div className={styles.buttonRow}>
                      <button
                        type="button"
                        className={styles.primaryButton}
                        disabled={busy || pending !== null}
                        onClick={() =>
                          void run(DESKTOP_ACTIONS.checkUpdates, DESKTOP_ACTIONS.checkUpdates)
                        }
                      >
                        Check for updates
                      </button>
                      <button
                        type="button"
                        className={styles.secondaryButton}
                        disabled={busy || pending !== null}
                        onClick={() =>
                          void run(DESKTOP_ACTIONS.cleanup, DESKTOP_ACTIONS.cleanup)
                        }
                      >
                        Free up space
                      </button>
                      {desktop.pendingReboot ? (
                        <button
                          type="button"
                          className={styles.secondaryButton}
                          disabled={busy || pending !== null}
                          onClick={() => void run('reboot', 'reboot')}
                        >
                          Restart now
                        </button>
                      ) : null}
                    </div>
                  </div>

                  <div className={styles.settingsSection}>
                    <h4>Network &amp; internet</h4>
                    <dl className={styles.compactFacts}>
                      <div>
                        <dt>Address</dt>
                        <dd>{desktop.ipAddress ?? 'No address'}</dd>
                      </div>
                      <div>
                        <dt>Configured</dt>
                        <dd>{staticNetwork ? 'Static' : 'Automatic (DHCP)'}</dd>
                      </div>
                      <div>
                        <dt>DNS servers</dt>
                        <dd>{desktop.dnsServers.join(', ') || 'None'}</dd>
                      </div>
                    </dl>
                    <div className={styles.buttonRow}>
                      <button
                        type="button"
                        className={styles.secondaryButton}
                        disabled={busy || pending !== null}
                        onClick={() =>
                          void run(DESKTOP_ACTIONS.flushDns, DESKTOP_ACTIONS.flushDns)
                        }
                      >
                        Flush DNS cache
                      </button>
                      <button
                        type="button"
                        className={styles.secondaryButton}
                        disabled={busy || pending !== null || staticNetwork}
                        title={staticNetwork ? 'This adapter uses a static address.' : undefined}
                        onClick={() =>
                          void run(DESKTOP_ACTIONS.renewLease, DESKTOP_ACTIONS.renewLease)
                        }
                      >
                        Renew DHCP lease
                      </button>
                    </div>
                  </div>

                  <div className={styles.settingsSection}>
                    <h4>Accounts</h4>
                    <p className={styles.smallText}>
                      {desktop.signedIn
                        ? `${desktop.userName} (${desktop.domain}\\${desktop.userAccount}) is signed in.`
                        : 'Nobody is signed in on this machine.'}
                    </p>
                    <button
                      type="button"
                      className={styles.secondaryButton}
                      disabled={busy || pending !== null || !desktop.signedIn}
                      onClick={() =>
                        void run(DESKTOP_ACTIONS.signOut, DESKTOP_ACTIONS.signOut)
                      }
                    >
                      Sign out
                    </button>
                  </div>

                  <button type="button" className={styles.linkButton} onClick={() => open('printers')}>
                    Open Printers &amp; scanners
                  </button>
                </div>
              ) : null}

              {app === 'control' ? (
                <div className={styles.appColumn}>
                  <div className={styles.appHeading}>
                    <h3>Control Panel</h3>
                    <span>Adjust your computer’s settings</span>
                  </div>
                  <div className={styles.controlGrid}>
                    <div className={styles.controlCard}>
                      <span className={styles.controlIcon} aria-hidden="true">
                        <Glyph name="system" size={24} />
                      </span>
                      <strong>System</strong>
                      <span>{desktop.os}</span>
                      <span>{desktop.hostname} · {desktop.domain}</span>
                    </div>
                    <button
                      type="button"
                      className={styles.controlCard}
                      onClick={() => open('printers')}
                    >
                      <span className={styles.controlIcon} aria-hidden="true">
                        <Glyph name="printer" size={24} />
                      </span>
                      <strong>Devices and Printers</strong>
                      <span>
                        {desktop.printers.length} printer
                        {desktop.printers.length === 1 ? '' : 's'} ·{' '}
                        {defaultPrinter?.name ?? 'no default'}
                      </span>
                    </button>
                    <div className={styles.controlCard}>
                      <span className={styles.controlIcon} aria-hidden="true">
                        <Glyph name="gear" size={24} />
                      </span>
                      <strong>Administrative Tools</strong>
                      <span>Print Spooler: {desktop.spoolerStatus}</span>
                      <button
                        type="button"
                        className={styles.secondaryButton}
                        disabled={busy || pending !== null || spoolerRunning}
                        onClick={() =>
                          void run(
                            DESKTOP_ACTIONS.restartSpooler,
                            DESKTOP_ACTIONS.restartSpooler,
                          )
                        }
                      >
                        Restart print spooler
                      </button>
                    </div>
                    <div className={styles.controlCard}>
                      <span className={styles.controlIcon} aria-hidden="true">
                        <Glyph name="refresh" size={24} />
                      </span>
                      <strong>Windows Update</strong>
                      <span>{updateText(desktop)}</span>
                      <button
                        type="button"
                        className={styles.secondaryButton}
                        disabled={busy || pending !== null}
                        onClick={() =>
                          void run(
                            DESKTOP_ACTIONS.checkUpdates,
                            DESKTOP_ACTIONS.checkUpdates,
                          )
                        }
                      >
                        Check for updates
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}

              {app === 'browser' ? (
                <div className={styles.appColumn}>
                  <div className={styles.browserBar}>
                    <span className={styles.browserDots} aria-hidden="true">
                      ● ● ●
                    </span>
                    <span className={styles.addressBar}>https://intranet.larkspur.example/self-service</span>
                  </div>
                  <nav className={styles.browserTabs} aria-label="Intranet pages">
                    {(
                      [
                        ['home', 'Home'],
                        ['support', 'Fix-its'],
                        ['software', 'Software'],
                      ] as const
                    ).map(([id, label]) => (
                      <button
                        key={id}
                        type="button"
                        className={
                          browserPage === id
                            ? `${styles.browserTab} ${styles.browserTabActive}`
                            : styles.browserTab
                        }
                        aria-pressed={browserPage === id}
                        onClick={() => setBrowserPage(id)}
                      >
                        {label}
                      </button>
                    ))}
                  </nav>

                  {browserPage === 'home' ? (
                    <div className={styles.page}>
                      <h3>Larkspur IT self-service</h3>
                      <p className={styles.smallText}>
                        Signed in as {desktop.signedIn ? desktop.userAccount : 'guest'} ·{' '}
                        {desktop.hostname}
                      </p>
                      <div className={styles.callout}>
                        <strong>Device check</strong>
                        <span>
                          Storage {desktop.diskFreePercent}% free · {updateText(desktop)}
                        </span>
                        <span>
                          Print spooler {desktop.spoolerStatus} ·{' '}
                          {defaultPrinter ? `default ${defaultPrinter.name}` : 'no default printer'}
                        </span>
                      </div>
                      <p className={styles.smallText}>
                        Use the Fix-its page to run an approved repair on this device. Every
                        repair is recorded in the support session.
                      </p>
                    </div>
                  ) : null}

                  {browserPage === 'support' ? (
                    <div className={styles.page}>
                      <h3>Approved fix-its</h3>
                      <p className={styles.smallText}>
                        These run on {desktop.hostname} as the signed-in user. Nothing here
                        touches another machine.
                      </p>
                      <div className={styles.fixGrid}>
                        <div className={styles.fixCard}>
                          <strong>Names will not resolve</strong>
                          <span>Clear the DNS resolver cache after the server settings are corrected.</span>
                          <button
                            type="button"
                            className={styles.primaryButton}
                            disabled={busy || pending !== null}
                            onClick={() =>
                              void run(DESKTOP_ACTIONS.flushDns, DESKTOP_ACTIONS.flushDns)
                            }
                          >
                            Flush DNS
                          </button>
                        </div>
                        <div className={styles.fixCard}>
                          <strong>Address looks stale</strong>
                          <span>
                            Ask the site DHCP server for a fresh lease on this adapter.
                            {staticNetwork ? ' This adapter is static, so the fix is unavailable.' : ''}
                          </span>
                          <button
                            type="button"
                            className={styles.primaryButton}
                            disabled={busy || pending !== null || staticNetwork}
                            onClick={() =>
                              void run(DESKTOP_ACTIONS.renewLease, DESKTOP_ACTIONS.renewLease)
                            }
                          >
                            Renew lease
                          </button>
                        </div>
                        <div className={styles.fixCard}>
                          <strong>Updates are behind</strong>
                          <span>Install the approved updates, then restart when prompted.</span>
                          <button
                            type="button"
                            className={styles.primaryButton}
                            disabled={busy || pending !== null}
                            onClick={() =>
                              void run(DESKTOP_ACTIONS.checkUpdates, DESKTOP_ACTIONS.checkUpdates)
                            }
                          >
                            Check for updates
                          </button>
                        </div>
                        <div className={styles.fixCard}>
                          <strong>Disk almost full</strong>
                          <span>Clear temporary files without touching the user’s documents.</span>
                          <button
                            type="button"
                            className={styles.primaryButton}
                            disabled={busy || pending !== null}
                            onClick={() =>
                              void run(DESKTOP_ACTIONS.cleanup, DESKTOP_ACTIONS.cleanup)
                            }
                          >
                            Free up space
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {browserPage === 'software' ? (
                    <div className={styles.page}>
                      <h3>Software</h3>
                      <p className={styles.smallText}>Approved packages for {desktop.hostname}.</p>
                      <div className={styles.softwareList}>
                        <div>
                          <strong>Windows updates</strong>
                          <span>{updateText(desktop)}</span>
                          <button
                            type="button"
                            className={styles.secondaryButton}
                            disabled={busy || pending !== null}
                            onClick={() =>
                              void run(DESKTOP_ACTIONS.checkUpdates, DESKTOP_ACTIONS.checkUpdates)
                            }
                          >
                            Install
                          </button>
                        </div>
                        <div>
                          <strong>Print service</strong>
                          <span>Spooler is {desktop.spoolerStatus}.</span>
                          <button
                            type="button"
                            className={styles.secondaryButton}
                            disabled={busy || pending !== null || spoolerRunning}
                            onClick={() =>
                              void run(
                                DESKTOP_ACTIONS.restartSpooler,
                                DESKTOP_ACTIONS.restartSpooler,
                              )
                            }
                          >
                            Restart
                          </button>
                        </div>
                        <div>
                          <strong>Support tools</strong>
                          <span>Clear temporary files from the system drive.</span>
                          <button
                            type="button"
                            className={styles.secondaryButton}
                            disabled={busy || pending !== null}
                            onClick={() =>
                              void run(DESKTOP_ACTIONS.cleanup, DESKTOP_ACTIONS.cleanup)
                            }
                          >
                            Run
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {app === 'terminal' ? (
                <div className={styles.terminalApp}>
                  <div
                    className={styles.terminalScroll}
                    role="log"
                    aria-label="Terminal output"
                    aria-live="polite"
                  >
                    <p className={styles.terminalIntro}>
                      HelpDeskLab simulated terminal on {desktop.hostname}. Type{' '}
                      <code>help</code> for the available tools. Every command is recorded
                      against this attempt, exactly as it is in the Terminal tab.
                    </p>
                    {terminalEntries.map((entry, index) => (
                      <div className={styles.terminalEntry} key={`${index}-${entry.command}`}>
                        <p className={styles.terminalCommandLine}>
                          <span className={styles.terminalPromptInline}>{prompt}</span>{' '}
                          {entry.command}
                        </p>
                        {entry.lines.map((line, lineIndex) => (
                          <p
                            key={`${lineIndex}-${line.text}`}
                            className={styles.terminalLine}
                            data-tone={line.tone}
                          >
                            {line.text || '\u00a0'}
                          </p>
                        ))}
                      </div>
                    ))}
                    <div ref={terminalEnd} />
                  </div>

                  <form className={styles.terminalForm} onSubmit={submitTerminal}>
                    <label className={styles.terminalPrompt} htmlFor="desktop-terminal-command">
                      {prompt}
                    </label>
                    <input
                      id="desktop-terminal-command"
                      className={styles.terminalInput}
                      type="text"
                      value={terminalInput}
                      autoComplete="off"
                      spellCheck={false}
                      aria-label="Command"
                      placeholder={
                        busy ? 'A command is already running…' : 'Type a command and press Enter'
                      }
                      disabled={busy || terminalBusy}
                      onChange={(event) => setTerminalInput(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'ArrowUp') {
                          recallTerminalHistory('up', event)
                        }
                        if (event.key === 'ArrowDown') {
                          recallTerminalHistory('down', event)
                        }
                      }}
                    />
                    <button
                      type="submit"
                      className={styles.terminalRun}
                      disabled={busy || terminalBusy || terminalInput.trim().length === 0}
                    >
                      {terminalBusy ? 'Running…' : 'Run'}
                    </button>
                  </form>
                </div>
              ) : null}

              {app === 'printers' ? (
                <div className={styles.appColumn}>
                  <div className={styles.appHeading}>
                    <h3>Printers &amp; scanners</h3>
                    <span>
                      Spooler {desktop.spoolerStatus}
                      {desktop.printers.length > 0 ? ` · ${desktop.printers.length} installed` : ''}
                    </span>
                  </div>

                  <div className={styles.spoolerRow}>
                    <span>
                      Print Spooler: <strong>{desktop.spoolerStatus}</strong>
                    </span>
                    <button
                      type="button"
                      className={styles.secondaryButton}
                      disabled={busy || pending !== null || spoolerRunning}
                      onClick={() =>
                        void run(DESKTOP_ACTIONS.restartSpooler, DESKTOP_ACTIONS.restartSpooler)
                      }
                    >
                      {pending === DESKTOP_ACTIONS.restartSpooler
                        ? 'Restarting…'
                        : 'Restart spooler'}
                    </button>
                  </div>

                  {desktop.printers.length === 0 ? (
                    <p className={styles.smallText}>No printers are installed on this machine.</p>
                  ) : (
                    <ul className={styles.printerList}>
                      {desktop.printers.map((printer) => {
                        const clearKey = `${DESKTOP_ACTIONS.clearQueue}:${printer.name}`
                        const defaultKey = `${DESKTOP_ACTIONS.defaultPrinter}:${printer.name}`
                        const canClear = printer.jobs.length > 0 || printer.status !== 'online'
                        return (
                          <li key={printer.id} className={styles.printerCard}>
                            <div className={styles.printerHead}>
                              <div>
                                <strong>{printer.name}</strong>
                                <span className={styles.smallText}>
                                  {printer.model} · {printer.status}
                                  {printer.isDefault ? ' · default' : ''}
                                </span>
                              </div>
                              <span
                                className={
                                  printer.status === 'online'
                                    ? `${styles.statusDot} ${styles.statusOnline}`
                                    : `${styles.statusDot} ${styles.statusOffline}`
                                }
                                aria-label={`Status ${printer.status}`}
                              />
                            </div>
                            <span className={styles.smallText}>{jobSummary(printer)}</span>
                            {printer.jobs.length > 0 ? (
                              <ul className={styles.jobList}>
                                {printer.jobs.map((job) => (
                                  <li key={job.id}>
                                    <span>{job.document}</span>
                                    <span>{job.status}</span>
                                  </li>
                                ))}
                              </ul>
                            ) : null}
                            <div className={styles.buttonRow}>
                              <button
                                type="button"
                                className={styles.secondaryButton}
                                disabled={busy || pending !== null || printer.isDefault}
                                onClick={() =>
                                  void run(defaultKey, DESKTOP_ACTIONS.defaultPrinter, [
                                    printer.name,
                                  ])
                                }
                              >
                                {printer.isDefault ? 'Default printer' : 'Set as default'}
                              </button>
                              <button
                                type="button"
                                className={styles.secondaryButton}
                                disabled={
                                  busy ||
                                  pending !== null ||
                                  !canClear ||
                                  desktop.spoolerStatus === 'stopped'
                                }
                                onClick={() =>
                                  void run(clearKey, DESKTOP_ACTIONS.clearQueue, [printer.name])
                                }
                              >
                                {pending === clearKey ? 'Clearing…' : 'Clear queue'}
                              </button>
                            </div>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </div>
              ) : null}
            </div>
          </section>
        ) : null}

        {output ? (
          <div className={styles.commandPanel} role="status" aria-live="polite">
            <div className={styles.commandHead}>
              <span className={styles.commandLabel}>
                {output.ok ? 'Command completed' : 'Command failed'}
              </span>
              <button
                type="button"
                className={styles.closeButton}
                aria-label="Dismiss command output"
                onClick={() => setOutput(null)}
              >
                ×
              </button>
            </div>
            <code className={styles.commandLine}>&gt; {output.command}</code>
            <div className={styles.commandLines}>
              {output.lines.map((line, index) => (
                <p key={`${index}-${line.text}`} data-tone={line.tone}>
                  {line.text || '\u00a0'}
                </p>
              ))}
            </div>
          </div>
        ) : null}

        {startOpen ? (
          <div className={styles.startMenu} role="menu" aria-label="Start menu">
            <div className={styles.startUser}>
              <span className={styles.avatar} aria-hidden="true">
                {desktop.userName.trim().charAt(0).toUpperCase() || '?'}
              </span>
              <div>
                <strong>{desktop.signedIn ? desktop.userName : 'Nobody signed in'}</strong>
                <span>{desktop.signedIn ? desktop.userAccount : 'Sign in to Windows'}</span>
              </div>
            </div>
            <div className={styles.startGrid}>
              {APPS.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  role="menuitem"
                  className={styles.startApp}
                  onClick={() => open(entry.id)}
                >
                  <span className={styles.startIcon} aria-hidden="true">
                    <Glyph name={entry.glyph} size={16} />
                  </span>
                  <span>{entry.label}</span>
                </button>
              ))}
            </div>
            <div className={styles.startFooter}>
              <button
                type="button"
                className={styles.startAction}
                disabled={busy || pending !== null || !desktop.signedIn}
                onClick={() => {
                  setStartOpen(false)
                  void run(DESKTOP_ACTIONS.signOut, DESKTOP_ACTIONS.signOut)
                }}
              >
                Sign out
              </button>
              <button
                type="button"
                className={styles.startAction}
                disabled={busy || pending !== null}
                onClick={() => {
                  setStartOpen(false)
                  void run('reboot', 'reboot')
                }}
              >
                Restart
              </button>
            </div>
          </div>
        ) : null}

        <footer className={styles.taskbar}>
          <button
            type="button"
            className={styles.startButton}
            aria-expanded={startOpen}
            onClick={() => setStartOpen((openNow) => !openNow)}
          >
            <span className={styles.windowsMark} aria-hidden="true">
              <Glyph name="apps" size={18} />
            </span>
            Start
          </button>
          <div className={styles.taskApps}>
            {app ? (
              <span className={styles.taskApp}>
                {APP_TITLES[app]}
                <span className={styles.sessionDot} aria-hidden="true" />
              </span>
            ) : null}
          </div>
          <span className={styles.taskMeta}>{desktop.hostname}</span>
          <span className={styles.taskClock}>{clockText(desktop.clock)}</span>
        </footer>
      </div>
    </section>
  )
}
