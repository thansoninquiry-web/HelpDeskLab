import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { loadModuleLesson, type ModuleLessonView } from '../../app/curriculumService'
import { familyLabel } from '../components/familyLabels'
import { PageHeader } from '../components/PageHeader'
import { RequirementList } from '../components/RequirementList'
import { useModulePractice } from '../components/useModulePractice'
import styles from './pages.module.css'

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; view: ModuleLessonView }
  | { kind: 'missing' }
  | { kind: 'error'; message: string }

function moduleNumber(number: number): string {
  return String(number).padStart(2, '0')
}

/**
 * Lesson copy is written with `backticks` around anything the learner types, so
 * a command stands out from the sentence it sits in.
 */
function LessonText({ text }: { text: string }) {
  return (
    <>
      {text.split('`').map((part, index) =>
        index % 2 === 1 ? (
          <code className={styles.stepCode} key={`code-${index}-${part}`}>
            {part}
          </code>
        ) : (
          <span key={`text-${index}-${part}`}>{part}</span>
        ),
      )}
    </>
  )
}

/**
 * One playable module, taught in three parts: the idea, one worked example, and
 * the way into the tickets the module is judged on. A lesson may add a fourth,
 * a connect-to-close checklist, for work whose order carries the evidence. The
 * lesson never names a generated ticket — the simulator draws a new variant each
 * time — so the example shows the shape of the work and why each step matters.
 */
