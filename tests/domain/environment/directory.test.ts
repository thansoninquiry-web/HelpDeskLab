import { describe, expect, it } from 'vitest'
import {
  ACCOUNT_CONSOLE_ACTIONS,
  directoryConsoleEntries,
  findConsoleAction,
  listDirectoryRecords,
} from '../../../src/domain/environment/directory'
import { filterConsoleEntries, searchConsoleEntries } from '../../../src/domain/environment/console'
import { findCommand } from '../../../src/domain/environment/commands'
import { createLarkspurWorld } from '../../../src/domain/environment/fixtures'

describe('listDirectoryRecords', () => {
  const world = createLarkspurWorld()

  it('lists every account sorted by name and resolves site and devices', () => {
    const records = listDirectoryRecords(world)

    expect(records).toHaveLength(world.users.length)
    expect(records.map((record) => record.displayName)).toEqual(
      [...records.map((record) => record.displayName)].sort((left, right) =>
        left.localeCompare(right),
      ),
    )

    const withDevice = records.find((record) => record.devices.length > 0)
    expect(withDevice?.siteName.length).toBeGreaterThan(0)
    expect(withDevice?.devices[0]?.hostname.length).toBeGreaterThan(0)
  })

  it('never exposes account state, group membership, or MFA', () => {
    const record = listDirectoryRecords(world)[0]
    const keys = Object.keys(record ?? {}).sort()

    expect(keys).toEqual([
      'department',
      'devices',
      'displayName',
      'email',
      'employeeId',
      'managerName',
      'samAccountName',
      'siteName',
    ])
    expect(JSON.stringify(record)).not.toMatch(/"(status|locked|disabled|groups|mfa)/i)
  })
})

describe('directoryConsoleEntries', () => {
  const world = createLarkspurWorld()

  it('projects each account into the shared console shape', () => {
    const entries = directoryConsoleEntries(world)

    expect(entries).toHaveLength(world.users.length)
    const entry = entries[0]
    expect(entry).toBeDefined()
    expect(Object.keys(entry ?? {}).sort()).toEqual([
      'actions',
      'facts',
      'filterIds',
      'groups',
      'history',
      'id',
      'note',
      'subtitle',
      'title',
    ])
    expect(entry?.history).toEqual([])
    expect(entry?.actions).toEqual(ACCOUNT_CONSOLE_ACTIONS)
    expect(entry?.groups[0]?.label).toBe('Devices')
    expect(entry?.facts.map((fact) => fact.label)).toEqual([
      'Employee ID',
      'Department',
      'Site',
      'Manager',
    ])
    // The filter can narrow by live state, but the record still prints none of it.
    expect(entry?.note).toMatch(/withholds account state/)
  })

  it('filters accounts by the state the world holds right now', () => {
    const world = createLarkspurWorld()
    const entries = directoryConsoleEntries(world)

    expect(filterConsoleEntries(entries, 'locked').map((entry) => entry.id)).toContain('mchen')
    expect(
      filterConsoleEntries(entries, 'password-expired').map((entry) => entry.id),
    ).toContain('asingh')
    expect(filterConsoleEntries(entries, 'disabled').map((entry) => entry.id)).toContain('jortiz')
    expect(filterConsoleEntries(entries, null)).toEqual(entries)

    // The projection reads the world, not a fixture: clearing the lock removes
    // the account from the filter the next time the console is opened.
    const marc = world.users.find((user) => user.samAccountName === 'mchen')
    expect(marc?.status).toBe('locked')
    if (marc) {
      marc.status = 'active'
    }
    expect(
      filterConsoleEntries(directoryConsoleEntries(world), 'locked').map((entry) => entry.id),
    ).not.toContain('mchen')
  })

  it('sticks the desk history the caller passed onto the matching record only', () => {
    const entries = directoryConsoleEntries(world, {
      mchen: [
        {
          kind: 'ticket',
          atMs: 1_000,
          text: 'Marcus is locked out',
          ticket: 'Password and account access',
          outcome: 'resolved',
        },
      ],
    })

    expect(entries.find((entry) => entry.id === 'mchen')?.history).toEqual([
      {
        kind: 'ticket',
        atMs: 1_000,
        text: 'Marcus is locked out',
        ticket: 'Password and account access',
        outcome: 'resolved',
      },
    ])
    expect(entries.find((entry) => entry.id === 'dwhitfield')?.history).toEqual([])
  })

  it('searches through the same generic console search as any other tool', () => {
    const entries = directoryConsoleEntries(world)
    const record = listDirectoryRecords(world).find((candidate) => candidate.devices.length > 0)
    expect(record).toBeDefined()
    if (!record) {
      return
    }

    expect(searchConsoleEntries(entries, '   ')).toHaveLength(entries.length)
    expect(searchConsoleEntries(entries, record.samAccountName.toUpperCase())).toContainEqual(
      entries.find((entry) => entry.id === record.samAccountName),
    )
    expect(searchConsoleEntries(entries, record.department).length).toBeGreaterThan(0)
    expect(
      searchConsoleEntries(entries, record.devices[0]?.hostname ?? '').map((entry) => entry.id),
    ).toContain(record.samAccountName)
    expect(searchConsoleEntries(entries, 'zzzz-no-such-person')).toEqual([])
  })
})

describe('account console actions', () => {
  it('maps every action onto a registered command', () => {
    for (const action of ACCOUNT_CONSOLE_ACTIONS) {
      const command = action.command('someone')
      const [name] = command.split(' ')
      expect(findCommand(name ?? '')).toBeDefined()
      expect(command).toMatch(/^[a-z-]+ someone$/)
    }
  })

  it('looks actions up by id and rejects unknown ids', () => {
    expect(findConsoleAction('reset-mfa')?.command('abc')).toBe('reset-mfa abc')
    expect(findConsoleAction('rm-rf')).toBeUndefined()
  })
})
