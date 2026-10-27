import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { AzureNav } from './AzureNav'
import { loadCurriculum, type ModuleView } from '../../../app/curriculumService'
import styles from './azure.module.css'

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; modules: readonly ModuleView[] }
  | { kind: 'error'; message: string }

function statusLabel(module: ModuleView): string {
  if (module.complete) {
    return 'Complete'
  }
  return module.met > 0 ? 'In progress' : 'Not started'
}

/**
 * The lessons this console's tickets are drawn from, listed without a ticket in
 * front of them.
 *
 * The console is where the work is done, so a learner who arrives here first had
 * only one way into the course: press a ticket and follow the link out of it.
 * This is the same route in reverse — the three modules the tickets belong to, in
 * course order, each opening its lesson, with how far it has got so the list says
 * what is left to read rather than only what exists.
 */
export function AzureCoursePage() {
  const [state, setState] = useState<LoadState>({ kind: 'loading' })

  useEffect(() => {
    let active = true

    loadCurriculum().then(
      (curriculum) => {
        if (active) {
          setState({
            kind: 'ready',
            // The console's own lessons are the ones practiced here, read off the
            // same field the dashboard uses to decide where a module is worked.
            modules: curriculum.modules.filter((module) => module.practice === 'azure'),
          })
        }
      },
      (caught: unknown) => {
        if (active) {
          setState({
            kind: 'error',
            message: caught instanceof Error ? caught.message : 'The course could not be read.',
          })
        }
      },
    )

    return () => {
      active = false
    }
  }, [])

  return (
    <div className={styles.page}>
      <header>
        <p className={styles.count}>Course · read before you change</p>
        <h1>Azure course</h1>
        <p className={styles.note}>
          Every ticket in this console is drawn from one of these lessons. Each explains the
          decision the ticket is scored on, so reading it first is the difference between
          changing the right setting and knowing what it cost to leave it alone.
        </p>
      </header>

      <AzureNav />

      {state.kind === 'error' ? (
        <p className={styles.empty} role="alert">
          {state.message}
        </p>
      ) : state.kind === 'loading' ? (
        <p className={styles.empty}>Reading the course…</p>
      ) : (
        <section className={styles.section} aria-label="Azure lessons">
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Lesson</th>
                  <th scope="col">What it teaches</th>
                  <th scope="col">Progress</th>
                  <th scope="col">Read</th>
                </tr>
              </thead>
              <tbody>
                {state.modules.map((module) => (
                  <tr key={module.id}>
                    <td>
                      <strong>{module.title}</strong>
                      <div className={styles.mono}>
                        Module {String(module.number).padStart(2, '0')}
                      </div>
                    </td>
                    <td>{module.summary}</td>
                    <td>
                      <div className={styles.mono}>
                        {module.met} / {module.total}
                      </div>
                      <div className={styles.mono}>{statusLabel(module)}</div>
                    </td>
                    <td>
                      <Link className={styles.link} to={`/modules/${module.id}`}>
                        Open lesson
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className={styles.note}>
            A ticket counts toward its lesson once the subscription agrees it is finished,
            not when the last change is made.
          </p>
        </section>
      )}
    </div>
  )
}
