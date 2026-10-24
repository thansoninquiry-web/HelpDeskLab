import { describe, expect, it } from 'vitest'
import type { ConsoleEntry } from '../../../src/domain/environment/console'
import {
  consoleDigest,
  consoleHasNews,
  nextConsoleWithNews,
  noteConsoleRead,
  type ConsolePage,
} from '../../../src/domain/environment/consoleNews'
import type { DesktopView } from '../../../src/domain/environment/remoteDesktop'
import type { TopologyView } from '../../../src/domain/environment/topology'

function entry(overrides: Partial<ConsoleEntry> & { id: string }): ConsoleEntry {
  return {
    title: overrides.id,
    subtitle: 'dwhitfield · Finance',
    facts: [{ label: 'Site', value: 'Larkspur HQ' }],
    groups: [],
    actions: [],
    ...overrides,
  }
}

function page(overrides: Partial<ConsolePage> = {}): ConsolePage {
  return {
    entries: [entry({ id: 'dwhitfield' }), entry({ id: 'mchen' })],
    topology: null,
    ...overrides,
  }
}

function topology(state: 'unknown' | 'proved' | 'failed'): TopologyView {
  return {
    originHostname: 'LT-4471',
    originSiteName: 'Larkspur HQ',
    groups: [
      {
        id: 'site:hq',
        kind: 'site',
        title: 'Larkspur HQ',
        subtitle: '10.20.4.0/24 · gateway 10.20.4.1',
        checks: [
          {
            id: 'site:hq:gateway',
            label: 'Gateway',
            command: 'ping 10.20.4.1',
            state,
            evidence: state === 'proved' ? 'Reply from 10.20.4.1: bytes=32 time<1ms TTL=64' : null,
            atMs: state === 'proved' ? 1_760_000_200_000 : null,
            entryId: 'hq',
            actionId: 'ping-gateway',
          },
        ],
      },
    ],
    proved: state === 'proved' ? 1 : 0,
    failed: state === 'failed' ? 1 : 0,
    total: 1,
  }
}

function desktop(overrides: Partial<DesktopView> = {}): DesktopView {
  return {
    entryId: 'LT-4472',
    hostname: 'LT-4472',
    userName: 'Marcus Chen',
    userAccount: 'mchen',
    signedIn: true,
    siteName: 'Larkspur HQ',
    domain: 'LARKSPUR',
    os: 'Windows 11 Enterprise 23H2',
    ipMode: 'dhcp',
    ipAddress: '10.20.4.58',
    dnsServers: ['10.20.4.10'],
    diskFreePercent: 41,
    lastUpdateDays: 6,
    pendingReboot: false,
    spoolerStatus: 'running',
    printers: [
      {
        id: 'PRN-FIN-01',
        name: 'PRN-FIN-01',
        model: 'HP LaserJet Pro M404dn',
        status: 'online',
        isDefault: true,
        jobs: [],
      },
    ],
    clock: 1_760_000_200_000,
    sessionStartedAt: 1_760_000_100_000,
    openDesktops: [
      { entryId: 'LT-4472', hostname: 'LT-4472', userName: 'Marcus Chen', focused: true, startedAt: 1_760_000_100_000 },
    ],
    ...overrides,
  }
}

describe('consoleDigest', () => {
  it('reads the same page the same way', () => {
    expect(consoleDigest(page())).toBe(consoleDigest(page()))
  })

  it('changes when anything a console prints changes', () => {
    const base = consoleDigest(page())
    expect(consoleDigest(page({ entries: [entry({ id: 'dwhitfield', subtitle: 'dwhitfield · Sales' })] }))).not.toBe(base)
    expect(
      consoleDigest(
        page({ entries: [entry({ id: 'dwhitfield', facts: [{ label: 'Site', value: 'North Warehouse' }] })] }),
      ),
    ).not.toBe(base)
    expect(consoleDigest(page({ entries: [entry({ id: 'dwhitfield', note: 'State withheld' })] }))).not.toBe(base)
  })

  it('changes when history, an action, or a map link changes', () => {
    const base = consoleDigest(page())
    expect(
      consoleDigest(
        page({
          entries: [
            entry({
              id: 'dwhitfield',
              history: [{ kind: 'command', atMs: 1, text: 'unlock-account dwhitfield', ticket: 'Lockout' }],
            }),
          ],
        }),
      ),
    ).not.toBe(base)
    expect(
      consoleDigest(
        page({
          entries: [
            {
              ...entry({ id: 'dwhitfield' }),
              actions: [
                { id: 'unlock', label: 'Unlock the account', detail: 'Clears the lock', command: () => 'unlock-account dwhitfield' },
              ],
            },
          ],
        }),
      ),
    ).not.toBe(base)
    expect(consoleDigest(page({ topology: topology('unknown') }))).not.toBe(base)
    expect(consoleDigest(page({ topology: topology('proved') }))).not.toBe(
      consoleDigest(page({ topology: topology('unknown') })),
    )
  })

  it('notices a desktop change that changes what the shell shows', () => {
    const running = consoleDigest({ entries: [], topology: null, desktop: desktop() })
    const stopped = consoleDigest({
      entries: [],
      topology: null,
      desktop: desktop({ spoolerStatus: 'stopped' }),
    })
    const printed = consoleDigest({
      entries: [],
      topology: null,
      desktop: desktop({
        printers: [
          {
            id: 'PRN-FIN-01',
            name: 'PRN-FIN-01',
            model: 'HP LaserJet Pro M404dn',
            status: 'online',
            isDefault: true,
            jobs: [{ id: 'job-1', document: 'Invoice 8841.pdf', owner: 'mchen', status: 'printing' }],
          },
        ],
      }),
    })
    expect(stopped).not.toBe(running)
    expect(printed).not.toBe(running)
    expect(printed).not.toBe(stopped)
  })

  it('stays quiet when only the clock moved', () => {
    // Every command advances the clock, and the fake desktop draws one. A digest
    // that followed it would mark every tab as news after every single command.
    const first = consoleDigest({ entries: [], topology: null, desktop: desktop() })
    const later = consoleDigest({
      entries: [],
      topology: null,
      desktop: desktop({ clock: 1_760_000_900_000, sessionStartedAt: 1_760_000_800_000 }),
    })
    expect(later).toBe(first)
  })

  it('stays quiet when only the filter ids moved', () => {
    // Filter ids narrow the list; they are never printed, so a change in them is
    // not something the console has to tell the learner about.
    const base = consoleDigest(page({ entries: [entry({ id: 'dwhitfield' })] }))
    expect(
      consoleDigest(
        page({ entries: [entry({ id: 'dwhitfield', filterIds: ['locked', 'finance'] })] }),
      ),
    ).toBe(base)
  })
})

