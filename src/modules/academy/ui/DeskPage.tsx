import { Link } from 'react-router'
import { ACADEMY_MODES } from '../types'
import { PHRASES } from '../data/phrases'
import { MORE_PEOPLE } from '../data/people'
import { PEOPLE, ROOMS, SCHOOL, schoolStats } from '../data/school'
import { AREA_LABELS, AREA_ORDER, SCENARIOS, scenariosIn } from '../data/scenarios'
import { AcademyNav } from './AcademyNav'
import { useVisitList } from './useAcademy'
import styles from './academy.module.css'

const PEOPLE_ON_SITE = [...PEOPLE, ...MORE_PEOPLE]

/**
 * The school desk's front page.
 *
 * The org profile, the clock the pack runs on, and the scenario queue, grouped
 * by where the work is. Every row names the caller, so the learner reads the
 * bell and the person before opening the visit.
 */
export function AcademyDeskPage() {
  const { best, error, loading } = useVisitList()
  const spanish = SCENARIOS.filter((scenario) => scenario.caller.language === 'es').length

  return (
    <div className={styles.page}>
      <header>
        <p className={styles.count}>
          {SCENARIOS.length} scenarios · 5 areas · {spanish} Spanish-first callers · 1 technician
        </p>
        <h1>Education IT · {SCHOOL.name}</h1>
        <p className={styles.lead}>
          A school desk on a bell. Read the room, talk to the teacher, and fix the thing that is
          stopping the lesson — before the class walks in.
        </p>
      </header>

      <AcademyNav />

      {error ? (
        <p className={styles.empty} role="alert">
          {error}
        </p>
      ) : null}

      <section className={styles.profile} aria-labelledby="profile-heading">
        <div className={styles.sectionHeading}>
          <h2 id="profile-heading">The school</h2>
          <span className={styles.count}>{SCHOOL.kind}</span>
        </div>
        <p className={styles.note}>{SCHOOL.about}</p>
        <dl className={styles.stats}>
          {schoolStats().map((stat) => (
            <div key={stat.label}>
              <dt>{stat.label}</dt>
              <dd>{stat.value}</dd>
            </div>
          ))}
        </dl>
        <div className={styles.twoUp}>
          <div>
            <h3 className={styles.panelTitle}>Rooms on the estate</h3>
            <ul className={styles.plainList}>
              {ROOMS.map((room) => (
                <li key={room.id}>
                  <span className={styles.itemTitle}>{room.name}</span>
                  <span className={styles.itemMeta}>
                    {room.floor} · {room.kit.join(' · ')}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className={styles.panelTitle}>Who calls</h3>
            <ul className={styles.plainList}>
              {PEOPLE_ON_SITE.filter((person) => person.role !== 'Site manager').map((person) => (
                <li key={person.name}>
                  <span className={styles.itemTitle}>
                    {person.name}
                    {person.language === 'es' ? (
                      <span className={styles.badge} data-tone="quiet">
                        Spanish-first
                      </span>
                    ) : null}
                  </span>
                  <span className={styles.itemMeta}>
                    {person.role} · {person.room}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className={styles.modes} aria-labelledby="modes-heading">
        <div className={styles.sectionHeading}>
          <h2 id="modes-heading">How the bell scores</h2>
          <span className={styles.count}>Choose inside a visit, before the first action</span>
        </div>
        <div className={styles.modeGrid}>
          {ACADEMY_MODES.map((entry) => (
            <div key={entry.id} className={styles.panel}>
              <h3 className={styles.panelTitle}>{entry.label}</h3>
              <p className={styles.note}>{entry.detail}</p>
              <p className={styles.itemMeta}>
                {entry.id === 'rush'
                  ? 'Five scenarios add a walk-up at the door: triage it or lose the safety points.'
                  : 'The same scenarios, with a technician’s normal walking time built in.'}
              </p>
            </div>
          ))}
        </div>
      </section>

      {AREA_ORDER.map((area) => {
        const entries = scenariosIn(area)
        const meta = AREA_LABELS[area]
        return (
          <section key={area} className={styles.section} aria-labelledby={`area-${area}`}>
            <div className={styles.sectionHeading}>
              <h2 id={`area-${area}`}>{meta.label}</h2>
              <span className={styles.count}>{entries.length} scenarios</span>
            </div>
            <p className={styles.note}>{meta.note}</p>
            <ul className={styles.caseList}>
              {entries.map((scenario) => {
                const record = best[scenario.id]
                return (
                  <li key={scenario.id} className={styles.caseRow}>
                    <span className={styles.caseBody}>
                      <Link className={styles.caseTitle} to={`/academy/cases/${scenario.id}`}>
                        {scenario.title}
                      </Link>
                      <span className={styles.caseSymptom}>{scenario.symptom}</span>
                      <span className={styles.itemMeta}>
                        {scenario.caller.name} · {scenario.caller.role} · {scenario.bell.label}
                      </span>
                    </span>
                    <span className={styles.caseMeta}>
                      {scenario.caller.language === 'es' ? (
                        <span className={styles.badge} data-tone="quiet">
                          ES
                        </span>
                      ) : null}
                      {scenario.walkUp ? (
                        <span className={styles.badge} data-tone="quiet">
                          walk-up
                        </span>
                      ) : null}
                      <span className={styles.badge} data-tone="quiet">
                        difficulty {scenario.difficulty}
                      </span>
                      {record ? (
                        <span className={styles.badge} data-tone={record.passed ? 'low' : 'high'}>
                          best {record.bestScore} · {record.attempts} visit
                          {record.attempts === 1 ? '' : 's'}
                        </span>
                      ) : (
                        <span className={styles.badge} data-tone="quiet">
                          {loading ? 'loading…' : 'not visited'}
                        </span>
                      )}
                    </span>
                  </li>
                )
              })}
            </ul>
          </section>
        )
      })}

      <section className={styles.section} aria-labelledby="support-heading">
        <div className={styles.sectionHeading}>
          <h2 id="support-heading">Before the first bell</h2>
          <span className={styles.count}>{PHRASES.length} support phrases</span>
        </div>
        <p className={styles.note}>
          The pack includes a Spanish phrase set and an onsite checklist, because a school desk does
          both: it talks to the caller, and it walks to the room with the right parts.
        </p>
        <div className={styles.row}>
          <Link className={styles.button} to="/academy/phrases">
            Open the phrasebook
          </Link>
          <Link className={styles.buttonQuiet} to="/academy/onsite">
            Onsite visit checklist
          </Link>
        </div>
      </section>
    </div>
  )
}
