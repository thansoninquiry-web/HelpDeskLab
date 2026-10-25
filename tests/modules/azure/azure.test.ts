// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest'
import { applyResourceAction } from '../../../src/modules/azure/logic/actions'
import {
  allowsPort,
  diagnose,
  findingsFor,
  isPortOpenToInternet,
  monthlyCost,
  roleOver,
} from '../../../src/modules/azure/logic/diagnostics'
import { AzureStore } from '../../../src/modules/azure/persistence/store'
import { AzureService } from '../../../src/modules/azure/service'
import { AZURE_TICKET_TEMPLATES } from '../../../src/modules/azure/tickets/templates'
import {
  isAzureTicketComplete,
  registerAzureTicketTemplates,
} from '../../../src/modules/azure/tickets/registry'
import type { AzureState } from '../../../src/modules/azure/types'
import { runMigrations } from '../../../src/persistence/migrations'
import { createSqliteDriver, type SqliteDriver } from '../../../src/persistence/sqlite'
import { loadWasmBinary } from '../../helpers/sqlite'

const NOW = Date.UTC(2026, 9, 24, 12, 0, 0)

function resource(state: AzureState, id: string) {
  const found = state.resources.find((entry) => entry.id === id)
  if (!found) {
    throw new Error(`missing resource ${id}`)
  }
  return found
}

async function seeded(): Promise<{ db: SqliteDriver; store: AzureStore; state: AzureState }> {
  const db = await createSqliteDriver(undefined, { wasmBinary: loadWasmBinary() })
  runMigrations(db)
  const store = new AzureStore({
    read: async (operation) => operation(db),
    write: async (operation) => operation(db),
  })
  return { db, store, state: await store.ensureSeeded() }
}

describe('the seeded subscription', () => {
  let state: AzureState

  beforeEach(async () => {
    state = (await seeded()).state
  })

  it('seeds four resource groups, thirteen resources, five rules and five assignments', () => {
    expect(state.resourceGroups).toHaveLength(4)
    expect(state.resources).toHaveLength(13)
    expect(state.nsgRules).toHaveLength(5)
    expect(state.roles).toHaveLength(5)
    expect(state.resources.filter((entry) => entry.properties.kind === 'vm')).toHaveLength(6)
    expect(state.resources.filter((entry) => entry.properties.kind === 'storage')).toHaveLength(3)
    expect(state.resources.filter((entry) => entry.properties.kind === 'nsg')).toHaveLength(2)
    expect(state.resources.filter((entry) => entry.properties.kind === 'webapp')).toHaveLength(2)
  })

  it('names the setting behind each ticket in the record itself', () => {
    // A machine switched off at the platform, not a broken one.
    expect(resource(state, 'res-vm-fin-01').properties).toMatchObject({ power: 'deallocated' })
    // Anonymous reads on an account holding customer documents.
    expect(diagnose(resource(state, 'res-st-apps'), state)).toContain('Public blob access is on')
    // A management port with a standing invitation attached.
    expect(diagnose(resource(state, 'res-nsg-jump'), state)).toContain(
      'Management port 3389 is open to the internet',
    )
    // The role over the production group belongs on the record the access
    // ticket reads, even though it is not a setting of the machine itself.
    expect(diagnose(resource(state, 'res-vm-app-01'), state)).toContain(
      'Rowan Vale (contractor) holds Owner at resource-group scope',
    )
    // The group in front of the portal has no rule for 443 at all.
    expect(allowsPort(state.nsgRules, 'res-nsg-web', 443)).toBe(false)
    expect(findingsFor(resource(state, 'res-nsg-web'), state)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ text: expect.stringContaining('Nothing allows 443') }),
      ]),
    )
  })

  it('prices a deallocated machine at its disks rather than its compute', () => {
    const running = resource(state, 'res-vm-app-01')
    const stopped = resource(state, 'res-vm-fin-01')
    expect(monthlyCost(running)).toBeGreaterThan(monthlyCost(stopped))
    expect(monthlyCost(stopped)).toBe(8)
  })
})

