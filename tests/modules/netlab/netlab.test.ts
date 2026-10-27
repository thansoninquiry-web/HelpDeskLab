// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest'
import { CONCEPTS, TOTAL_QUESTIONS } from '../../../src/modules/netlab/data/concepts'
import { INCIDENTS, incidentById } from '../../../src/modules/netlab/data/incidents'
import { deviceById, TOPOLOGY } from '../../../src/modules/netlab/data/topology'
import { baselineEstate, buildEstate } from '../../../src/modules/netlab/logic/estate'
import { scoreNetlabAttempt } from '../../../src/modules/netlab/logic/scoring'
import { runTool } from '../../../src/modules/netlab/logic/tools'
import { NetlabStore } from '../../../src/modules/netlab/persistence/store'
import { NetlabService } from '../../../src/modules/netlab/service'
import {
  LAB_FIXES,
  type ChangeRecord,
  type FixId,
  type Incident,
  type RecordedCheck,
} from '../../../src/modules/netlab/types'
import { runMigrations } from '../../../src/persistence/migrations'
import { createSqliteDriver, type SqliteDriver } from '../../../src/persistence/sqlite'
import { loadWasmBinary } from '../../helpers/sqlite'

const NOW = Date.UTC(2026, 9, 26, 12, 0, 0)

/** The reference path: every isolating read, then the fixes in order. */
function reference(incident: Incident) {
  let at = NOW
  const checks: RecordedCheck[] = incident.evidence.map((evidence) => ({
    id: evidence.id,
    deviceId: evidence.deviceId ?? incident.subjectId,
    at: (at += 1_000),
  }))
  const changes: ChangeRecord[] = incident.expectedFix.map((fix) => ({
    fix,
    at: (at += 1_000),
  }))
  const estate = buildEstate(incident, incident.expectedFix)
  return { checks, changes, estate, score: scoreNetlabAttempt({ incident, estate, checks, changes }) }
}

function toolLines(
  incident: Incident,
  deviceId: string,
  command: string,
  fixes: readonly FixId[] = [],
) {
  const estate = buildEstate(incident, fixes)
  return runTool({ estate, deviceId }, command).lines.map((entry) => entry.text).join('\n')
}

describe('the school network', () => {
  it('seeds one site, two VLANs and a device for every role', () => {
    expect(TOPOLOGY.vlans.map((vlan) => vlan.id)).toEqual(['10', '20'])
    expect(TOPOLOGY.devices).toHaveLength(19)
    // Five office machines, four classroom machines and two laptops on Wi-Fi.
    expect(TOPOLOGY.devices.filter((device) => device.kind === 'client')).toHaveLength(11)
    expect(TOPOLOGY.devices.filter((device) => device.kind === 'ap')).toHaveLength(2)
    // Every client that is not wireless has a switch port, and every port exists.
    for (const device of TOPOLOGY.devices) {
      if (device.kind === 'client' && !device.wireless) {
        expect(device.port, `${device.id} has no port`).toBeTruthy()
      }
    }
    expect(baselineEstate().wan.wanUp).toBe(true)
    expect(baselineEstate().clients['pc-staff-01']?.address).toBe('10.10.10.101')
  })

  it('offers fifteen incidents, each naming a real device and an offered path', () => {
    expect(INCIDENTS).toHaveLength(15)
    expect(new Set(INCIDENTS.map((incident) => incident.id)).size).toBe(15)
    expect(new Set(INCIDENTS.map((incident) => incident.fault.kind)).size).toBeGreaterThanOrEqual(13)

    for (const incident of INCIDENTS) {
      const subject = deviceById(incident.subjectId)
      expect(subject, `${incident.id} names ${incident.subjectId}`).toBeTruthy()
      expect(incident.hints).toHaveLength(3)
      expect(incident.evidence.length).toBeGreaterThan(0)
      expect(incident.expectedFix.length).toBeGreaterThan(0)
      for (const fix of incident.expectedFix) {
        expect(LAB_FIXES, `${incident.id} expects an unknown fix ${fix}`).toContain(fix)
        expect(
          incident.fixOptions.some((option) => option.id === fix),
          `${incident.id} does not offer ${fix}`,
        ).toBe(true)
      }
      for (const conceptId of incident.conceptIds) {
        expect(CONCEPTS.some((concept) => concept.id === conceptId)).toBe(true)
      }
      for (const evidence of incident.evidence) {
        if (evidence.deviceId) {
          expect(deviceById(evidence.deviceId), `${incident.id} reads a missing device`).toBeTruthy()
        }
      }
    }
  })

  it('writes a quiz with one correct answer per question', () => {
    expect(CONCEPTS).toHaveLength(5)
    expect(TOTAL_QUESTIONS).toBe(15)
    for (const concept of CONCEPTS) {
      expect(concept.questions.length).toBeGreaterThan(0)
      for (const question of concept.questions) {
        const correct = question.choices.filter((choice) => choice.id === question.answer)
        expect(correct, `${concept.id}/${question.id} has no correct choice`).toHaveLength(1)
        expect(question.choices.length).toBeGreaterThan(1)
        expect(question.explanation.length).toBeGreaterThan(20)
      }
    }
  })
})

