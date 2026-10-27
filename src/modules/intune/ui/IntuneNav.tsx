import { NavLink } from 'react-router'
import styles from './intune.module.css'

const sections = [
  { to: '/intune', label: 'Devices', end: true },
  { to: '/intune/policies', label: 'Compliance policies', end: false },
  { to: '/intune/apps', label: 'Apps', end: false },
  // The course behind the tickets, so a lesson is reachable from the console
  // without opening one first.
  { to: '/intune/course', label: 'Course', end: false },
  { to: '/intune/tickets', label: 'Practice tickets', end: false },
  { to: '/intune/terminal', label: 'Terminal', end: false },
] as const

/** The console's own tabs, so the app shell keeps one section for the module. */
export function IntuneNav() {
  return (
    <nav className={styles.nav} aria-label="Intune sections">
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
