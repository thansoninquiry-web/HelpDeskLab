import type { ConsoleId, ToolGroupView } from '../../app/practiceService'
import styles from './ToolPicker.module.css'

interface ToolPickerProps {
  groups: readonly ToolGroupView[]
  onOpen: (consoleId: ConsoleId) => void
  /** Drop the descriptions, for the narrow dropdown in the tool header. */
  compact?: boolean
}

/** A small console glyph per group, drawn on the same grid as the shell icons. */
function GroupIcon({ group }: { group: string }) {
  const common = {
    width: 16,
    height: 16,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.6,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  }

  if (group === 'email') {
    return (
      <svg {...common}>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="m3 7 9 6 9-6" />
      </svg>
    )
  }
  if (group === 'knowledge') {
    return (
      <svg {...common}>
        <path d="M4 5h7a2 2 0 0 1 2 2v12a2 2 0 0 0-2-2H4Z" />
        <path d="M20 5h-7a2 2 0 0 0-2 2v12a2 2 0 0 1 2-2h7Z" />
      </svg>
    )
  }
  if (group === 'management') {
    return (
      <svg {...common}>
        <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9Z" />
        <path d="m4 7.5 8 4.5 8-4.5M12 12v9" />
      </svg>
    )
  }
  if (group === 'service-desk') {
    return (
      <svg {...common}>
        <path d="M4 13a8 8 0 0 1 16 0" />
        <rect x="3" y="13" width="4" height="7" rx="1.5" />
        <rect x="17" y="13" width="4" height="7" rx="1.5" />
        <path d="M19 20a3 3 0 0 1-3 2h-2" />
      </svg>
    )
  }
  return (
    <svg {...common}>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="2.4" />
      <path d="M12 20.5v2M12 1.5v2M20.5 12h2M1.5 12h2" />
    </svg>
  )
}

/**
 * The tool shelf: every tool the desk has, grouped the way the work is.
 *
 * Every entry opens a console. The shelf is deliberately flat — no dead links,
 * no "coming soon" — so what the menu offers is exactly what the desk can do.
 */
export function ToolPicker({ groups, onOpen, compact = false }: ToolPickerProps) {
  return (
    <div className={compact ? `${styles.picker} ${styles.compact}` : styles.picker}>
      {groups.map((group) => (
        <section className={styles.group} key={group.id} aria-labelledby={`tool-group-${group.id}`}>
          <h3 className={styles.groupLabel} id={`tool-group-${group.id}`}>
            {group.label}
          </h3>
          <ul className={styles.list}>
            {group.tools.map((tool) => (
              <li key={tool.id}>
                <button
                  type="button"
                  className={styles.tool}
                  onClick={() => onOpen(tool.id)}
                >
                  <span className={styles.toolIcon}>
                    <GroupIcon group={group.id} />
                  </span>
                  <span className={styles.toolText}>
                    <span className={styles.toolName}>{tool.label}</span>
                    <span className={styles.toolDetail}>{tool.detail}</span>
                  </span>
                  <span className={styles.toolChevron} aria-hidden="true">
                    ›
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
