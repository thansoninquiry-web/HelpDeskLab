import { partById } from '../data/parts'
import type { BenchEstate, PartArea, PartId } from '../types'
import styles from './desktop.module.css'

type PartState = 'ok' | 'warn' | 'down'

/** How the diagram marks a part, read from the machine rather than the fault. */
function partState(estate: BenchEstate | null, part: PartId): PartState {
  if (!estate) {
    return 'ok'
  }
  switch (part) {
    case 'psu':
      return estate.post.state === 'dead' ? 'down' : 'ok'
    case 'ram-1':
      return estate.post.failing === 'ram-1' || (!estate.post.memoryHealthy && estate.post.failing === null)
        ? 'warn'
        : 'ok'
    case 'ram-2':
      return estate.post.failing === 'ram-2' ? 'warn' : 'ok'
    case 'storage':
      return estate.disk.health === 'failing' ? 'warn' : estate.disk.detected ? 'ok' : 'down'
    case 'cooler':
      return estate.tempC >= 85 ? 'warn' : 'ok'
    case 'cmos':
      return estate.cmos === 'dead' ? 'warn' : 'ok'
    case 'battery':
      return estate.battery.health.startsWith('replace') ? 'warn' : 'ok'
    case 'charger':
      return estate.charger === 'dead' ? 'warn' : 'ok'
    case 'screen':
      return estate.screen === 'cracked' ? 'down' : 'ok'
    case 'keyboard':
      return estate.keyboard === 'failing' ? 'warn' : 'ok'
    case 'gpu':
      return estate.devices.find((device) => device.name === 'Display adapter')?.status === 'ok'
        ? 'ok'
        : 'warn'
    default:
      return 'ok'
  }
}

const AREAS: readonly { area: PartArea; heading: string; parts: readonly PartId[] }[] = [
  {
    area: 'case',
    heading: 'Inside the case',
    parts: ['psu', 'motherboard', 'cpu', 'ram-1', 'ram-2', 'gpu', 'cooler', 'cmos', 'storage'],
  },
  {
    area: 'laptop',
    heading: 'The laptop body',
    parts: ['battery', 'charger', 'screen', 'keyboard'],
  },
]

export interface InternalsDiagramProps {
  platform: 'desktop' | 'laptop'
  selected: PartId | null
  onSelect: (part: PartId) => void
  estate?: BenchEstate | null
  /** Which areas to show; the bench page shows both, a case only its own. */
  showBoth?: boolean
}

/**
 * The machine, as a diagram of parts rather than a picture of one.
 *
 * Every part is a button, because the point is to point at something and test
 * it. The desktop and the laptop are the same component with different areas:
 * a desktop has a power supply and a CMOS cell, a laptop has a pack, a charger
 * and a panel.
 */
export function InternalsDiagram({
  platform,
  selected,
  onSelect,
  estate = null,
  showBoth = false,
}: InternalsDiagramProps) {
  // The desktop's group is called `case`; the laptop's is `laptop`.
  const area = platform === 'desktop' ? 'case' : 'laptop'
  const areas = showBoth ? AREAS : AREAS.filter((group) => group.area === area)

  return (
    <div className={styles.diagram}>
      {areas.map((group) => (
        <section key={group.area} className={styles.diagramGroup} aria-labelledby={`area-${group.area}`}>
          <h3 id={`area-${group.area}`} className={styles.diagramHeading}>
            {group.heading}
          </h3>
          <div className={styles.partGrid}>
            {group.parts.map((partId) => {
              const part = partById(partId)
              if (!part) {
                return null
              }
              const state = partState(estate, partId)
              return (
                <button
                  key={partId}
                  type="button"
                  className={styles.part}
                  data-state={state}
                  aria-pressed={selected === partId}
                  onClick={() => onSelect(partId)}
                >
                  <span className={styles.partDot} data-state={state} aria-hidden="true" />
                  <span className={styles.partName}>{part.name}</span>
                  <span className={styles.partRole}>{part.test}</span>
                </button>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}
