import { NavLink } from 'react-router'
import styles from './desktop.module.css'

const sections = [
  { to: '/desktop', label: 'Cases', end: true },
  { to: '/desktop/tutorial', label: 'Tutorial', end: false },
  { to: '/desktop/bench', label: 'Bench', end: false },
  { to: '/desktop/tools', label: 'Tools', end: false },
] as const

/** The bench's own tabs, so the app shell keeps one section for the module. */
export function DesktopNav() {
  return (
    <nav className={styles.nav} aria-label="Desktop support sections">
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
