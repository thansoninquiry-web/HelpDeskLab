import { useMemo, useState } from 'react'
import {
  DESKTOP_ACTIONS,
  formatSimClock,
  searchConsole,
  type ConsoleAction,
  type ConsoleActionArgument,
  type ConsoleEntry,
  type ConsoleIcon,
  type ConsoleLine,
  type ConsoleFocus,
  type ConsoleView,
  type WorkspaceView,
} from '../../app/practiceService'
import { FakeDesktop, type DesktopCommandOutput } from './FakeDesktop'
import styles from './ToolConsole.module.css'
import { TopologyMap } from './TopologyMap'

interface ToolConsoleProps {
  /** Null while the console is still being read. */
  view: ConsoleView | null
  loadError: string | null
  busy: boolean
  onRun: (
    entryId: string,
    actionId: string,
    inputs?: readonly string[],
  ) => Promise<WorkspaceView | null>
  /**
   * Runs a command typed into a Remote Desktop terminal. Same pipeline as the
   * side terminal; the console only knows that this surface has one.
   */
  onSubmitCommand?: (input: string) => Promise<WorkspaceView | null>
  /**
   * A record was opened. Reading is the learner acting on the call, so the
   * attempt records it — the console's own selection state would otherwise be
   * the only sign, and the caller could not hear it.
   */
  onRead?: (entryId: string) => void
  /**
   * What this console was showing when it was last left — the search in its box
   * and the record in front — so a reopened ticket lands back on the machine.
   * Absent, or null, is a console that has not been worked in yet.
   */
  focus?: ConsoleFocus | null
  /**
   * The search or the open record changed. Reading a record is reported too, so
   * what the learner was looking at is what a reopen puts back.
   */
  onFocusChange?: (focus: ConsoleFocus) => void
}

interface ConsoleOutput {
  command: string
  ok: boolean
  lines: ConsoleLine[]
}

/**
 * What a picker row leads with, drawn on the shell's icon grid: a monitor for a
 * machine, a person for an account, and a printer for a printer. The record says
 * which one it is; the row only draws it, so a mixed list cannot lie about what
 * a learner is about to open.
 */
function EntryGlyph({ icon }: { icon: ConsoleIcon }) {
  const common = {
    className: styles.pickerGlyph,
    width: 20,
    height: 20,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.5,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  }

  if (icon === 'account') {
    return (
      <svg {...common}>
        <circle cx="12" cy="8.5" r="3.5" />
        <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
      </svg>
    )
  }

  if (icon === 'printer') {
    return (
      <svg {...common}>
        <path d="M7 9V4h10v5" />
        <rect x="4" y="9" width="16" height="7" rx="1.5" />
        <path d="M7 16h10v5H7z" />
      </svg>
    )
  }

  return (
    <svg {...common}>
      <rect x="3" y="4" width="18" height="12" rx="1.5" />
      <path d="M9 20h6M12 16v4" />
    </svg>
  )
}

interface PickerRowProps {
  entry: ConsoleEntry
  /** What the record is, or undefined for a list of one kind the console names. */
  icon: ConsoleIcon | undefined
  active: boolean
  /** The button that opens the record, if this record offers one. */
  rowAction: { action: ConsoleAction; label: string } | null
  disabled: boolean
  running: boolean
  onSelect: () => void
  onRun: () => void
}

/**
 * One row of a picker console: the machine, who holds it, and the way in.
 *
 * The button that opens the record and the one that opens the session are
 * siblings rather than nested, because they do different things: the first
 * reads the record, the second runs the audited command.
 */
function PickerRow({
  entry,
  icon,
  active,
  rowAction,
  disabled,
  running,
  onSelect,
  onRun,
}: PickerRowProps) {
  return (
    <div className={styles.pickerRow}>
      <button
        type="button"
        className={active ? `${styles.pickerEntry} ${styles.pickerEntryActive}` : styles.pickerEntry}
        aria-pressed={active}
        onClick={onSelect}
      >
        {icon ? <EntryGlyph icon={icon} /> : null}
        <span className={styles.pickerNames}>
          <span className={styles.pickerName}>{entry.title}</span>
          <span className={styles.pickerMeta}>{entry.subtitle}</span>
        </span>
      </button>
      {rowAction ? (
        <button type="button" className={styles.pickerAction} disabled={disabled} onClick={onRun}>
          {running ? 'Working…' : rowAction.label}
        </button>
      ) : null}
    </div>
  )
}

