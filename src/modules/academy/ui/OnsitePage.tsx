import { useState } from 'react'
import {
  SAFETY_BASICS,
  VISIT_KITS,
  VISIT_NOTE_PARTS,
} from '../data/catalog'
import { AREA_LABELS, AREA_ORDER } from '../data/scenarios'
import type { AcademyArea } from '../types'
import { AcademyNav } from './AcademyNav'
import styles from './academy.module.css'

/**
 * The onsite visit checklist.
 *
 * Three lists a technician can read on the way out of the door: what goes in the
 * bag for this kind of room, how not to hurt yourself or the building, and what
 * the visit note has to say before the ticket can close.
 */
export function AcademyOnsitePage() {
  const [area, setArea] = useState<AcademyArea>('classroom')
  const [packed, setPacked] = useState<ReadonlySet<string>>(new Set())
  const kit = VISIT_KITS[area]

  const toggle = (item: string) => {
    setPacked((current) => {
      const next = new Set(current)
      if (next.has(item)) {
        next.delete(item)
      } else {
        next.add(item)
      }
      return next
    })
  }

  return (
    <div className={styles.page}>
      <header>
        <p className={styles.count}>
          {AREA_ORDER.length} kinds of visit · {SAFETY_BASICS.length} safety basics · one note
        </p>
        <h1>Onsite visit checklist</h1>
        <p className={styles.lead}>
          A school is a building full of people. The visit starts at the cupboard and ends with a
          note the teacher can read, not at the moment the machine boots.
        </p>
      </header>

      <AcademyNav />

      <section className={styles.panel} aria-labelledby="pack-heading">
        <div className={styles.sectionHeading}>
          <h2 id="pack-heading">Pack for the visit</h2>
          <span className={styles.count}>
            {packed.size} items ticked · {kit.label}
          </span>
        </div>
        <div className={styles.row} role="group" aria-label="Kind of visit">
          {AREA_ORDER.map((entry) => (
            <button
              key={entry}
              type="button"
              className={area === entry ? styles.button : styles.buttonQuiet}
              aria-pressed={area === entry}
              onClick={() => {
                setArea(entry)
                setPacked(new Set())
              }}
            >
              {AREA_LABELS[entry].label}
            </button>
          ))}
        </div>
        <p className={styles.note}>{kit.watch}</p>
        <div className={styles.twoUp}>
          <div>
            <h3 className={styles.panelTitle}>Tools</h3>
            <ul className={styles.checklist}>
              {kit.tools.map((item) => (
                <li key={item}>
                  <label>
                    <input
                      type="checkbox"
                      checked={packed.has(item)}
                      onChange={() => toggle(item)}
                    />{' '}
                    {item}
                  </label>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className={styles.panelTitle}>Parts and spares</h3>
            <ul className={styles.checklist}>
              {kit.parts.map((item) => (
                <li key={item}>
                  <label>
                    <input
                      type="checkbox"
                      checked={packed.has(item)}
                      onChange={() => toggle(item)}
                    />{' '}
                    {item}
                  </label>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <p className={styles.itemMeta}>
          A second trip costs the lesson, not just the technician. The per-visit checklist on a
          scenario scores this step, so packing it is worth points as well as time.
        </p>
      </section>

      <section className={styles.section} aria-labelledby="safety-heading">
        <div className={styles.sectionHeading}>
          <h2 id="safety-heading">Safety and lifting</h2>
          <span className={styles.count}>Non-negotiable</span>
        </div>
        <ul className={styles.numbered}>
          {SAFETY_BASICS.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p className={styles.note}>
          Escalate a hot case, a burning smell or a damaged ceiling mount to the site manager. A
          school desk does not own the building, and a technician on a ladder alone is an accident
          waiting to be written up.
        </p>
      </section>

      <section className={styles.section} aria-labelledby="note-heading">
        <div className={styles.sectionHeading}>
          <h2 id="note-heading">Write the visit up</h2>
          <span className={styles.count}>What the note has to contain</span>
        </div>
        <ul className={styles.numbered}>
          {VISIT_NOTE_PARTS.map((part) => (
            <li key={part}>The note names {part}.</li>
          ))}
        </ul>
        <p className={styles.note}>
          Write it where the teacher can read it, not only in the ticket. “Fixed the projector” is
          not a note; “Room 3, HDMI lead loose at the laptop and the projector on the wrong input,
          reseated and switched, ask Mrs Vargas to call if it drops again” is one.
        </p>
      </section>
    </div>
  )
}