describe('resource actions', () => {
  let state: AzureState

  beforeEach(async () => {
    state = (await seeded()).state
  })

  it('starts a deallocated machine and refuses to start a running one', () => {
    const started = applyResourceAction(state, {
      resourceId: 'res-vm-fin-01',
      action: 'start',
      now: NOW,
    })
    expect(started.status).toBe('applied')
    expect(resource(started.state, 'res-vm-fin-01').properties).toMatchObject({
      power: 'running',
    })

    const again = applyResourceAction(started.state, {
      resourceId: 'res-vm-fin-01',
      action: 'start',
      now: NOW,
    })
    expect(again.status).toBe('refused')
    expect(again.summary).toContain('already running')
  })

  it('deallocates an idle machine and refuses an action that does not fit it', () => {
    const stopped = applyResourceAction(state, {
      resourceId: 'res-vm-dev-04',
      action: 'deallocate',
      now: NOW,
    })
    expect(resource(stopped.state, 'res-vm-dev-04').properties).toMatchObject({
      power: 'deallocated',
    })
    expect(stopped.notes.join(' ')).toContain('Compute billing has stopped')

    const wrong = applyResourceAction(state, {
      resourceId: 'res-st-apps',
      action: 'deallocate',
      now: NOW,
    })
    expect(wrong.status).toBe('refused')
    expect(wrong.summary).toContain('not a virtual machine')
  })

  it('opens a port with a new inbound rule and refuses a duplicate', () => {
    const opened = applyResourceAction(state, {
      resourceId: 'res-nsg-web',
      action: 'open-port',
      now: NOW,
      port: 443,
    })
    expect(opened.status).toBe('applied')
    expect(isPortOpenToInternet(opened.state.nsgRules, 'res-nsg-web', 443)).toBe(true)
    // The rule that was already there is untouched: this is an addition, not a
    // replacement of the group.
    expect(allowsPort(opened.state.nsgRules, 'res-nsg-web', 80)).toBe(true)

    const again = applyResourceAction(opened.state, {
      resourceId: 'res-nsg-web',
      action: 'open-port',
      now: NOW,
      port: 443,
    })
    expect(again.status).toBe('refused')
  })

  it('closes a management port by removing the rule that allowed it', () => {
    const closed = applyResourceAction(state, {
      resourceId: 'res-nsg-jump',
      action: 'close-port',
      now: NOW,
      port: 3389,
    })
    expect(closed.status).toBe('applied')
    expect(isPortOpenToInternet(closed.state.nsgRules, 'res-nsg-jump', 3389)).toBe(false)
    // The other rule on the group survives.
    expect(allowsPort(closed.state.nsgRules, 'res-nsg-jump', 443)).toBe(true)

    const again = applyResourceAction(closed.state, {
      resourceId: 'res-nsg-jump',
      action: 'close-port',
      now: NOW,
      port: 3389,
    })
    expect(again.status).toBe('refused')
  })

  it('turns off public blobs, turns on retention and raises TLS', () => {
    const restricted = applyResourceAction(state, {
      resourceId: 'res-st-apps',
      action: 'restrict-public-access',
      now: NOW,
    })
    expect(resource(restricted.state, 'res-st-apps').properties).toMatchObject({
      publicBlobAccess: false,
    })

    const retained = applyResourceAction(state, {
      resourceId: 'res-st-backups',
      action: 'enable-soft-delete',
      now: NOW,
    })
    expect(resource(retained.state, 'res-st-backups').properties).toMatchObject({
      softDeleteDays: 30,
    })

    const tls = applyResourceAction(state, {
      resourceId: 'res-st-logs',
      action: 'require-tls',
      now: NOW,
    })
    expect(resource(tls.state, 'res-st-logs').properties).toMatchObject({ tlsMin: '1.2' })
  })

  it('scales the free plan up and refuses to scale a paid one', () => {
    const scaled = applyResourceAction(state, {
      resourceId: 'res-app-portal',
      action: 'scale-up',
      now: NOW,
    })
    expect(resource(scaled.state, 'res-app-portal').properties).toMatchObject({
      planSku: 'Standard',
    })

    const again = applyResourceAction(scaled.state, {
      resourceId: 'res-app-portal',
      action: 'scale-up',
      now: NOW,
    })
    expect(again.status).toBe('refused')
  })

  it('shrinks an over-broad role without removing the work', () => {
    const changed = applyResourceAction(state, {
      resourceId: 'res-vm-app-01',
      action: 'assign-role',
      now: NOW,
      principal: 'usr-contractor',
      role: 'Contributor',
    })
    expect(changed.status).toBe('applied')
    expect(roleOver(changed.state, 'rg-harbour-prod', 'usr-contractor')).toBe('Contributor')
    // The assignment was replaced rather than duplicated.
    expect(
      changed.state.roles.filter(
        (entry) =>
          entry.scope === 'rg-harbour-prod' && entry.principal === 'usr-contractor',
      ),
    ).toHaveLength(1)

    const unchanged = applyResourceAction(changed.state, {
      resourceId: 'res-vm-app-01',
      action: 'assign-role',
      now: NOW,
      principal: 'usr-contractor',
      role: 'Contributor',
    })
    expect(unchanged.status).toBe('refused')
  })

  it('deletes a machine on request, and takes the rest with a resource group', () => {
    const deleted = applyResourceAction(state, {
      resourceId: 'res-vm-build-02',
      action: 'delete-vm',
      now: NOW,
    })
    expect(resource(deleted.state, 'res-vm-build-02').deleted).toBe(true)
    // A tombstone takes no further action, and the refusal is written down.
    const again = applyResourceAction(deleted.state, {
      resourceId: 'res-vm-build-02',
      action: 'start',
      now: NOW,
    })
    expect(again.status).toBe('refused')

    const group = applyResourceAction(state, {
      resourceId: 'res-vm-app-01',
      action: 'delete-resource-group',
      now: NOW,
    })
    // Everything in production is gone, including its rules and assignments.
    expect(
      group.state.resources
        .filter((entry) => entry.resourceGroupId === 'rg-harbour-prod')
        .every((entry) => entry.deleted === true),
    ).toBe(true)
    expect(group.state.nsgRules.every((rule) => !rule.nsgId.startsWith('res-nsg'))).toBe(true)
    expect(group.state.roles.every((entry) => entry.scope !== 'rg-harbour-prod')).toBe(true)
    expect(group.notes.join(' ')).toContain('Nothing in that group can be recovered')
  })
})

