import { Link } from 'react-router'
import { PageHeader } from '../components/PageHeader'
import styles from './pages.module.css'

const modules = [
  {
    name: 'Local persistence',
    detail:
      'SQLite history for tickets, attempts, scores, and progress, with migrations, backups, and import.',
    milestone: 'M1 · complete',
  },
  {
    name: 'Simulated environment',
    detail:
      'Fictional users, machines, DNS/DHCP, printers, and a simulated clock behind realistic tools.',
    milestone: 'M2 · complete',
  },
  {
    name: 'Ticket generator',
    detail:
      'Seeded tickets built from three scenario families. Every ticket injects a real fault into the simulated world.',
    milestone: 'M3 · complete',
  },
  {
    name: 'Scoring engine',
    detail:
      'Declarative rubrics over the action log and end state, with safety gates and an explained debrief.',
    milestone: 'M4 · complete',
  },
]

export function DashboardPage() {
  return (
    <>
      <PageHeader
        eyebrow="Milestones 1–4"
        title="Dashboard"
        description="The practice loop is open: pull a ticket, investigate the simulated machine, document your evidence, and get scored on the decision."
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
          <span className={styles.count}>4 modules</span>
        </div>

        <ul className={styles.cardGrid}>
          {modules.map((module) => (
            <li key={module.name} className={styles.card}>
              <span className={styles.statusReady}>Ready</span>
              <h3>{module.name}</h3>
              <p>{module.detail}</p>
              <span className={styles.milestone}>{module.milestone}</span>
            </li>
          ))}
        </ul>
      </section>

      <aside className={styles.notice}>
        <strong>Fictional environment.</strong> Tickets, users, hosts, and directory records are
        generated locally. Commands act on a simulated world only — nothing here touches a real
        machine or accepts a real credential.
      </aside>
    </>
  )
}
