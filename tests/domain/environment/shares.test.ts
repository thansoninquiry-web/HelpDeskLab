import { describe, expect, it } from 'vitest'
import { findCommand } from '../../../src/domain/environment/commands'
import { createLarkspurWorld } from '../../../src/domain/environment/fixtures'
import { sharesConsoleEntries } from '../../../src/domain/environment/shares'

describe('sharesConsoleEntries', () => {
  const world = createLarkspurWorld()
  const entries = sharesConsoleEntries(world)

  it('lists every share with where it lives', () => {
    expect(entries.map((entry) => entry.id).sort()).toEqual(
      world.shares.map((share) => share.id).sort(),
    )

    const share = world.shares[0]
    const entry = entries.find((candidate) => candidate.id === share?.id)
    expect(entry?.facts.map((fact) => fact.label)).toEqual(['Host', 'Path', 'Site'])
    expect(entry?.subtitle).toContain(share?.server ?? '')
  })

  it('withholds who can reach a share: no grant, group, or deny is listed', () => {
    const json = JSON.stringify(entries)

    for (const group of world.groups) {
      expect(json).not.toContain(group.name)
    }
    for (const user of world.users) {
      expect(json).not.toContain(user.samAccountName)
    }
    expect(json).not.toContain('LARKSPUR\\')
    for (const entry of entries) {
      expect(entry.note).toMatch(/not listed here/)
    }
  })

  it('maps both actions onto registered commands with declared inputs', () => {
    for (const entry of entries) {
      for (const action of entry.actions) {
        expect(action.args?.length ?? 0).toBeGreaterThan(0)
        const command = action.command(
          entry.id,
          action.args?.map(() => 'value'),
        )
        const [name] = command.split(' ')
        expect(findCommand(name ?? '')).toBeDefined()
        for (const argument of action.args ?? []) {
          expect(argument.validate('')).toBe(false)
          expect(argument.hint.length).toBeGreaterThan(0)
        }
      }
    }

    const operations = entries.find((entry) => entry.title === 'Operations')
    expect(operations?.actions.find((action) => action.id === 'share-access')?.command('x', ['tbrooks'])).toBe(
      'get-share-access Operations tbrooks',
    )
    expect(
      operations?.actions.find((action) => action.id === 'share-grant')?.command('x', ['FS-Ops-RW', 'tbrooks']),
    ).toBe('add-group-member FS-Ops-RW tbrooks')
  })
})
