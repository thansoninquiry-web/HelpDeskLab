import { Link } from 'react-router'
import { PageHeader } from '../../../ui/components/PageHeader'
import { DSA_PATTERN_GROUPS } from '../data/patterns'
import { findDsaProblem } from '../data/problems'
import styles from './dsa.module.css'

/**
 * The cue-to-technique sheet, as a reference rather than a quiz.
 *
 * A cue usually licenses more than one defensible technique — a sorted array
 * makes both binary search and two pointers right — so asking "which one" would
 * be a trick. The sheet lists the options with their costs and the reason to
 * pick each, and links to the problem that drills it where the bank has one.
 */
export function DsaPatternsPage() {
  return (
    <div className={styles.page}>
      <p className={styles.back}>
        <Link to="/dsa">← All problems</Link>
      </p>

      <PageHeader
        eyebrow="Practice · pattern sheet"
        title="Pattern sheet"
        description="Read the cue in the question, then the techniques it licenses and what each costs. The costs keep their caveats: quickselect and quicksort are only linear or n log n on average, and a binary search tree is only logarithmic while it stays balanced."
      />

      <p className={styles.sheetNote}>
        A cue often licenses more than one technique, and the sheet is honest about that: a
        sorted array makes binary search the cheaper exact lookup and two pointers the
        cheaper full scan. Pick by what the question needs, not by which name you saw first.
        Entries marked <em>Practice</em> open a problem that uses them.
      </p>

      {DSA_PATTERN_GROUPS.map((group) => (
        <section key={group.id} className={styles.sheetGroup} aria-label={group.title}>
          <h2 className={styles.heading}>{group.title}</h2>
          <div className={styles.sheetEntries}>
            {group.entries.map((entry) => (
              <article key={entry.id} className={styles.sheetEntry}>
                <h3>{entry.cue}</h3>
                <p className={styles.sheetWhy}>{entry.why}</p>
                <ul className={styles.sheetTools}>
                  {entry.tools.map((tool) => {
                    const problem = tool.problemId ? findDsaProblem(tool.problemId) : undefined
                    return (
                      <li key={tool.name}>
                        <div className={styles.toolTop}>
                          <span className={styles.toolName}>{tool.name}</span>
                          <span className={styles.cost}>
                            <span>{tool.time}</span>
                            {tool.space ? <span>{tool.space}</span> : null}
                          </span>
                        </div>
                        <p>{tool.note}</p>
                        {problem ? (
                          <Link className={styles.toolLink} to={`/dsa/${problem.id}`}>
                            Practice: {problem.title}
                          </Link>
                        ) : null}
                      </li>
                    )
                  })}
                </ul>
              </article>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
