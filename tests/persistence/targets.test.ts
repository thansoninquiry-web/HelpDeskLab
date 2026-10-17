// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ConflictError, NotFoundError } from '../../src/persistence/errors'
import { makeJobTarget } from '../helpers/factories'
import { createTestPersistence, type TestPersistence } from '../helpers/sqlite'

describe('job targets repository', () => {
  let env: TestPersistence

  beforeEach(async () => {
    env = await createTestPersistence()
  })

  afterEach(async () => {
    await env.persistence.close()
  })

  it('round-trips a listing including its raw description', async () => {
    const target = makeJobTarget()
    await env.persistence.targets.create(target)

    expect(await env.persistence.targets.findById(target.id)).toEqual(target)
    expect(await env.persistence.targets.list()).toEqual([target])
  })

  it('lists newest first and preserves whitespace in the stored text', async () => {
    const older = makeJobTarget({ id: 'target-old', createdAt: 1_000, updatedAt: 1_000 })
    const newer = makeJobTarget({
      id: 'target-new',
      createdAt: 2_000,
      updatedAt: 2_000,
      rawDescription: 'Line one.\n\nLine two with DHCP  leases and a printer queue.',
      url: '',
      appliedOn: null,
      status: 'researching',
    })
    await env.persistence.targets.create(older)
    await env.persistence.targets.create(newer)

    const listed = await env.persistence.targets.list()

    expect(listed.map((target) => target.id)).toEqual(['target-new', 'target-old'])
    expect(listed[0]?.rawDescription).toContain('\n\n')
    expect(listed[0]?.appliedOn).toBeNull()
  })

  it('rejects duplicate ids without overwriting the first listing', async () => {
    await env.persistence.targets.create(makeJobTarget())

    await expect(
      env.persistence.targets.create(makeJobTarget({ company: 'Other Co' })),
    ).rejects.toBeInstanceOf(ConflictError)
    expect((await env.persistence.targets.findById('target-1'))?.company).toBe('Northwind Support')
  })

  it('updates status and removes listings, rejecting unknown ids', async () => {
    await env.persistence.targets.create(makeJobTarget())

    await env.persistence.targets.updateStatus('target-1', 'interviewing', 1_760_000_500_000)
    expect(await env.persistence.targets.findById('target-1')).toMatchObject({
      status: 'interviewing',
      updatedAt: 1_760_000_500_000,
    })

    await env.persistence.targets.remove('target-1')
    expect(await env.persistence.targets.findById('target-1')).toBeNull()

    await expect(env.persistence.targets.updateStatus('missing', 'offer', 1)).rejects.toBeInstanceOf(
      NotFoundError,
    )
    await expect(env.persistence.targets.remove('missing')).rejects.toBeInstanceOf(NotFoundError)
  })

  it('survives a database export and reimport', async () => {
    await env.persistence.targets.create(makeJobTarget())
    const bytes = await env.persistence.exportDatabase()

    await env.persistence.resetDatabase()
    expect(await env.persistence.targets.list()).toEqual([])

    await env.persistence.importDatabase(bytes)
    expect((await env.persistence.targets.list())[0]?.rawDescription).toContain('Reset passwords')
  })
})
