import type { ReactNode } from 'react'
import { Link } from 'react-router'
import styles from './TutorialPage.module.css'

/**
 * A learner-facing walkthrough for one simulator.
 *
 * The shape is the same in every module — what the surface is for, the steps of
 * one piece of work, where the marks come from, and the mistakes people make
 * first — so a learner who has read one tutorial knows how to read the next. The
 * content is data in each module, because the steps are about that module's
 * tools and nothing here is generated.
 */

export interface TutorialLink {
  to: string
  label: string
}

export interface TutorialStep {
  title: string
  /** What the learner does, in one or two sentences. */
  action: string
  /** Why that step, and what it proves. */
  why: string
  link?: TutorialLink
}

export interface TutorialScoreRow {
  label: string
  detail: string
}

export interface Tutorial {
  /** The module this walks, for the page's own badge. */
  surface: string
  title: string
  lede: string
  /** Reading time, in minutes, for the page header. */
  minutes: number
  before: readonly string[]
  steps: readonly TutorialStep[]
  scoring: readonly TutorialScoreRow[]
  mistakes: readonly string[]
  practice: TutorialLink & { note: string }
  /** The module's home route, for the way back. */
  home: TutorialLink
}

export function TutorialView({ tutorial, nav }: { tutorial: Tutorial; nav?: ReactNode }) {
  return (
    <div className={styles.page}>
      <header>
        <p className={styles.count}>
          Tutorial · {tutorial.surface} · {tutorial.steps.length} steps · about{' '}
          {tutorial.minutes} minutes
        </p>
        <h1>{tutorial.title}</h1>
        <p className={styles.lead}>{tutorial.lede}</p>
      </header>

      {nav}

      <section className={styles.panel} aria-labelledby="before-heading">
        <h2 id="before-heading" className={styles.panelTitle}>
          Before you start
        </h2>
        <ul className={styles.list}>
          {tutorial.before.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section className={styles.section} aria-labelledby="steps-heading">
        <div className={styles.sectionHeading}>
          <h2 id="steps-heading">One piece of work, start to finish</h2>
          <span className={styles.count}>Read it once, then do it</span>
        </div>
        <ol className={styles.steps}>
          {tutorial.steps.map((step, index) => (
            <li key={step.title} className={styles.step}>
              <span className={styles.stepNumber} aria-hidden="true">
                {String(index + 1).padStart(2, '0')}
              </span>
              <div className={styles.stepBody}>
                <h3 className={styles.stepTitle}>{step.title}</h3>
                <p className={styles.action}>{step.action}</p>
                <p className={styles.why}>{step.why}</p>
                {step.link ? (
                  <Link className={styles.stepLink} to={step.link.to}>
                    {step.link.label}
                  </Link>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className={styles.section} aria-labelledby="score-heading">
        <div className={styles.sectionHeading}>
          <h2 id="score-heading">Where the marks come from</h2>
          <span className={styles.count}>Out of 100</span>
        </div>
        <dl className={styles.scoring}>
          {tutorial.scoring.map((row) => (
            <div key={row.label}>
              <dt>{row.label}</dt>
              <dd>{row.detail}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className={styles.section} aria-labelledby="mistakes-heading">
        <div className={styles.sectionHeading}>
          <h2 id="mistakes-heading">The first mistakes</h2>
          <span className={styles.count}>Cheaper to read than to make</span>
        </div>
        <ul className={styles.mistakes}>
          {tutorial.mistakes.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section className={styles.practice} aria-labelledby="practice-heading">
        <h2 id="practice-heading" className={styles.panelTitle}>
          Now do one
        </h2>
        <p className={styles.practiceNote}>{tutorial.practice.note}</p>
        <div className={styles.row}>
          <Link className={styles.button} to={tutorial.practice.to}>
            {tutorial.practice.label}
          </Link>
          <Link className={styles.back} to={tutorial.home.to}>
            {tutorial.home.label}
          </Link>
        </div>
      </section>
    </div>
  )
}
