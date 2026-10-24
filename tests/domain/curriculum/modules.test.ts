import { describe, expect, it } from 'vitest'
import { SCENARIO_FAMILIES } from '../../../src/domain/generator'
import {
  CURRICULUM,
  emptyEvidence,
  moduleProgress,
  nextModule,
  type CurriculumModule,
  type ModuleEvidence,
  type ModuleMeasure,
} from '../../../src/domain/curriculum/modules'

const COURSE_TITLES = [
  'Your First Shift',
  'The Ticket Queue',
  'Documentation',
  'Company Chat',
  'Voicemails',
  'The Phone',
  'Directory (Active Directory)',
  'Remote Desktop',
  'Server Room',
  'Mail Admin',
  'Mail Security',
  'Asset Management',
  'Computer Deployment',
  'PC Shelf',
  'Ship Manager',
  'Mock Interview',
  'Intune: Device Compliance',
  'Intune: App Deployment',
  'Intune: Device Lifecycle',
]

const FAMILIES = SCENARIO_FAMILIES.map((family) => family.id)

function evidence(overrides: Partial<ModuleEvidence> = {}): ModuleEvidence {
  return { ...emptyEvidence(), ...overrides }
}

function moduleByNumber(number: number): CurriculumModule {
  const found = CURRICULUM.find((module) => module.number === number)
  if (!found) {
    throw new Error(`No module numbered ${number}`)
  }
  return found
}

describe('curriculum catalog', () => {
  it('lists the nineteen course modules in order', () => {
    expect(CURRICULUM).toHaveLength(19)
    expect(CURRICULUM.map((module) => module.title)).toEqual(COURSE_TITLES)
    expect(CURRICULUM.map((module) => module.number)).toEqual(
      Array.from({ length: 19 }, (_, index) => index + 1),
    )
  })

  it('gives every module a unique id and a summary', () => {
    const ids = CURRICULUM.map((module) => module.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const module of CURRICULUM) {
      expect(module.summary.trim().length).toBeGreaterThan(0)
    }
  })

  it('only states requirements for modules that are built', () => {
    for (const module of CURRICULUM) {
      if (module.status === 'planned') {
        expect(module.requirements).toEqual([])
        expect(module.scope).toEqual([])
        expect(module.note?.length ?? 0).toBeGreaterThan(0)
        continue
      }
      expect(module.note).toBeUndefined()
      expect(module.requirements.length).toBeGreaterThanOrEqual(2)
      const requirementIds = module.requirements.map((entry) => entry.id)
      expect(new Set(requirementIds).size).toBe(requirementIds.length)
      for (const entry of module.requirements) {
        expect(entry.target).toBeGreaterThan(0)
        expect(entry.label.trim().length).toBeGreaterThan(0)
        expect(entry.detail.trim().length).toBeGreaterThan(0)
      }
    }
  })

  it('scopes playable modules to families the simulator generates', () => {
    for (const module of CURRICULUM) {
      for (const family of module.scope) {
        expect(FAMILIES).toContain(family)
      }
    }
  })

  it('builds every module in the course', () => {
    expect(CURRICULUM.filter((module) => module.status === 'playable')).toHaveLength(19)
    expect(CURRICULUM.filter((module) => module.status === 'planned')).toHaveLength(0)
  })

  it('makes the mail modules playable on the trace and quarantine decisions', () => {
    const mail = moduleByNumber(10)
    expect(mail.status).toBe('playable')
    expect(mail.note).toBeUndefined()
    expect(mail.scope).toEqual(['MAIL-01'])
    expect(mail.requirements.map((entry) => entry.measure)).toEqual([
      'mailboxReads',
      'mailMessageTraces',
      'mailboxPasses',
    ])

    const security = moduleByNumber(11)
    expect(security.status).toBe('playable')
    expect(security.note).toBeUndefined()
    expect(security.scope).toEqual(['MAILSEC-01'])
    expect(security.requirements.map((entry) => entry.measure)).toEqual([
      'mailMessageTraces',
      'quarantineReleases',
      'sendersBlocked',
      'mailSecurityPasses',
    ])
  })

  it('makes the shelf pipeline playable on the register and the run', () => {
    const assets = moduleByNumber(12)
    expect(assets.status).toBe('playable')
    expect(assets.note).toBeUndefined()
    expect(assets.scope).toEqual(['DEP-01'])
    expect(assets.requirements.map((entry) => entry.measure)).toEqual([
      'deploymentQueueReads',
      'deploymentReads',
      'deploymentHoldPasses',
      // The device console joined this module: its work is asset work.
      'intuneTicketsResolved',
      'intunePasses',
    ])

    const deployment = moduleByNumber(13)
    expect(deployment.status).toBe('playable')
    expect(deployment.note).toBeUndefined()
    expect(deployment.scope).toEqual(['DEP-01'])
    expect(deployment.requirements.map((entry) => entry.measure)).toEqual([
      'deploymentReads',
      'deploymentRuns',
      'deploymentPasses',
    ])
  })

  it('makes the shelf and the shipping desk playable on the moves they record', () => {
    const shelf = moduleByNumber(14)
    expect(shelf.status).toBe('playable')
    expect(shelf.note).toBeUndefined()
    expect(shelf.requirements.map((entry) => entry.measure)).toEqual([
      'shelfReads',
      'machinesIssued',
      'shelfHolds',
    ])

    const shipping = moduleByNumber(15)
    expect(shipping.status).toBe('playable')
    expect(shipping.note).toBeUndefined()
    expect(shipping.scope).toEqual(['DEP-01'])
    expect(shipping.requirements.map((entry) => entry.measure)).toEqual([
      'shipmentReads',
      'shipmentsDispatched',
      'shipmentsDelivered',
      'shipmentsRebooked',
    ])
  })

  it('makes Remote Desktop playable on the work a session records', () => {
    const remote = moduleByNumber(8)

    expect(remote.status).toBe('playable')
    expect(remote.note).toBeUndefined()
    expect(remote.scope).toEqual(FAMILIES)
    expect(remote.requirements.map((entry) => entry.measure)).toEqual([
      'remoteSessionsOpened',
      'remoteReadBeforeChange',
      'remoteWorkDocumented',
    ])
    expect(remote.requirements.every((entry) => entry.target === 1)).toBe(true)
  })

  it('makes the device console a three-module course of its own', () => {
    const compliance = moduleByNumber(17)
    expect(compliance.status).toBe('playable')
    expect(compliance.scope).toEqual([])
    expect(compliance.intuneTemplates).toEqual([
      'tpl-bitlocker-off',
      'tpl-policy-not-evaluated',
    ])
    expect(compliance.requirements.map((entry) => entry.measure)).toEqual([
      'intuneReadBeforeFix',
      'intuneComplianceFixes',
      'intuneVerdictRefreshed',
      'intunePerfectDiagnosis',
    ])

    const apps = moduleByNumber(18)
    expect(apps.scope).toEqual([])
    expect(apps.requirements.map((entry) => entry.measure)).toEqual([
      'intuneAppInstallFixes',
      'intuneAppSetsInstalled',
      'intunePerfectSafety',
    ])

    const lifecycle = moduleByNumber(19)
    expect(lifecycle.scope).toEqual([])
    expect(lifecycle.requirements.map((entry) => entry.measure)).toEqual([
      'intuneLeaverRetires',
      'intuneWipePasses',
      'intuneStaleCleared',
      'intuneOwnershipPasses',
      'intuneLifecycleDecisions',
    ])
    // The capstone is the only requirement that asks for more than one pass.
    expect(lifecycle.requirements.at(-1)?.target).toBe(3)
  })

  it('keeps the console requirements apart from the service-desk families', () => {
    const consoleModules = CURRICULUM.filter((module) => module.intuneTemplates !== undefined)
    expect(consoleModules.map((module) => module.number)).toEqual([17, 18, 19])
    for (const module of consoleModules) {
      // An Intune template is not a scenario family, so neither scope may claim
      // the other's work.
      expect(module.scope).toEqual([])
      expect(module.intuneTemplates?.length ?? 0).toBeGreaterThan(0)
    }
  })
})

