import { Link, NavLink, Outlet } from 'react-router'
import styles from './AppShell.module.css'

const navigation = [
  { to: '/', label: 'Dashboard' },
  { to: '/practice', label: 'Practice' },
  { to: '/progress', label: 'Progress' },
  { to: '/settings', label: 'Settings' },
]

export function AppShell() {
  return (
    <div className={styles.shell}>
      <a className={styles.skipLink} href="#main">
        Skip to content
      </a>

      <header className={styles.header}>
        <Link className={styles.brand} to="/">
          <img className={styles.logo} src="/icon.svg" alt="" width="32" height="32" />
          <span className={styles.brandText}>
            <span className={styles.name}>HelpDeskLab</span>
            <span className={styles.tagline}>Tier 1 practice lab</span>
          </span>
        </Link>

        <nav className={styles.nav} aria-label="Primary">
          {navigation.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                isActive ? `${styles.navLink} ${styles.navLinkActive}` : styles.navLink
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <span className={styles.badge}>M4 · practice loop</span>
      </header>

      <main id="main" className={styles.main}>
        <Outlet />
      </main>

      <footer className={styles.footer}>
        Local-first · fictional data only · no telemetry
      </footer>
    </div>
  )
}