export function ModuleLessonPage() {
  const { moduleId = '' } = useParams()
  // The lesson is stored with the id it belongs to, so navigating to another
  // module reads as loading again without an effect setting state up front.
  const [loaded, setLoaded] = useState<{ moduleId: string; state: LoadState } | null>(null)
  const state: LoadState =
    loaded && loaded.moduleId === moduleId ? loaded.state : { kind: 'loading' }
  // The checklist is a reading aid, not attempt state: it is kept per module for
  // the visit and never written anywhere. The log is what the module scores.
  const [flow, setFlow] = useState<{ moduleId: string; checked: readonly number[] }>({
    moduleId: '',
    checked: [],
  })
  const checkedSteps = flow.moduleId === moduleId ? flow.checked : []
  const { start, busyId, error: practiceError } = useModulePractice()

  const toggleFlowStep = (index: number) => {
    const current = flow.moduleId === moduleId ? flow.checked : []
    setFlow({
      moduleId,
      checked: current.includes(index)
        ? current.filter((step) => step !== index)
        : [...current, index],
    })
  }

  useEffect(() => {
    let active = true

    loadModuleLesson(moduleId).then(
      (view) => {
        if (active) {
          setLoaded({ moduleId, state: view ? { kind: 'ready', view } : { kind: 'missing' } })
        }
      },
      (caught: unknown) => {
        if (active) {
          setLoaded({
            moduleId,
            state: {
              kind: 'error',
              message: caught instanceof Error ? caught.message : 'That lesson could not be read.',
            },
          })
        }
      },
    )

    return () => {
      active = false
    }
  }, [moduleId])

  if (state.kind === 'loading') {
    return (
      <>
        <PageHeader eyebrow="Curriculum" title="Lesson" description="Opening the lesson…" />
        <p className={styles.statusMessage}>Reading the module…</p>
      </>
    )
  }

  if (state.kind === 'error') {
    return (
      <>
        <PageHeader eyebrow="Curriculum" title="Lesson" description="The lesson could not be read." />
        <p className={styles.statusError} role="alert">
          {state.message}
        </p>
        <p>
          <Link className={styles.moduleAction} to="/">
            Back to the modules
          </Link>
        </p>
      </>
    )
  }

  if (state.kind === 'missing') {
    return (
      <>
        <PageHeader
          eyebrow="Curriculum"
          title="Lesson not available"
          description="This module has no lesson in this build."
        />
        <p className={styles.sectionText}>
          Every module in the course has a lesson. This address names one the app does not have,
          so there is nothing to teach toward.
        </p>
        <p>
          <Link className={styles.moduleAction} to="/">
            Back to the modules
          </Link>
        </p>
      </>
    )
  }

  const { module, lesson } = state.view
  const practice = lesson.practice

  return (
    <>
      <PageHeader
        eyebrow={`Module ${moduleNumber(module.number)} · Lesson`}
        title={module.title}
        description={module.summary}
      />

      <p className={styles.lessonBackRow}>
        <Link className={styles.lessonBack} to="/">
          ← All modules
        </Link>
        <span className={styles.count}>
          {module.met}/{module.total} requirements
        </span>
      </p>

      <section className={styles.section} aria-labelledby="lesson-concept-heading">
        <div className={styles.sectionHeading}>
          <h2 id="lesson-concept-heading">The idea</h2>
          <span className={styles.count}>Read once</span>
        </div>
        <div className={styles.lessonPanel}>
          {lesson.concept.map((paragraph) => (
            <p className={styles.lessonParagraph} key={paragraph}>
              {paragraph}
            </p>
          ))}
        </div>
      </section>

      <section className={styles.section} aria-labelledby="lesson-example-heading">
        <div className={styles.sectionHeading}>
          <h2 id="lesson-example-heading">One worked example</h2>
          <span className={styles.count}>{lesson.example.steps.length} steps</span>
        </div>
        <div className={styles.exampleCard}>
          <h3 className={styles.exampleTitle}>{lesson.example.title}</h3>
          <p className={styles.exampleScenario}>{lesson.example.scenario}</p>

          <ol className={styles.stepList}>
            {lesson.example.steps.map((step, index) => (
              <li className={styles.step} key={step.action}>
                <span className={styles.stepNumber} aria-hidden="true">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <span className={styles.stepBody}>
                  <span className={styles.stepAction}>
                    <LessonText text={step.action} />
                  </span>
                  <span className={styles.stepNote}>
                    <LessonText text={step.note} />
                  </span>
                </span>
              </li>
            ))}
          </ol>

          <p className={styles.exampleResult}>
            <span className={styles.exampleResultLabel}>Why it scores</span>
            {lesson.example.result}
          </p>
        </div>
      </section>

      {lesson.flow ? (
        <section className={styles.section} aria-labelledby="lesson-flow-heading">
          <div className={styles.sectionHeading}>
            <h2 id="lesson-flow-heading">{lesson.flow.title}</h2>
            <span className={styles.count} aria-live="polite">
              {checkedSteps.length} of {lesson.flow.steps.length} checked
            </span>
          </div>
          <div className={styles.flowCard}>
            <p className={styles.flowIntro}>{lesson.flow.intro}</p>

            <ol className={styles.flowList}>
              {lesson.flow.steps.map((step, index) => {
                const done = checkedSteps.includes(index)
                return (
                  <li
                    className={done ? `${styles.flowStep} ${styles.flowStepDone}` : styles.flowStep}
                    key={step.action}
                  >
                    <label className={styles.flowCheck}>
                      <input
                        type="checkbox"
                        className={styles.flowCheckInput}
                        checked={done}
                        onChange={() => toggleFlowStep(index)}
                      />
                      <span className={styles.flowNumber} aria-hidden="true">
                        {String(index + 1).padStart(2, '0')}
                      </span>
                      <span className={styles.flowBody}>
                        <span className={styles.flowAction}>
                          <LessonText text={step.action} />
                        </span>
                        <span className={styles.flowEvidence}>
                          <span className={styles.flowEvidenceLabel}>Leave in the log:</span>
                          <LessonText text={step.evidence} />
                        </span>
                      </span>
                    </label>
                  </li>
                )
              })}
            </ol>

            <p className={styles.exampleResult}>
              <span className={styles.exampleResultLabel}>Before you close</span>
              {lesson.flow.finish}
            </p>
          </div>
        </section>
      ) : null}

      <section className={styles.section} aria-labelledby="lesson-practice-heading">
        <div className={styles.sectionHeading}>
          <h2 id="lesson-practice-heading">Practise it</h2>
          <span className={styles.count}>
            {practice.kind === 'tickets'
              ? 'Matching tickets'
              : practice.kind === 'intune'
                ? 'Intune console'
                : practice.kind === 'azure'
                  ? 'Azure console'
                  : 'Job targets'}
          </span>
        </div>

        <div className={styles.lessonPanel}>
          {practice.kind === 'tickets' ? (
            <>
              <p className={styles.sectionText}>
                The button starts a ticket this module can actually exercise — the variant as well as
                the family, where the requirement turns on it. The links open the queue on one family
                instead. Any passing attempt counts; the family is just where to start.
              </p>
              <div className={styles.practiceRow}>
                <button
                  type="button"
                  className={styles.primaryButton}
                  onClick={() => void start(module.id)}
                  disabled={busyId !== null}
                >
                  {busyId === module.id ? 'Starting…' : 'Practise this module'}
                </button>
                {practice.families.map((family) => (
                  <Link
                    key={family}
                    className={styles.practiceLink}
                    to={`/practice?family=${family}`}
                  >
                    {familyLabel(family)} tickets
                  </Link>
                ))}
                <Link className={styles.practiceWhole} to="/practice">
                  Whole queue
                </Link>
              </div>
              {practiceError ? (
                <p className={styles.statusError} role="alert">
                  {practiceError}
                </p>
              ) : null}
            </>
          ) : practice.kind === 'intune' ? (
            <>
              <p className={styles.sectionText}>
                This module is worked in the Intune console rather than the ticket queue. The button
                opens the console ticket this lesson follows; the estate it acts on is the next link.
                A ticket counts once the device state agrees it is finished, not when the last action
                has been pressed.
              </p>
              <div className={styles.practiceRow}>
                <Link
                  className={styles.primaryButton}
                  to={`/intune/tickets?template=${practice.templateId}`}
                >
                  Practise this module
                </Link>
                <Link className={styles.practiceLink} to="/intune/tickets">
                  All Intune tickets
                </Link>
                <Link className={styles.practiceWhole} to="/intune">
                  Open the console
                </Link>
              </div>
            </>
          ) : practice.kind === 'azure' ? (
            <>
              <p className={styles.sectionText}>
                This module is worked in the Azure console rather than the ticket queue. The
                button opens the console ticket this lesson follows; the inventory it acts on is
                the next link. A ticket counts once the subscription agrees it is finished, not
                when the last action has been pressed.
              </p>
              <div className={styles.practiceRow}>
                <Link
                  className={styles.primaryButton}
                  to={`/azure/tickets?template=${practice.templateId}`}
                >
                  Practise this module
                </Link>
                <Link className={styles.practiceLink} to="/azure/tickets">
                  All Azure tickets
                </Link>
                <Link className={styles.practiceWhole} to="/azure">
                  Open the console
                </Link>
              </div>
            </>
          ) : (
            <>
              <p className={styles.sectionText}>
                This module is judged on the listings you save rather than on a ticket. Coverage
                counts once the family behind a skill has a passing attempt, so the two pages feed
                each other.
              </p>
              <div className={styles.practiceRow}>
                <Link className={styles.practiceLink} to="/targets">
                  Job targets
                </Link>
                <Link className={styles.practiceWhole} to="/practice">
                  Whole queue
                </Link>
              </div>
            </>
          )}

          <div className={styles.lessonRequirements}>
            <span className={styles.lessonSubheading}>What has to be true to finish it</span>
            <RequirementList requirements={module.requirements} />
          </div>

          {module.xp > 0 ? (
            <p className={styles.moduleXp}>{module.xp} XP earned on these tickets</p>
          ) : null}
        </div>
      </section>
    </>
  )
}
