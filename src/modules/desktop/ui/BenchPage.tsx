import { useState } from 'react'
import { Link } from 'react-router'
import { partById } from '../data/parts'
import { CASES } from '../data/cases'
import { healthyEstate } from '../logic/estate'
import type { WindowsEdition } from '../types'
import { DesktopNav } from './DesktopNav'
import { InternalsDiagram } from './InternalsDiagram'
import styles from './desktop.module.css'
import type { PartId } from '../types'

const HEALTHY = healthyEstate()

const EDITIONS: readonly { edition: WindowsEdition; label: string; note: string }[] = [
  {
    edition: 'Windows 11',
    label: 'Windows 11',
    note: 'The current desktop: TPM and Secure Boot are prerequisites, Settings has replaced most of Control Panel, and driver updates arrive through Windows Update. Device Manager, Event Viewer and Disk Management still hold their old names, which is why the tools here are the same on both.',
  },
  {
    edition: 'Windows 10',
    label: 'Windows 10',
    note: 'Out of mainstream support in October 2025; security updates only where the organisation pays for them. The tools are identical to 11, so a learner who knows one knows the other — the difference is the Settings panel and the update model.',
  },
  {
    edition: 'Windows 7',
    label: 'Legacy mode · Windows 7',
    note: 'No security updates since January 2020. It still turns up on stock-room and shop-floor machines, and a clean install has no USB 3 driver, so the ports are dead until the vendor package is installed. A machine on this version is a finding in its own right, not just a machine with a fault.',
  },
  {
    edition: 'Windows XP',
    label: 'Legacy mode · Windows XP',
    note: 'The XP era is where compatibility mode comes from: programs written for it check the version they are running on and exit on anything newer. Run them in compatibility mode if the business needs them, and plan the replacement — nothing about XP belongs on a network today.',
  },
]

/**
 * The bench reference.
 *
 * A healthy machine, part by part, so a learner can learn the layout before a
 * fault is in front of them — and the four Windows editions the module covers,
 * with what each one changes about the job.
 */
export function DesktopBenchPage() {
  const [selected, setSelected] = useState<PartId>('psu')
  const part = partById(selected)

  return (
    <div className={styles.page}>
      <header>
        <p className={styles.count}>
          One desktop · one laptop · {CASES.length} cases on this bench
        </p>
        <h1>The bench</h1>
        <p className={styles.lead}>
          The machine the cases are worked on. Click a part to read what it does, how it fails and
          the test that tells you which it is.
        </p>
      </header>

      <DesktopNav />

      <section className={styles.section} aria-labelledby="diagram-heading">
        <div className={styles.sectionHeading}>
          <h2 id="diagram-heading">Inside the machine</h2>
          <span className={styles.count}>healthy reference · no fault</span>
        </div>
        <InternalsDiagram
          platform="desktop"
          selected={selected}
          onSelect={setSelected}
          estate={HEALTHY}
          showBoth
        />
        {part ? (
          <div className={styles.partPanel}>
            <h3 className={styles.partHeading}>{part.name}</h3>
            <p className={styles.note}>{part.role}</p>
            <p className={styles.partFailure}>Failing looks like: {part.failure}</p>
            <p className={styles.count}>
              The test that settles it: {part.test} · cases that use it:{' '}
              {CASES.filter((entry) => entry.subject === part.id).length}
            </p>
            <Link className={styles.link} to="/desktop">
              Open a case and work it
            </Link>
          </div>
        ) : null}
      </section>

      <section className={styles.section} aria-labelledby="editions-heading">
        <div className={styles.sectionHeading}>
          <h2 id="editions-heading">The four Windows the bench covers</h2>
          <span className={styles.count}>two supported · two legacy</span>
        </div>
        <ul className={styles.editionList}>
          {EDITIONS.map((entry) => (
            <li key={entry.edition} className={styles.edition}>
              <span className={styles.editionName}>{entry.label}</span>
              <span className={styles.editionNote}>{entry.note}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