describe('the reference path', () => {
  it('closes every incident and scores 100', () => {
    for (const incident of INCIDENTS) {
      const { estate, score } = reference(incident)
      expect(incident.verify(estate), `${incident.id} end state`).toBe(true)
      expect(score.resolved, `${incident.id} resolved`).toBe(true)
      expect(score.total, `${incident.id} total`).toBe(100)
      expect(score.passed, `${incident.id} passed`).toBe(true)
      expect(score.penalty, `${incident.id} penalty`).toBe(0)
    }
  })

  it('withholds the diagnosis points when the fix comes with no reads', () => {
    const incident = incidentById('one-pc-no-internet')
    if (!incident) {
      throw new Error('missing incident')
    }
    const estate = buildEstate(incident, incident.expectedFix)
    const score = scoreNetlabAttempt({
      incident,
      estate,
      checks: [],
      changes: incident.expectedFix.map((fix, index) => ({ fix, at: NOW + index })),
    })

    expect(score.categoryScores.diagnosis).toEqual({ earned: 0, possible: 35 })
    expect(score.categoryScores.resolution).toEqual({ earned: 55, possible: 55 })
    expect(score.total).toBe(65)
    expect(score.passed).toBe(false)
  })

  it('rewards starting at the fault’s layer and charges for starting above it', () => {
    const incident = incidentById('site-wide-outage')
    if (!incident) {
      throw new Error('missing incident')
    }
    const estate = buildEstate(incident, incident.expectedFix)
    const changes = incident.expectedFix.map((fix, index) => ({ fix, at: NOW + 5_000 + index }))

    const atTheCircuit = scoreNetlabAttempt({
      incident,
      estate,
      checks: [{ id: 'wan-status', deviceId: 'modem-1', at: NOW }],
      changes,
    })
    const atTheResolver = scoreNetlabAttempt({
      incident,
      estate,
      checks: [{ id: 'dns', deviceId: incident.subjectId, at: NOW }],
      changes,
    })

    expect(atTheCircuit.items.find((item) => item.id === 'layer-order')?.passed).toBe(true)
    expect(atTheResolver.items.find((item) => item.id === 'layer-order')?.passed).toBe(false)
    expect(atTheCircuit.total).toBeGreaterThan(atTheResolver.total)
  })

  it('charges for a change the incident never asked for', () => {
    const incident = incidentById('one-pc-no-internet')
    if (!incident) {
      throw new Error('missing incident')
    }
    const { checks } = reference(incident)
    const estate = buildEstate(incident, ['reseat-cable', 'flush-dns-cache'])
    const score = scoreNetlabAttempt({
      incident,
      estate,
      checks,
      changes: [
        { fix: 'reseat-cable', at: NOW + 10_000 },
        { fix: 'flush-dns-cache', at: NOW + 11_000 },
      ],
    })

    expect(score.penalty).toBe(5)
    expect(score.categoryScores.safety).toEqual({ earned: 5, possible: 10 })
    expect(score.total).toBe(95)
    expect(score.deductions[0]).toContain('not needed for this incident')
  })

  it('cannot pass when a change took the network away for nothing', () => {
    const incident = incidentById('staff-wifi-down')
    if (!incident) {
      throw new Error('missing incident')
    }
    const { checks } = reference(incident)
    const estate = buildEstate(incident, ['power-cycle-ap', 'factory-reset-ap'])
    const score = scoreNetlabAttempt({
      incident,
      estate,
      checks,
      changes: [
        { fix: 'power-cycle-ap', at: NOW + 10_000 },
        { fix: 'factory-reset-ap', at: NOW + 11_000 },
      ],
    })

    expect(score.criticalSafety).toBe(true)
    expect(score.passed).toBe(false)
    expect(score.categoryScores.safety?.earned).toBe(0)
  })

  it('pays less for the right steps in the wrong order, and cannot resolve them', () => {
    const incident = incidentById('dhcp-scope-exhausted')
    if (!incident) {
      throw new Error('missing incident')
    }
    // The lease is renewed but the pool was never freed, so the laptop still
    // holds no address: the second step only holds on the back of the first.
    const estate = buildEstate(incident, ['renew-lease'])
    const score = scoreNetlabAttempt({
      incident,
      estate,
      checks: reference(incident).checks,
      changes: [{ fix: 'renew-lease', at: NOW + 10_000 }],
    })

    expect(score.resolved).toBe(false)
    expect(score.items.filter((item) => item.id.startsWith('fix-') && item.passed)).toHaveLength(1)
    expect(score.total).toBeLessThan(75)
  })
})

