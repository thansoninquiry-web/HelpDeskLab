import { CONCEPTS, TOTAL_QUESTIONS } from '../data/concepts'
import { NetlabNav } from './NetlabNav'
import { useConcepts } from './useNetlab'
import styles from './netlab.module.css'

/**
 * The cards and the quiz under them.
 *
 * Reading is a learner's own mark, because the lab cannot observe reading; the
 * quiz is stored per question, so a wrong answer stays wrong until it is tried
 * again. Nothing here is scored into XP: understanding a subnet is not resolving
 * a ticket.
 */
export function NetlabConceptsPage() {
  const { answers, reads, error, answer, markRead } = useConcepts()
  const correct = answers.filter((entry) => entry.correct).length

  return (
    <div className={styles.page}>
      <header>
        <p className={styles.count}>
          {CONCEPTS.length} cards · {TOTAL_QUESTIONS} questions ·{' '}
          {answers.length} answered · {correct} correct
        </p>
        <h1>Concepts</h1>
        <p className={styles.lead}>
          The vocabulary the incidents assume: which network is which, how to talk about
          layers, how an address is divided, who hands out names and numbers, and what the
          circuit on the wall actually is.
        </p>
      </header>

      <NetlabNav />

      {error ? (
        <p className={styles.empty} role="alert">
          {error}
        </p>
      ) : null}

      <div className={styles.cardGrid}>
        {CONCEPTS.map((concept) => {
          const read = reads.some((entry) => entry.conceptId === concept.id)
          const answered = answers.filter((entry) => entry.conceptId === concept.id)
          return (
            <article key={concept.id} id={concept.id} className={styles.card}>
              <header className={styles.cardHeader}>
                <h2 className={styles.cardTitle}>{concept.title}</h2>
                {read ? (
                  <span className={styles.badge} data-tone="low">
                    Read
                  </span>
                ) : (
                  <button
                    type="button"
                    className={styles.buttonQuiet}
                    onClick={() => void markRead(concept.id)}
                  >
                    Mark as read
                  </button>
                )}
              </header>
              <p className={styles.cardLede}>{concept.lede}</p>

              <div className={styles.cardSections}>
                {concept.sections.map((section) => (
                  <section key={section.heading} className={styles.cardSection}>
                    <h3>{section.heading}</h3>
                    <p>{section.body}</p>
                    {section.points ? (
                      <ul className={styles.points}>
                        {section.points.map((point) => (
                          <li key={point}>{point}</li>
                        ))}
                      </ul>
                    ) : null}
                  </section>
                ))}
              </div>

              <p className={styles.takeaway}>{concept.takeaway}</p>

              <div className={styles.quiz}>
                <h3 className={styles.quizTitle}>
                  <span>Quiz</span>
                  <span className={styles.count}>
                    {answered.length} of {concept.questions.length} answered
                  </span>
                </h3>

                {concept.questions.map((question, index) => {
                  const record = answers.find(
                    (entry) =>
                      entry.conceptId === concept.id && entry.questionId === question.id,
                  )
                  const correctChoice = question.choices.find(
                    (choice) => choice.id === question.answer,
                  )
                  return (
                    <div key={question.id} className={styles.question}>
                      <p className={styles.questionText}>
                        <span className={styles.count}>{index + 1}.</span> {question.prompt}
                      </p>
                      <ul className={styles.choices}>
                        {question.choices.map((choice) => {
                          const state = !record
                            ? undefined
                            : choice.id === question.answer
                              ? 'correct'
                              : choice.id === record.choice
                                ? 'wrong'
                                : undefined
                          return (
                            <li key={choice.id}>
                              <button
                                type="button"
                                className={styles.choice}
                                data-state={state}
                                onClick={() => void answer(concept.id, question.id, choice.id)}
                              >
                                {choice.text}
                              </button>
                            </li>
                          )
                        })}
                      </ul>
                      {record ? (
                        <p className={styles.explanation}>
                          {record.correct ? (
                            <span className={styles.right}>Correct. </span>
                          ) : (
                            <span className={styles.wrong}>
                              Not quite — the answer is “{correctChoice?.text}”.{' '}
                            </span>
                          )}
                          {question.explanation}
                        </p>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            </article>
          )
        })}
      </div>
    </div>
  )
}