describe('module progress', () => {
  const firstShift = moduleByNumber(1)

  it('starts every requirement at zero', () => {
    const progress = moduleProgress(firstShift, emptyEvidence())
    expect(progress.met).toBe(0)
    expect(progress.complete).toBe(false)
    expect(progress.percent).toBe(0)
    expect(progress.requirements.every((entry) => !entry.met)).toBe(true)
  })

  it('counts met requirements and rounds the bar down', () => {
    const progress = moduleProgress(firstShift, evidence({ passedAttempts: 1 }))
    expect(progress.met).toBe(1)
    expect(progress.total).toBe(3)
    expect(progress.percent).toBe(33)
    expect(progress.complete).toBe(false)
    expect(progress.requirements.map((entry) => entry.met)).toEqual([true, false, false])
  })

  it('completes only when every requirement is met', () => {
    const progress = moduleProgress(
      firstShift,
      evidence({ passedAttempts: 2, troubleshootingNotes: 4, customerNotes: 1 }),
    )
    expect(progress.met).toBe(3)
    expect(progress.percent).toBe(100)
    expect(progress.complete).toBe(true)
  })

  it('completes the mail modules only when the trace and the decisions are on file', () => {
    const mail = moduleByNumber(10)
    const security = moduleByNumber(11)

    expect(moduleProgress(mail, evidence({ mailboxReads: 1, mailMessageTraces: 1 })).met).toBe(2)
    expect(
      moduleProgress(
        mail,
        evidence({ mailboxReads: 1, mailMessageTraces: 1, mailboxPasses: 1 }),
      ).complete,
    ).toBe(true)

    expect(
      moduleProgress(
        security,
        evidence({ mailMessageTraces: 1, quarantineReleases: 1, sendersBlocked: 1 }),
      ).met,
    ).toBe(3)
    expect(
      moduleProgress(
        security,
        evidence({
          mailMessageTraces: 1,
          quarantineReleases: 1,
          sendersBlocked: 1,
          mailSecurityPasses: 1,
        }),
      ).complete,
    ).toBe(true)
  })

  it('completes the shelf modules only when the reads and the decision are on file', () => {
    const assets = moduleByNumber(12)
    const deployment = moduleByNumber(13)

    expect(
      moduleProgress(assets, evidence({ deploymentQueueReads: 1, deploymentReads: 1 })).met,
    ).toBe(2)
    expect(
      moduleProgress(
        assets,
        evidence({
          deploymentQueueReads: 1,
          deploymentReads: 1,
          deploymentHoldPasses: 1,
          intuneTicketsResolved: 1,
          intunePasses: 1,
        }),
      ).complete,
    ).toBe(true)

    expect(
      moduleProgress(deployment, evidence({ deploymentReads: 1, deploymentRuns: 1 })).met,
    ).toBe(2)
    expect(
      moduleProgress(
        deployment,
        evidence({ deploymentReads: 1, deploymentRuns: 1, deploymentPasses: 1 }),
      ).complete,
    ).toBe(true)
  })

  it('judges Voicemails on the message, the callback and the note', () => {
    const voicemails = moduleByNumber(5)

    expect(voicemails.status).toBe('playable')
    expect(voicemails.scope).toEqual(FAMILIES)
    expect(voicemails.requirements.map((entry) => entry.measure)).toEqual([
      'voicemailPasses',
      'voicemailCallbacks',
      'voicemailNotes',
    ])

    // Chat evidence is not message evidence: a caller who answered the phone
    // is a different attempt from one who left a recording.
    const progress = moduleProgress(voicemails, evidence({ callerQuestions: 99 }))
    expect(progress.met).toBe(0)
    expect(progress.complete).toBe(false)

    expect(
      moduleProgress(
        voicemails,
        evidence({ voicemailPasses: 1, voicemailCallbacks: 1, voicemailNotes: 1 }),
      ).complete,
    ).toBe(true)
  })

  it('completes the console modules only when the decisions are on file', () => {
    const compliance = moduleByNumber(17)
    const lifecycle = moduleByNumber(19)

    expect(
      moduleProgress(compliance, evidence({ intuneReadBeforeFix: 1, intuneComplianceFixes: 1 })).met,
    ).toBe(2)
    expect(
      moduleProgress(
        compliance,
        evidence({
          intuneReadBeforeFix: 1,
          intuneComplianceFixes: 1,
          intuneVerdictRefreshed: 1,
          intunePerfectDiagnosis: 1,
        }),
      ).complete,
    ).toBe(true)

    // Three passes in one lifecycle decision are one decision, not three.
    expect(
      moduleProgress(
        lifecycle,
        evidence({ intuneLeaverRetires: 1, intuneLifecycleDecisions: 1 }),
      ).met,
    ).toBe(1)
    expect(
      moduleProgress(
        lifecycle,
        evidence({
          intuneLeaverRetires: 1,
          intuneWipePasses: 1,
          intuneStaleCleared: 1,
          intuneOwnershipPasses: 1,
          intuneLifecycleDecisions: 3,
        }),
      ).complete,
    ).toBe(true)
  })

  it('ignores evidence it cannot read', () => {
    const broken = { ...emptyEvidence(), passedAttempts: Number.NaN }
    const progress = moduleProgress(firstShift, broken as ModuleEvidence)
    expect(progress.requirements[0]?.current).toBe(0)
    expect(progress.requirements[0]?.met).toBe(false)
  })
})

