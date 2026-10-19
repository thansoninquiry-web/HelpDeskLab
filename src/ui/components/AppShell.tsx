import { useEffect, useRef } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router'
import { ProgressChip } from './ProgressChip'
import styles from './AppShell.module.css'

const navigation = [
  { to: '/', label: 'Modules', end: true, icon: 'grid' },
  { to: '/practice', label: 'Practice', end: false, icon: 'ticket' },
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
  if (name === 'target') {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="8" />
        <circle cx="12" cy="12" r="3.5" />
        <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
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
  const navRef = useRef<HTMLElement | null>(null)

  /**
   * At phone width the sections live on a strip that scrolls. Put the section
   * the learner is on in the middle of it, so the strip never rests with a
   * label sliced by the edge and the current one is always readable.
   */
  useEffect(() => {
    const nav = navRef.current
    if (!nav || nav.scrollWidth <= nav.clientWidth) {
      return
    }

    // The router marks the match; the ticket override marks practice itself.
    const current =
      nav.querySelector<HTMLElement>('[aria-current="page"]') ??
      nav.querySelector<HTMLElement>(`.${styles.navLinkActive}`)
    if (!current) {
      return
    }

    const left = Math.max(0, current.offsetLeft - (nav.clientWidth - current.offsetWidth) / 2)
    if (typeof nav.scrollTo === 'function') {
      nav.scrollTo({ left })
    } else {
      nav.scrollLeft = left
    }
  }, [pathname])

  // A ticket is still practice: keep the queue tab lit while it is open.
  const isSectionActive = (to: string, routerSaysActive: boolean): boolean =>
    routerSaysActive || (to === '/practice' && pathname.startsWith('/ticket'))

  return (
    <div className={styles.shell}>
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

        <nav className={styles.nav} aria-label="Primary" ref={navRef}>
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
