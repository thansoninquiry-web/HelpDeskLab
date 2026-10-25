import { NavLink } from 'react-router'
import styles from './azure.module.css'

const sections = [
  { to: '/azure', label: 'Inventory', end: true },
  { to: '/azure/network', label: 'Network rules', end: false },
  { to: '/azure/access', label: 'Access', end: false },
  { to: '/azure/tickets', label: 'Practice tickets', end: false },
] as const

/** The console's own tabs, so the app shell keeps one section for the module. */
export function AzureNav() {
  return (
    <nav className={styles.nav} aria-label="Azure sections">
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