describe('the tools', () => {
  it('reads a disconnected adapter and the port that has no carrier', () => {
    const incident = incidentById('one-pc-no-internet')
    if (!incident) {
      throw new Error('missing incident')
    }
    expect(toolLines(incident, 'pc-staff-02', 'ipconfig /all')).toContain('Media disconnected')
    const switchOutput = toolLines(incident, 'sw-core', 'show interfaces status')
    expect(switchOutput).toMatch(/Gi1\/0\/6\s+PC-STAFF-02\s+notconnect/)
    expect(switchOutput).toMatch(/Gi1\/0\/5\s+PC-STAFF-01\s+connected/)

    expect(toolLines(incident, 'pc-staff-02', 'ipconfig /all', ['reseat-cable'])).not.toContain(
      'Media disconnected',
    )
  })

  it('shows the missing VLAN on the trunk and the APIPA address it causes', () => {
    const incident = incidentById('classroom-offline')
    if (!incident) {
      throw new Error('missing incident')
    }
    expect(toolLines(incident, 'pc-lab-01', 'ipconfig /all')).toContain('169.254.')
    expect(toolLines(incident, 'sw-core', 'show interfaces trunk')).toMatch(/Gi1\/0\/1\s+10\s*$/)
    expect(
      toolLines(incident, 'sw-core', 'show interfaces trunk', ['restore-trunk-vlan']),
    ).toMatch(/Gi1\/0\/1\s+10,20/)
  })

  it('separates names from numbers, and finds the rogue server on a port', () => {
    const dns = incidentById('dns-outage')
    const rogue = incidentById('rogue-router')
    if (!dns || !rogue) {
      throw new Error('missing incident')
    }
    expect(toolLines(dns, 'pc-staff-01', 'nslookup srv-files')).toContain('timed out')
    expect(toolLines(dns, 'pc-staff-01', 'ping 1.1.1.1')).toContain('Reply from')
    expect(toolLines(dns, 'pc-staff-01', 'nslookup srv-files', ['start-dns-service'])).toContain(
      '10.10.10.11',
    )

    expect(toolLines(rogue, 'pc-lab-03', 'ipconfig /all')).toContain('192.168.0.')
    expect(toolLines(rogue, 'sw-core', 'show mac address-table')).toMatch(/Gi1\/0\/24/)
  })

  it('answers a port test honestly, and reports half duplex on the server port', () => {
    const portal = incidentById('portal-blocked')
    const duplex = incidentById('slow-file-server')
    if (!portal || !duplex) {
      throw new Error('missing incident')
    }
    expect(
      toolLines(portal, 'pc-lab-02', 'test-netconnection portal.bramble-academy.org -port 443'),
    ).toContain('TcpTestSucceeded : False')
    expect(
      toolLines(portal, 'pc-lab-02', 'test-netconnection portal.bramble-academy.org -port 443', [
        'remove-block-rule',
      ]),
    ).toContain('TcpTestSucceeded : True')
    expect(toolLines(duplex, 'sw-core', 'show interfaces status')).toMatch(/Gi1\/0\/21.*half.*100/)
    expect(
      toolLines(duplex, 'sw-core', 'show interfaces status', ['set-port-auto']),
    ).toMatch(/Gi1\/0\/21.*a-full.*a-1000/)
  })

  it('refuses configuration mode, so a change always goes through the attempt', () => {
    const incident = incidentById('one-pc-no-internet')
    if (!incident) {
      throw new Error('missing incident')
    }
    expect(toolLines(incident, 'sw-core', 'configure terminal')).toContain(
      'Configuration mode is not available in this lab.',
    )
  })
})