/**
 * One declared input. The hint states the shape the command needs, and the run
 * button stays disabled until it matches, so a half-typed value never becomes a
 * command.
 *
 * When the console can name values this action could take, they are offered as
 * chips: the learner picks one instead of recalling it. No chip is chosen for
 * them — the box starts empty, a chip only fills it, and the run button stays
 * closed until a value is there.
 */
function ActionInput({
  inputId,
  argument,
  value,
  onChange,
}: {
  inputId: string
  argument: ConsoleActionArgument
  value: string
  onChange: (value: string) => void
}) {
  const id = `action-input-${inputId}-${argument.id}`
  const choices = argument.choices ?? []
  return (
    <p className={styles.actionInput}>
      <label htmlFor={id}>{argument.label}</label>
      <input
        id={id}
        type="text"
        value={value}
        placeholder={argument.placeholder}
        aria-describedby={`${id}-hint`}
        onChange={(event) => onChange(event.target.value)}
      />
      <span id={`${id}-hint`} className={styles.actionInputHint}>
        {argument.hint}
      </span>
      {choices.length > 0 ? (
        <span
          className={styles.actionChoices}
          role="group"
          aria-label={`Possible values for ${argument.label}`}
        >
          <span className={styles.actionChoicesLabel} aria-hidden="true">
            Possible values
          </span>
          {choices.map((choice) => (
            <button
              key={choice}
              type="button"
              className={styles.actionChoice}
              data-chosen={choice === value}
              onClick={() => onChange(choice)}
            >
              {choice}
            </button>
          ))}
        </span>
      ) : null}
    </p>
  )
}

/**
 * One pane for every tool console.
 *
 * What is rendered is decided entirely by the projection it is handed: a
 * Directory and a Server Room differ in their entries and actions, not in their
 * layout, search, or output handling. Adding a console is a domain change.
 */