describe('next module', () => {
  const allComplete = (): Record<string, ReturnType<typeof moduleProgress>> =>
    Object.fromEntries(
      CURRICULUM.map((module) => [
        module.id,
        {
          met: 3,
          total: 3,
          percent: 100,
          complete: true,
          requirements: [],
        },
      ]),
    )

  it('returns the first unfinished playable module', () => {
    const progress = allComplete()
    progress[moduleByNumber(1).id] = moduleProgress(moduleByNumber(1), evidence())
    expect(nextModule(CURRICULUM, progress)?.number).toBe(1)
  })

  it('moves on to the next module once one is finished', () => {
    const progress = allComplete()
    progress[moduleByNumber(2).id] = moduleProgress(moduleByNumber(2), evidence())
    expect(nextModule(CURRICULUM, progress)?.number).toBe(2)
    expect(nextModule(CURRICULUM, progress)?.status).toBe('playable')
  })

  it('returns null when the build is complete', () => {
    expect(nextModule(CURRICULUM, allComplete())).toBeNull()
  })
})

describe('measure coverage', () => {
  it('maps every requirement to a declared counter', () => {
    const declared = new Set(Object.keys(emptyEvidence()))
    for (const module of CURRICULUM) {
      for (const entry of module.requirements) {
        const measure: ModuleMeasure = entry.measure
        expect(declared.has(measure)).toBe(true)
      }
    }
  })
})
