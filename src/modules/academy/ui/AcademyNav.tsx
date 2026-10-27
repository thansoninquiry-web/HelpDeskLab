import { NavLink } from 'react-router'
import styles from './academy.module.css'

const sections = [
  { to: '/academy', label: 'Desk', end: true },
  { to: '/academy/tutorial', label: 'Tutorial', end: false },
  { to: '/academy/onsite', label: 'Onsite checklist', end: false },
  { to: '/academy/phrases', label: 'Spanish phrases', end: false },
] as const

/** The school desk's own tabs, so the app shell keeps one section for the module. */
export function AcademyNav() {
  return (
    <nav className={styles.nav} aria-label="Education IT sections">
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