describe('noteConsoleRead', () => {
  it('never calls the first read of a console news', () => {
    const reads = noteConsoleRead({}, { id: 'mail-admin', digest: 'a' }, false)
    expect(consoleHasNews(reads, 'mail-admin', 'a')).toBe(false)
  })

  it('keeps the digest the learner read when a background console changes', () => {
    const reads = noteConsoleRead({}, { id: 'mail-admin', digest: 'a' }, false)
    const after = noteConsoleRead(reads, { id: 'mail-admin', digest: 'b' }, false)
    expect(consoleHasNews(after, 'mail-admin', 'b')).toBe(true)
    // Nothing changed in the map, so state does not churn on a reread.
    expect(after).toBe(reads)
  })

  it('files the change for the console being looked at', () => {
    const reads = noteConsoleRead({}, { id: 'mail-admin', digest: 'a' }, false)
    const after = noteConsoleRead(reads, { id: 'mail-admin', digest: 'b' }, true)
    expect(consoleHasNews(after, 'mail-admin', 'b')).toBe(false)
    expect(after['mail-admin']).toBe('b')
  })

  it('leaves the map alone when the read found the same page', () => {
    const reads = noteConsoleRead({}, { id: 'directory', digest: 'a' }, true)
    expect(noteConsoleRead(reads, { id: 'directory', digest: 'a' }, true)).toBe(reads)
  })

  it('keeps one console out of another console’s business', () => {
    const reads = noteConsoleRead(
      noteConsoleRead({}, { id: 'directory', digest: 'a' }, false),
      { id: 'mail-admin', digest: 'x' },
      false,
    )
    const after = noteConsoleRead(reads, { id: 'mail-admin', digest: 'y' }, false)
    expect(consoleHasNews(after, 'directory', 'a')).toBe(false)
    expect(consoleHasNews(after, 'mail-admin', 'y')).toBe(true)
  })
})

describe('nextConsoleWithNews', () => {
  const open = ['directory', 'mail-admin', 'printers'] as const
  const read = { directory: 'a', 'mail-admin': 'a', printers: 'a' }

  it('takes the next tab along the strip, not the first one marked', () => {
    const digests = { directory: 'b', 'mail-admin': 'b', printers: 'b' }
    expect(nextConsoleWithNews(open, 'directory', read, digests)).toBe('mail-admin')
  })

  it('wraps round to the front of the strip', () => {
    const digests = { directory: 'b', 'mail-admin': 'a', printers: 'b' }
    expect(nextConsoleWithNews(open, 'printers', read, digests)).toBe('directory')
  })

  it('starts at the front when no tab is in front', () => {
    const digests = { directory: 'a', 'mail-admin': 'b', printers: 'a' }
    expect(nextConsoleWithNews(open, null, read, digests)).toBe('mail-admin')
  })

  it('comes back round to the tab in front when it is the only one with news', () => {
    // Its pane was behind the terminal, or another tab, when the change arrived.
    const digests = { directory: 'b', 'mail-admin': 'a', printers: 'a' }
    expect(nextConsoleWithNews(open, 'directory', read, digests)).toBe('directory')
  })

  it('finds nothing when every tab has been read', () => {
    const digests = { directory: 'a', 'mail-admin': 'a', printers: 'a' }
    expect(nextConsoleWithNews(open, 'directory', read, digests)).toBeNull()
  })

  it('counts a tab whose page has not arrived as read', () => {
    // A tab that is still loading has nothing to point at, so it is not a stop
    // on the way, even though the tab after it does have news.
    expect(nextConsoleWithNews(open, 'directory', read, { 'mail-admin': 'b' })).toBe('mail-admin')
    expect(nextConsoleWithNews(open, 'printers', read, { 'mail-admin': 'a' })).toBeNull()
  })
})

describe('consoleHasNews', () => {
  it('reports nothing for a console that has never been read', () => {
    expect(consoleHasNews({}, 'directory', 'a')).toBe(false)
  })

  it('reports nothing for a console that has not been read yet', () => {
    // The tab is open but its view has not arrived: nothing to point at.
    expect(consoleHasNews({ directory: 'a' }, 'directory', undefined)).toBe(false)
  })

  it('reports the change once the page moves', () => {
    expect(consoleHasNews({ directory: 'a' }, 'directory', 'b')).toBe(true)
  })
})