describe('attempts and progress storage', () => {
  let db: SqliteDriver
  let store: NetlabStore
  let service: NetlabService

  beforeEach(async () => {
    db = await createSqliteDriver(undefined, { wasmBinary: loadWasmBinary() })
    runMigrations(db)
    store = new NetlabStore({
      read: async (operation) => operation(db),
      write: async (operation) => operation(db),
    })
    service = new NetlabService(store, () => NOW)
  })

  it('resumes the open attempt rather than starting a second one', async () => {
    const first = await service.open('one-pc-no-internet')
    const again = await service.open('one-pc-no-internet')
    expect(again.attempt.id).toBe(first.attempt.id)
    expect(first.estate.clients['pc-staff-02']?.link).toBe('down')
  })

  it('records reads and changes, refuses a repeat, and scores what it saved', async () => {
    const opened = await service.open('one-pc-no-internet')
    const incident = incidentById('one-pc-no-internet')
    if (!incident) {
      throw new Error('missing incident')
    }
    // The reference path's reads, taken through the service so the stored story
    // is the one the scorer reads back.
    for (const evidence of incident.evidence) {
      await service.recordCheck(
        opened.attempt.id,
        evidence.id,
        evidence.deviceId ?? incident.subjectId,
      )
    }

    const applied = await service.applyFix(opened.attempt.id, 'reseat-cable')
    expect(applied.status).toBe('applied')
    expect(applied.estate.clients['pc-staff-02']?.link).toBe('up')

    const again = await service.applyFix(opened.attempt.id, 'reseat-cable')
    expect(again.status).toBe('refused')

    const notOffered = await service.applyFix(opened.attempt.id, 'start-dns-service')
    expect(notOffered.status).toBe('refused')

    const scored = await service.score(opened.attempt.id)
    expect(scored.score.total).toBe(100)
    expect(scored.score.passed).toBe(true)
    expect(await service.attempts()).toHaveLength(1)
  })

  it('starts a fresh attempt after a score, keeping the old one as history', async () => {
    const opened = await service.open('one-pc-no-internet')
    await service.applyFix(opened.attempt.id, 'reseat-cable')
    await service.score(opened.attempt.id)

    const restarted = await service.restart('one-pc-no-internet')
    expect(restarted.attempt.id).not.toBe(opened.attempt.id)
    expect(restarted.attempt.state.fixes).toEqual([])
    expect(restarted.estate.clients['pc-staff-02']?.link).toBe('down')
    expect(await service.attempts()).toHaveLength(1)
  })

  it('keeps the quiz answer and the read mark, and forgets them on reset', async () => {
    const result = await service.answer('subnetting', 'usable-25', '126')
    expect(result.correct).toBe(true)
    await service.markConceptRead('subnetting')

    const answers = await service.quizAnswers()
    expect(answers).toHaveLength(1)
    expect(answers[0]?.correct).toBe(true)
    expect(await service.conceptReads()).toHaveLength(1)

    await service.reset()
    expect(await service.quizAnswers()).toHaveLength(0)
    expect(await service.conceptReads()).toHaveLength(0)
    expect(await service.attempts()).toHaveLength(0)
  })
})
