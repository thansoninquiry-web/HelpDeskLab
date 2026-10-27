import { useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import type { ConsoleLine, ConsoleResponse } from '../../modules/shared/console'
import styles from './CommandConsole.module.css'

/**
 * One typed line and what it printed. The intro is not stored here: it is the
 * console's own opening text, so `clear` puts the learner back where they began
 * rather than in front of an empty pane with no idea what to type.
 */
interface Entry {
  id: number
  kind: 'input' | 'output'
  text: string
  tone?: ConsoleLine['tone']
}

export interface CommandConsoleProps {
  title: string
  /** One line saying what this shell can reach. */
  subtitle: string
  /** The shell's own prompt, e.g. `PS>` or `$`. */
  prompt: string
  /** The first thing printed: what the shell is and what it cannot do. */
  intro: readonly ConsoleLine[]
  /**
   * A few commands offered under the box. Pressing one fills the box and leaves
   * it to the learner to press Run — a suggestion is a reminder of the syntax,
   * not a shortcut past reading the command.
   */
  suggestions?: readonly string[]
  busy?: boolean
  run: (input: string) => Promise<ConsoleResponse> | ConsoleResponse
}

/**
 * A terminal over one module's own state.
 *
 * It draws whatever the module's command resolver hands back and knows nothing
 * about Intune or Azure: the prompt, the opening text, and the commands are the
 * caller's. That is the same split the ticket workspace's tool consoles use, and
 * it is why a third simulator can have a shell for the price of a resolver.
 */
export function CommandConsole({
  title,
  subtitle,
  prompt,
  intro,
  suggestions = [],
  busy = false,
  run,
}: CommandConsoleProps) {
  const [entries, setEntries] = useState<readonly Entry[]>([])
  const [input, setInput] = useState('')
  const [history, setHistory] = useState<readonly string[]>([])
  // Null is "past the newest command", which is also an empty box.
  const [recall, setRecall] = useState<number | null>(null)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const nextId = useRef(0)
  const inputRef = useRef<HTMLInputElement | null>(null)

  const push = (lines: readonly ConsoleLine[]) => {
    setEntries((current) => [
      ...current,
      ...lines.map((entry) => ({
        id: nextId.current++,
        kind: 'output' as const,
        text: entry.text,
        tone: entry.tone,
      })),
    ])
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const command = input.trim()
    if (command.length === 0 || working || busy) {
      return
    }

    setEntries((current) => [
      ...current,
      { id: nextId.current++, kind: 'input', text: command },
    ])
    setHistory((current) => [...current, command])
    setRecall(null)
    setInput('')
    setWorking(true)

    try {
      const response = await run(command)
      if (response.cleared) {
        // A cleared console forgets the command that cleared it too, the way a
        // real `clear` leaves nothing behind.
        setEntries([])
      } else {
        push(response.lines)
      }
      setError(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'That command could not be run.')
    } finally {
      setWorking(false)
      inputRef.current?.focus()
    }
  }

  /** Up and down walk the commands already typed, filling the box as they go. */
  const recallHistory = (direction: -1 | 1) => {
    if (history.length === 0) {
      return
    }

    const from = recall === null ? history.length : recall
    const next = Math.min(history.length, Math.max(0, from + direction))
    setRecall(next === history.length ? null : next)
    setInput(next === history.length ? '' : (history[next] ?? ''))
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      recallHistory(-1)
    } else if (event.key === 'ArrowDown') {
      event.preventDefault()
      recallHistory(1)
    }
  }

  const fill = (command: string) => {
    setInput(command)
    setRecall(null)
    inputRef.current?.focus()
  }

  const printed: Entry[] = [
    ...intro.map((entry, index) => ({
      id: -(index + 1),
      kind: 'output' as const,
      text: entry.text,
      tone: entry.tone,
    })),
    ...entries,
  ]

  return (
    <section className={styles.console} aria-label={`${title} terminal`}>
      <header className={styles.header}>
        <h2 className={styles.title}>{title}</h2>
        <p className={styles.subtitle}>{subtitle}</p>
      </header>

      <div className={styles.scroll} role="log" aria-live="polite" aria-label="Console output">
        {printed.map((entry) => (
          <p
            key={entry.id}
            className={entry.kind === 'input' ? styles.inputLine : styles.outputLine}
            data-tone={entry.kind === 'input' ? 'input' : (entry.tone ?? 'output')}
          >
            {entry.kind === 'input' ? `${prompt} ${entry.text}` : entry.text || '\u00a0'}
          </p>
        ))}
      </div>

      <form className={styles.promptRow} onSubmit={submit}>
        <label className={styles.promptLabel} htmlFor="command-console-input">
          {prompt}
        </label>
        <input
          id="command-console-input"
          ref={inputRef}
          className={styles.input}
          type="text"
          value={input}
          onChange={(event) => {
            setInput(event.target.value)
            setRecall(null)
          }}
          onKeyDown={onKeyDown}
          aria-describedby="command-console-help"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          placeholder="Type a command, or help"
        />
        <button
          type="submit"
          className={styles.run}
          disabled={working || busy || input.trim().length === 0}
        >
          {working ? 'Running…' : 'Run'}
        </button>
      </form>

      <p id="command-console-help" className={styles.help} role={error ? 'alert' : undefined}>
        {error ?? 'Enter runs a command. Up and down recall the last ones. `help` lists them.'}
      </p>

      {suggestions.length > 0 ? (
        <div className={styles.suggestions} role="group" aria-label="Commands worth trying">
          <span className={styles.suggestionsLabel} aria-hidden="true">
            Try
          </span>
          {suggestions.map((command) => (
            <button
              key={command}
              type="button"
              className={styles.suggestion}
              onClick={() => fill(command)}
            >
              {command}
            </button>
          ))}
        </div>
      ) : null}
    </section>
  )
}
