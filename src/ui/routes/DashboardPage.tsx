import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { loadCurriculum, type CurriculumView, type ModuleView } from '../../app/curriculumService'
import { PageHeader } from '../components/PageHeader'
import { RequirementList } from '../components/RequirementList'
import { useModulePractice } from '../components/useModulePractice'
import styles from './pages.module.css'

function chipLabel(module: ModuleView): string {
  if (module.status === 'planned') {
    return 'Planned'
  }
  if (module.complete) {
    return 'Complete'
  }
  return module.met > 0 ? 'In progress' : 'Not started'
}

function chipTone(module: ModuleView): string {
  if (module.status === 'planned') {
    return 'planned'
  }
  if (module.complete) {
    return 'complete'
  }
  return module.met > 0 ? 'active' : 'idle'
}

function ModuleRow({
  module,
  open,
  onToggle,
}: {
  module: ModuleView
  open: boolean
  onToggle: () => void
}) {
  const panelId = `module-${module.id}-panel`
  const headingId = `module-${module.id}-heading`
  // Each row starts its own ticket on demand, so one row's failure or busy
  // state cannot block another module's entry point.
  const { start, busyId, error } = useModulePractice()

  return (
    <li className={styles.moduleRow} data-status={module.status} data-complete={module.complete}>
      <h3 className={styles.moduleHeading} id={headingId}>
        <button
          type="button"
          className={styles.moduleToggle}
          aria-expanded={open}
          // Only while the panel exists: a reference to an unmounted id names
          // nothing, and `aria-expanded` already carries the state.
          aria-controls={open ? panelId : undefined}
          onClick={onToggle}
        >
          <span className={styles.moduleNumber}>{String(module.number).padStart(2, '0')}</span>
          <span className={styles.moduleTitle}>{module.title}</span>
          <span className={styles.moduleChip} data-tone={chipTone(module)}>
            {chipLabel(module)}
          </span>
          <span className={styles.moduleMeta}>
            {module.status === 'planned' ? '—' : `${module.met}/${module.total}`}
          </span>
          <span className={styles.moduleCaret} aria-hidden="true">
            ▸
          </span>
        </button>
      </h3>

      {open ? (
        <div className={styles.modulePanel} id={panelId} role="region" aria-labelledby={headingId}>
          <p className={styles.moduleSummary}>{module.summary}</p>

          {module.note ? <p className={styles.moduleNote}>{module.note}</p> : null}

          {module.requirements.length > 0 ? (
            <RequirementList requirements={module.requirements} />
          ) : null}

          {module.status === 'playable' ? (
            <>
              <div className={styles.moduleFooter}>
                {module.xp > 0 ? (
                  <span className={styles.moduleXp}>{module.xp} XP on these tickets</span>
                ) : (
                  <span />
                )}
                <span className={styles.moduleActions}>
                  <Link className={styles.moduleAction} to={`/modules/${module.id}`}>
                    Lesson
                  </Link>
                  {module.complete ? null : module.practice === 'tickets' ? (
                    <button
                      type="button"
                      className={`${styles.moduleAction} ${styles.moduleActionButton}`}
                      onClick={() => void start(module.id)}
                      disabled={busyId !== null}
                    >
                      {busyId === module.id ? 'Starting…' : 'Practise'}
                    </button>
                  ) : module.practice === 'intune' ? (
                    <Link className={styles.moduleAction} to="/intune/tickets">
                      Intune console
                    </Link>
                  ) : module.practice === 'targets' ? (
                    <Link className={styles.moduleAction} to="/targets">
                      Job targets
                    </Link>
                  ) : null}
                </span>
              </div>
              {error ? (
                <p className={styles.moduleError} role="alert">
                  {error}
                </p>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}
    </li>
  )
}

function Overview({ curriculum }: { curriculum: CurriculumView }) {
  const { met, total, percent, complete, playable, next } = curriculum

  return (
    <>
      <div className={styles.curriculumStrip}>
        <div className={styles.curriculumTrack} aria-hidden="true">
          <div className={styles.curriculumFill} style={{ width: `${percent}%` }} />
        </div>
        <p className={styles.curriculumLine}>
          <span className={styles.curriculumFigure}>
            {met} of {total}
          </span>{' '}
          requirements met · {complete} of {playable} modules complete
        </p>
        {next ? (
          <p className={styles.curriculumNext}>
            Next up:{' '}
            <Link className={styles.curriculumNextLink} to={`/modules/${next.id}`}>
              {String(next.number).padStart(2, '0')} {next.title}
            </Link>
          </p>
        ) : (
          <p className={styles.curriculumNext}>Every module in this build is complete.</p>
        )}
      </div>

      <p className={styles.curriculumNote}>
        Progress is read from your attempts, notes and saved listings. A ticket can count toward
        more than one module.
      </p>
    </>
  )
}

export function DashboardPage() {
  const [curriculum, setCurriculum] = useState<CurriculumView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set())
  const focusedOnce = useRef(false)

  useEffect(() => {
    let cancelled = false
    loadCurriculum()
      .then((view) => {
        if (cancelled) {
          return
        }
        setCurriculum(view)
        if (!focusedOnce.current && view.next) {
          focusedOnce.current = true
          setOpen(new Set([view.next.id]))
        }
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : 'Modules could not be loaded.')
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  const toggle = (id: string) => {
    setOpen((current) => {
      const nextOpen = new Set(current)
      if (nextOpen.has(id)) {
        nextOpen.delete(id)
      } else {
        nextOpen.add(id)
      }
      return nextOpen
    })
  }

  return (
    <>
      <PageHeader
        eyebrow="Curriculum"
        title="Dashboard"
        description="Nineteen modules, all of them playable today. Pull a ticket, investigate the simulated machine, document your evidence, and see which parts of the course your work has covered."
      />

      <div className={styles.ctaRow}>
        <Link className={styles.ctaPrimary} to="/practice">
          Open the ticket queue
        </Link>
        <Link className={styles.ctaSecondary} to="/progress">
          Review progress
        </Link>
      </div>

      <section className={styles.section} aria-labelledby="modules-heading">
        <div className={styles.sectionHeading}>
          <h2 id="modules-heading">Modules</h2>
          <span className={styles.count}>
            {curriculum
              ? `${curriculum.playable} playable · ${curriculum.modules.length} total`
              : 'The course'}
          </span>
        </div>

        {error ? (
          <p className={styles.statusError} role="alert">
            {error}
          </p>
        ) : curriculum ? (
          <>
            <Overview curriculum={curriculum} />
            <ol className={styles.moduleList}>
              {curriculum.modules.map((module) => (
                <ModuleRow
                  key={module.id}
                  module={module}
                  open={open.has(module.id)}
                  onToggle={() => toggle(module.id)}
                />
              ))}
            </ol>
          </>
        ) : (
          <p className={styles.statusMessage}>Reading your history…</p>
        )}
      </section>

      <aside className={styles.notice}>
        <strong>Fictional environment.</strong> Tickets, users, hosts, and directory records are
        generated locally. Commands act on a simulated world only — nothing here touches a real
        machine or accepts a real credential.
      </aside>
    </>
  )
}
