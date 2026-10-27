import { NavLink } from 'react-router'
import styles from './netlab.module.css'

const sections = [
  { to: '/networking', label: 'Topology', end: true },
  { to: '/networking/tutorial', label: 'Tutorial', end: false },
  { to: '/networking/incidents', label: 'Incidents', end: false },
  { to: '/networking/concepts', label: 'Concepts', end: false },
  { to: '/networking/tools', label: 'Tools', end: false },
] as const

/** The lab's own tabs, so the app shell keeps one section for the module. */
export function NetlabNav() {
  return (
    <nav className={styles.nav} aria-label="Networking lab sections">
      {sections.map((section) => (
        <NavLink
          key={section.to}
          to={section.to}
          end={section.end}
          className={({ isActive }) =>
            isActive ? `${styles.navLink} ${styles.navLinkActive}` : styles.navLink
          }
        >
          {section.label}
        </NavLink>
      ))}
    </nav>
  )
}