describe('tickets and scoring', () => {
  let state: AzureState
  let service: AzureService

  beforeEach(async () => {
    const setup = await seeded()
    state = setup.state
    service = new AzureService(setup.store, () => NOW)
  })

  it('offers nine tickets through the registration seam', () => {
    const offered: string[] = []
    const returned = registerAzureTicketTemplates({
      offer: (template) => offered.push(template.id),
    })
    expect(returned).toHaveLength(9)
    expect(offered).toEqual(AZURE_TICKET_TEMPLATES.map((template) => template.id))
  })

  it('closes only when the subscription agrees the ticket is done', async () => {
    expect(isAzureTicketComplete('tpl-nsg-open-rdp', state)).toBe(false)

    const result = await service.act({
      resourceId: 'res-nsg-jump',
      action: 'close-port',
      port: 3389,
    })
    expect(isAzureTicketComplete('tpl-nsg-open-rdp', result.state)).toBe(true)
  })

  it('finishes each ticket by its reference action, with nothing else', async () => {
    for (const template of AZURE_TICKET_TEMPLATES) {
      const action = template.expectedActions[0]
      if (!action) {
        throw new Error(`${template.id} has no reference action`)
      }
      const fresh = (await seeded()).state
      const outcome = applyResourceAction(fresh, {
        resourceId: template.resourceId,
        action,
        now: NOW,
        port:
          action === 'open-port' || action === 'close-port'
            ? template.id.includes('rdp')
              ? 3389
              : 443
            : undefined,
        principal: action === 'assign-role' ? 'usr-contractor' : undefined,
        role: action === 'assign-role' ? 'Contributor' : undefined,
      })
      expect(template.verify(
        outcome.state.resources.find((entry) => entry.id === template.resourceId) ??
          resource(fresh, template.resourceId),
        outcome.state,
      ), `${template.id} after ${action}`).toBe(true)
    }
  })

  it('records the read step without changing the resource', async () => {
    const before = resource(state, 'res-st-apps')
    const result = await service.review('res-st-apps')

    expect(result.summary).toContain('Public blob access is on')
    expect(result.state.events.at(-1)?.action).toBe('review')
    expect(resource(result.state, 'res-st-apps')).toEqual(before)
  })

  it('awards full marks for the reference path', async () => {
    const startedAt = NOW - 60_000
    await service.review('res-st-apps')
    await service.act({ resourceId: 'res-st-apps', action: 'restrict-public-access' })
    const { score } = await service.score('tpl-storage-public', startedAt)

    expect(score.resolved).toBe(true)
    expect(score.total).toBe(100)
    expect(score.band).toBe('strong')
    expect(score.deductions).toHaveLength(0)
    expect(score.categoryScores.diagnosis).toEqual({ earned: 10, possible: 10 })
    expect(score.categoryScores.resolution).toEqual({ earned: 75, possible: 75 })
    expect(score.categoryScores.safety).toEqual({ earned: 15, possible: 15 })
    expect(score.categoryScores.documentation.possible).toBe(0)
  })

  it('withholds the diagnosis points when the change comes before the read', async () => {
    const startedAt = NOW - 60_000
    await service.act({ resourceId: 'res-st-apps', action: 'restrict-public-access' })
    await service.review('res-st-apps')
    const { score } = await service.score('tpl-storage-public', startedAt)

    expect(score.total).toBe(90)
    expect(score.categoryScores.diagnosis).toEqual({ earned: 0, possible: 10 })
    expect(score.items.find((item) => item.id === 'read-first')?.passed).toBe(false)
  })

  it('charges for the resource group a security ticket never asked to delete', async () => {
    const startedAt = NOW - 60_000
    await service.act({ resourceId: 'res-st-apps', action: 'delete-resource-group' })
    const { score } = await service.score('tpl-storage-public', startedAt)

    // The resource is gone, so the ticket cannot be resolved; the deletion is
    // charged in full.
    expect(score.resolved).toBe(false)
    expect(score.penalty).toBe(50)
    expect(score.categoryScores.safety).toEqual({ earned: 0, possible: 15 })
    expect(score.deductions[0]).toContain('not needed for this ticket')
  })

  it('records an attempt once per start, so re-checking does not duplicate it', async () => {
    const startedAt = NOW - 30_000
    await service.act({ resourceId: 'res-vm-fin-01', action: 'start' })
    await service.score('tpl-vm-stopped', startedAt)
    await service.score('tpl-vm-stopped', startedAt)

    const attempts = await service.attempts()
    expect(attempts.filter((attempt) => attempt.startedAt === startedAt)).toHaveLength(1)
  })

  it('resets the subscription to the seed', async () => {
    await service.act({ resourceId: 'res-vm-app-01', action: 'delete-resource-group' })
    const fresh = await service.reset()

    expect(fresh.resources).toHaveLength(13)
    // The reset restores the seed rather than leaving tombstones behind.
    expect(fresh.resources.every((entry) => entry.deleted !== true)).toBe(true)
    expect(fresh.nsgRules).toHaveLength(5)
    expect(fresh.roles).toHaveLength(5)
    expect(fresh.events).toHaveLength(0)
    expect(roleOver(fresh, 'rg-harbour-prod', 'usr-contractor')).toBe('Owner')
  })
})
