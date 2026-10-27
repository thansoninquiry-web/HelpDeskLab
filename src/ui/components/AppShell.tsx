import { Link, NavLink, Outlet, useLocation } from 'react-router'
import { ProgressChip } from './ProgressChip'
import { useScrolledPast } from './useScrolledPast'
import styles from './AppShell.module.css'

/**
 * Where the phone header folds to one row, and where it unfolds again.
 *
 * The distance between the two is wider than the section row it gives back
 * (3.2rem, about 64px at the largest text size), because collapsing the header
 * pulls the scroll position up by exactly that row: a single threshold inside
 * the gap would fold and unfold the header on the same scroll event.
 */
const COLLAPSE_AFTER_PX = 160
const RESTORE_BELOW_PX = 40

const navigation = [
  { to: '/', label: 'Modules', end: true, icon: 'grid' },
  { to: '/practice', label: 'Practice', end: false, icon: 'ticket' },
  { to: '/dsa', label: 'DSA', end: false, icon: 'code' },
  { to: '/languages', label: 'Languages', end: false, icon: 'book' },
  { to: '/intune', label: 'Intune', end: false, icon: 'device' },
  { to: '/azure', label: 'Azure', end: false, icon: 'cloud' },
  { to: '/networking', label: 'Networking', end: false, icon: 'network' },
  { to: '/desktop', label: 'Desktop', end: false, icon: 'desktop' },
  { to: '/targets', label: 'Job targets', end: false, icon: 'target' },
  { to: '/progress', label: 'Progress', end: false, icon: 'chart' },
  { to: '/settings', label: 'Settings', end: false, icon: 'gear' },
] as const

/** One line-icon set, drawn on a 24px grid like the reference consoles. */
function Icon({ name }: { name: (typeof navigation)[number]['icon'] }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.6,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  }

  if (name === 'grid') {
    return (
      <svg {...common}>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
    )
  }
  if (name === 'ticket') {
    return (
      <svg {...common}>
        <path d="M4 7h16v3a2 2 0 0 0 0 4v3H4v-3a2 2 0 0 0 0-4V7Z" />
        <path d="M12 7v10" strokeDasharray="1.6 2.4" />
      </svg>
    )
  }
  if (name === 'code') {
    // Chevrons and a slash: the DSA section is about the code interview.
    return (
      <svg {...common}>
        <path d="M8 7 3 12l5 5M16 7l5 5-5 5M14 4l-4 16" />
      </svg>
    )
  }
  if (name === 'book') {
    return (
      <svg {...common}>
        <path d="M4 4h6a2 2 0 0 1 2 2v14a2 2 0 0 0-2-2H4Z" />
        <path d="M20 4h-6a2 2 0 0 0-2 2v14a2 2 0 0 1 2-2h6Z" />
      </svg>
    )
  }
  if (name === 'target') {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="8" />
        <circle cx="12" cy="12" r="3.5" />
        <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
      </svg>
    )
  }
  if (name === 'device') {
    // A laptop outline: the Intune section is about managed devices.
    return (
      <svg {...common}>
        <rect x="3" y="5" width="18" height="11" rx="1.5" />
        <path d="M2 19h20" />
      </svg>
    )
  }
  if (name === 'cloud') {
    // A cloud outline: the Azure section is about the subscription behind the desk.
    return (
      <svg {...common}>
        <path d="M7 18h10a4 4 0 0 0 .6-7.96A6 6 0 0 0 6 11a3.5 3.5 0 0 0 1 7Z" />
      </svg>
    )
  }
  if (name === 'network') {
    // A switch with its access ports: the networking lab is the wire, not the cloud.
    return (
      <svg {...common}>
        <rect x="3" y="7" width="18" height="8" rx="1.5" />
        <path d="M7 15v4M12 15v4M17 15v4M7 7V4M17 7V4" />
      </svg>
    )
  }
  if (name === 'desktop') {
    // A tower and a panel: the bench is the machine, not the network.
    return (
      <svg {...common}>
        <rect x="3" y="4" width="12" height="16" rx="1.5" />
        <path d="M6 7h6M6 10h6M6 16h2" />
        <rect x="17" y="7" width="4" height="10" rx="1" />
      </svg>
    )
  }
  if (name === 'chart') {
    return (
      <svg {...common}>
        <path d="M4 19V5M4 19h16" />
        <path d="M8 15v-4M12 15V7M16 15v-6" />
      </svg>
    )
  }
  return (
    <svg {...common}>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 1.56V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.56-1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.56V3a2 2 0 1 1 4 0v.1A1.7 1.7 0 0 0 15 4.6a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9c.14.37.5.69.9.9h.1a2 2 0 1 1 0 4H21a1.7 1.7 0 0 0-1.6 1.1Z" />
    </svg>
  )
}

export function AppShell() {
  const { pathname } = useLocation()
  // Only the phone stylesheet reads this; the wider header is one row already.
  const scrolled = useScrolledPast(COLLAPSE_AFTER_PX, RESTORE_BELOW_PX)

  // A ticket is still practice: keep the queue tab lit while it is open.
  const isSectionActive = (to: string, routerSaysActive: boolean): boolean =>
    routerSaysActive || (to === '/practice' && pathname.startsWith('/ticket'))

  return (
    <div className={styles.shell} data-scrolled={scrolled ? 'true' : 'false'}>
      <a className={styles.skipLink} href="#main">
        Skip to content
      </a>

      <header className={styles.header}>
        <Link className={styles.brand} to="/">
          <img className={styles.logo} src="/icon.svg" alt="" width="30" height="30" />
          <span className={styles.brandText}>
            <span className={styles.name}>HelpDeskLab</span>
            <span className={styles.tagline}>Tier 1 practice lab</span>
          </span>
        </Link>

        <span className={styles.headerRule} aria-hidden="true" />

        <nav className={styles.nav} aria-label="Primary">
          {navigation.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                isSectionActive(item.to, isActive)
                  ? `${styles.navLink} ${styles.navLinkActive}`
                  : styles.navLink
              }
            >
              <span className={styles.navIcon} aria-hidden="true">
                <Icon name={item.icon} />
              </span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className={styles.headerStatus}>
          <ProgressChip />
        </div>
      </header>

      <div className={styles.body}>
        <aside className={styles.rail} aria-label="Sections">
          <div className={styles.railGroup}>
            {navigation.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                aria-label={`${item.label} section`}
                title={item.label}
                className={({ isActive }) =>
                  isSectionActive(item.to, isActive)
                    ? `${styles.railLink} ${styles.railLinkActive}`
                    : styles.railLink
                }
              >
                <Icon name={item.icon} />
              </NavLink>
            ))}
          </div>
          <span className={styles.railMark} aria-hidden="true">
            HD
          </span>
        </aside>

        <main id="main" className={styles.main}>
          <Outlet />
        </main>
      </div>
    </div>
  )
}
