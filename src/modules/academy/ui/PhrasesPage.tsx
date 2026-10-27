import { useState } from 'react'
import { GLOSSARY, PHRASES, PHRASE_GROUPS, type PhraseCard } from '../data/phrases'
import { AcademyNav } from './AcademyNav'
import styles from './academy.module.css'

const GROUP_ORDER: readonly PhraseCard['group'][] = [
  'opening',
  'diagnose',
  'reassure',
  'handover',
]

/**
 * The Spanish phrasebook.
 *
 * A study card is a sentence plus the moment it is for. The English is hidden
 * until the learner asks for it, so the card can be used as recall rather than
 * as a translation.
 */
export function AcademyPhrasesPage() {
  const [shown, setShown] = useState<ReadonlySet<string>>(new Set())

  const toggle = (id: string) => {
    setShown((current) => {
      const next = new Set(current)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  return (
    <div className={styles.page}>
      <header>
        <p className={styles.count}>
          {PHRASES.length} phrases · {GROUP_ORDER.length} moments · optional study
        </p>
        <h1>Spanish for the school desk</h1>
        <p className={styles.lead}>
          The sentences that start a call, narrow a fault, say what happens next, and hand a machine
          over. Spanish first, English when you want it.
        </p>
      </header>

      <AcademyNav />

      <section className={styles.panel} aria-labelledby="how-heading">
        <h2 id="how-heading" className={styles.panelTitle}>
          How to use the cards
        </h2>
        <p className={styles.note}>
          Read the Spanish aloud before revealing the English. The point is not perfect grammar; it
          is being understood, and being understood kindly. Every Spanish-first scenario in the pack
          has a caller who is patient but in a hurry.
        </p>
        <div className={styles.row}>
          <button
            type="button"
            className={styles.buttonQuiet}
            onClick={() => setShown(new Set(PHRASES.map((card) => card.id)))}
          >
            Show every translation
          </button>
          <button type="button" className={styles.buttonQuiet} onClick={() => setShown(new Set())}>
            Hide every translation
          </button>
        </div>
      </section>

      {GROUP_ORDER.map((group) => (
        <section key={group} className={styles.section} aria-labelledby={`phrase-${group}`}>
          <div className={styles.sectionHeading}>
            <h2 id={`phrase-${group}`}>{PHRASE_GROUPS[group]}</h2>
            <span className={styles.count}>
              {PHRASES.filter((card) => card.group === group).length} cards
            </span>
          </div>
          <ul className={styles.phraseGrid}>
            {PHRASES.filter((card) => card.group === group).map((card) => (
              <li key={card.id} className={styles.phraseCard}>
                <p className={styles.phraseEs}>{card.es}</p>
                {shown.has(card.id) ? (
                  <p className={styles.phraseEn}>{card.en}</p>
                ) : (
                  <button
                    type="button"
                    className={styles.buttonQuiet}
                    onClick={() => toggle(card.id)}
                  >
                    Show English
                  </button>
                )}
                <p className={styles.itemMeta}>{card.when}</p>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <section className={styles.section} aria-labelledby="glossary-heading">
        <div className={styles.sectionHeading}>
          <h2 id="glossary-heading">The words in the room</h2>
          <span className={styles.count}>{GLOSSARY.length} terms</span>
        </div>
        <table className={styles.table}>
          <caption className={styles.itemMeta}>
            The vocabulary a school ticket uses, so a caller can point at the thing that is broken.
          </caption>
          <thead>
            <tr>
              <th scope="col">Español</th>
              <th scope="col">English</th>
            </tr>
          </thead>
          <tbody>
            {GLOSSARY.map((entry) => (
              <tr key={entry.es}>
                <td>{entry.es}</td>
                <td>{entry.en}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  )
}