export function ToolConsole({
  view,
  loadError,
  busy,
  onRun,
  onSubmitCommand,
  onRead,
  focus = null,
  onFocusChange,
}: ToolConsoleProps) {
  const [query, setQuery] = useState(() => focus?.query ?? '')
  const [filterId, setFilterId] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(() => focus?.selectedId ?? null)
  const [runningId, setRunningId] = useState<string | null>(null)
  const [output, setOutput] = useState<ConsoleOutput | null>(null)
  // Values typed into an action that needs one, keyed by entry and action.
  const [inputs, setInputs] = useState<Record<string, string[]>>({})
  // A console that supplies a map opens on it; its records stay one click away.
  const [mode, setMode] = useState<'map' | 'records'>('map')
  // A console whose definition offers a grid still opens on the record list: the
  // grid is a second way to read the same records, not a different console.
  const [layout, setLayout] = useState<'list' | 'grid'>('list')
  // A live remote session opens on its desktop; the machine record is one click
  // away. Remembering which session was hidden means a newly opened session
  // always opens on its desktop, without an effect to reset the state.
  const [hiddenSession, setHiddenSession] = useState<number | null>(null)
  const sessionStartedAt = view?.desktop?.sessionStartedAt ?? null
  const desktopVisible = sessionStartedAt !== null && hiddenSession !== sessionStartedAt

  /**
   * Which console this pane is currently showing. One pane serves every console,
   * so switching tabs keeps the component mounted: the search and the open record
   * have to be put back from that console's own focus rather than carried over
   * from the tab before it.
   */
  const [shownConsole, setShownConsole] = useState<string | null>(view?.consoleId ?? null)
  if (view !== null && view.consoleId !== shownConsole) {
    setShownConsole(view.consoleId)
    setQuery(focus?.query ?? '')
    // A record this attempt no longer has — un-run, or closed by a command — is
    // not reopened: the console opens on its list rather than on nothing.
    setSelectedId(
      focus?.selectedId != null && view.entries.some((entry) => entry.id === focus.selectedId)
        ? focus.selectedId
        : null,
    )
    setOutput(null)
  }

  /** What this console is showing, as the attempt stores it. */
  const reportFocus = (next: ConsoleFocus) => {
    onFocusChange?.(next)
  }

  /** Opens a record, and says so: the read is a step the attempt keeps. */
  const openRecord = (entryId: string) => {
    setSelectedId(entryId)
    setOutput(null)
    reportFocus({ query, selectedId: entryId })
    onRead?.(entryId)
  }

  const entries = view?.entries ?? null
  // A filter belongs to the console that declares it: switching to a console
  // with different filters drops the old choice instead of hiding every record.
  const filters = view?.definition.filters ?? []
  const activeFilterId = filters.some((filter) => filter.id === filterId) ? filterId : null
  const visible = useMemo(
    () => searchConsole(entries ?? [], query, activeFilterId),
    [entries, query, activeFilterId],
  )
  const selected = useMemo(
    () => entries?.find((entry) => entry.id === selectedId) ?? null,
    [entries, selectedId],
  )

  if (loadError) {
    return (
      <div className={styles.console} data-console-frame>
        <p className={styles.hint} role="alert">
          {loadError}
        </p>
      </div>
    )
  }

  if (!view) {
    return (
      <div className={styles.console} data-console-frame>
        <p className={styles.hint}>Opening the console…</p>
      </div>
    )
  }

  const { definition } = view
  // A console that does not declare a grid keeps reading as rows even when the
  // grid was chosen somewhere else: the choice is the pane's, the view is the
  // console's.
  const inGrid = layout === 'grid' && definition.showsGrid === true
  // The picker is how a console's rows read, not a different console: a console
  // that also declares tiles keeps them, and switching to the grid reads the same
  // records as squares. A console with no tiles is a picker whichever reading was
  // left set elsewhere.
  const pickingRows = definition.picker !== undefined && !inGrid
  const plural = (count: number) => `${count} ${definition.entryNoun}${count === 1 ? '' : 's'}`

  const inputKey = (entryId: string, actionId: string) => `${entryId}:${actionId}`
  /** Which button is mid-run: the detail's or a picker row's. */
  const runningKey = inputKey

  const valuesFor = (entryId: string, action: ConsoleAction): string[] =>
    action.args?.map((_argument, index) => inputs[inputKey(entryId, action.id)]?.[index] ?? '') ?? []

  const supplied = (entryId: string, action: ConsoleAction, index: number, value: string) => {
    const key = inputKey(entryId, action.id)
    const next = valuesFor(entryId, action).slice()
    next[index] = value
    setInputs((current) => ({ ...current, [key]: next }))
  }

  /** A record button's classes, whichever way the records are being read. */
  const recordClass = (isSelected: boolean): string => {
    const grid = inGrid
    const base = (grid ? styles.tileButton : styles.entryButton) ?? ''
    const active = (grid ? styles.tileButtonActive : styles.entryButtonActive) ?? ''
    return isSelected ? `${base} ${active}`.trim() : base
  }

  /** An action that needs a value cannot be pressed until the value is usable. */
  const ready = (action: ConsoleAction, values: readonly string[]): boolean =>
    (action.args ?? []).every((argument, index) => argument.validate(values[index] ?? ''))

  /**
   * Runs one action on one record, whichever button asked for it. A picker row
   * and the record's own button therefore leave the same command in the log.
   */
  const runAction = async (entry: ConsoleEntry, action: ConsoleAction) => {
    const declared = action.args ?? null
    const command = action.command(entry.id, declared ? valuesFor(entry.id, action) : undefined)
    setRunningId(runningKey(entry.id, action.id))
    const next = await onRun(
      entry.id,
      action.id,
      declared ? valuesFor(entry.id, action) : undefined,
    )
    setRunningId(null)

    if (!next) {
      return
    }

    const logged = [...next.entries]
      .reverse()
      .find((candidate) => candidate.kind === 'command' && candidate.text === command)

    if (logged && logged.kind === 'command') {
      setOutput({ command, ok: logged.ok, lines: logged.lines })
    }
  }

  const run = async (action: ConsoleAction) => {
    if (!selected) {
      return
    }

    await runAction(selected, action)
  }

  /**
   * The picker button a record offers, if its console is a picker. An action
   * that needs a value cannot run from a row: it stays in the record, where the
   * box for the value is.
   */
  const rowActionFor = (
    entry: ConsoleEntry,
  ): { action: ConsoleAction; label: string } | null => {
    const picker = definition.picker
    if (!picker) {
      return null
    }

    for (const declared of picker.rowActions) {
      const action = entry.actions.find((candidate) => candidate.id === declared.id)
      if (action && (action.args?.length ?? 0) === 0) {
        return { action, label: declared.label }
      }
    }
    return null
  }

  /** A row button also opens the record it acts on, so its output lands somewhere. */
  const runRowAction = (entry: ConsoleEntry, action: ConsoleAction) => {
    setSelectedId(entry.id)
    setOutput(null)
    reportFocus({ query, selectedId: entry.id })
    void runAction(entry, action)
  }

  /** Desktop controls run through the same action pipeline as the record buttons. */
  const runDesktopAction = async (
    actionId: string,
    inputs?: readonly string[],
  ): Promise<DesktopCommandOutput | null> => {
    if (!view?.desktop) {
      return null
    }

    const next = await onRun(view.desktop.entryId, actionId, inputs)
    if (!next) {
      return null
    }

    const entry = [...next.entries]
      .reverse()
      .find((candidate) => candidate.kind === 'command')
    return entry && entry.kind === 'command'
      ? { command: entry.text, ok: entry.ok, lines: entry.lines }
      : null
  }

  /**
   * Puts another open session in front. It runs as the console action the
   * machine's own row offers, so the switch is logged like every other step and
   * the console is reread with the desktop that is now in view.
   */
  const switchDesktop = async (hostname: string): Promise<boolean> => {
    const next = await onRun(hostname, DESKTOP_ACTIONS.switchDesktop)
    return next !== null
  }

  /** A command typed on the fake desktop goes through the same pipeline. */
  const runDesktopCommand = async (input: string): Promise<DesktopCommandOutput | null> => {
    if (!onSubmitCommand) {
      return null
    }

    const next = await onSubmitCommand(input)
    if (!next) {
      return null
    }

    const entry = [...next.entries]
      .reverse()
      .find((candidate) => candidate.kind === 'command')
    return entry && entry.kind === 'command'
      ? { command: entry.text, ok: entry.ok, lines: entry.lines }
      : null
  }

  return (
    // The box the console's own container query measures, marked so the divider
    // can ask how wide it is and snap to the widths its layout turns on.
    <div className={styles.console} data-console-frame>
      {view.desktop && desktopVisible ? (
        <FakeDesktop
          // Keyed by machine: switching desktops must not carry the last one's
          // open app, terminal scrollback, or half-typed command across.
          key={view.desktop.entryId}
          desktop={view.desktop}
          busy={busy}
          onRun={runDesktopAction}
          onCommand={runDesktopCommand}
          onShowRecords={() => setHiddenSession(sessionStartedAt)}
          onSelectSession={switchDesktop}
        />
      ) : (
        <>
      {definition.picker ? (
        <div className={styles.pickerHeader}>
          <h2 className={styles.pickerTitle}>{definition.picker.title}</h2>
          <p className={styles.pickerSubtitle}>{definition.picker.subtitle}</p>
        </div>
      ) : null}

      {view.desktop ? (
        <div className={styles.viewSwitch} role="group" aria-label={`${definition.label} view`}>
          <button
            type="button"
            className={styles.viewButton}
            onClick={() => setHiddenSession(null)}
          >
            Open desktop
          </button>
        </div>
      ) : null}

      {view.topology ? (
        <div className={styles.viewSwitch} role="group" aria-label={`${definition.label} view`}>
          <button
            type="button"
            aria-pressed={mode === 'map'}
            className={
              mode === 'map' ? `${styles.viewButton} ${styles.viewButtonActive}` : styles.viewButton
            }
            onClick={() => setMode('map')}
          >
            Map
          </button>
          <button
            type="button"
            aria-pressed={mode === 'records'}
            className={
              mode === 'records'
                ? `${styles.viewButton} ${styles.viewButtonActive}`
                : styles.viewButton
            }
            onClick={() => setMode('records')}
          >
            List
          </button>
        </div>
      ) : null}

      {definition.showsGrid ? (
        <div className={styles.viewSwitch} role="group" aria-label={`${definition.label} view`}>
          <button
            type="button"
            aria-pressed={layout === 'list'}
            className={
              layout === 'list'
                ? `${styles.viewButton} ${styles.viewButtonActive}`
                : styles.viewButton
            }
            onClick={() => setLayout('list')}
          >
            List
          </button>
          <button
            type="button"
            aria-pressed={layout === 'grid'}
            className={
              layout === 'grid'
                ? `${styles.viewButton} ${styles.viewButtonActive}`
                : styles.viewButton
            }
            onClick={() => setLayout('grid')}
          >
            Grid
          </button>
        </div>
      ) : null}

      {view.topology && mode === 'map' ? (
        <TopologyMap topology={view.topology} busy={busy} onRun={onRun} />
      ) : (
        <>
      <div className={styles.searchRow}>
        <input
          className={styles.search}
          type="search"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            reportFocus({ query: event.target.value, selectedId })
          }}
          placeholder={definition.searchPlaceholder}
          aria-label={definition.searchLabel}
        />
        {filters.length > 0 ? (
          <label className={styles.filter}>
            <span className={styles.filterLabel}>
              {definition.filterLabel ?? 'Filter'}
            </span>
            <select
              className={styles.filterSelect}
              value={activeFilterId ?? ''}
              onChange={(event) => setFilterId(event.target.value)}
            >
              <option value="">All {definition.entryNoun}s</option>
              {filters.map((filter) => (
                <option key={filter.id} value={filter.id}>
                  {filter.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <span className={styles.count}>
          {visible.length} of {plural(entries?.length ?? 0)}
        </span>
      </div>

      {entries === null ? (
        <p className={styles.hint}>Reading the console…</p>
      ) : entries.length === 0 ? (
        <p className={styles.hint}>{definition.emptyMessage}</p>
      ) : (
        <div
          className={[
            styles.lower,
            inGrid ? styles.lowerGrid : null,
            // Tiles are the whole pane until one of them is opened; the detail
            // column only takes room once there is a record to put in it.
            inGrid && !selected ? styles.lowerGridOnly : null,
            // A picker reads as one list: its rows carry the way in, so the
            // record opens underneath instead of beside it.
            pickingRows ? styles.lowerPicker : null,
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {/* The same records, the same selection, and the same list semantics:
              the grid changes how a record reads, not what pressing one does. */}
          <ul
            className={
              pickingRows ? styles.pickerList : inGrid ? styles.tileGrid : styles.list
            }
            aria-label={definition.listLabel}
            data-view={pickingRows ? 'picker' : inGrid ? 'grid' : 'list'}
          >
            {visible.length === 0 ? (
              <li className={styles.hint}>Nothing matches “{query}”.</li>
            ) : (
              visible.map((entry) => {
                const rowAction = rowActionFor(entry)
                return pickingRows ? (
                  <li key={entry.id} className={styles.pickerRowItem}>
                    <PickerRow
                      entry={entry}
                      icon={entry.icon ?? definition.picker?.rowIcon}
                      active={entry.id === selectedId}
                      rowAction={rowAction}
                      disabled={busy || runningId !== null}
                      running={runningId === runningKey(entry.id, rowAction?.action.id ?? '')}
                      onSelect={() => openRecord(entry.id)}
                      onRun={() => {
                        if (rowAction) {
                          runRowAction(entry, rowAction.action)
                        }
                      }}
                    />
                  </li>
                ) : (
                <li key={entry.id}>
                  <button
                    type="button"
                    className={recordClass(entry.id === selectedId)}
                    aria-pressed={entry.id === selectedId}
                    onClick={() => openRecord(entry.id)}
                  >
                    <span className={styles.entryTitle}>{entry.title}</span>
                    <span className={styles.entryMeta}>{entry.subtitle}</span>
                    {inGrid
                      ? (definition.tileFacts ?? []).map((label) => {
                          const fact = entry.facts.find((candidate) => candidate.label === label)
                          return fact ? (
                            <span className={styles.tileFact} key={label}>
                              <span className={styles.tileFactLabel}>{fact.label}</span>
                              <span className={styles.tileFactValue}>{fact.value}</span>
                            </span>
                          ) : null
                        })
                      : null}
                  </button>
                </li>
                )
              })
            )}
          </ul>

          {selected ? (
            <div className={styles.detail}>
              <div className={styles.detailHeader}>
                <span className={styles.detailName}>{selected.title}</span>
                <span className={styles.entryMeta}>{selected.subtitle}</span>
              </div>

              <dl className={styles.fieldList}>
                {selected.facts.map((fact) => (
                  <div className={styles.fieldRow} key={fact.label}>
                    <dt>{fact.label}</dt>
                    <dd>{fact.value}</dd>
                  </div>
                ))}
              </dl>

              {selected.groups.map((group) => (
                <div className={styles.group} key={group.label}>
                  <span className={styles.subheading}>{group.label}</span>
                  {group.items.length === 0 ? (
                    <p className={styles.hint}>{group.empty}</p>
                  ) : (
                    <ul className={styles.groupList}>
                      {group.items.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}

              {selected.history ? (
                <div className={styles.group}>
                  <span className={styles.subheading}>Recent desk history</span>
                  {selected.history.length === 0 ? (
                    <p className={styles.hint}>
                      No closed ticket or recorded command has touched this account yet.
                    </p>
                  ) : (
                    <ol className={styles.historyList} aria-label="Recent desk history">
                      {selected.history.map((item, index) => (
                        <li
                          key={`${item.atMs}-${item.kind}-${index}`}
                          className={styles.historyItem}
                          data-kind={item.kind}
                        >
                          <span className={styles.historyTime}>
                            {formatSimClock(item.atMs)}
                          </span>
                          {item.kind === 'command' ? (
                            <code className={styles.historyCommand}>{item.text}</code>
                          ) : (
                            <span className={styles.historyText}>{item.text}</span>
                          )}
                          <span className={styles.historyMeta}>
                            {item.kind === 'ticket'
                              ? `closed ${item.outcome ?? 'without a score'}`
                              : item.ticket}
                          </span>
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              ) : null}

              {selected.actions.length > 0 ? (
                <>
                  <span className={styles.subheading}>Actions</span>
                  <div className={styles.actionGrid}>
                    {selected.actions.map((action) => {
                      const values = valuesFor(selected.id, action)
                      const declaredArguments = action.args ?? []
                      return (
                        <div className={styles.actionRow} key={action.id}>
                          <button
                            type="button"
                            className={styles.actionButton}                              disabled={
                              busy || runningId !== null || !ready(action, values)
                            }
                            onClick={() => void run(action)}
                          >
                            <span className={styles.actionLabel}>
                              {runningId === runningKey(selected.id, action.id)
                                ? 'Running…'
                                : action.label}
                            </span>
                            <span className={styles.actionDetail}>{action.detail}</span>
                          </button>

                          {declaredArguments.length > 0 ? (
                            <div className={styles.actionInputs}>
                              {declaredArguments.map((argument, index) => (
                                <ActionInput
                                  key={argument.id}
                                  inputId={action.id}
                                  argument={argument}
                                  value={values[index] ?? ''}
                                  onChange={(value) =>
                                    supplied(selected.id, action, index, value)
                                  }
                                />
                              ))}
                            </div>
                          ) : null}
                        </div>
                      )
                    })}
                  </div>
                </>
              ) : null}

              {selected.note ? <p className={styles.hint}>{selected.note}</p> : null}

              {output ? (
                <div className={styles.output} role="status" aria-live="polite">
                  <span className={styles.outputCommand}>&gt; {output.command}</span>
                  {output.lines.map((line, index) => (
                    <p key={`${index}-${line.text}`} className={styles.outputLine} data-tone={line.tone}>
                      {line.text || '\u00a0'}
                    </p>
                  ))}
                </div>
              ) : null}
            </div>
          ) : (
            <p className={styles.hint}>{definition.selectHint}</p>
          )}
        </div>
      )}
        </>
      )}
        </>
      )}
    </div>
  )
}
