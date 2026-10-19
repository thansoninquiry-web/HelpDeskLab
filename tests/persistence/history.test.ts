// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestPersistence, type TestPersistence } from '../helpers/sqlite'
import { makeAction, makeSession, makeTicket } from '../helpers/factories'

describe('history reads', () => {
  let env: TestPersistence

  beforeEach(async () => {
    env = await createTestPersistence()
  })

  afterEach(async () => {
    await env.persistence.close()
  })

  it('returns sessions newest first and validates the limit', async () => {
    const { persistence } = env
    await persistence.tickets.create(makeTicket())
    await persistence.sessions.create(makeSession('ticket-1', { id: 's-1', startedAt: 10 }))
    await persistence.sessions.create(makeSession('ticket-1', { id: 's-2', startedAt: 20 }))

    expect((await persistence.sessions.listRecent(10)).map((row) => row.id)).toEqual(['s-2', 's-1'])
    expect((await persistence.sessions.listRecent(1)).map((row) => row.id)).toEqual(['s-2'])
    await expect(persistence.sessions.listRecent(0)).rejects.toBeInstanceOf(RangeError)
  })

  it('returns actions newest first across sessions', async () => {
    const { persistence } = env
    await persistence.tickets.create(makeTicket())
    await persistence.sessions.create(makeSession('ticket-1', { id: 's-1' }))

    await persistence.actions.append(
      makeAction('s-1', { input: { command: 'ipconfig /all' } }),
    )
    await persistence.actions.append(
      makeAction('s-1', {
        kind: 'note',
        input: { noteKind: 'troubleshooting', text: 'Checked the resolver first.' },
      }),
    )

    const recent = await persistence.actions.listRecent(10)
    expect(recent).toHaveLength(2)
    expect(recent[0]?.kind).toBe('note')
    expect(recent[1]?.seq).toBe(1)
    expect(await persistence.actions.listRecent(1)).toHaveLength(1)
    await expect(persistence.actions.listRecent(0)).rejects.toBeInstanceOf(RangeError)
  })
})
