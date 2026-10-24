// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { generateTicket } from '../../src/domain/generator'
import type { GeneratedTicket } from '../../src/domain/generator'
import { HELD_SHELF_VARIANT } from '../../src/domain/generator/families/deployment'
import type { TopologyView } from '../../src/domain/environment/topology'
import { TOPOLOGY_BONUS_XP } from '../../src/domain/scoring/evaluator'
import { SqlitePersistence, openPersistence, type Persistence } from '../../src/persistence/database'
import { runMigrations } from '../../src/persistence/migrations'
import { MemorySnapshotStore } from '../../src/persistence/snapshotStore'
import { createSqliteDriver } from '../../src/persistence/sqlite'
import { makeScore } from '../helpers/factories'
import { loadWasmBinary } from '../helpers/sqlite'

const holder = vi.hoisted(() => ({ current: null as Persistence | null }))

vi.mock('../../src/app/persistenceService', () => ({
  getLocalDatabase: async () => {
    if (!holder.current) {
      throw new Error('Test database is not ready')
    }
    return holder.current
  },
}))

import {
  HintBudgetSpentError,
  HintsWithheldError,
  NoHintAvailableError,
  abandonAttempt,
  addNote,
  askCaller,
  callerInterjection,
  clearActiveAttempt,
  computeWeakTopics,
  createTickets,
  denialReasons,
  denyCaller,
  findActiveSessionId,
  getWorkspace,
  loadConsole,
  loadDebrief,
  loadProgress,
  loadProgressSummary,
  loadQueue,
  openSession,
  placeCallback,
  reapplyRewind,
  recordConsoleRead,
  repairHintRecord,
  resolveAttempt,
  recordInPersonVisit,
  revealHint,
  reviewClosure,
  rewindAttempt,
  scanBadge,
  RewindRefusedError,
  runConsoleAction,
  saveClosureDraft,
  saveConsoleFocus,
  saveWorkspaceLayout,
  type WorkspaceLayout,
  searchConsole,
  sendVerificationCode,
  sortQueue,
  startAttempt,
  startModulePractice,
  submitCommand,
  submitDesktopTerminalCommand,
  verifyCallerWithCode,
  verifyCallerWithLetterPin,
  type DebriefView,
  DESKTOP_ACTIONS,
  type WorkspaceView,
} from '../../src/app/practiceService'
import { saveExamMode, saveFamilyHintPolicy, saveHintPolicy } from '../../src/app/settingsService'

/** The first ticket of a family that came in live, for the queue-reuse tests. */
function liveTicketFor(scenarioId: string): GeneratedTicket {
  for (let seed = 1; seed < 600; seed += 1) {
    const ticket = generateTicket(seed, { familyId: scenarioId })
    if (ticket.public.voicemail === undefined) {
      return ticket
    }
  }
  throw new Error(`No live ${scenarioId} ticket was generated`)
}

function generatedFor(scenarioId: string, variantId: string): GeneratedTicket {
  for (let seed = 1; seed < 600; seed += 1) {
    const ticket = generateTicket(seed, { familyId: scenarioId })
    if (ticket.variantId === variantId) {
      return ticket
    }
  }
  throw new Error(`No seed produced ${scenarioId}/${variantId}`)
}

async function insertTicket(
  persistence: Persistence,
  generated: GeneratedTicket,
  id: string,
): Promise<void> {
  await persistence.tickets.create({
    id,
    scenarioId: generated.scenarioId,
    variantId: generated.variantId,
    difficulty: generated.difficulty,
    seed: generated.seed,
    signature: generated.signature,
    publicContent: JSON.parse(JSON.stringify(generated.public)),
    createdAt: Date.now(),
    status: 'available',
  })
}

/** What the last command on the log printed, as one string. */
function commandText(view: Awaited<ReturnType<typeof getWorkspace>>): string {
  const entry = view.entries.at(-1)
  if (entry?.kind !== 'command') {
    throw new Error('Expected the last entry to be a command')
  }
  return entry.lines.map((line) => line.text).join('\n')
}

/** The status the last directory lookup on the log printed for an account. */
function accountStatus(view: Awaited<ReturnType<typeof getWorkspace>>): string {
  const entry = view.entries.at(-1)
  if (entry?.kind !== 'command') {
    throw new Error('Expected the last entry to be a command')
  }
  const line = entry.lines.find((item) => /status/i.test(item.text))
  if (!line) {
    throw new Error(`No status line in: ${entry.lines.map((item) => item.text).join(' | ')}`)
  }
  return line.text.split(':')[1]?.trim() ?? ''
}

/** The gate the interface offers: one live code, read back by the caller. */
async function verifyCallerByCode(): Promise<void> {
  const view = await getWorkspace()
  const sent = await sendVerificationCode(view.verification.callerId)
  await verifyCallerWithCode(sent.verification.active?.readBack ?? '')
}

let persistence: Persistence

beforeEach(async () => {
  persistence = await openPersistence({
    snapshotStore: new MemorySnapshotStore(),
    wasmBinary: loadWasmBinary(),
  })
  holder.current = persistence
})

describe('practice service', () => {
  it('fills the queue with generated tickets that carry the required fields', async () => {
    const queue = await loadQueue()

    expect(queue).toHaveLength(5)
    for (const ticket of queue) {
      expect(ticket.subject.length).toBeGreaterThan(0)
      expect(ticket.requester.name.length).toBeGreaterThan(0)
      expect(['critical', 'high', 'medium', 'low']).toContain(ticket.severity)
      expect(ticket.status).toBe('available')
      expect(ticket.scenarioTitle.length).toBeGreaterThan(0)
    }
  })

  it('opens the ticket a module\'s lesson starts on', async () => {
    const workspace = await startModulePractice('first-shift')

    expect(workspace.ticket.scenarioId).toBe('PWD-01')
    expect(workspace.entries).toEqual([])
    const stored = await persistence.tickets.findById(workspace.ticket.id)
    expect(stored?.status).toBe('in_progress')
    expect(await persistence.sessions.findActive()).not.toBeNull()
  })

  it('reuses an available ticket for the module instead of adding a duplicate', async () => {
    const generated = generatedFor('PWD-01', 'account-lockout')
    await insertTicket(persistence, generated, 'ticket-queued')

    const workspace = await startModulePractice('first-shift')

    expect(workspace.ticket.id).toBe('ticket-queued')
    expect(await persistence.tickets.listRecent(60)).toHaveLength(1)
  })

  it('pins the variant a module is judged on', async () => {
    const wrongVariant = generatedFor('DEP-01', 'imaging-run-failed')
    await insertTicket(persistence, wrongVariant, 'ticket-wrong-variant')

    const workspace = await startModulePractice('asset-management')

    // The held-shelf ticket is the one this module needs, even though a
    // different DEP-01 ticket was already waiting in the queue.
    expect(workspace.ticket.id).not.toBe('ticket-wrong-variant')
    expect(workspace.ticket.scenarioId).toBe('DEP-01')
    expect(workspace.ticket.variantId).toBe(HELD_SHELF_VARIANT)
  })

  it('opens Voicemails on a ticket that arrived as a message', async () => {
    const workspace = await startModulePractice('voicemails')

    expect(workspace.ticket.scenarioId).toBe('PWD-01')
    expect(workspace.ticket.voicemail).not.toBeNull()

    // The arrival is drawn from the seed the queue stores, so reopening the
    // ticket plays the same message rather than a different one.
    const stored = await persistence.tickets.findById(workspace.ticket.id)
    expect(stored).not.toBeNull()
    const rebuilt = generateTicket(stored?.seed ?? 0, { familyId: 'PWD-01' })
    expect(rebuilt.public.voicemail).toEqual(workspace.ticket.voicemail)
  })

  it('does not hand the voicemail module a live ticket from the queue', async () => {
    await insertTicket(persistence, liveTicketFor('PWD-01'), 'ticket-live')

    const workspace = await startModulePractice('voicemails')

    expect(workspace.ticket.id).not.toBe('ticket-live')
    expect(workspace.ticket.voicemail).not.toBeNull()
    // The live ticket is still on the queue, not consumed by the module.
    expect(await persistence.tickets.listRecent(60)).toHaveLength(2)
  })

  it('refuses a module that is practised from job targets', async () => {
    await expect(startModulePractice('mock-interview')).rejects.toThrow(
      /Job targets page/,
    )
  })

  it('runs a full lockout attempt and persists the score and progress', async () => {
    const generated = generatedFor('PWD-01', 'account-lockout')
    const sam = generated.public.requester.samAccountName
    await insertTicket(persistence, generated, 'ticket-lockout')

    const workspace = await startAttempt('ticket-lockout')
    expect(workspace.ticket.id).toBe('ticket-lockout')
    expect(workspace.entries).toEqual([])

    await verifyCallerByCode()
    await submitCommand(`get-account ${sam}`)
    const afterUnlock = await submitCommand(`unlock-account ${sam}`)
    await submitCommand(`get-account ${sam}`)
    await addNote(
      'troubleshooting',
      'Directory showed the account locked. Verified the caller with their badge, unlocked it, and confirmed the status returned to active.',
    )
    await addNote(
      'customer',
      'Your account is unlocked. Sign in with your current password and contact us if it locks again today.',
    )

    expect(afterUnlock.entries.filter((entry) => entry.kind === 'command')).toHaveLength(2)
    expect(afterUnlock.hasVerifiedCaller).toBe(true)
    expect(afterUnlock.customerNotes).toHaveLength(0)

    const debrief = await resolveAttempt({
      code: 'resolved-remote',
      note: 'Resolved remotely after verifying the caller.',
    })

    expect(debrief.total).toBe(100)
    expect(debrief.passed).toBe(true)
    expect(debrief.band).toBe('strong')
    // A ticket whose caller told the truth has no contradictions to report.
    expect(debrief.identityFindings).toEqual([])
    expect(debrief.reference.map((step) => step.label)).toEqual([
      'Verify the caller before anything changes',
      `Run get-account ${sam}`,
      `Run unlock-account ${sam}`,
      'Recheck the account now it is unlocked',
      'Leave a troubleshooting note',
      'Send the customer a plain-language update',
    ])
    // A command step is explained by what the tool is for, not by repeating the
    // command or exposing the intent id behind a caller question.
    expect(debrief.reference[1]?.detail).toBe(
      'Show directory status, lockout, and password expiry for an account',
    )

    const storedScore = await persistence.scores.findBySession(workspace.sessionId)
    expect(storedScore?.total).toBe(100)
    expect(storedScore?.passed).toBe(true)

    const ticket = await persistence.tickets.findById('ticket-lockout')
    expect(ticket?.status).toBe('completed')

    const stats = await persistence.progress.get('PWD-01')
    expect(stats?.attempts).toBe(1)
    expect(stats?.passes).toBe(1)
    expect(stats?.bestScore).toBe(100)

    const reloaded = await loadDebrief(workspace.sessionId)
    expect(reloaded?.total).toBe(100)
    expect(reloaded?.decision.code).toBe('resolved-remote')
    expect(reloaded?.items.length).toBe(generated.rubric.items.length)

    const progress = await loadProgress()
    expect(progress.attempts).toBe(1)
    expect(progress.rows[0]?.scenarioTitle).toBe('Password and account access')
  })

  it('summarises the steps a learner buys hints for across scored attempts', async () => {
    const generated = generatedFor('PWD-01', 'account-lockout')
    await insertTicket(persistence, generated, 'ticket-habit-1')
    await startAttempt('ticket-habit-1')

    const hinted = await revealHint()
    // The workspace names a rung as `step#rung`; the habit is kept per step.
    const firstName = hinted.hints[0]?.id ?? ''
    const separator = firstName.indexOf('#')
    const hintedItemId = separator === -1 ? firstName : firstName.slice(0, separator)
    expect(hintedItemId.length).toBeGreaterThan(0)
    await resolveAttempt({ code: 'escalated-tier2', note: '' })

    // A second sitting of the same family, this time without a single rung.
    await insertTicket(persistence, generatedFor('PWD-01', 'account-lockout'), 'ticket-habit-2')
    await startAttempt('ticket-habit-2')
    await resolveAttempt({ code: 'escalated-tier2', note: '' })

    const progress = await loadProgress()

    expect(progress.hintHabitSummary.attempts).toBe(2)
    expect(progress.hintHabitSummary.attemptsWithHints).toBe(1)
    expect(progress.hintHabitSummary.rungs).toBe(1)

    const bought = progress.hintHabits.find((habit) => habit.itemId === hintedItemId)
    expect(bought).toMatchObject({ attempts: 2, bought: 1, rungs: 1 })
    expect(bought?.label.length).toBeGreaterThan(0)
    expect(bought?.band).toBe('sometimes-bought')

    // Every other step was worked out alone, which is what the learner needs to
    // see beside the one they bought.
    expect(progress.hintHabits.length).toBeGreaterThan(1)
    for (const habit of progress.hintHabits.filter((entry) => entry.itemId !== hintedItemId)) {
      expect(habit.band).toBe('worked-alone')
      expect(habit.bought).toBe(0)
    }
  })

  it('reads which proof the desk reaches for, and whether it proved anybody', async () => {
    // One attempt proved by a code read-back.
    await insertTicket(persistence, generatedFor('PWD-01', 'account-lockout'), 'ticket-method-1')
    await startAttempt('ticket-method-1')
    await verifyCallerByCode()
    await resolveAttempt({ code: 'escalated-tier2', note: '' })

    // A second attempt rang a shared line first: a colleague answered, which is
    // a check that happened and proved somebody else, then the code proved the
    // caller.
    await insertTicket(
      persistence,
      generatedFor('PWD-01', 'shared-line-callback'),
      'ticket-method-2',
    )
    await startAttempt('ticket-method-2')
    await placeCallback('team-line')
    await verifyCallerByCode()
    await resolveAttempt({ code: 'escalated-tier2', note: '' })

    const progress = await loadProgress()

    expect(progress.verificationSummary).toMatchObject({
      checks: 3,
      proved: 2,
      attempts: 2,
      provedPercent: 67,
    })
    const [code, callback] = progress.verificationHabits
    // The method used most often leads, and both kinds of check are counted.
    expect(code).toMatchObject({
      method: 'verification-code',
      label: 'Code read-back',
      checks: 2,
      proved: 2,
      failed: 0,
      attempts: 2,
    })
    expect(callback).toMatchObject({
      method: 'callback',
      label: 'Callback',
      checks: 1,
      proved: 0,
      failed: 1,
      attempts: 1,
    })
  })

  it('reports a charged rung whose hint the log no longer holds', async () => {
    const generated = generatedFor('PWD-01', 'account-lockout')
    await insertTicket(persistence, generated, 'ticket-lost-hint')
    const workspace = await startAttempt('ticket-lost-hint')

    // The score keeps the charge; the action log it was scored from is then
    // gone, which is what a pruned or restored-without-rows log looks like.
    await persistence.scores.save(
      makeScore(workspace.sessionId, {
        rubric: {
          items: [{ id: 'unlock', label: 'Unlock the account', passed: true }],
          hintsUsed: 2,
        },
      }),
    )

    const progress = await loadProgress()

    // The rows can only place what the log holds, so the summary carries the
    // difference instead of showing a smaller number with no explanation.
    expect(progress.hintHabitSummary.rungs).toBe(0)
    expect(progress.hintHabitSummary.unaccountedRungs).toBe(2)
    expect(progress.hintHabitSummary.attemptsWithUnaccountedHints).toBe(1)
  })

  it('reads back where a learner keeps un-running, family by family', async () => {
    const generated = generatedFor('PWD-01', 'account-lockout')
    const sam = generated.public.requester.samAccountName

    // Two sittings of the same family, both cut at the same unlock: that is the
    // step this learner keeps backing out of, not the account they aimed at.
    for (const ticketId of ['ticket-rewind-1', 'ticket-rewind-2']) {
      await insertTicket(persistence, generated, ticketId)
      await startAttempt(ticketId)
      await verifyCallerByCode()
      await submitCommand(`get-account ${sam}`)
      const changed = await submitCommand(`unlock-account ${sam}`)
      const step = changed.entries.at(-1)?.seq
      if (step === undefined) {
        throw new Error('The unlock was not recorded')
      }

      const rewound = await rewindAttempt(step)
      expect(rewound.entries.some((entry) => entry.kind === 'rewind')).toBe(true)
      await resolveAttempt({ code: 'escalated-tier2', note: '' })
    }

    // One sitting of another family, cut once, so there are two rows to compare.
    await insertTicket(persistence, generatedFor('NET-01', 'bad-static-dns'), 'ticket-rewind-3')
    await startAttempt('ticket-rewind-3')
    await verifyCallerByCode()
    const probed = await submitCommand('ipconfig /all')
    const probeStep = probed.entries.at(-1)?.seq
    if (probeStep === undefined) {
      throw new Error('The check was not recorded')
    }
    await rewindAttempt(probeStep)
    await resolveAttempt({ code: 'escalated-tier2', note: '' })

    const progress = await loadProgress()

    expect(progress.rewindSummary.rewinds).toBe(3)
    expect(progress.rewindSummary.attemptsWithRewind).toBe(3)
    expect(progress.rewindSummary.families).toBe(2)
    expect(progress.rewindSummary.stepsUnrun).toBeGreaterThanOrEqual(3)

    // The family cut in both of its attempts outranks the one cut in its only one.
    const [heaviest, other] = progress.familyRewinds
    expect(heaviest).toMatchObject({
      scenarioId: 'PWD-01',
      scenarioTitle: 'Password and account access',
      rewinds: 2,
      attempts: 2,
      attemptsWithRewind: 2,
      rewindPercent: 100,
      band: 'heavy',
      worstStep: { label: 'unlock-account', times: 2 },
    })
    expect(other).toMatchObject({
      scenarioId: 'NET-01',
      rewinds: 1,
      attempts: 1,
      rewindPercent: 100,
      band: 'heavy',
      worstStep: { label: 'ipconfig', times: 1 },
    })
  })

  it('replays the variant a stored ticket names, not the one its seed now draws', async () => {
    // This seed draws the plain lockout, so only the stored variant can explain
    // the urgent rubric coming back from the replay.
    const drawn = generatedFor('PWD-01', 'account-lockout')
    await insertTicket(
      persistence,
      { ...drawn, variantId: 'pressured-lockout' },
      'ticket-pinned',
    )

    await startAttempt('ticket-pinned')
    const debrief = await resolveAttempt({
      code: 'resolved-remote',
      note: 'Resolved after verifying the caller.',
    })

    expect(debrief.items.map((item) => item.id)).toContain('diagnose-first')
  })

  it('still opens a ticket whose stored variant has since been retired', async () => {
    const drawn = generatedFor('PWD-01', 'account-lockout')
    await insertTicket(
      persistence,
      { ...drawn, variantId: 'retired-lockout' },
      'ticket-retired',
    )

    const workspace = await startAttempt('ticket-retired')

    expect(workspace.ticket.id).toBe('ticket-retired')
    expect(workspace.entries).toEqual([])
  })

  it('has the pressured caller refuse the diagnostic questions', async () => {
    const generated = generatedFor('PWD-01', 'pressured-lockout')
    await insertTicket(persistence, generated, 'ticket-pressured')
    await startAttempt('ticket-pressured')

    const view = await askCaller('what-changed')
    const reply = view.entries.at(-1)

    expect(reply?.kind).toBe('ask')
    if (reply?.kind !== 'ask') {
      throw new Error('The question was not recorded')
    }
    // The caller answers the question by asking for the fix again.
    expect(reply.answer).toMatch(/skip|unlock|reset/i)
    expect(reply.answer).not.toMatch(/nothing that i know of/i)
  })

  it('has the pressured caller break in when the desk stalls', async () => {
    const generated = generatedFor('PWD-01', 'pressured-lockout')
    await insertTicket(persistence, generated, 'ticket-pressured-stall')
    await startAttempt('ticket-pressured-stall')

    // Two turns of the call are the desk's. The third is the caller's: nobody has
    // been identified, and the client is waiting.
    const first = await askCaller('what-error')
    const second = await askCaller('when-start')
    expect(first.entries.at(-1)?.kind).toBe('ask')
    expect(second.entries.at(-1)?.kind).toBe('ask')

    const third = await askCaller('what-changed')
    const interruption = third.entries.at(-1)
    expect(interruption?.kind).toBe('interruption')
    if (interruption?.kind !== 'interruption') {
      throw new Error('The caller did not break in')
    }
    expect(interruption.message).toMatch(/still there/i)
    expect(interruption.message).toMatch(/unlock/i)

    // It is a call turn like any other, so a reload reads the same conversation
    // and the line is not said twice.
    const reopened = await openSession(third.sessionId)
    expect(reopened.entries.filter((entry) => entry.kind === 'interruption')).toHaveLength(1)

    const fourth = await askCaller('other-users')
    expect(fourth.entries.at(-1)?.kind).toBe('ask')

    // The next line in the ladder arrives when the desk keeps working instead of
    // doing the checks, and the caller still has not repeated themselves.
    await askCaller('already-tried')
    const sixth = await askCaller('what-error')
    const second_line = sixth.entries.at(-1)
    expect(second_line?.kind).toBe('interruption')
    if (second_line?.kind !== 'interruption') {
      throw new Error('The caller did not press again')
    }
    expect(second_line.message).toMatch(/skip the checks/i)
    expect(second_line.message).not.toBe(interruption.message)
  })

  it('lets the caller break in while the desk is doing nothing at all', async () => {
    const generated = generatedFor('PWD-01', 'pressured-lockout')
    await insertTicket(persistence, generated, 'ticket-pressured-idle')
    await startAttempt('ticket-pressured-idle')

    // Nothing has happened on the call, so the tick has nothing to say.
    expect(await callerInterjection()).toBeNull()

    vi.useFakeTimers()
    try {
      // A desk that has stopped acting: no action will ever ask for a line, so
      // the minutes on the call are the only thing that can earn one.
      vi.setSystemTime(Date.now() + 3 * 60_000)
      const view = await callerInterjection()
      const line = view?.entries.at(-1)
      expect(line?.kind).toBe('interruption')
      if (line?.kind !== 'interruption') {
        throw new Error('The caller did not break into an idle call')
      }
      expect(line.message).toMatch(/still there/i)

      // It is recorded like any other call turn, so it cannot be said twice.
      expect(view?.entries.filter((entry) => entry.kind === 'interruption')).toHaveLength(1)
      expect(await callerInterjection()).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('restarts the caller’s clock whenever the desk acts again', async () => {
    const generated = generatedFor('PWD-01', 'pressured-lockout')
    const sam = generated.public.requester.samAccountName
    await insertTicket(persistence, generated, 'ticket-pressured-restart')
    await startAttempt('ticket-pressured-restart')

    const lastInterruption = async (): Promise<string> => {
      const view = await getWorkspace()
      return (
        view.entries.filter((entry) => entry.kind === 'interruption').at(-1)?.message ?? ''
      )
    }

    vi.useFakeTimers()
    try {
      const openedAt = Date.now()

      // Three quiet minutes earn the first line about the wait.
      vi.setSystemTime(openedAt + 3 * 60_000)
      expect(await callerInterjection()).not.toBeNull()
      expect(await lastInterruption()).toMatch(/still there/i)

      // The desk picks the call back up one minute later. That is a step, so the
      // silence the ladder measures starts again from here.
      vi.setSystemTime(openedAt + 4 * 60_000)
      await submitCommand(`get-account ${sam}`)
      expect(await callerInterjection()).toBeNull()

      // Two minutes later the desk has still only been quiet for two minutes —
      // the four already on the call were not silence. Measured from the start
      // of the attempt this tick would have earned the next rung.
      vi.setSystemTime(openedAt + 6 * 60_000)
      expect(await callerInterjection()).toBeNull()

      // Five quiet minutes after the step do earn it.
      vi.setSystemTime(openedAt + 9 * 60_000)
      const view = await callerInterjection()
      expect(view?.entries.at(-1)?.kind).toBe('interruption')
      expect(await lastInterruption()).toMatch(/skip the checks/i)
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps the clock running when the caller speaks, because that is not the desk acting', async () => {
    const generated = generatedFor('PWD-01', 'pressured-lockout')
    await insertTicket(persistence, generated, 'ticket-pressured-talk')
    await startAttempt('ticket-pressured-talk')

    vi.useFakeTimers()
    try {
      const openedAt = Date.now()

      vi.setSystemTime(openedAt + 3 * 60_000)
      expect(await callerInterjection()).not.toBeNull()

      // Two minutes later the desk has still acted on nothing. If the caller's
      // own line reset the clock the silence would only be two minutes old and
      // the next rung (five) would not be due.
      vi.setSystemTime(openedAt + 5 * 60_000)
      const view = await callerInterjection()
      expect(view?.entries.at(-1)?.kind).toBe('interruption')
      expect(
        view?.entries.filter((entry) => entry.kind === 'interruption').at(-1),
      ).toMatchObject({ message: expect.stringMatching(/skip the checks/i) })
    } finally {
      vi.useRealTimers()
    }
  })

  it('escalates when the desk carries on after the caller has warned it', async () => {
    const generated = generatedFor('PWD-01', 'pressured-lockout')
    const sam = generated.public.requester.samAccountName
    await insertTicket(persistence, generated, 'ticket-pressured-ignored')
    await startAttempt('ticket-pressured-ignored')

    const interruptions = async (): Promise<string[]> => {
      const view = await getWorkspace()
      return view.entries.flatMap((entry) =>
        entry.kind === 'interruption' ? [entry.message] : [],
      )
    }

    await submitCommand(`get-account ${sam}`)
    // The change nobody verified is what the caller reacts to first.
    await submitCommand(`unlock-account ${sam}`)
    expect((await interruptions())[0]).toMatch(/no code/i)

    // Two more steps without a check: the answer to being ignored, not another
    // remark about the clock.
    await submitCommand(`get-account ${sam}`)
    await submitCommand(`get-account ${sam}`)
    expect((await interruptions())[1]).toMatch(/still there/i)
    expect((await interruptions())[2]).toMatch(/still have not checked who i am/i)

    // And the ladder keeps climbing: the next line asks for the password it has
    // been angling for all along, ahead of the quieter line about the clock.
    for (let step = 0; step < 3; step += 1) {
      await submitCommand(`get-account ${sam}`)
    }
    const ladder = await interruptions()
    expect(ladder[3]).toMatch(/send the new password/i)
    expect(ladder[4]).toMatch(/skip the checks/i)

    // Nothing on this ticket was ever verified, which is the point of the trap.
    expect((await getWorkspace()).hasVerifiedCaller).toBe(false)
  })

  it('tells the debrief how hard the caller pressed and what each break-in followed', async () => {
    const generated = generatedFor('PWD-01', 'pressured-lockout')
    const sam = generated.public.requester.samAccountName
    await insertTicket(persistence, generated, 'ticket-pressured-debrief')
    await startAttempt('ticket-pressured-debrief')

    await submitCommand(`get-account ${sam}`)
    // The unverified change is the caller's opening, and the third turn on the
    // call earns the line about the clock.
    await submitCommand(`unlock-account ${sam}`)
    await submitCommand(`get-account ${sam}`)
    const workspace = await getWorkspace()
    expect(workspace.entries.filter((entry) => entry.kind === 'interruption')).toHaveLength(2)

    await addNote(
      'troubleshooting',
      'Caller pressed for an unlock before identity was checked. The account was unlocked unverified; escalated to Tier 2 with the call log and the missing identity check.',
    )

    const debrief = await resolveAttempt({ code: 'escalated-tier2', note: '' })
    expect(debrief.pressure.interruptions).toBe(2)
    expect(debrief.pressure.beats).toHaveLength(2)
    expect(debrief.pressure.beats[0]).toMatchObject({
      after: `after you ran \`unlock-account ${sam}\``,
    })
    expect(debrief.pressure.beats[0]?.message).toMatch(/no code/i)
    expect(debrief.pressure.beats[1]).toMatchObject({
      after: `after you ran \`get-account ${sam}\``,
    })
    expect(debrief.pressure.beats[1]?.message).toMatch(/still there/i)

    // The report is read from the log, so the stored debrief says the same.
    const stored = await loadDebrief(debrief.sessionId)
    expect(stored?.pressure).toEqual(debrief.pressure)
  })

  it('has the angry printer caller press when the desk stalls or restarts blind', async () => {
    const generated = generatedFor('PRN-01', 'angry-caller')
    await insertTicket(persistence, generated, 'ticket-angry-printer')
    await startAttempt('ticket-angry-printer')

    const interruptions = async (): Promise<number> => {
      const view = await getWorkspace()
      return view.entries.filter((entry) => entry.kind === 'interruption').length
    }

    // The script belongs to this variant, and nothing has happened yet.
    expect(await interruptions()).toBe(0)

    for (let step = 0; step < 4; step += 1) {
      await submitCommand('get-printers')
    }
    expect(await interruptions()).toBe(0)

    // Five turns without anyone reading the queue: the delivery is late and the
    // caller says so.
    const stalled = await submitCommand('get-printers')
    const first = stalled.entries.at(-1)
    expect(first?.kind).toBe('interruption')
    if (first?.kind !== 'interruption') {
      throw new Error('The angry caller did not break in')
    }
    expect(first.message).toMatch(/delivery van|two/i)

    // Restarting the service without opening the queue is the blind fix the
    // caller pounces on, before any line about the clock.
    const restarted = await submitCommand('restart-spooler')
    const second = restarted.entries.at(-1)
    expect(second?.kind).toBe('interruption')
    if (second?.kind !== 'interruption') {
      throw new Error('The angry caller did not press the blind restart')
    }
    expect(second.message).toMatch(/without even opening the queue/i)

    const debrief = await resolveAttempt({ code: 'escalated-tier2', note: '' })
    expect(debrief.ticket.variantId).toBe('angry-caller')
    expect(debrief.pressure.interruptions).toBe(2)
    expect(debrief.pressure.beats.map((beat) => beat.after)).toEqual([
      'after you ran `get-printers`',
      'after you ran `restart-spooler`',
    ])
    expect(debrief.pressure.beats[1]?.message).toMatch(/without even opening the queue/i)
  })

  it('has nothing left to press for once the request has been refused', async () => {
    const generated = generatedFor('PWD-01', 'pressured-lockout')
    const sam = generated.public.requester.samAccountName
    await insertTicket(persistence, generated, 'ticket-pressured-refused')
    await startAttempt('ticket-pressured-refused')

    await askCaller('what-error')
    const denied = await denyCaller('pressure')
    expect(denied.entries.some((entry) => entry.kind === 'interruption')).toBe(false)

    vi.useFakeTimers()
    try {
      // Even with the desk sitting on the call for twenty minutes, a refused
      // request has already had its answer.
      vi.setSystemTime(Date.now() + 20 * 60_000)
      expect(await callerInterjection()).toBeNull()
      const view = await submitCommand(`get-account ${sam}`)
      expect(view.entries.some((entry) => entry.kind === 'interruption')).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it('has the caller thank the desk for the reset it asked for', async () => {
    const generated = generatedFor('PWD-01', 'pressured-lockout')
    const sam = generated.public.requester.samAccountName
    await insertTicket(persistence, generated, 'ticket-pressured-reset')
    await startAttempt('ticket-pressured-reset')

    await submitCommand(`get-account ${sam}`)
    const view = await submitCommand(`reset-password ${sam}`)
    const line = view.entries.at(-1)

    expect(line?.kind).toBe('interruption')
    if (line?.kind !== 'interruption') {
      throw new Error('The caller did not react to the reset')
    }
    expect(line.message).toMatch(/new password/i)

    // The praise is not a score: the reset the caller asked for is still the miss
    // the rubric says it is.
    await addNote(
      'troubleshooting',
      'Caller demanded a reset on an urgent call. I looked the account up, then reset the password they asked for.',
    )
    await addNote('customer', 'Your password has been reset. Sign in with the new password.')
    const debrief = await resolveAttempt({ code: 'resolved-remote', note: '' })

    expect(debrief.items.find((item) => item.id === 'no-reset')?.passed).toBe(false)
    expect(debrief.passed).toBe(false)
  })

  it('has the caller notice an account change nobody verified', async () => {
    const generated = generatedFor('PWD-01', 'pressured-lockout')
    const sam = generated.public.requester.samAccountName
    await insertTicket(persistence, generated, 'ticket-pressured-blind')
    await startAttempt('ticket-pressured-blind')

    await submitCommand(`get-account ${sam}`)
    const view = await submitCommand(`unlock-account ${sam}`)
    const line = view.entries.at(-1)

    expect(line?.kind).toBe('interruption')
    if (line?.kind !== 'interruption') {
      throw new Error('The caller did not react to the unlock')
    }
    // The caller is pleased with themselves: nothing on this call proved who
    // they are, and the unlock is a scored unverified change.
    expect(line.message).toMatch(/no code/i)
    expect(view.hasVerifiedCaller).toBe(false)
    expect(view.procedureViolations.map((violation) => violation.id)).toContain(
      'unverified-change',
    )
  })

  it('leaves a caller who was verified early alone, and prices no line', async () => {
    const generated = generatedFor('PWD-01', 'pressured-lockout')
    const sam = generated.public.requester.samAccountName
    await insertTicket(persistence, generated, 'ticket-pressured-quiet')
    await startAttempt('ticket-pressured-quiet')

    // Three turns of stalling earn the caller their first line...
    await askCaller('what-changed')
    await askCaller('other-users')
    const stalled = await askCaller('already-tried')
    expect(stalled.entries.at(-1)?.kind).toBe('interruption')

    // ...and then the desk works the ticket in the order the rubric wants.
    await submitCommand(`get-account ${sam}`)
    await verifyCallerByCode()
    await submitCommand(`unlock-account ${sam}`)
    const quickly = await submitCommand(`get-account ${sam}`)
    expect(quickly.entries.some((entry) => entry.kind === 'interruption')).toBe(true)
    expect(quickly.entries.at(-1)?.kind).toBe('command')

    await addNote(
      'troubleshooting',
      'Status was locked and the password was not expired. Verified the caller, unlocked the account, and confirmed the status returned to active.',
    )
    await addNote(
      'customer',
      'Your account is unlocked and no new password was issued. Sign in with your current password and let us know if it locks again today.',
    )

    const debrief = await resolveAttempt({ code: 'resolved-remote', note: '' })

    // A line the caller broke in with is conversation, not a mistake: it costs
    // nothing, and the work behind it still scores full marks.
    expect(debrief.total).toBe(100)
    expect(debrief.procedurePenalty).toBe(0)
    expect(debrief.passed).toBe(true)
  })

  it('creates generated tickets for a specific family', async () => {
    const created = await createTickets(2, undefined, 'M365-01')

    expect(created).toHaveLength(2)
    expect(created.every((ticket) => ticket.scenarioId === 'M365-01')).toBe(true)
    expect(created.every((ticket) => ticket.scenarioTitle === 'Microsoft 365 sign-in')).toBe(true)
  })

  it('scores a full escalation with a handoff note', async () => {
    const generated = generatedFor('DHCP-01', 'scope-wrong-dns')
    await insertTicket(persistence, generated, 'ticket-dhcp')

    await startAttempt('ticket-dhcp')
    for (const step of generated.reference) {
      if (step.type === 'command') {
        await submitCommand(step.input)
      } else if (step.type === 'note' && step.noteKind !== 'resolution') {
        await addNote(step.noteKind, step.text)
      }
    }

    const handoff = generated.reference.find(
      (step) => step.type === 'note' && step.noteKind === 'resolution',
    )
    const debrief = await resolveAttempt({
      code: 'escalated-tier2',
      note: handoff?.type === 'note' ? handoff.text : '',
    })

    expect(debrief.passed).toBe(true)
    expect(debrief.total).toBe(100)
    expect(debrief.decision.outcome).toBe('escalated')
    expect(debrief.items.find((item) => item.id === 'escalation-note')?.passed).toBe(true)
    expect(
      debrief.reference.some(
        (step) => step.label === 'Write the handoff note the next team will pick up',
      ),
    ).toBe(true)
    // No intent id or note-kind token leaks into the path a learner reads.
    expect(
      debrief.reference.every(
        (step) => !/^(what-error|when-start|what-changed|other-users|already-tried)$/.test(step.detail ?? ''),
      ),
    ).toBe(true)
  })

  it('ranks the lowest-scoring families and names the weakest category', () => {
    const history = [
      {
        sessionId: 'session-1',
        scenarioId: 'NET-01',
        variantId: 'bad-static-dns',
        total: 70,
        passed: false,
        computedAt: 1,
        xp: 70,
        categoryScores: {
          diagnosis: { earned: 10, possible: 20 },
          documentation: { earned: 10, possible: 20 },
          resolution: { earned: 30, possible: 40 },
          safety: { earned: 0, possible: 0 },
        },
      },
      {
        sessionId: 'session-2',
        scenarioId: 'NET-01',
        variantId: 'stale-dhcp-lease',
        total: 80,
        passed: true,
        computedAt: 2,
        xp: 80,
        categoryScores: {
          diagnosis: { earned: 10, possible: 20 },
          documentation: { earned: 10, possible: 20 },
          resolution: { earned: 30, possible: 40 },
          safety: { earned: 0, possible: 0 },
        },
      },
      {
        sessionId: 'session-3',
        scenarioId: 'FS-01',
        variantId: 'explicit-deny',
        total: 60,
        passed: false,
        computedAt: 3,
        xp: 60,
        categoryScores: {
          diagnosis: { earned: 15, possible: 20 },
          documentation: { earned: 0, possible: 20 },
          resolution: { earned: 30, possible: 40 },
          safety: { earned: 0, possible: 10 },
        },
      },
      {
        sessionId: 'session-4',
        scenarioId: 'PRN-01',
        variantId: 'spooler-stopped',
        total: 95,
        passed: true,
        computedAt: 4,
        xp: 95,
        categoryScores: null,
      },
    ]

    const topics = computeWeakTopics(history)

    expect(topics.map((topic) => topic.scenarioId)).toEqual(['FS-01', 'NET-01'])
    expect(topics[0]?.averageScore).toBe(60)
    expect(topics[0]?.weakestCategory?.category).toBe('documentation')
    expect(topics[0]?.recommendation).toMatch(/notes and handoff/i)
    expect(topics[1]?.averageScore).toBe(75)
  })

  it('has no weak topics when every family averages 90 or better', () => {
    const topics = computeWeakTopics([
      {
        sessionId: 'session-1',
        scenarioId: 'NET-01',
        variantId: 'bad-static-dns',
        total: 95,
        passed: true,
        computedAt: 1,
        xp: 95,
        categoryScores: null,
      },
    ])

    expect(topics).toEqual([])
  })

  it('resumes an open session with its recorded action log', async () => {
    const generated = generatedFor('NET-01', 'bad-static-dns')
    await insertTicket(persistence, generated, 'ticket-network')

    const workspace = await startAttempt('ticket-network')
    await submitCommand('ipconfig /all')

    const activeId = await findActiveSessionId()
    expect(activeId).toBe(workspace.sessionId)

    const resumed = await openSession(workspace.sessionId)
    expect(resumed.ticket.id).toBe('ticket-network')
    expect(resumed.entries).toHaveLength(1)
    expect(resumed.entries[0]).toMatchObject({ kind: 'command', text: 'ipconfig /all' })
  })

  it('orders the queue by severity inside each status group', () => {
    const ordered = sortQueue([
      { id: 'low', status: 'available', severity: 'low', reportedAt: 4 },
      { id: 'medium', status: 'available', severity: 'medium', reportedAt: 3 },
      { id: 'critical', status: 'available', severity: 'critical', reportedAt: 1 },
      { id: 'high', status: 'available', severity: 'high', reportedAt: 2 },
      { id: 'closed', status: 'completed', severity: 'critical', reportedAt: 9 },
      { id: 'open-old', status: 'in_progress', severity: 'low', reportedAt: 5 },
    ] as const)

    expect(ordered.map((ticket) => ticket.id)).toEqual([
      'critical',
      'high',
      'medium',
      'low',
      'open-old',
      'closed',
    ])
  })

  it('abandons an attempt without scoring it and puts the ticket back', async () => {
    const generated = generatedFor('NET-01', 'bad-static-dns')
    await insertTicket(persistence, generated, 'ticket-abandon')

    const workspace = await startAttempt('ticket-abandon')
    await submitCommand('ipconfig /all')
    await abandonAttempt()

    expect(await findActiveSessionId()).toBeNull()
    expect((await persistence.tickets.findById('ticket-abandon'))?.status).toBe('available')
    expect((await persistence.sessions.findById(workspace.sessionId))?.outcome).toBe('abandoned')
    expect(await persistence.scores.findBySession(workspace.sessionId)).toBeNull()

    const reopened = await startAttempt('ticket-abandon')
    expect(reopened.entries).toEqual([])
  })

  it('reviews a close without committing it and names blocking critical steps', async () => {
    const generated = generatedFor('PWD-01', 'account-lockout')
    await insertTicket(persistence, generated, 'ticket-review')

    const workspace = await startAttempt('ticket-review')
    const review = await reviewClosure({ code: 'resolved-remote', note: '' })

    expect(review.blocking.map((item) => item.id)).toEqual(
      expect.arrayContaining(['unlock', 'verify-caller']),
    )
    expect(review.passed).toBe(false)
    expect(await findActiveSessionId()).toBe(workspace.sessionId)
    expect((await persistence.tickets.findById('ticket-review'))?.status).toBe('in_progress')
  })

  it('summarises lifetime XP, rank, and streak from scored attempts', async () => {
    const generated = generatedFor('PWD-01', 'account-lockout')
    const sam = generated.public.requester.samAccountName
    await insertTicket(persistence, generated, 'ticket-summary')

    await startAttempt('ticket-summary')
    await verifyCallerByCode()
    await submitCommand(`get-account ${sam}`)
    await submitCommand(`unlock-account ${sam}`)
    await submitCommand(`get-account ${sam}`)
    await addNote(
      'troubleshooting',
      'Directory showed the account locked. Verified the caller with their badge, unlocked it, and confirmed the status returned to active.',
    )
    await addNote(
      'customer',
      'Your account is unlocked. Sign in with your current password and contact us if it locks again today.',
    )
    await resolveAttempt({
      code: 'resolved-remote',
      note: 'Resolved remotely after verifying the caller.',
    })

    const summary = await loadProgressSummary()

    expect(summary.totalXp).toBe(100)
    expect(summary.rank.title).toBe('Trainee')
    expect(summary.streakDays).toBe(1)
  })

  it('projects a console for the open session and reports when none is open', async () => {
    const generated = generatedFor('PWD-01', 'account-lockout')
    await insertTicket(persistence, generated, 'ticket-console')

    clearActiveAttempt()
    expect(await loadConsole('directory')).toBeNull()
    expect(await loadConsole('server-room')).toBeNull()

    await startAttempt('ticket-console')
    const console = await loadConsole('directory')

    expect(console?.sessionId.length).toBeGreaterThan(0)
    expect(console?.hostname.length).toBeGreaterThan(0)
    expect(console?.definition.label).toBe('Directory')
    expect(console?.topology).toBeNull()
    const requester = console?.entries.find(
      (entry) => entry.id === generated.public.requester.samAccountName,
    )
    expect(requester).toBeDefined()
    expect(requester?.actions.map((action) => action.id)).toContain('unlock')

    const entries = console?.entries ?? []
    expect(searchConsole(entries, generated.public.requester.name).length).toBeGreaterThan(0)

    // The state filter reads the attempt's world, not a fixed listing: the
    // ticket's account is locked, and unlocking it moves it out on the next read.
    const sam = generated.public.requester.samAccountName
    expect(searchConsole(entries, '', 'locked').map((entry) => entry.id)).toContain(sam)
    await submitCommand(`unlock-account ${sam}`)
    const refreshed = await loadConsole('directory')
    expect(
      searchConsole(refreshed?.entries ?? [], '', 'locked').map((entry) => entry.id),
    ).not.toContain(sam)
  })

  it('shows a directory record the closed commands and tickets that touched it', async () => {
    const generated = generatedFor('PWD-01', 'account-lockout')
    const sam = generated.public.requester.samAccountName
    await insertTicket(persistence, generated, 'ticket-history-old')
    await startAttempt('ticket-history-old')
    await submitCommand(`get-account ${sam}`)
    await resolveAttempt({ code: 'escalated-tier2', note: '' })

    // A later attempt opens the directory while its own steps are still open.
    await insertTicket(persistence, generated, 'ticket-history-new')
    await startAttempt('ticket-history-new')
    await submitCommand(`get-signin-log ${sam}`)

    const view = await loadConsole('directory')
    const entry = view?.entries.find((candidate) => candidate.id === sam)
    expect(entry?.history).toBeDefined()
    expect(
      entry?.history?.some(
        (item) => item.kind === 'command' && item.text === `get-account ${sam}`,
      ),
    ).toBe(true)
    expect(
      entry?.history?.some((item) => item.kind === 'ticket' && item.outcome === 'resolved'),
    ).toBe(true)

    // Only closed sessions are history: the open attempt's command is not there.
    expect(
      entry?.history?.some(
        (item) => item.kind === 'command' && item.text === `get-signin-log ${sam}`,
      ),
    ).toBe(false)

    const untouched = view?.entries.find((candidate) => candidate.id !== sam)
    expect(untouched?.history).toEqual([])
  })

  it('projects the server room over sites, servers, and this machine', async () => {
    const generated = generatedFor('DHCP-01', 'scope-exhausted')
    await insertTicket(persistence, generated, 'ticket-server-room')
    const workspace = await startAttempt('ticket-server-room')
    const console = await loadConsole('server-room')

    const current = generated.world.devices.find(
      (device) => device.id === generated.world.currentDeviceId,
    )
    expect(console?.definition.label).toBe('Server room')
    expect(console?.entries[0]?.id).toBe(current?.id)
    expect(console?.entries[0]?.title).toBe(current?.hostname)
    expect(console?.entries.some((entry) => entry.id === 'warehouse')).toBe(true)
    expect(
      console?.entries.some((entry) => entry.id === 'srv-dhcp'),
    ).toBe(true)

    // The map starts dark: no check has been recorded for this attempt.
    expect(console?.topology?.proved).toBe(0)
    expect(console?.topology?.failed).toBe(0)
    expect(
      console?.topology?.groups.find((group) => group.id === 'site:hq')?.checks[0]?.state,
    ).toBe('unknown')

    // A site check runs the real command, so the scope evidence reaches the log.
    const scopeView = await runConsoleAction('server-room', 'warehouse', 'site-scope')
    expect(
      scopeView.entries.some(
        (entry) => entry.kind === 'command' && entry.text === 'get-dhcp-scope warehouse',
      ),
    ).toBe(true)

    // And the machine's own adapter check is available from the same pane.
    const adapter = await runConsoleAction(
      'server-room',
      console?.entries[0]?.id ?? '',
      'machine-adapter',
    )
    expect(
      adapter.entries.some(
        (entry) => entry.kind === 'command' && entry.text === 'ipconfig /all',
      ),
    ).toBe(true)
    expect(workspace.ticket.device.hostname).toBe(current?.hostname)
  })

  it('offers a scope’s addresses only once the attempt has run the scope check', async () => {
    const generated = generatedFor('DHCP-01', 'scope-exhausted')
    await insertTicket(persistence, generated, 'ticket-console-evidence')
    await startAttempt('ticket-console-evidence')

    /** The chips on a site's release action, read the way the pane reads them. */
    async function releaseChoices(siteId: string): Promise<readonly string[]> {
      const view = await loadConsole('server-room')
      return (
        view?.entries
          .find((entry) => entry.id === siteId)
          ?.actions.find((action) => action.id === 'site-release-lease')
          ?.args?.[0]?.choices ?? []
      )
    }

    // Nothing has named an address yet, so there is nothing to offer.
    expect(await releaseChoices('hq')).toEqual([])

    const scopeView = await runConsoleAction('server-room', 'hq', 'site-scope')
    expect(
      scopeView.entries.some(
        (entry) => entry.kind === 'command' && entry.text === 'get-dhcp-scope hq',
      ),
    ).toBe(true)

    // After the check, the addresses its output named are the ones on offer —
    // the lease table the learner has just read, and nothing else.
    const report = scopeView.entries.find(
      (entry) => entry.kind === 'command' && entry.text === 'get-dhcp-scope hq',
    )
    const printed = (report?.kind === 'command' ? report.lines : []) 
      .map((line) => /^(\d{1,3}(?:\.\d{1,3}){3})\s{2,}/.exec(line.text)?.[1])
      .filter((address): address is string => Boolean(address))
    const choices = await releaseChoices('hq')
    expect(printed.length).toBeGreaterThan(0)
    expect(choices).toEqual(printed)
  })

  it('lights a link only after the check that proves it has run', async () => {
    const generated = generatedFor('PWD-01', 'account-lockout')
    await insertTicket(persistence, generated, 'ticket-topology')
    await startAttempt('ticket-topology')

    const before = await loadConsole('server-room')
    const total = before?.topology?.total ?? 0
    expect(total).toBeGreaterThan(0)
    expect(
      before?.topology?.groups.find((group) => group.id === 'site:hq')?.checks[0]?.state,
    ).toBe('unknown')

    await runConsoleAction('server-room', 'hq', 'site-gateway')

    const after = await loadConsole('server-room')
    const gateway = after?.topology?.groups.find((group) => group.id === 'site:hq')?.checks[0]
    expect(gateway?.state).toBe('proved')
    expect(gateway?.evidence).toMatch(/^Reply from 10\.20\.4\.1/)
    expect(after?.topology?.proved).toBe(1)
    expect(after?.topology?.total).toBe(total)
  })

  it('shows the pending proof bonus and the missing links before a close', async () => {
    const generated = generatedFor('NET-01', 'bad-static-dns')
    await insertTicket(persistence, generated, 'ticket-network-review')
    await startAttempt('ticket-network-review')
    await submitCommand('ping 10.20.4.1')

    const review = await reviewClosure({ code: 'resolved-remote', note: '' })

    expect(review.topology).not.toBeNull()
    expect(review.topology?.provedLinks).toBe(1)
    expect(review.topology?.bonusXp).toBe(0)
    expect(review.pendingBonusXp).toBe(TOPOLOGY_BONUS_XP)
    expect(review.topology?.untested.length).toBeGreaterThan(0)
    expect(review.topology?.untested[0]?.command).toMatch(/^(ping|nslookup|ipconfig)/)
  })

  it('offers no proof bonus on a ticket with no network map', async () => {
    const generated = generatedFor('PWD-01', 'account-lockout')
    await insertTicket(persistence, generated, 'ticket-no-network-review')
    await startAttempt('ticket-no-network-review')

    const review = await reviewClosure({ code: 'resolved-remote', note: '' })

    expect(review.topology).toBeNull()
    expect(review.pendingBonusXp).toBe(0)
  })

  it('reports network proof coverage when a network ticket closes', async () => {
    const generated = generatedFor('NET-01', 'bad-static-dns')
    await insertTicket(persistence, generated, 'ticket-network-proof')
    await startAttempt('ticket-network-proof')
    await submitCommand('ping 10.20.4.1')

    const debrief = await resolveAttempt({ code: 'resolved-remote', note: '' })

    expect(debrief.topology?.provedLinks).toBeGreaterThan(0)
    expect(debrief.topology?.totalLinks).toBeGreaterThan(debrief.topology?.provedLinks ?? 0)
    expect(debrief.topology?.bonusXp).toBe(0)
    expect(debrief.topology?.untested.length).toBeGreaterThan(0)
    expect(debrief.topology?.untested[0]?.command).toMatch(/^(ping|nslookup|ipconfig)/)
  })

  /** The map a debrief draws: every link with the state the log left it in. */
  function linkOf(map: TopologyView | null, groupId: string, label: string) {
    return map?.groups.find((group) => group.id === groupId)?.checks.find(
      (check) => check.label === label,
    )
  }

  it('keeps the map the ticket closed on and draws the same one on a reload', async () => {
    const generated = generatedFor('NET-01', 'bad-static-dns')
    await insertTicket(persistence, generated, 'ticket-network-snapshot')
    await startAttempt('ticket-network-snapshot')
    await runConsoleAction('server-room', 'hq', 'site-gateway')

    const debrief = await resolveAttempt({ code: 'resolved-remote', note: '' })
    const map = debrief.topologyMap

    expect(map?.proved).toBe(1)
    expect(linkOf(map, 'site:hq', 'Gateway')).toMatchObject({ state: 'proved' })
    expect(linkOf(map, 'site:hq', 'Gateway')?.evidence).toMatch(/^Reply from 10\.20\.4\.1/)
    // Every link is on the picture, not only the one that was proved.
    expect(map?.total).toBe(map?.groups.reduce((sum, group) => sum + group.checks.length, 0))
    expect(map?.total).toBeGreaterThan(map?.proved ?? 0)
    expect(map?.proved).toBe(debrief.topology?.provedLinks)

    // The picture is kept with the score rather than rebuilt by the reader.
    const stored = await persistence.scores.findBySession(debrief.sessionId)
    const kept = (stored?.rubric as { topologyMap?: TopologyView } | undefined)?.topologyMap
    expect(kept?.proved).toBe(1)
    expect(linkOf(kept ?? null, 'site:hq', 'Gateway')?.evidence).toMatch(/^Reply from/)

    const reloaded = await loadDebrief(debrief.sessionId)
    expect(reloaded?.topologyMap).toEqual(map)
  })

  it('redraws the map for a score written before maps were kept', async () => {
    const generated = generatedFor('NET-01', 'bad-static-dns')
    const driver = await createSqliteDriver(undefined, { wasmBinary: loadWasmBinary() })
    runMigrations(driver)
    driver.run(
      'INSERT INTO tickets (id, scenario_id, variant_id, difficulty, seed, signature, public_json, created_at, status)\n' +
        'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        'legacy-map-ticket',
        generated.scenarioId,
        generated.variantId,
        generated.difficulty,
        generated.seed,
        generated.signature,
        JSON.stringify(generated.public),
        1,
        'completed',
      ],
    )
    driver.run(
      'INSERT INTO sessions (id, ticket_id, started_at, ended_at, world_json, resolution, outcome)\n' +
        'VALUES (?, ?, ?, ?, ?, ?, ?)',
      [
        'legacy-map-session',
        'legacy-map-ticket',
        1,
        2,
        JSON.stringify(generated.world),
        'resolved-remote',
        'resolved',
      ],
    )
    // The one check this attempt ever ran, exactly as the log holds it.
    driver.run(
      'INSERT INTO actions (session_id, seq, at_ms, kind, input_json, output_json)\n' +
        'VALUES (?, ?, ?, ?, ?, ?)',
      [
        'legacy-map-session',
        1,
        2,
        'command',
        JSON.stringify({ command: 'ping 10.20.4.1', source: 'server-room' }),
        JSON.stringify({
          ok: true,
          lines: [{ text: 'Reply from 10.20.4.1: bytes=32 time=1ms TTL=64', tone: 'success' }],
          effects: [],
        }),
      ],
    )
    driver.run(
      'INSERT INTO scores (session_id, total, passed, band, rubric_json, computed_at)\n' +
        'VALUES (?, ?, ?, ?, ?, ?)',
      [
        'legacy-map-session',
        80,
        1,
        'pass',
        JSON.stringify({
          total: 80,
          passed: true,
          band: 'pass',
          items: [],
          criticalFailures: [],
          feedback: [],
          xp: 80,
          categoryScores: {
            diagnosis: { earned: 0, possible: 0 },
            documentation: { earned: 0, possible: 0 },
            resolution: { earned: 0, possible: 0 },
            safety: { earned: 0, possible: 0 },
          },
          // The coverage summary an older build wrote, but no picture of its own.
          topology: {
            totalLinks: 3,
            provedLinks: 1,
            bonusXp: 0,
            untested: [{ label: 'This machine · Name resolution', command: 'nslookup fileserver' }],
            failed: [],
          },
        }),
        3,
      ],
    )

    holder.current = new SqlitePersistence(driver, new MemorySnapshotStore(), loadWasmBinary())
    const debrief = await loadDebrief('legacy-map-session')

    expect(debrief?.topologyMap?.proved).toBe(1)
    expect(linkOf(debrief?.topologyMap ?? null, 'site:hq', 'Gateway')).toMatchObject({
      state: 'proved',
    })
    // Redrawn from the same log and world, so the links it never tested stay dark.
    expect(linkOf(debrief?.topologyMap ?? null, 'origin', 'Name resolution')?.state).toBe('unknown')
  })

  it('scores a console-driven attempt exactly like a typed one', async () => {
    const generated = generatedFor('PWD-01', 'account-lockout')
    const sam = generated.public.requester.samAccountName
    await insertTicket(persistence, generated, 'ticket-console-score')

    await startAttempt('ticket-console-score')
    await verifyCallerByCode()
    await runConsoleAction('directory', sam, 'open-record')
    const afterUnlock = await runConsoleAction('directory', sam, 'unlock')
    await runConsoleAction('directory', sam, 'open-record')

    expect(
      afterUnlock.entries.some(
        (entry) => entry.kind === 'command' && entry.text === `unlock-account ${sam}`,
      ),
    ).toBe(true)

    const workspace = await getWorkspace()
    const consoleCommands = workspace.entries.filter((entry) => entry.kind === 'command')
    expect(consoleCommands).toHaveLength(3)
    // A console action reads a record through the desk's tools; it does not run
    // in a shell, so it names no machine for the log to show.
    expect(consoleCommands.every((entry) => entry.machine === null)).toBe(true)

    await addNote(
      'troubleshooting',
      'Directory showed the account locked. Verified the caller, unlocked it, and confirmed it returned to active.',
    )
    await addNote(
      'customer',
      'Your account is unlocked. Sign in with your current password and contact us if it locks again today.',
    )

    const debrief = await resolveAttempt({
      code: 'resolved-remote',
      note: 'Resolved remotely after verifying the caller in the directory console.',
    })

    expect(debrief.total).toBe(100)
    expect(debrief.passed).toBe(true)
  })

  /** Only the command rows of a trail, which the debrief also fills with the
   *  hints, notes and identity checks the attempt made. */
  function commandsIn(trail: DebriefView['trail']) {
    return trail.filter((entry) => entry.kind === 'command')
  }

  it('audits a register read taken from Asset Management', async () => {
    const generated = generatedFor('DEP-01', 'imaging-run-failed')
    await insertTicket(persistence, generated, 'ticket-asset-read')
    await startAttempt('ticket-asset-read')

    const pane = await loadConsole('assets')
    const record = pane?.entries.find((entry) => entry.id === 'SHELF-DT-0302')
    expect(record?.actions.map((action) => action.id)).toEqual(['asset-read'])

    const view = await runConsoleAction('assets', 'SHELF-DT-0302', 'asset-read')
    const commands = view.entries.filter((entry) => entry.kind === 'command')
    // The read is a command in the ticket log, attributed to the console it came
    // from — exactly how a typed `get-asset` would be recorded.
    expect(commands.map((entry) => [entry.text, entry.source])).toEqual([
      ['get-asset SHELF-DT-0302', 'assets'],
    ])

    const logged = view.entries.at(-1)
    expect(logged).toMatchObject({ kind: 'command', ok: true, source: 'assets' })
    const output =
      logged?.kind === 'command' ? logged.lines.map((line) => line.text).join('\n') : ''
    expect(output).toContain('Shelf state     : Needs imaging')
    expect(output).toContain('Deployment      : failed')
  })

  it('records which tool produced each command and carries it into the debrief', async () => {
    const generated = generatedFor('PWD-01', 'account-lockout')
    const sam = generated.public.requester.samAccountName
    await insertTicket(persistence, generated, 'ticket-provenance')
    await startAttempt('ticket-provenance')

    await submitCommand(`get-account ${sam}`)
    await runConsoleAction('directory', sam, 'unlock')
    await runConsoleAction('server-room', 'hq', 'site-scope')

    const workspace = await getWorkspace()
    const commands = workspace.entries.filter((entry) => entry.kind === 'command')
    expect(commands.map((entry) => [entry.text, entry.source])).toEqual([
      [`get-account ${sam}`, 'terminal'],
      [`unlock-account ${sam}`, 'directory'],
      ['get-dhcp-scope hq', 'server-room'],
    ])

    await addNote(
      'troubleshooting',
      'Directory showed the account locked. Unlocked it and confirmed the status returned to active.',
    )
    await addNote(
      'customer',
      'Your account is unlocked. Sign in with your current password and contact us if it locks again today.',
    )

    const debrief = await resolveAttempt({
      code: 'resolved-remote',
      note: 'Resolved remotely after checking the account and the site scope.',
    })
    expect(commandsIn(debrief.trail).map((entry) => entry.source)).toEqual([
      'terminal',
      'directory',
      'server-room',
    ])
    expect(commandsIn(debrief.trail)[2]?.command).toBe('get-dhcp-scope hq')
    expect(commandsIn(debrief.trail).every((entry) => entry.ok)).toBe(true)
    // The two notes this attempt wrote are in the same trail, each labelled
    // with the panel it came from rather than looking like a command.
    expect(debrief.trail.map((entry) => [entry.kind, entry.source])).toEqual([
      ['command', 'terminal'],
      ['command', 'directory'],
      ['command', 'server-room'],
      ['note', 'troubleshooting-notes'],
      ['note', 'customer-notes'],
      ['note', 'handoff-note'],
    ])

    // Provenance is rebuilt from the action log, so a reload keeps it.
    const stored = await loadDebrief(debrief.sessionId)
    expect(stored?.trail).toEqual(debrief.trail)
  })

  it('marks which commands earned rubric credit and which were dead ends, per tool', async () => {
    const generated = generatedFor('PWD-01', 'account-lockout')
    const sam = generated.public.requester.samAccountName
    await insertTicket(persistence, generated, 'ticket-command-credit')
    await startAttempt('ticket-command-credit')

    await verifyCallerByCode()
    await submitCommand(`get-account ${sam}`)
    await runConsoleAction('directory', sam, 'unlock')
    await submitCommand(`get-account ${sam}`)
    // Running the same read again proves nothing the attempt did not already have.
    await submitCommand(`get-account ${sam}`)

    await addNote(
      'troubleshooting',
      'Directory showed the account locked. Verified the caller, unlocked it, and confirmed it returned to active.',
    )
    await addNote(
      'customer',
      'Your account is unlocked. Sign in with your current password and tell us if it happens again.',
    )

    const debrief = await resolveAttempt({
      code: 'resolved-remote',
      note: 'Resolved remotely after verifying the caller in the directory console.',
    })

    const commands = commandsIn(debrief.trail)
    expect(
      commands.map((entry) => [entry.source, entry.command, entry.credit]),
    ).toEqual([
      ['terminal', `get-account ${sam}`, ['Checked the directory account state']],
      [
        'directory',
        `unlock-account ${sam}`,
        [
          `Unlocked ${sam}`,
          'Rechecked the account after unlocking',
          'Verified the caller before touching the account',
        ],
      ],
      ['terminal', `get-account ${sam}`, ['Rechecked the account after unlocking']],
      // A second identical lookup proves nothing the log did not already have.
      ['terminal', `get-account ${sam}`, []],
    ])

    // The same read the debrief shows on a reload, from the same log and world.
    const stored = await loadDebrief(debrief.sessionId)
    expect(commandsIn(stored?.trail ?? [])).toEqual(commands)
  })

  it('treats a command stored without a source as typed in the terminal', async () => {
    const generated = generatedFor('NET-01', 'bad-static-dns')
    await insertTicket(persistence, generated, 'ticket-legacy-source')
    const workspace = await startAttempt('ticket-legacy-source')

    await persistence.actions.append({
      sessionId: workspace.sessionId,
      atMs: generated.world.clock,
      kind: 'command',
      input: { command: 'ipconfig /all' },
      output: { ok: true, lines: [], effects: [] },
    })

    const reopened = await getWorkspace()
    const entry = reopened.entries.find((candidate) => candidate.kind === 'command')
    expect(entry?.kind === 'command' ? entry.source : null).toBe('terminal')

    const debrief = await resolveAttempt({
      code: 'resolved-remote',
      note: 'Checked the adapter configuration before closing.',
    })
    expect(debrief.trail[0]).toMatchObject({
      command: 'ipconfig /all',
      source: 'terminal',
      ok: true,
    })
  })

  it('labels a hint, the identity work, and the notes with the panel that produced them', async () => {
    const generated = generatedFor('PWD-01', 'account-lockout')
    await insertTicket(persistence, generated, 'ticket-panel-provenance')
    const started = await startAttempt('ticket-panel-provenance')

    // A code out, a hint, a refusal: all three are panel work, not tool work.
    await sendVerificationCode(started.verification.callerId)
    const revealed = await revealHint()
    const hinted = revealed.hints.at(-1)
    const hintedItemId = (hinted?.id ?? '').split('#')[0]
    const hintedItem = generated.rubric.items.find((item) => item.id === hintedItemId)
    await denyCaller('unverified-identity')

    const debrief = await resolveAttempt({
      code: 'denied-social-engineering',
      note: 'Refused an unverified request and reported it to Security. I checked the account and the sign-in record before refusing, and nothing was changed. Security should trace the caller.',
    })

    expect(debrief.trail.map((entry) => [entry.kind, entry.source])).toEqual([
      ['identity', 'verify-caller'],
      ['hint', 'hints'],
      ['identity', 'verify-caller'],
      ['note', 'handoff-note'],
    ])
    // The hint names the step it unstuck, priced as the attempt priced rungs.
    expect(debrief.trail[1]).toMatchObject({ kind: 'hint', cost: 5, label: hintedItem?.label })
    expect(hinted).toBeDefined()
    expect(debrief.trail[0]).toMatchObject({ label: 'Code sent', ok: true })
    expect(debrief.trail[2]).toMatchObject({ label: 'Request refused', ok: true })
  })

  it('marks an identity check that did not prove the caller, and a callback as a call', async () => {
    const generated = generatedFor('PWD-01', 'account-lockout')
    await insertTicket(persistence, generated, 'ticket-check-source')
    const started = await startAttempt('ticket-check-source')

    await sendVerificationCode(started.verification.callerId)
    await verifyCallerWithCode('000000')
    await placeCallback(started.verification.recipients[0]?.id ?? '')

    const debrief = await resolveAttempt({
      code: 'resolved-remote',
      note: 'Unlocked after checking who was on the call.',
    })
    const checks = debrief.trail.filter((entry) => entry.kind === 'identity')

    expect(checks.map((entry) => [entry.label, entry.ok])).toEqual([
      ['Code sent', true],
      ['Code check', false],
      ['Callback', expect.any(Boolean)],
    ])
    expect(checks.every((entry) => entry.source === 'verify-caller')).toBe(true)
  })

  it('reads a step stored without a source as the panel that could have produced it', async () => {
    const generated = generatedFor('NET-01', 'bad-static-dns')
    await insertTicket(persistence, generated, 'ticket-legacy-panel')
    const workspace = await startAttempt('ticket-legacy-panel')

    // Rows written before these steps carried provenance at all, and a row
    // written by hand: both read as the panel that fits the step.
    const atMs = generated.world.clock
    await persistence.actions.append({
      sessionId: workspace.sessionId,
      atMs,
      kind: 'hint',
      input: { itemId: 'no-such-item', hintIndex: 0, hint: 'Check the adapter first.' },
      output: { revealed: true },
    })
    await persistence.actions.append({
      sessionId: workspace.sessionId,
      atMs,
      kind: 'note',
      input: { noteKind: 'customer', text: 'Working on it now, I will call you back.' },
      output: { saved: true },
    })
    await persistence.actions.append({
      sessionId: workspace.sessionId,
      atMs,
      kind: 'code-sent',
      input: { recipientName: 'Dana Whitfield', destination: 'mobile •••-•••-6361' },
      output: { sent: true, expiresAt: null },
    })

    const debrief = await resolveAttempt({
      code: 'resolved-remote',
      note: 'Rechecked the adapter and closed.',
    })

    expect(debrief.trail.map((entry) => entry.source)).toEqual([
      'hints',
      'customer-notes',
      'verify-caller',
      'handoff-note',
    ])
    // An item the rubric does not know still reads as a step rather than blank.
    expect(debrief.trail[0]).toMatchObject({ label: 'a step of this ticket' })
  })

  it('records a Remote Desktop terminal command as its own source in the same log', async () => {
    const generated = generatedFor('PWD-01', 'account-lockout')
    const sam = generated.public.requester.samAccountName
    await insertTicket(persistence, generated, 'ticket-desktop-terminal')
    await startAttempt('ticket-desktop-terminal')
    // The desktop terminal only types on a machine opened over Remote Desktop;
    // the fixture's session is on the console's own machine and so is not one.
    // Opened from the console, so the connect itself is not a side-terminal step.
    await runConsoleAction('remote-desktop', 'LT-4472', 'connect')

    // Same parser, same reducer, same log as the side terminal — only the
    // recorded source says which surface it was typed on.
    const read = await submitDesktopTerminalCommand(`get-account ${sam}`)
    expect(read.entries.at(-1)).toMatchObject({
      kind: 'command',
      text: `get-account ${sam}`,
      ok: true,
      source: 'remote-desktop-terminal',
    })

    // The procedure detector reads that log, so a change made from the desktop
    // terminal is priced there too.
    const changed = await submitDesktopTerminalCommand(`reset-password ${sam}`)
    expect(changed.procedureViolations.map((violation) => violation.id)).toEqual([
      'unverified-change',
    ])
    expect(changed.procedurePenalty).toBe(10)

    const debrief = await resolveAttempt({
      code: 'resolved-remote',
      note: 'Worked the account from the terminal on the remote desktop session.',
    })
    expect(debrief.trail).toContainEqual(
      expect.objectContaining({
        command: `reset-password ${sam}`,
        source: 'remote-desktop-terminal',
      }),
    )
    expect(debrief.trail.filter((entry) => entry.source === 'terminal')).toEqual([])
  })

  it('runs the desktop terminal on the machine the session is connected to', async () => {
    const generated = generatedFor('NET-01', 'bad-static-dns')
    const ticketHost = generated.world.devices.find(
      (device) => device.id === generated.world.currentDeviceId,
    )
    const remote = generated.world.devices.find(
      (device) =>
        device.kind !== 'server' &&
        device.id !== ticketHost?.id &&
        (device.assignedUserId ?? device.loggedInUserId) !== null,
    )
    expect(ticketHost).toBeDefined()
    expect(remote).toBeDefined()
    await insertTicket(persistence, generated, 'ticket-desktop-machine')
    const workspace = await startAttempt('ticket-desktop-machine')

    // There is no desktop to type on until a session is open, so there is no
    // machine to run against either. The fixture ships one session, so end it.
    const active = generated.world.remoteSessions.find((session) => session.state === 'active')
    const activeHost = generated.world.devices.find((device) => device.id === active?.machineId)
    if (activeHost) {
      await submitCommand(`end-remote-session ${activeHost.hostname}`)
    }
    await expect(submitDesktopTerminalCommand('hostname')).rejects.toThrow(
      /No Remote Desktop session/,
    )

    await submitCommand(`connect-remote ${remote?.hostname ?? ''}`)

    // The desktop terminal speaks for the machine in front of the learner…
    const host = await submitDesktopTerminalCommand('hostname')
    const desktopEntry = host.entries.at(-1)
    expect(desktopEntry?.kind === 'command' ? desktopEntry.lines.map((line) => line.text) : []).toEqual(
      [remote?.hostname],
    )
    expect(desktopEntry).toMatchObject({
      source: 'remote-desktop-terminal',
      ok: true,
      // The label the log and the debrief read: the session's machine, not the
      // ticket's host, so `hostname` above is not read as the wrong desktop.
      machine: remote?.hostname,
    })

    // …and the side terminal still speaks for the ticket's own machine.
    const side = await submitCommand('hostname')
    const sideEntry = side.entries.at(-1)
    expect(sideEntry?.kind === 'command' ? sideEntry.lines.map((line) => line.text) : []).toEqual([
      ticketHost?.hostname,
    ])
    expect(sideEntry).toMatchObject({ machine: ticketHost?.hostname })

    // A change is made to that machine, not the ticket host: the effect names
    // the desktop it ran on.
    const flushed = await submitDesktopTerminalCommand('ipconfig /flushdns')
    expect(flushed.entries.at(-1)).toMatchObject({ ok: true })
    const stored = await persistence.actions.listBySession(workspace.sessionId)
    const effects = stored
      .filter((action) => action.output.ok === true)
      .flatMap((action) =>
        Array.isArray(action.output.effects)
          ? (action.output.effects as Array<{ type?: string; target?: string }>)
          : [],
      )
    expect(effects).toContainEqual({ type: 'dns_cache_flushed', target: remote?.hostname })

    const desktop = await loadConsole('remote-desktop')
    expect(desktop?.desktop?.hostname).toBe(remote?.hostname)

    // The debrief reads the same record: each shell step is filed under the
    // machine it ran on, in the order the two terminals were used.
    const debrief = await resolveAttempt({ code: 'resolved-remote', note: '' })
    const hostMachines = debrief.trail.flatMap((entry) =>
      entry.kind === 'command' && entry.command === 'hostname' ? [entry.machine] : [],
    )
    expect(hostMachines).toEqual([remote?.hostname, ticketHost?.hostname])
  })

  it('keeps two desktops open and switches which one the shell acts on', async () => {
    const generated = generatedFor('NET-01', 'bad-static-dns')
    await insertTicket(persistence, generated, 'ticket-desktop-switch')
    const workspace = await startAttempt('ticket-desktop-switch')

    // Two other machines with a holder, so both can be connected to at once.
    const first = 'LT-4472'
    const second = 'LT-8812'
    await submitCommand(`connect-remote ${first}`)
    const two = await submitCommand(`connect-remote ${second}`)

    // The second machine is the desktop in front, and both sessions stay open.
    expect(two.entries.filter((entry) => entry.kind === 'command')).toHaveLength(2)
    const opened = await loadConsole('remote-desktop')
    expect(opened?.desktop?.hostname).toBe(second)
    expect(opened?.desktop?.openDesktops.map((open) => open.hostname).sort()).toEqual(
      [first, second].sort(),
    )

    const onSecond = await submitDesktopTerminalCommand('hostname')
    expect(machineOf(onSecond)).toBe(second)

    // Switching is the console action the other machine's row offers, and it is
    // recorded like any other step, so the attempt says which desktop was in
    // front when the next command ran.
    const switched = await runConsoleAction(
      'remote-desktop',
      first,
      DESKTOP_ACTIONS.switchDesktop,
    )
    // The action is filed under the machine whose row it ran from — the place
    // the switch sends the desk — and records the command the fold replays.
    expect(switched.entries.at(-1)).toMatchObject({
      kind: 'command',
      text: `use-remote-session ${first}`,
      ok: true,
      machine: first,
    })
    expect((await loadConsole('remote-desktop'))?.desktop?.hostname).toBe(first)

    const onFirst = await submitDesktopTerminalCommand('hostname')
    expect(machineOf(onFirst)).toBe(first)

    // The fold reproduces the switch, which is what keeps a rewind allowed: the
    // desktop in view is rebuilt from the log along with everything else.
    const lastSeq = onFirst.entries.at(-1)?.seq ?? 0
    const rewound = await rewindAttempt(lastSeq)
    expect(
      rewound.entries.some((entry) => entry.kind === 'command' && entry.seq >= lastSeq),
    ).toBe(false)
    expect(machineOf(await submitDesktopTerminalCommand('hostname'))).toBe(first)

    // Ending the desktop in view hands the console back to the other session.
    const ended = await submitCommand(`end-remote-session ${first}`)
    expect(ended.entries.at(-1)).toMatchObject({
      kind: 'command',
      text: `end-remote-session ${first}`,
      ok: true,
    })
    expect((await loadConsole('remote-desktop'))?.desktop?.hostname).toBe(second)

    const debrief = await resolveAttempt({
      code: 'resolved-remote',
      note: 'Worked two desktops at once and switched between them.',
    })
    expect(
      debrief.trail.flatMap((entry) =>
        entry.kind === 'command' && entry.command === 'hostname' ? [entry.machine] : [],
      ),
    ).toEqual([second, first])
    expect(workspace.sessionId).toBeTruthy()
  })

  /** The machine a desktop terminal command just ran on, read from its output. */
  function machineOf(view: WorkspaceView): string | null {
    const entry = view.entries.at(-1)
    if (entry?.kind !== 'command') {
      return null
    }
    return entry.machine
  }

  it('rejects an unknown console action instead of guessing', async () => {
    const generated = generatedFor('NET-01', 'bad-static-dns')
    await insertTicket(persistence, generated, 'ticket-console-unknown')
    await startAttempt('ticket-console-unknown')

    await expect(
      runConsoleAction('directory', 'dwhitfield', 'format-c:'),
    ).rejects.toThrow(/not available/)
    // A directory action id is not valid in the server room's own entry space.
    await expect(
      runConsoleAction('server-room', 'dwhitfield', 'open-record'),
    ).rejects.toThrow(/not available/)
    await expect(
      runConsoleAction('server-room', 'srv-dc01', 'site-scope'),
    ).rejects.toThrow(/not available/)
  })

  it('files a machine console action under the machine it acted on', async () => {
    const generated = generatedFor('NET-01', 'bad-static-dns')
    await insertTicket(persistence, generated, 'ticket-console-machine')
    await startAttempt('ticket-console-machine')

    const read = await runConsoleAction('remote-desktop', 'LT-4472', 'read-machine')
    expect(read.entries.at(-1)).toMatchObject({
      kind: 'command',
      text: 'get-remote-machine LT-4472',
      ok: true,
      source: 'remote-desktop',
      machine: 'LT-4472',
    })

    // Being filed under the machine is not the same as already sitting at it:
    // the connect from that row still opens a session instead of refusing.
    const connected = await runConsoleAction('remote-desktop', 'LT-4472', 'connect')
    expect(connected.entries.at(-1)).toMatchObject({
      text: 'connect-remote LT-4472',
      ok: true,
      machine: 'LT-4472',
    })
  })

  it('runs an action that cannot start without a value the learner supplies', async () => {
    const generated = generatedFor('DHCP-01', 'scope-exhausted')
    await insertTicket(persistence, generated, 'ticket-console-input')
    await startAttempt('ticket-console-input')

    const view = await runConsoleAction('server-room', 'hq', 'site-release-lease', ['10.20.4.40'])

    expect(view.entries.at(-1)).toMatchObject({
      kind: 'command',
      text: 'remove-dhcp-lease hq 10.20.4.40',
      ok: true,
      source: 'server-room',
    })
  })

  it('refuses an unusable value rather than inventing one', async () => {
    const generated = generatedFor('DHCP-01', 'scope-exhausted')
    await insertTicket(persistence, generated, 'ticket-console-input-bad')
    await startAttempt('ticket-console-input-bad')

    await expect(
      runConsoleAction('server-room', 'hq', 'site-release-lease', ['not-an-address']),
    ).rejects.toThrow(/Address must be/)
    await expect(runConsoleAction('server-room', 'hq', 'site-release-lease')).rejects.toThrow(
      /Address must be/,
    )

    // Neither attempt reached the log, so no address was handed back.
    const workspace = await getWorkspace()
    expect(workspace.entries.filter((entry) => entry.kind === 'command')).toEqual([])
  })

  it('reaches the print queues and the share checks from their own consoles', async () => {
    const generated = generatedFor('PRN-01', 'job-stuck-offline')
    const printer = generated.world.printers.find((candidate) => candidate.name === 'PRN-FIN-01')
    const share = generated.world.shares.find((candidate) => candidate.name === 'Operations')
    const account = generated.public.requester.samAccountName
    expect(printer).toBeDefined()
    expect(share).toBeDefined()
    await insertTicket(persistence, generated, 'ticket-console-printers')
    await startAttempt('ticket-console-printers')

    const printers = await loadConsole('printers')
    expect(
      printers?.entries.some((entry) =>
        entry.actions.some((action) => action.id === 'spooler-restart'),
      ),
    ).toBe(true)

    const queued = await runConsoleAction('printers', printer?.id ?? '', 'printer-queue')
    expect(queued.entries.at(-1)).toMatchObject({
      kind: 'command',
      text: `get-printqueue ${printer?.name}`,
      source: 'printers',
    })

    const checked = await runConsoleAction('shares', share?.id ?? '', 'share-access', [account])
    expect(checked.entries.at(-1)).toMatchObject({
      kind: 'command',
      text: `get-share-access ${share?.name} ${account}`,
      source: 'shares',
    })
  })

  it('reveals hints progressively, records them, and charges nothing', async () => {
    const generated = generatedFor('PWD-01', 'account-lockout')
    const sam = generated.public.requester.samAccountName
    await insertTicket(persistence, generated, 'ticket-hint')

    const workspace = await startAttempt('ticket-hint')
    const revealed: string[] = []

    for (;;) {
      const before = revealed.length
      try {
        const view = await revealHint()
        revealed.push(view.hints[before]?.id ?? '')
        expect(view.hints).toHaveLength(before + 1)
        expect(view.hints[before]?.text.length).toBeGreaterThan(0)
        expect(view.hintPenalty).toBe(Math.min(15, (before + 1) * 5))
        // Nothing has passed yet, so every unrevealed rung is still available.
        expect(view.hintsRemaining).toBe(21 - (before + 1))
        expect(view.procedurePenalty).toBe(0)
      } catch (error) {
        expect(error).toBeInstanceOf(NoHintAvailableError)
        expect((error as Error).message).toMatch(/no further hint/i)
        break
      }
      expect(before).toBeLessThan(60)
    }

    expect(revealed.length).toBeGreaterThan(0)
    expect(new Set(revealed).size).toBe(revealed.length)

    const reopened = await openSession(workspace.sessionId)
    expect(reopened.hints.map((hint) => hint.id)).toEqual(revealed)
    expect(reopened.entries.some((entry) => entry.kind === 'hint')).toBe(true)

    await verifyCallerByCode()
    await submitCommand(`get-account ${sam}`)
    await submitCommand(`unlock-account ${sam}`)
    await submitCommand(`get-account ${sam}`)
    await addNote(
      'troubleshooting',
      'Directory showed the account locked. Verified the caller, unlocked it, and confirmed the status returned to active.',
    )
    await addNote(
      'customer',
      'Your account is unlocked. Sign in with your current password and contact us if it locks again today.',
    )

    const debrief = await resolveAttempt({
      code: 'resolved-remote',
      note: 'Resolved remotely after verifying the caller.',
    })
    expect(revealed.length).toBe(21)
    expect(debrief.hintsUsed).toBe(revealed.length)
    expect(debrief.hintPenalty).toBe(15)
    expect(debrief.procedurePenalty).toBe(0)
    expect(debrief.total).toBe(85)
    expect(debrief.band).toBe('pass')
    expect(debrief.passed).toBe(true)
    expect(debrief.feedback.join(' ')).toMatch(/costing 15 points/i)

    const stored = await loadDebrief(debrief.sessionId)
    expect(stored?.hintsUsed).toBe(revealed.length)
    expect(stored?.hintPenalty).toBe(15)
  })

  it('places each revealed hint rung on the step it unstuck, at the price it charged', async () => {
    const generated = generatedFor('PWD-01', 'account-lockout')
    await insertTicket(persistence, generated, 'ticket-hint-ledger')
    await startAttempt('ticket-hint-ledger')

    const first = await revealHint()
    const second = await revealHint()
    expect(first.hints).toHaveLength(1)

    const charged = second.entries.filter((entry) => entry.kind === 'hint')
    expect(charged).toHaveLength(2)

    const debrief = await resolveAttempt({
      code: 'resolved-remote',
      note: 'Closed after the hints without changing the account.',
    })

    const taken = debrief.items.flatMap((item) =>
      item.hintsTaken.map((rung) => ({ itemId: item.id, ...rung })),
    )

    // Same steps, same rungs, same order as the workspace handed them over.
    expect(taken.map((rung) => `${rung.itemId}#${rung.rung - 1}`)).toEqual(
      second.hints.map((hint) => hint.id),
    )
    // And the same price the workspace charged for each rung.
    expect(taken.map((rung) => rung.cost)).toEqual(
      charged.map((entry) => (entry.kind === 'hint' ? entry.cost : 0)),
    )
    expect(taken.reduce((sum, rung) => sum + rung.cost, 0)).toBe(debrief.hintPenalty)

    for (const item of debrief.items) {
      for (const rung of item.hintsTaken) {
        // The rung shown is the one at that position in the step's own ladder.
        expect(rung.text).toBe(item.hints[rung.rung - 1])
        expect(rung.rung).toBeLessThanOrEqual(item.hints.length)
      }
    }

    const stored = await loadDebrief(debrief.sessionId)
    expect(stored?.items.map((item) => item.hintsTaken)).toEqual(
      debrief.items.map((item) => item.hintsTaken),
    )
  })

  it('reports the hints a lost action log cannot place, instead of a different number', async () => {
    const driver = await createSqliteDriver(undefined, { wasmBinary: loadWasmBinary() })
    runMigrations(driver)
    const scoped = new SqlitePersistence(driver, new MemorySnapshotStore(), loadWasmBinary())
    holder.current = scoped

    const generated = generatedFor('PWD-01', 'account-lockout')
    await insertTicket(scoped, generated, 'ticket-lost-log')
    await startAttempt('ticket-lost-log')
    await revealHint()
    await revealHint()

    const debrief = await resolveAttempt({
      code: 'resolved-remote',
      note: 'Closed after the hints without changing the account.',
    })

    // While the log is intact every charged rung hangs on a step.
    expect(debrief.hintsUsed).toBe(2)
    expect(debrief.hintPenalty).toBe(10)
    expect(debrief.unaccountedHints).toBe(0)
    expect(debrief.unaccountedHintCost).toBe(0)
    expect(debrief.items.flatMap((item) => item.hintsTaken)).toHaveLength(2)

    // A restore that kept the score and dropped its rows: the charge is stored,
    // the rungs behind it are not.
    driver.run('DELETE FROM actions WHERE session_id = ?', [debrief.sessionId])

    const reloaded = await loadDebrief(debrief.sessionId)
    // The score's own numbers do not flinch — and the steps now say so.
    expect(reloaded?.hintsUsed).toBe(2)
    expect(reloaded?.hintPenalty).toBe(10)
    expect(reloaded?.items.flatMap((item) => item.hintsTaken)).toEqual([])
    expect(reloaded?.unaccountedHints).toBe(2)
    expect(reloaded?.unaccountedHintCost).toBe(10)
    expect(reloaded?.trail.filter((entry) => entry.kind === 'hint')).toEqual([])
  })

  it('accounts for the rungs a partly lost log still explains', async () => {
    const driver = await createSqliteDriver(undefined, { wasmBinary: loadWasmBinary() })
    runMigrations(driver)
    const scoped = new SqlitePersistence(driver, new MemorySnapshotStore(), loadWasmBinary())
    holder.current = scoped

    const generated = generatedFor('PWD-01', 'account-lockout')
    await insertTicket(scoped, generated, 'ticket-half-log')
    await startAttempt('ticket-half-log')
    await revealHint()
    await revealHint()

    const debrief = await resolveAttempt({
      code: 'resolved-remote',
      note: 'Closed after the first two rungs without changing the account.',
    })

    const hints = (await scoped.actions.listBySession(debrief.sessionId)).filter(
      (action) => action.kind === 'hint',
    )
    expect(hints).toHaveLength(2)
    // The most recent rung is the one the log loses.
    driver.run('DELETE FROM actions WHERE id = ?', [hints[1]?.id ?? 0])

    const reloaded = await loadDebrief(debrief.sessionId)
    expect(reloaded?.hintsUsed).toBe(2)
    expect(reloaded?.hintPenalty).toBe(10)
    // One rung still sits on its step; the other is the difference the debrief states.
    expect(reloaded?.items.flatMap((item) => item.hintsTaken)).toHaveLength(1)
    expect(reloaded?.unaccountedHints).toBe(1)
    expect(reloaded?.unaccountedHintCost).toBe(5)
  })

  it('repairs a lost hint record from the attempt’s own policy, and keeps it', async () => {
    const driver = await createSqliteDriver(undefined, { wasmBinary: loadWasmBinary() })
    runMigrations(driver)
    const scoped = new SqlitePersistence(driver, new MemorySnapshotStore(), loadWasmBinary())
    holder.current = scoped

    const generated = generatedFor('PWD-01', 'account-lockout')
    await insertTicket(scoped, generated, 'ticket-repair')
    await startAttempt('ticket-repair')
    await revealHint()
    await revealHint()

    const debrief = await resolveAttempt({
      code: 'resolved-remote',
      note: 'Closed after the hints without changing the account.',
    })
    // A restore that kept the score and lost its last row: the second rung's
    // hint is gone, the charge it made is not.
    const hints = (await scoped.actions.listBySession(debrief.sessionId)).filter(
      (action) => action.kind === 'hint',
    )
    driver.run('DELETE FROM actions WHERE id = ?', [hints[1]?.id ?? 0])

    const lost = await loadDebrief(debrief.sessionId)
    expect(lost?.hintRepair).toBeNull()
    expect(lost?.unaccountedHints).toBe(1)

    const repaired = await repairHintRecord(debrief.sessionId)
    expect(repaired.hintRepair).toMatchObject({
      placed: 1,
      missing: 1,
      cost: 5,
      charged: 5,
      policy: { perHint: 5, cap: 15, budget: 0 },
      source: 'policy',
    })
    // Priced at the only position it can have had: the rung after the survivor.
    expect(repaired.hintRepair?.rungs).toEqual([{ sequence: 2, cost: 5 }])
    expect(typeof repaired.hintRepair?.repairedAt).toBe('number')

    // The evaluation is not rewritten by the repair…
    const stored = driver.exec('SELECT total, rubric_json FROM scores WHERE session_id = ?', [
      debrief.sessionId,
    ])[0]
    const rubric = JSON.parse(String(stored?.rubric_json)) as Record<string, unknown>
    expect(stored?.total).toBe(debrief.total)
    expect(rubric.hintsUsed).toBe(2)
    expect(rubric.hintPenalty).toBe(10)

    // …and the repair survives a reload, still on no step.
    const reloaded = await loadDebrief(debrief.sessionId)
    expect(reloaded?.hintRepair).toEqual(repaired.hintRepair)
    expect(reloaded?.items.flatMap((item) => item.hintsTaken)).toHaveLength(1)

    // A second press keeps the record it already has rather than pricing it again.
    const again = await repairHintRecord(debrief.sessionId)
    expect(again.hintRepair).toEqual(repaired.hintRepair)
  })

  it('offers no repair on an attempt whose log accounts for every hint', async () => {
    const generated = generatedFor('PWD-01', 'account-lockout')
    await insertTicket(persistence, generated, 'ticket-nothing-to-repair')
    await startAttempt('ticket-nothing-to-repair')
    await revealHint()

    const debrief = await resolveAttempt({
      code: 'resolved-remote',
      note: 'Closed after a hint without changing the account.',
    })

    const repaired = await repairHintRecord(debrief.sessionId)

    expect(repaired.unaccountedHints).toBe(0)
    expect(repaired.hintRepair).toBeNull()
  })

  it('takes its hint count from the log when the stored score never recorded one', async () => {
    const driver = await createSqliteDriver(undefined, { wasmBinary: loadWasmBinary() })
    runMigrations(driver)
    const scoped = new SqlitePersistence(driver, new MemorySnapshotStore(), loadWasmBinary())
    holder.current = scoped

    const generated = generatedFor('PWD-01', 'account-lockout')
    await insertTicket(scoped, generated, 'ticket-uncounted-log')
    await startAttempt('ticket-uncounted-log')
    await revealHint()
    await revealHint()

    const debrief = await resolveAttempt({
      code: 'resolved-remote',
      note: 'Closed after the hints without changing the account.',
    })

    // The same attempt, stored the way a build that did not count hints would
    // have written it: the rungs are on the log, the count is not on the score.
    const row = driver.exec('SELECT rubric_json FROM scores WHERE session_id = ?', [
      debrief.sessionId,
    ])[0]
    const rubric = JSON.parse(String(row?.rubric_json)) as Record<string, unknown>
    delete rubric.hintsUsed
    delete rubric.hintPenalty
    driver.run('UPDATE scores SET rubric_json = ? WHERE session_id = ?', [
      JSON.stringify(rubric),
      debrief.sessionId,
    ])

    const reloaded = await loadDebrief(debrief.sessionId)
    // The count the steps show is the count the header shows — nothing to reconcile.
    expect(reloaded?.items.flatMap((item) => item.hintsTaken)).toHaveLength(2)
    expect(reloaded?.hintsUsed).toBe(2)
    expect(reloaded?.hintPenalty).toBe(0)
    expect(reloaded?.unaccountedHints).toBe(0)
  })

  it('pins the hint price an attempt started under, even when the setting changes', async () => {
    const generated = generatedFor('PWD-01', 'account-lockout')
    const sam = generated.public.requester.samAccountName
    await insertTicket(persistence, generated, 'ticket-pinned-price')

    const started = await startAttempt('ticket-pinned-price')
    expect(started.hintPolicy).toEqual({ perHint: 5, cap: 15, budget: 0 })
    expect((await revealHint()).hintPenalty).toBe(5)

    // The learner makes hints dearer while this ticket is still open…
    await saveHintPolicy({ perHint: 25, cap: 50, budget: 0 })

    const workspace = await getWorkspace()
    expect(workspace.hintPolicy).toEqual({ perHint: 5, cap: 15, budget: 0 })
    expect(workspace.hintPenalty).toBe(5)
    expect(workspace.entries.filter((entry) => entry.kind === 'hint').map((entry) => entry.cost)).toEqual(
      [5],
    )

    await verifyCallerByCode()
    await submitCommand(`get-account ${sam}`)
    await submitCommand(`unlock-account ${sam}`)
    await submitCommand(`get-account ${sam}`)
    await addNote(
      'troubleshooting',
      'Directory showed the account locked. Verified the caller, unlocked it, and confirmed the status returned to active.',
    )
    await addNote(
      'customer',
      'Your account is unlocked. Sign in with your current password and contact us if it locks again today.',
    )

    const debrief = await resolveAttempt({
      code: 'resolved-remote',
      note: 'Resolved remotely after verifying the caller.',
    })
    expect(debrief.hintPolicy).toEqual({ perHint: 5, cap: 15, budget: 0 })
    expect(debrief.hintPenalty).toBe(5)
    expect(debrief.total).toBe(95)

    const stored = await loadDebrief(debrief.sessionId)
    expect(stored?.hintPolicy).toEqual({ perHint: 5, cap: 15, budget: 0 })
    expect(stored?.items.flatMap((item) => item.hintsTaken).map((rung) => rung.cost)).toEqual([5])

    // …and the next attempt pays the new price from its very first rung.
    await insertTicket(persistence, generated, 'ticket-new-price')
    const next = await startAttempt('ticket-new-price')
    expect(next.hintPolicy).toEqual({ perHint: 25, cap: 50, budget: 0 })
    expect((await revealHint()).hintPenalty).toBe(25)
  })

  it('prices a ticket by its own family, and another family by the default', async () => {
    const generated = generatedFor('PWD-01', 'account-lockout')
    const sam = generated.public.requester.samAccountName
    await insertTicket(persistence, generated, 'ticket-family-price')

    // Only the ticket's own family is dearer; the default is left where it was.
    await saveFamilyHintPolicy('PWD-01', { perHint: 12, cap: 36, budget: 0 })

    const started = await startAttempt('ticket-family-price')
    expect(started.hintPolicy).toEqual({ perHint: 12, cap: 36, budget: 0 })
    expect((await revealHint()).hintPenalty).toBe(12)

    await verifyCallerByCode()
    await submitCommand(`get-account ${sam}`)
    await submitCommand(`unlock-account ${sam}`)
    await submitCommand(`get-account ${sam}`)
    await addNote(
      'troubleshooting',
      'Directory showed the account locked. Verified the caller, unlocked it, and confirmed the status returned to active.',
    )
    await addNote(
      'customer',
      'Your account is unlocked. Sign in with your current password and contact us if it locks again today.',
    )

    const debrief = await resolveAttempt({
      code: 'resolved-remote',
      note: 'Resolved remotely after verifying the caller.',
    })
    expect(debrief.hintPolicy).toEqual({ perHint: 12, cap: 36, budget: 0 })
    expect(debrief.hintPenalty).toBe(12)
    expect(debrief.total).toBe(88)
    // The debrief can say which price applied, and what it departed from, even
    // after the family is re-priced.
    expect(debrief.hintPricing).toEqual({
      policy: { perHint: 12, cap: 36, budget: 0 },
      source: 'family',
      familyId: 'PWD-01',
      defaultPolicy: { perHint: 5, cap: 15, budget: 0 },
    })
    await saveFamilyHintPolicy('PWD-01', { perHint: 20, cap: 40, budget: 0 })
    const reloaded = await loadDebrief(debrief.sessionId)
    expect(reloaded?.hintPolicy).toEqual({ perHint: 12, cap: 36, budget: 0 })
    expect(reloaded?.hintPricing).toEqual(debrief.hintPricing)

    // A ticket from another family still plays at the default.
    await insertTicket(
      persistence,
      generatedFor('NET-01', 'bad-static-dns'),
      'ticket-other-family',
    )
    const other = await startAttempt('ticket-other-family')
    expect(other.hintPolicy).toEqual({ perHint: 5, cap: 15, budget: 0 })
    expect((await revealHint()).hintPenalty).toBe(5)
  })

  it('costs nothing for hints when the learner sets them free', async () => {
    const generated = generatedFor('PWD-01', 'account-lockout')
    const sam = generated.public.requester.samAccountName
    await insertTicket(persistence, generated, 'ticket-free-hints')
    await saveHintPolicy({ perHint: 0, cap: 0, budget: 0 })

    const started = await startAttempt('ticket-free-hints')
    expect(started.hintPolicy).toEqual({ perHint: 0, cap: 0, budget: 0 })

    await revealHint()
    await revealHint()
    const workspace = await getWorkspace()
    expect(workspace.hintPenalty).toBe(0)
    expect(workspace.entries.filter((entry) => entry.kind === 'hint').map((entry) => entry.cost)).toEqual(
      [0, 0],
    )

    await verifyCallerByCode()
    await submitCommand(`get-account ${sam}`)
    await submitCommand(`unlock-account ${sam}`)
    await submitCommand(`get-account ${sam}`)
    await addNote(
      'troubleshooting',
      'Directory showed the account locked. Verified the caller, unlocked it, and confirmed the status returned to active.',
    )
    await addNote(
      'customer',
      'Your account is unlocked. Sign in with your current password and contact us if it locks again today.',
    )

    const debrief = await resolveAttempt({
      code: 'resolved-remote',
      note: 'Resolved remotely after verifying the caller.',
    })
    expect(debrief.hintsUsed).toBe(2)
    expect(debrief.hintPenalty).toBe(0)
    expect(debrief.total).toBe(100)
    expect(debrief.feedback.join(' ')).toMatch(/2 hints revealed, costing 0 points/i)
    expect(debrief.items.flatMap((item) => item.hintsTaken)).toHaveLength(2)
    expect(debrief.items.flatMap((item) => item.hintsTaken).every((rung) => rung.cost === 0)).toBe(
      true,
    )
  })

  it('rations hints with a budget instead of charging a flat penalty', async () => {
    const generated = generatedFor('PWD-01', 'account-lockout')
    const sam = generated.public.requester.samAccountName
    await insertTicket(persistence, generated, 'ticket-budget')
    await saveHintPolicy({ perHint: 5, cap: 15, budget: 2 })

    const started = await startAttempt('ticket-budget')
    expect(started.hintPolicy).toEqual({ perHint: 5, cap: 15, budget: 2 })
    expect(started.hintBudgetSpent).toBe(false)

    await revealHint()
    const afterOne = await getWorkspace()
    expect(afterOne.hints).toHaveLength(1)
    expect(afterOne.hintBudgetSpent).toBe(false)
    // The budget holds the count down even though plenty of rungs are left.
    expect(afterOne.hintsRemaining).toBe(1)

    await revealHint()
    const afterTwo = await getWorkspace()
    expect(afterTwo.hints).toHaveLength(2)
    expect(afterTwo.hintBudgetSpent).toBe(true)
    expect(afterTwo.hintsRemaining).toBe(0)

    // The third hint is refused outright: nothing is recorded and nothing is charged.
    await expect(revealHint()).rejects.toThrow(HintBudgetSpentError)
    await expect(revealHint()).rejects.toThrow(/used all 2 hints in its budget/i)
    const refused = await getWorkspace()
    expect(refused.hints).toHaveLength(2)
    expect(refused.hintPenalty).toBe(10)
    expect(refused.procedurePenalty).toBe(0)

    // The budget rations; it does not add a penalty of its own.
    await verifyCallerByCode()
    await submitCommand(`get-account ${sam}`)
    await submitCommand(`unlock-account ${sam}`)
    await submitCommand(`get-account ${sam}`)
    await addNote(
      'troubleshooting',
      'Directory showed the account locked. Verified the caller, unlocked it, and confirmed the status returned to active.',
    )
    await addNote(
      'customer',
      'Your account is unlocked. Sign in with your current password and contact us if it locks again today.',
    )

    const debrief = await resolveAttempt({
      code: 'resolved-remote',
      note: 'Resolved remotely after verifying the caller.',
    })
    expect(debrief.hintPolicy).toEqual({ perHint: 5, cap: 15, budget: 2 })
    expect(debrief.hintsUsed).toBe(2)
    expect(debrief.hintPenalty).toBe(10)
    expect(debrief.total).toBe(90)

    const stored = await loadDebrief(debrief.sessionId)
    expect(stored?.hintPolicy.budget).toBe(2)
  })

  it('runs out of a free attempt\'s budget without charging for it', async () => {
    const generated = generatedFor('PWD-01', 'account-lockout')
    await insertTicket(persistence, generated, 'ticket-free-budget')
    await saveHintPolicy({ perHint: 0, cap: 0, budget: 1 })

    await startAttempt('ticket-free-budget')
    await revealHint()

    await expect(revealHint()).rejects.toThrow(HintBudgetSpentError)
    const workspace = await getWorkspace()
    expect(workspace.hintPenalty).toBe(0)
    expect(workspace.hintBudgetSpent).toBe(true)
    expect(workspace.hintsRemaining).toBe(0)
  })

  it('keeps the budget an attempt started with when the setting changes', async () => {
    const generated = generatedFor('PWD-01', 'account-lockout')
    await insertTicket(persistence, generated, 'ticket-pinned-budget')
    await saveHintPolicy({ perHint: 5, cap: 15, budget: 1 })

    const started = await startAttempt('ticket-pinned-budget')
    await saveHintPolicy({ perHint: 5, cap: 15, budget: 12 })

    expect(started.hintPolicy.budget).toBe(1)
    await revealHint()
    await expect(revealHint()).rejects.toThrow(HintBudgetSpentError)

    // A reopened session reads the budget it started with, not the new setting.
    const reopened = await openSession(started.sessionId)
    expect(reopened.hintPolicy).toEqual({ perHint: 5, cap: 15, budget: 1 })
    expect(reopened.hintBudgetSpent).toBe(true)

    // The next attempt gets the new budget.
    await insertTicket(persistence, generated, 'ticket-next-budget')
    expect((await startAttempt('ticket-next-budget')).hintPolicy.budget).toBe(12)
  })

  it('says when today’s price has moved since the attempt paid', async () => {
    const generated = generatedFor('NET-01', 'bad-static-dns')
    await insertTicket(persistence, generated, 'ticket-price-drift')
    await startAttempt('ticket-price-drift')
    const debrief = await resolveAttempt({ code: 'escalated-tier2', note: '' })

    // Nothing has moved, so the debrief has no drift to report.
    expect(debrief.hintPolicy).toEqual({ perHint: 5, cap: 15, budget: 0 })
    expect(debrief.hintPriceNow).toBeNull()

    // A budget-only change rations rungs without moving the price.
    await saveHintPolicy({ perHint: 5, cap: 15, budget: 4 })
    expect((await loadDebrief(debrief.sessionId))?.hintPriceNow).toBeNull()

    // Then the price itself moves: the attempt keeps its own, and the debrief
    // names what a new sitting would pay now.
    await saveHintPolicy({ perHint: 9, cap: 27, budget: 0 })
    const reloaded = await loadDebrief(debrief.sessionId)
    expect(reloaded?.hintPolicy).toEqual({ perHint: 5, cap: 15, budget: 0 })
    expect(reloaded?.hintPriceNow).toEqual({ perHint: 9, cap: 27, budget: 0 })

    // Making hints free is a move too, and the debrief keeps the price it paid.
    await saveHintPolicy({ perHint: 0, cap: 0, budget: 0 })
    const free = await loadDebrief(debrief.sessionId)
    expect(free?.hintPolicy).toEqual({ perHint: 5, cap: 15, budget: 0 })
    expect(free?.hintPriceNow).toEqual({ perHint: 0, cap: 0, budget: 0 })
  })

  it('sits a ticket as an exam: the price is pinned and every hint is withheld', async () => {
    const generated = generatedFor('PWD-01', 'account-lockout')
    await insertTicket(persistence, generated, 'ticket-exam')
    // The learner's own price is cheap and its budget tight; an exam ignores it.
    await saveHintPolicy({ perHint: 1, cap: 3, budget: 2 })
    await saveExamMode(true)

    const workspace = await startAttempt('ticket-exam')

    expect(workspace.exam).toBe(true)
    expect(workspace.hintPolicy).toEqual({ perHint: 5, cap: 15, budget: 0 })
    await expect(revealHint()).rejects.toThrow(HintsWithheldError)
    expect((await getWorkspace()).hints).toEqual([])

    const debrief = await resolveAttempt({
      code: 'resolved-remote',
      note: 'Worked it unaided and closed it at the end of the call.',
    })

    expect(debrief.exam).toBe(true)
    expect(debrief.hintsUsed).toBe(0)
    // Nothing was spent on hints, and the ladders are handed over instead.
    expect(debrief.hintPenalty).toBe(0)
    expect(debrief.items.some((item) => item.hints.length > 0)).toBe(true)
    expect((await loadDebrief(debrief.sessionId))?.exam).toBe(true)

    // The exam rate is not a catalogue price, so a moved setting says nothing
    // about what this attempt paid.
    await saveHintPolicy({ perHint: 9, cap: 27, budget: 0 })
    expect((await loadDebrief(debrief.sessionId))?.hintPriceNow).toBeNull()
  })

  it('keeps an exam an exam until it is scored, whatever the setting does next', async () => {
    const generated = generatedFor('PWD-01', 'account-lockout')
    await insertTicket(persistence, generated, 'ticket-exam-reload')
    await saveExamMode(true)
    const started = await startAttempt('ticket-exam-reload')
    expect(started.exam).toBe(true)

    // A reload reopens the attempt from its row, mode and all.
    clearActiveAttempt()
    expect((await openSession(started.sessionId)).exam).toBe(true)

    // Turning the mode off does not hand an in-flight exam its hints back.
    await saveExamMode(false)
    await expect(revealHint()).rejects.toThrow(HintsWithheldError)

    // The next ticket is practice again, at the learner's own price.
    await insertTicket(persistence, generated, 'ticket-practice-again')
    const next = await startAttempt('ticket-practice-again')
    expect(next.exam).toBe(false)
    expect(next.hintsRemaining).toBeGreaterThan(0)
  })

  it('scores the same work the same whether it was sat as an exam or as practice', async () => {
    const generated = generatedFor('PWD-01', 'account-lockout')
    const sam = generated.public.requester.samAccountName
    await insertTicket(persistence, generated, 'ticket-fair-exam')
    await insertTicket(persistence, generated, 'ticket-fair-practice')
    // Free hints for practice: the two attempts then differ only in the mode.
    await saveHintPolicy({ perHint: 0, cap: 0, budget: 0 })

    const play = async () => {
      await verifyCallerByCode()
      await submitCommand(`get-account ${sam}`)
      await submitCommand(`unlock-account ${sam}`)
      await submitCommand(`get-account ${sam}`)
      await addNote(
        'troubleshooting',
        'Directory showed the account locked. Verified the caller, unlocked it, and confirmed the status returned to active.',
      )
      await addNote(
        'customer',
        'Your account is unlocked. Sign in with your usual password and tell us if it locks again today.',
      )
      return resolveAttempt({
        code: 'resolved-remote',
        note: 'Resolved remotely after verifying the caller.',
      })
    }

    await saveExamMode(true)
    await startAttempt('ticket-fair-exam')
    const exam = await play()

    await saveExamMode(false)
    await startAttempt('ticket-fair-practice')
    const practice = await play()

    expect(exam.exam).toBe(true)
    expect(practice.exam).toBe(false)
    expect(exam.total).toBe(practice.total)
    expect(exam.passed).toBe(practice.passed)
  })

  it('reopens the close a reloaded attempt was writing', async () => {
    const generated = generatedFor('PWD-01', 'account-lockout')
    await insertTicket(persistence, generated, 'ticket-draft')
    const started = await startAttempt('ticket-draft')

    await saveClosureDraft({
      code: 'escalated-tier2',
      note: 'Unlocked twice and the lockout came back, so the identity team needs the report.',
    })

    // A reload drops the in-memory attempt and reopens the session from its row.
    clearActiveAttempt()
    const reopened = await openSession(started.sessionId)

    expect(reopened.closureDraft).toEqual({
      code: 'escalated-tier2',
      note: 'Unlocked twice and the lockout came back, so the identity team needs the report.',
    })
    expect(await findActiveSessionId()).toBe(started.sessionId)
  })

  it('saves nothing for a form the learner has not touched', async () => {
    const generated = generatedFor('PWD-01', 'account-lockout')
    await insertTicket(persistence, generated, 'ticket-draft-empty')
    const started = await startAttempt('ticket-draft-empty')

    await saveClosureDraft({ code: null, note: '   ' })

    expect((await persistence.sessions.findById(started.sessionId))?.closureDraft).toBeNull()
    expect((await getWorkspace()).closureDraft).toEqual({ code: null, note: '' })
  })

  it('refuses a close code this build does not offer', async () => {
    const generated = generatedFor('PWD-01', 'account-lockout')
    await insertTicket(persistence, generated, 'ticket-draft-code')
    const started = await startAttempt('ticket-draft-code')

    await saveClosureDraft({ code: 'retired-code', note: 'Handing this one on.' })

    const stored = await persistence.sessions.findById(started.sessionId)
    expect(stored?.closureDraft).toEqual({ code: null, note: 'Handing this one on.' })
  })

  /** A stored layout, with no pin or tabs unless a test asks for them. */
  function layout(overrides: Partial<WorkspaceLayout> = {}): WorkspaceLayout {
    return { pane: 'terminal', tool: null, tabs: [], pinned: [], ratio: null, ...overrides }
  }

  it('remembers where the learner was working, so the ticket reopens in that tool', async () => {
    const generated = generatedFor('PWD-01', 'account-lockout')
    await insertTicket(persistence, generated, 'ticket-layout')
    const started = await startAttempt('ticket-layout')

    // A new attempt opens on a clean terminal: the consoles a previous ticket
    // left open were that ticket's work.
    expect((await getWorkspace()).layout).toEqual({
      pane: 'terminal',
      tool: null,
      tabs: [],
      pinned: [],
      ratio: null,
    })

    await saveWorkspaceLayout(
      layout({ pane: 'tools', tool: 'printers', tabs: ['directory', 'printers'] }),
    )

    expect((await persistence.sessions.findById(started.sessionId))?.workspaceLayout).toEqual({
      pane: 'tools',
      tool: 'printers',
      tabs: ['directory', 'printers'],
      pinned: [],
      ratio: null,
    })

    // A reload drops the in-memory attempt and reopens the session from its row.
    clearActiveAttempt()
    const reopened = await openSession(started.sessionId)

    expect(reopened.layout).toEqual({
      pane: 'tools',
      tool: 'printers',
      tabs: ['directory', 'printers'],
      pinned: [],
      ratio: null,
    })
  })

  it('reopens a ticket at the width it was worked at, not the device default', async () => {
    const generated = generatedFor('PWD-01', 'account-lockout')
    await insertTicket(persistence, generated, 'ticket-layout-ratio')
    const started = await startAttempt('ticket-layout-ratio')

    await saveWorkspaceLayout(
      layout({ pane: 'tools', tool: 'printers', tabs: ['printers'], ratio: 0.62 }),
    )
    expect((await persistence.sessions.findById(started.sessionId))?.workspaceLayout?.ratio).toBe(
      0.62,
    )

    clearActiveAttempt()
    const reopened = await openSession(started.sessionId)

    // The width belongs to the ticket: another ticket sized to something else
    // must not move this one.
    expect(reopened.layout.ratio).toBe(0.62)
  })

  it('reopens a ticket written before widths were stored at the device\u2019s own', async () => {
    const generated = generatedFor('PWD-01', 'account-lockout')
    await insertTicket(persistence, generated, 'ticket-layout-old')
    await persistence.sessions.create({
      id: 'layout-old-session',
      ticketId: 'ticket-layout-old',
      startedAt: Date.now(),
      endedAt: null,
      world: JSON.parse(JSON.stringify(generated.world)),
      hintPolicy: null,
      closureDraft: null,
      // The shape a build without stored widths wrote.
      workspaceLayout: { pane: 'tools', tool: 'printers', tabs: ['printers'], pinned: [] },
      consoleFocus: null,
      examMode: false,
      resolution: null,
      outcome: null,
    })

    const workspace = await openSession('layout-old-session')

    expect(workspace.layout.ratio).toBeNull()
    // The rest of the row still opens as it was left.
    expect(workspace.layout.pane).toBe('tools')
  })

  it('reopens a console on the machine it was left on, search and record and all', async () => {
    const generated = generatedFor('PWD-01', 'account-lockout')
    await insertTicket(persistence, generated, 'ticket-focus')
    const started = await startAttempt('ticket-focus')

    // A new attempt has no console focus: the searches a previous ticket ran were
    // that ticket's work.
    expect((await getWorkspace()).consoleFocus).toEqual({})

    await saveConsoleFocus('directory', { query: 'kira', selectedId: 'user:kira-khan' })

    expect((await persistence.sessions.findById(started.sessionId))?.consoleFocus).toEqual({
      directory: { query: 'kira', selectedId: 'user:kira-khan' },
    })

    clearActiveAttempt()
    const reopened = await openSession(started.sessionId)

    expect(reopened.consoleFocus).toEqual({
      directory: { query: 'kira', selectedId: 'user:kira-khan' },
    })
  })

  it('keeps each console’s search apart, and drops one that is cleared', async () => {
    const generated = generatedFor('PWD-01', 'account-lockout')
    await insertTicket(persistence, generated, 'ticket-focus-two')
    await startAttempt('ticket-focus-two')

    await saveConsoleFocus('directory', { query: 'kira', selectedId: null })
    await saveConsoleFocus('printers', { query: 'lobby', selectedId: 'printer:lobby' })

    expect((await getWorkspace()).consoleFocus).toEqual({
      directory: { query: 'kira', selectedId: null },
      printers: { query: 'lobby', selectedId: 'printer:lobby' },
    })

    // Clearing one console leaves the other where it was, and an emptied console
    // is dropped rather than stored as an empty search.
    await saveConsoleFocus('directory', { query: '', selectedId: null })
    expect((await getWorkspace()).consoleFocus).toEqual({
      printers: { query: 'lobby', selectedId: 'printer:lobby' },
    })
  })

  it('reopens a focus written for a console this build no longer offers as none', async () => {
    const generated = generatedFor('PWD-01', 'account-lockout')
    await insertTicket(persistence, generated, 'ticket-focus-retired')
    await persistence.sessions.create({
      id: 'focus-retired-session',
      ticketId: 'ticket-focus-retired',
      startedAt: Date.now(),
      endedAt: null,
      world: JSON.parse(JSON.stringify(generated.world)),
      hintPolicy: null,
      closureDraft: null,
      workspaceLayout: null,
      // The shape a build with a console this one dropped would have written.
      consoleFocus: {
        directory: { query: 'kira', selectedId: 'user:kira-khan' },
        'retired-console': { query: 'anything', selectedId: null },
      },
      examMode: false,
      resolution: null,
      outcome: null,
    })

    const workspace = await openSession('focus-retired-session')

    expect(workspace.consoleFocus).toEqual({
      directory: { query: 'kira', selectedId: 'user:kira-khan' },
    })
  })

  it('tells the queue where the open attempt left off, so resuming names what it lands in', async () => {
    const generated = generatedFor('PWD-01', 'account-lockout')
    await insertTicket(persistence, generated, 'ticket-resume')
    await startAttempt('ticket-resume')

    // Picked up but not started: the resume lands in the terminal, before the
    // first step, rather than in a console nobody opened.
    const fresh = await loadQueue()
    expect(fresh.find((ticket) => ticket.id === 'ticket-resume')?.resume).toEqual({
      tool: null,
      pane: 'terminal',
      steps: 0,
    })
    // A ticket nobody has picked up has nothing to resume, only a start ahead.
    expect(
      fresh.find((ticket) => ticket.id !== 'ticket-resume' && ticket.resume !== null),
    ).toBeUndefined()

    await submitCommand('get-printers')
    await saveWorkspaceLayout(layout({ pane: 'tools', tool: 'printers', tabs: ['printers'] }))

    const rows = await loadQueue()
    const row = rows.find((ticket) => ticket.id === 'ticket-resume')

    // The console in front and the length of the log: what a resume puts back.
    expect(row?.resume).toEqual({ tool: 'printers', pane: 'tools', steps: 1 })

    // One attempt is open at a time, so only its ticket has a point to name.
    expect(rows.filter((ticket) => ticket.resume !== null)).toHaveLength(1)
  })

  it('reopens three tabs in their own order with the older one in front, and keeps a closed tab closed', async () => {
    const generated = generatedFor('PWD-01', 'account-lockout')
    await insertTicket(persistence, generated, 'ticket-tab-order')
    const started = await startAttempt('ticket-tab-order')

    // Two consoles were opened after the one in front, and the ticket was left
    // on the older tab: a reopen must not simply bring the newest forward.
    await saveWorkspaceLayout(
      layout({ pane: 'tools', tool: 'mail-admin', tabs: ['directory', 'mail-admin', 'printers'] }),
    )

    clearActiveAttempt()
    const reopened = await openSession(started.sessionId)

    expect(reopened.layout.tabs).toEqual(['directory', 'mail-admin', 'printers'])
    expect(reopened.layout.tool).toBe('mail-admin')

    // Closing the tab in front stores the strip without it, so the console is a
    // tab that was closed rather than one the reopen forgot.
    await saveWorkspaceLayout(
      layout({ pane: 'tools', tool: 'printers', tabs: ['directory', 'printers'] }),
    )

    clearActiveAttempt()
    const afterClose = await openSession(started.sessionId)
    expect(afterClose.layout.tabs).toEqual(['directory', 'printers'])
    expect(afterClose.layout.tool).toBe('printers')

    // And it is still gone on the reopen after that: nothing rebuilds the strip
    // from the consoles the ticket has seen.
    clearActiveAttempt()
    const third = await openSession(started.sessionId)
    expect(third.layout.tabs).not.toContain('mail-admin')
    expect(third.layout.tool).toBe('printers')
  })

  it('remembers a tab pinned to the left, and puts it back there', async () => {
    const generated = generatedFor('PWD-01', 'account-lockout')
    await insertTicket(persistence, generated, 'ticket-layout-pinned')
    const started = await startAttempt('ticket-layout-pinned')

    // Pinning holds the console at the front of the strip, whatever order the
    // tabs were in when it was pinned.
    await saveWorkspaceLayout(
      layout({ pane: 'tools', tool: 'mail-admin', tabs: ['mail-admin', 'printers'], pinned: ['mail-admin'] }),
    )

    clearActiveAttempt()
    const reopened = await openSession(started.sessionId)

    expect(reopened.layout.tabs).toEqual(['mail-admin', 'printers'])
    expect(reopened.layout.pinned).toEqual(['mail-admin'])
  })

  it('remembers a group of pinned tabs in the order they were pinned', async () => {
    const generated = generatedFor('PWD-01', 'account-lockout')
    await insertTicket(persistence, generated, 'ticket-layout-group')
    const started = await startAttempt('ticket-layout-group')

    await saveWorkspaceLayout(
      layout({
        pane: 'tools',
        tool: 'shares',
        tabs: ['mail-admin', 'printers', 'directory', 'shares'],
        pinned: ['mail-admin', 'printers'],
        ratio: null,
      }),
    )

    const stored = await persistence.sessions.findById(started.sessionId)
    expect(stored?.workspaceLayout).toEqual({
      pane: 'tools',
      tool: 'shares',
      tabs: ['mail-admin', 'printers', 'directory', 'shares'],
      pinned: ['mail-admin', 'printers'],
      ratio: null,
    })

    clearActiveAttempt()
    const reopened = await openSession(started.sessionId)

    expect(reopened.layout.tabs).toEqual(['mail-admin', 'printers', 'directory', 'shares'])
    expect(reopened.layout.pinned).toEqual(['mail-admin', 'printers'])
  })

  it('reads a pin written before the group existed as a group of one', async () => {
    const generated = generatedFor('PWD-01', 'account-lockout')
    await insertTicket(persistence, generated, 'ticket-layout-old-pin')
    await persistence.sessions.create({
      id: 'layout-old-pin-session',
      ticketId: 'ticket-layout-old-pin',
      startedAt: Date.now(),
      endedAt: null,
      world: JSON.parse(JSON.stringify(generated.world)),
      hintPolicy: null,
      closureDraft: null,
      // The shape this build wrote before pins became a group: one id, not a list.
      workspaceLayout: {
        pane: 'tools',
        tool: 'directory',
        tabs: ['directory', 'printers'],
        pinned: 'printers',
      },
      consoleFocus: null,
      examMode: false,
      resolution: null,
      outcome: null,
    })

    const workspace = await openSession('layout-old-pin-session')

    // The old pin still holds the front, now as the group of one it was.
    expect(workspace.layout.tabs).toEqual(['printers', 'directory'])
    expect(workspace.layout.pinned).toEqual(['printers'])
  })

  it('stores nothing for a workspace the learner never left, and keeps the tabs it did open', async () => {
    const generated = generatedFor('PWD-01', 'account-lockout')
    await insertTicket(persistence, generated, 'ticket-layout-empty')
    const started = await startAttempt('ticket-layout-empty')

    await saveWorkspaceLayout(layout())

    expect((await persistence.sessions.findById(started.sessionId))?.workspaceLayout).toBeNull()

    // Switching back to the terminal leaves the tool open, which is worth
    // remembering: that is a workspace the learner did move in.
    await saveWorkspaceLayout(layout({ pane: 'tools', tool: 'printers', tabs: ['printers'] }))
    await saveWorkspaceLayout(layout({ pane: 'terminal', tool: 'printers', tabs: ['printers'] }))

    expect((await persistence.sessions.findById(started.sessionId))?.workspaceLayout).toEqual({
      pane: 'terminal',
      tool: 'printers',
      tabs: ['printers'],
      pinned: [],
      ratio: null,
    })
  })

  it('reopens a workspace naming a tool this build no longer offers on the terminal', async () => {
    const generated = generatedFor('PWD-01', 'account-lockout')
    await insertTicket(persistence, generated, 'ticket-layout-retired')
    await persistence.sessions.create({
      id: 'layout-retired-session',
      ticketId: 'ticket-layout-retired',
      startedAt: Date.now(),
      endedAt: null,
      world: JSON.parse(JSON.stringify(generated.world)),
      hintPolicy: null,
      closureDraft: null,
      // The shape a build with a console this one dropped would have written.
      workspaceLayout: {
        pane: 'tools',
        tool: 'retired-tool',
        tabs: ['printers', 'retired-tool'],
        pinned: 'retired-tool',
      },
      consoleFocus: null,
      examMode: false,
      resolution: null,
      outcome: null,
    })

    const workspace = await openSession('layout-retired-session')

    // The retired console loses its tab, and with it the pin it was holding.
    expect(workspace.layout).toEqual({
      pane: 'tools',
      tool: null,
      tabs: ['printers'],
      pinned: [],
      ratio: null,
    })
  })

  it('drops the remembered workspace once the ticket closes', async () => {
    const generated = generatedFor('PWD-01', 'account-lockout')
    await insertTicket(persistence, generated, 'ticket-layout-closed')
    const started = await startAttempt('ticket-layout-closed')

    await saveWorkspaceLayout(layout({ pane: 'tools', tool: 'printers', tabs: ['printers'] }))
    await resolveAttempt({ code: 'escalated-tier2', note: 'Handed over with the queue cleared.' })

    const row = await persistence.sessions.findById(started.sessionId)
    expect(row?.workspaceLayout).toBeNull()
  })

  it('drops the draft once the ticket closes, keeping the note as the decision', async () => {
    const generated = generatedFor('PWD-01', 'account-lockout')
    await insertTicket(persistence, generated, 'ticket-draft-closed')
    const started = await startAttempt('ticket-draft-closed')
    const note = 'Report filed with the identity team; they own the repeat lockout.'

    await saveClosureDraft({ code: 'escalated-tier2', note })
    const debrief = await resolveAttempt({ code: 'escalated-tier2', note })

    const row = await persistence.sessions.findById(started.sessionId)
    expect(row?.resolution).toBe('escalated-tier2')
    expect(row?.closureDraft).toBeNull()
    expect(debrief.decision).toEqual({ outcome: 'escalated', code: 'escalated-tier2', note })
  })

  it('un-runs a mistaken step and puts the world back with it', async () => {
    const generated = generatedFor('PWD-01', 'account-lockout')
    const sam = generated.public.requester.samAccountName
    await insertTicket(persistence, generated, 'ticket-rewind')

    await startAttempt('ticket-rewind')
    await verifyCallerByCode()
    const checked = await submitCommand(`get-account ${sam}`)
    expect(accountStatus(checked)).toBe('locked')

    // The mistake: a change nobody asked for, made after the check.
    const changed = await submitCommand(`unlock-account ${sam}`)
    expect(accountStatus(changed)).toBe('active')
    const step = changed.entries.at(-1)?.seq
    if (step === undefined) {
      throw new Error('The unlock was not recorded')
    }
    const dropped = changed.entries.filter((entry) => entry.seq >= step).length

    const rewound = await rewindAttempt(step)

    // The entry is gone, the log says what happened to it, and the account is
    // back where the learner left it.
    expect(
      rewound.entries.some(
        (entry) => entry.kind === 'command' && entry.text === `unlock-account ${sam}`,
      ),
    ).toBe(false)
    expect(rewound.entries.find((entry) => entry.kind === 'rewind')).toMatchObject({ dropped })
    expect(rewound.simulatedClock).toBeLessThan(changed.simulatedClock)

    const rechecked = await submitCommand(`get-account ${sam}`)
    expect(accountStatus(rechecked)).toBe('locked')
  })

  it('puts an accidental rewind back, steps, world, and clock together', async () => {
    const generated = generatedFor('PWD-01', 'account-lockout')
    const sam = generated.public.requester.samAccountName
    await insertTicket(persistence, generated, 'ticket-reapply')

    await startAttempt('ticket-reapply')
    await verifyCallerByCode()
    await submitCommand(`get-account ${sam}`)
    const changed = await submitCommand(`unlock-account ${sam}`)
    const step = changed.entries.at(-1)?.seq
    if (step === undefined) {
      throw new Error('The unlock was not recorded')
    }

    const rewound = await rewindAttempt(step)
    const marker = rewound.entries.find((entry) => entry.kind === 'rewind')
    expect(marker).toMatchObject({ dropped: 1, canReapply: true })
    const cut = marker?.seq ?? 0

    const restored = await reapplyRewind(cut)

    // The cut is gone, its step is back in its old place, and the world and
    // clock are the ones the learner had before the rewind.
    expect(restored.entries.some((entry) => entry.kind === 'rewind')).toBe(false)
    expect(restored.entries.at(-1)).toMatchObject({
      kind: 'command',
      text: `unlock-account ${sam}`,
    })
    expect(restored.simulatedClock).toBe(changed.simulatedClock)
    expect(restored.commandsRun).toBe(changed.commandsRun)

    // A reload reads the restored world, not the rewound one.
    clearActiveAttempt()
    await openSession(restored.sessionId)
    const reopened = await submitCommand(`get-account ${sam}`)
    expect(accountStatus(reopened)).toBe('active')

    // And the debrief reads the attempt as though the cut had not been made.
    const debrief = await resolveAttempt({
      code: 'resolved-remote',
      note: 'Unlocked after verifying the caller.',
    })
    expect(debrief.rewinds).toBe(0)
    expect(debrief.rewoundSteps).toBe(0)
    expect(commandsIn(debrief.trail).map((entry) => entry.command)).toContain(
      `unlock-account ${sam}`,
    )
  })

  it('puts back a hint a rewind refunded, and the price with it', async () => {
    const generated = generatedFor('PWD-01', 'account-lockout')
    await insertTicket(persistence, generated, 'ticket-reapply-hint')

    await startAttempt('ticket-reapply-hint')
    await verifyCallerByCode()
    const hinted = await revealHint()
    const cut = hinted.entries.at(-1)?.seq ?? 1
    const rewound = await rewindAttempt(cut)
    expect(rewound.hints).toEqual([])
    expect(rewound.hintPenalty).toBe(0)

    const restored = await reapplyRewind(rewound.entries.at(-1)?.seq ?? 1)

    expect(restored.hints).toHaveLength(1)
    expect(restored.hintPenalty).toBe(5)
    expect(restored.hintsRemaining).toBe(hinted.hintsRemaining)
  })

  it('refuses to put a cut back once later work sits after it', async () => {
    const generated = generatedFor('PWD-01', 'account-lockout')
    const sam = generated.public.requester.samAccountName
    await insertTicket(persistence, generated, 'ticket-reapply-late')

    await startAttempt('ticket-reapply-late')
    await submitCommand(`get-account ${sam}`)
    const rewound = await rewindAttempt(1)
    const cut = rewound.entries.at(-1)?.seq ?? 1

    const carriedOn = await submitCommand(`get-account ${sam}`)

    // The cut is now behind new work, so its steps can no longer take their old
    // place without moving the step that came after them.
    await expect(reapplyRewind(cut)).rejects.toThrow(/Work has been logged since that rewind/)
    expect((await getWorkspace()).entries).toHaveLength(carriedOn.entries.length)
  })

  it('puts a cut back even when the caller has broken in since', async () => {
    const generated = generatedFor('PWD-01', 'account-lockout')
    const sam = generated.public.requester.samAccountName
    await insertTicket(persistence, generated, 'ticket-reapply-caller')

    const started = await startAttempt('ticket-reapply-caller')
    await submitCommand(`get-account ${sam}`)
    const rewound = await rewindAttempt(1)
    const cut = rewound.entries.at(-1)?.seq ?? 1

    // A line the caller broke in with is conversation, not work: it must not
    // take away the chance to put the cut back.
    await persistence.actions.append({
      sessionId: started.sessionId,
      atMs: Date.now(),
      kind: 'ask-user',
      input: {},
      output: { interruption: true, answer: 'Hello? Are you still there?' },
    })
    expect((await getWorkspace()).entries.at(-2)).toMatchObject({
      kind: 'rewind',
      canReapply: true,
    })

    const restored = await reapplyRewind(cut)

    expect(restored.entries.some((entry) => entry.kind === 'rewind')).toBe(false)
    expect(restored.entries.at(-2)).toMatchObject({
      kind: 'command',
      text: `get-account ${sam}`,
    })
    expect(restored.entries.at(-1)).toMatchObject({ kind: 'interruption' })
  })

  it('puts a cut back even when the desk has read a tool since', async () => {
    const generated = generatedFor('PWD-01', 'account-lockout')
    const sam = generated.public.requester.samAccountName
    await insertTicket(persistence, generated, 'ticket-reapply-read')

    const started = await startAttempt('ticket-reapply-read')
    await submitCommand(`get-account ${sam}`)
    const rewound = await rewindAttempt(1)
    const cut = rewound.entries.at(-1)?.seq ?? 1

    // Looking at the directory changed nothing in the world, so it must not take
    // away the chance to put the cut back.
    await recordConsoleRead('directory', null)
    expect(rewound.entries.find((entry) => entry.kind === 'rewind')).toMatchObject({
      canReapply: true,
    })
    expect((await getWorkspace()).entries.find((entry) => entry.kind === 'rewind')).toMatchObject({
      canReapply: true,
    })

    const restored = await reapplyRewind(cut)
    expect(restored.entries.some((entry) => entry.kind === 'rewind')).toBe(false)

    // The read followed the steps it sat behind, so the log still holds it.
    const logged = await persistence.actions.listBySession(started.sessionId)
    expect(logged.at(-1)).toMatchObject({ kind: 'console-read' })
  })

  it('lets the caller react when the desk reads a tool, without changing the world', async () => {
    const generated = generatedFor('PWD-01', 'pressured-lockout')
    await insertTicket(persistence, generated, 'ticket-pressured-read')
    await startAttempt('ticket-pressured-read')

    const view = await recordConsoleRead('directory', null)
    expect(view).not.toBeNull()
    const line = view?.entries.at(-1)
    expect(line?.kind).toBe('interruption')
    if (line?.kind !== 'interruption') {
      throw new Error('The caller did not react to the read')
    }
    expect(line.message).toMatch(/looking me up/i)

    // The read is in the log, with a wall clock like any other step, and it is
    // not in the conversation: reading a console changes nothing.
    const logged = await persistence.actions.listBySession(view?.sessionId ?? '')
    expect(logged.at(-2)).toMatchObject({
      kind: 'console-read',
      input: { consoleId: 'directory' },
    })
    expect(logged.at(-2)?.wallMs).not.toBeNull()

    const after = await getWorkspace()
    expect(after.commandsRun).toBe(0)
    expect(after.entries).toHaveLength(1)
    expect(after.entries[0]).toMatchObject({ kind: 'interruption' })
  })

  it('refuses to put back a cut recorded before its steps were kept', async () => {
    const generated = generatedFor('PWD-01', 'account-lockout')
    await insertTicket(persistence, generated, 'ticket-reapply-legacy')

    const started = await startAttempt('ticket-reapply-legacy')
    await submitCommand('help')
    // The shape a marker written before the steps were kept has: a count and no
    // steps to put back.
    const marker = await persistence.actions.append({
      sessionId: started.sessionId,
      atMs: Date.now(),
      kind: 'rewind',
      input: { dropped: 1, fromSeq: 2 },
      output: { rewound: true },
    })

    await expect(reapplyRewind(marker.seq)).rejects.toThrow(/before its steps could be kept/)
  })

  it('refunds the hint a rewind drops and gives the rungs back', async () => {
    const generated = generatedFor('PWD-01', 'account-lockout')
    await insertTicket(persistence, generated, 'ticket-rewind-hint')

    await startAttempt('ticket-rewind-hint')
    await verifyCallerByCode()
    const hinted = await revealHint()
    expect(hinted.hintPenalty).toBe(5)
    expect(hinted.hints).toHaveLength(1)

    const rewound = await rewindAttempt(hinted.entries.at(-1)?.seq ?? 1)

    expect(rewound.hints).toEqual([])
    expect(rewound.hintPenalty).toBe(0)
    expect(rewound.hintsRemaining).toBe(hinted.hintsRemaining + 1)
  })

  it('scores the attempt from what is left, not from what was un-run', async () => {
    const generated = generatedFor('PWD-01', 'account-lockout')
    const sam = generated.public.requester.samAccountName
    await insertTicket(persistence, generated, 'ticket-rewind-score')

    await startAttempt('ticket-rewind-score')
    // Changing the account before anyone proved who was calling is priced as a
    // process mistake while the attempt is open.
    const changed = await submitCommand(`unlock-account ${sam}`)
    expect(changed.procedureViolations.length).toBeGreaterThan(0)
    expect(changed.procedurePenalty).toBeGreaterThan(0)
    const step = changed.entries.at(-1)?.seq ?? 1
    const dropped = changed.entries.filter((entry) => entry.seq >= step).length

    const rewound = await rewindAttempt(step)

    expect(rewound.procedureViolations).toEqual([])
    expect(rewound.procedurePenalty).toBe(0)

    // And the score is read from the log as it stands.
    const debrief = await resolveAttempt({
      code: 'resolved-remote',
      note: 'Closed without changing anything.',
    })
    expect(debrief.procedurePenalty).toBe(0)
    expect(debrief.rewinds).toBe(1)
    expect(debrief.rewoundSteps).toBe(dropped)
    expect(commandsIn(debrief.trail).map((entry) => entry.command)).not.toContain(
      `unlock-account ${sam}`,
    )
    expect((await loadDebrief(debrief.sessionId))?.rewoundSteps).toBe(dropped)
  })

  it('records a code going out, so un-running the send takes the code back', async () => {
    const generated = generatedFor('PWD-01', 'account-lockout')
    await insertTicket(persistence, generated, 'ticket-rewind-code')

    await startAttempt('ticket-rewind-code')
    const opened = await getWorkspace()
    const recipient = opened.verification.recipients[0]
    if (!recipient) {
      throw new Error('The ticket has no contact to reach')
    }

    const sent = await sendVerificationCode(recipient.id)

    expect(sent.verification.active).not.toBeNull()
    expect(sent.entries.at(-1)).toMatchObject({ kind: 'code-sent', recipientName: recipient.name })

    const rewound = await rewindAttempt(sent.entries.at(-1)?.seq ?? 1)

    expect(rewound.verification.active).toBeNull()
  })

  it('refuses to rewind an exam, and says what can be un-run instead', async () => {
    const generated = generatedFor('PWD-01', 'account-lockout')
    await insertTicket(persistence, generated, 'ticket-rewind-exam')
    await saveExamMode(true)

    const started = await startAttempt('ticket-rewind-exam')
    await submitCommand('help')

    const before = (await getWorkspace()).entries.length
    expect(started.canRewind).toBe(false)
    expect((await getWorkspace()).canRewind).toBe(false)
    await expect(rewindAttempt(1)).rejects.toThrow(RewindRefusedError)
    // The step is still there.
    expect((await getWorkspace()).entries).toHaveLength(before)
  })

  it('refuses when the log no longer folds back to the world in hand', async () => {
    const generated = generatedFor('PWD-01', 'account-lockout')
    await insertTicket(persistence, generated, 'ticket-rewind-diverged')

    const started = await startAttempt('ticket-rewind-diverged')
    await submitCommand('help')
    const stored = await persistence.sessions.findById(started.sessionId)
    if (!stored) {
      throw new Error('The session went missing')
    }

    // A world that no longer matches the log: a hand-edited file, or an attempt
    // recorded before every world change was written down.
    await persistence.sessions.saveWorld(started.sessionId, {
      ...stored.world,
      clock: (stored.world.clock as number) + 600_000,
    })
    clearActiveAttempt()
    await openSession(started.sessionId)

    await expect(rewindAttempt(1)).rejects.toThrow(/cannot be replayed exactly/)
    // Nothing was dropped on the strength of a fold that does not hold.
    expect((await getWorkspace()).entries).toHaveLength(1)
  })

  it('lets the last step of an attempt be un-run back to an empty log', async () => {
    const generated = generatedFor('PWD-01', 'account-lockout')
    const sam = generated.public.requester.samAccountName
    await insertTicket(persistence, generated, 'ticket-rewind-all')

    const started = await startAttempt('ticket-rewind-all')
    await submitCommand(`get-account ${sam}`)

    const rewound = await rewindAttempt(1)

    expect(rewound.entries.filter((entry) => entry.kind === 'command')).toEqual([])
    expect(rewound.entries.find((entry) => entry.kind === 'rewind')).toMatchObject({ dropped: 1 })
    expect(rewound.commandsRun).toBe(0)
    expect(rewound.simulatedClock).toBe(started.simulatedClock)
  })

  it('treats an attempt recorded before budgets existed as unlimited', async () => {
    const generated = generatedFor('PWD-01', 'account-lockout')
    await insertTicket(persistence, generated, 'legacy-budget-ticket')
    await persistence.sessions.create({
      id: 'legacy-budget-session',
      ticketId: 'legacy-budget-ticket',
      startedAt: Date.now(),
      endedAt: null,
      world: JSON.parse(JSON.stringify(generated.world)),
      // The shape a build without budgets wrote into the session row.
      hintPolicy: { perHint: 5, cap: 15 },
      closureDraft: null,
      workspaceLayout: null,
      consoleFocus: null,
      examMode: false,
      resolution: null,
      outcome: null,
    })

    const workspace = await openSession('legacy-budget-session')

    expect(workspace.hintPolicy).toEqual({ perHint: 5, cap: 15, budget: 0 })
    expect(workspace.hintBudgetSpent).toBe(false)
  })

  it('prices an unverified, evidence-free fix in the debrief', async () => {
    const generated = generatedFor('PWD-01', 'account-lockout')
    const sam = generated.public.requester.samAccountName
    await insertTicket(persistence, generated, 'ticket-procedure')
    await startAttempt('ticket-procedure')

    await revealHint()
    await submitCommand(`unlock-account ${sam}`)
    await submitCommand(`get-account ${sam}`)

    const debrief = await resolveAttempt({ code: 'resolved-remote', note: '' })

    expect(debrief.violations.map((violation) => violation.id)).toEqual([
      'unverified-change',
      'fix-before-evidence',
    ])
    expect(debrief.procedurePenalty).toBe(15)
    expect(debrief.hintsUsed).toBe(1)
    expect(debrief.hintPenalty).toBe(5)
    expect(debrief.feedback.join(' ')).toMatch(/before verifying the caller/i)
  })

  it('reports the same charges from a dry run as the close records', async () => {
    const generated = generatedFor('PWD-01', 'account-lockout')
    const sam = generated.public.requester.samAccountName
    await insertTicket(persistence, generated, 'ticket-projection')
    await startAttempt('ticket-projection')

    await revealHint()
    await submitCommand(`unlock-account ${sam}`)
    await submitCommand(`get-account ${sam}`)

    // The workspace reads this dry run rather than counting the costs itself,
    // so the score it shows before the close is the one the close writes.
    const review = await reviewClosure({ code: 'resolved-remote', note: '' })
    const debrief = await resolveAttempt({ code: 'resolved-remote', note: '' })

    expect(review.procedurePenalty).toBe(debrief.procedurePenalty)
    expect(review.hintPenalty).toBe(debrief.hintPenalty)
    expect(review.total).toBe(debrief.total)
    expect(review.passed).toBe(debrief.passed)
    expect(review.procedurePenalty).toBeGreaterThan(0)
    expect(review.hintPenalty).toBeGreaterThan(0)
  })

  it('shows the procedure cost live, before the ticket is closed', async () => {
    const generated = generatedFor('PWD-01', 'account-lockout')
    const sam = generated.public.requester.samAccountName
    await insertTicket(persistence, generated, 'ticket-procedure-live')

    const start = await startAttempt('ticket-procedure-live')
    expect(start.procedurePenalty).toBe(0)
    expect(start.procedureViolations).toEqual([])

    // The first change trips both mistakes: nobody verified, and no evidence
    // was read first. The workspace prices them the moment they are recorded.
    await submitCommand(`unlock-account ${sam}`)
    const afterFix = await getWorkspace()
    expect(afterFix.procedureViolations.map((violation) => violation.id)).toEqual([
      'unverified-change',
      'fix-before-evidence',
    ])
    expect(afterFix.procedureViolations.map((violation) => violation.points)).toEqual([10, 5])
    expect(afterFix.procedurePenalty).toBe(15)

    // Repeating the mistake cannot inflate a cost that is priced once.
    await submitCommand(`unlock-account ${sam}`)
    expect((await getWorkspace()).procedurePenalty).toBe(15)

    // Verifying afterwards changes nothing: the price belongs to what happened.
    await verifyCallerByCode()
    expect((await getWorkspace()).procedurePenalty).toBe(15)

    const debrief = await resolveAttempt({ code: 'resolved-remote', note: '' })
    expect(debrief.procedurePenalty).toBe(15)
    expect(debrief.violations.map((violation) => violation.id)).toEqual([
      'unverified-change',
      'fix-before-evidence',
    ])
  })

  it('keeps the live procedure cost at zero when evidence comes first', async () => {
    const generated = generatedFor('PWD-01', 'account-lockout')
    const sam = generated.public.requester.samAccountName
    await insertTicket(persistence, generated, 'ticket-procedure-clean')
    await startAttempt('ticket-procedure-clean')

    await submitCommand(`get-account ${sam}`)
    await verifyCallerByCode()
    await submitCommand(`unlock-account ${sam}`)

    const workspace = await getWorkspace()
    expect(workspace.procedureViolations).toEqual([])
    expect(workspace.procedurePenalty).toBe(0)
  })

  it('treats a score stored before hints existed as costing nothing', async () => {
    const driver = await createSqliteDriver(undefined, { wasmBinary: loadWasmBinary() })
    runMigrations(driver)
    driver.run(
      "INSERT INTO tickets (id, scenario_id, variant_id, difficulty, seed, signature, public_json, created_at, status)\n" +
        "VALUES ('legacy-ticket', 'NET-01', 'bad-static-dns', 2, 1, 'legacy-sig', '{\"subject\":\"Legacy ticket\"}', 1, 'completed')",
    )
    driver.run(
      "INSERT INTO sessions (id, ticket_id, started_at, ended_at, world_json, resolution, outcome)\n" +
        "VALUES ('legacy-session', 'legacy-ticket', 1, 2, '{}', 'resolved-remote', 'resolved')",
    )
    // A rubric JSON written by the build before hints landed: no hintsUsed, no hintPenalty.
    driver.run(
      "INSERT INTO scores (session_id, total, passed, band, rubric_json, computed_at)\n" +
        "VALUES ('legacy-session', 88, 1, 'pass', " +
        "'{\"total\":88,\"passed\":true,\"band\":\"pass\",\"items\":[],\"criticalFailures\":[],\"feedback\":[],\"xp\":88,\"categoryScores\":{\"diagnosis\":{\"earned\":10,\"possible\":10},\"documentation\":{\"earned\":10,\"possible\":10},\"resolution\":{\"earned\":10,\"possible\":10},\"safety\":{\"earned\":10,\"possible\":10}}}', 3)",
    )

    holder.current = new SqlitePersistence(driver, new MemorySnapshotStore(), loadWasmBinary())
    const debrief = await loadDebrief('legacy-session')

    expect(debrief?.total).toBe(88)
    expect(debrief?.hintsUsed).toBe(0)
    expect(debrief?.hintPenalty).toBe(0)
  })

  it('keeps a stored single hint readable by turning it into a one-rung ladder', async () => {
    const driver = await createSqliteDriver(undefined, { wasmBinary: loadWasmBinary() })
    runMigrations(driver)
    driver.run(
      'INSERT INTO tickets (id, scenario_id, variant_id, difficulty, seed, signature, public_json, created_at, status)\n' +
        'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        'legacy-hint-ticket',
        'PWD-01',
        'account-lockout',
        1,
        2,
        'legacy-hint-sig',
        JSON.stringify({
          subject: 'Legacy ticket',
          body: '',
          scenarioTitle: 'Password and account access',
          variantLabel: 'Account lockout',
          category: 'identity',
          severity: 'high',
          requester: {
            name: 'Marcus Chen',
            samAccountName: 'mchen',
            employeeId: 'E-4421',
            department: 'Operations',
            email: 'marcus.chen@larkspur.example',
            siteName: 'Larkspur HQ',
          },
          device: {
            hostname: 'LT-4471',
            kind: 'laptop',
            os: 'Windows 11 Enterprise 23H2',
            siteName: 'Larkspur HQ',
          },
          symptoms: [],
          createdAt: 1,
        }),
        1,
        'completed',
      ],
    )
    driver.run(
      "INSERT INTO sessions (id, ticket_id, started_at, ended_at, world_json, resolution, outcome)\n" +
        "VALUES ('legacy-hint-session', 'legacy-hint-ticket', 1, 2, '{}', 'resolved-remote', 'resolved')",
    )
    driver.run(
      'INSERT INTO scores (session_id, total, passed, band, rubric_json, computed_at)\n' +
        'VALUES (?, ?, ?, ?, ?, ?)',
      [
        'legacy-hint-session',
        80,
        1,
        'pass',
        JSON.stringify({
          total: 80,
          passed: true,
          band: 'pass',
          items: [
            {
              id: 'old-safety',
              label: 'Old safety step',
              category: 'safety',
              weight: 10,
              critical: false,
              passed: false,
              why: '',
              hint: 'Old single hint',
              evidence: [],
            },
          ],
          criticalFailures: [],
          feedback: [],
          xp: 80,
          categoryScores: {
            diagnosis: { earned: 0, possible: 0 },
            documentation: { earned: 0, possible: 0 },
            resolution: { earned: 0, possible: 0 },
            safety: { earned: 0, possible: 0 },
          },
        }),
        3,
      ],
    )

    holder.current = new SqlitePersistence(driver, new MemorySnapshotStore(), loadWasmBinary())
    const debrief = await loadDebrief('legacy-hint-session')

    expect(debrief?.items[0]?.hints).toEqual(['Old single hint'])
  })

  it('verifies the caller only after the live code is read back', async () => {
    const generated = generatedFor('PWD-01', 'account-lockout')
    await insertTicket(persistence, generated, 'ticket-code')

    const started = await startAttempt('ticket-code')
    const caller = started.verification.recipients[0]
    expect(caller?.role).toBe('caller')
    expect(started.verification.active).toBeNull()

    const sent = await sendVerificationCode(caller?.id ?? '')
    expect(sent.verification.active?.forCaller).toBe(true)
    const readBack = sent.verification.active?.readBack
    expect(readBack).toMatch(/^\d{3} \d{3}$/)

    const verified = await verifyCallerWithCode(readBack ?? '')
    expect(verified.hasVerifiedCaller).toBe(true)
    expect(verified.verification.lastAttempt).toBeNull()
    expect(verified.entries.at(-1)).toMatchObject({ kind: 'verify', ok: true })

    // The live code and the verification survive a reload.
    const reopened = await openSession(verified.sessionId)
    expect(reopened.hasVerifiedCaller).toBe(true)
    expect(reopened.verification.active?.forCaller).toBe(true)
  })

  it('counts the live code down on the simulated clock, and says so before it expires', async () => {
    const generated = generatedFor('PWD-01', 'account-lockout')
    const sam = generated.public.requester.samAccountName
    await insertTicket(persistence, generated, 'ticket-code-clock')

    const started = await startAttempt('ticket-code-clock')
    const sent = await sendVerificationCode(started.verification.callerId)
    // Ten simulated minutes when it is sent.
    expect(sent.verification.active?.remainingMs).toBe(10 * 60_000)

    // Each command is a minute on the simulation's clock, so the panel's number
    // moves with the work the learner does rather than with the wall.
    const ticked = await submitCommand(`get-account ${sam}`)
    expect(ticked.verification.active?.remainingMs).toBe(9 * 60_000)

    // After ten of them the code is spent, and the panel can say so before the
    // learner has typed six digits that were never going to work.
    let view = ticked
    for (let minute = 0; minute < 9; minute += 1) {
      view = await submitCommand(`get-account ${sam}`)
    }
    expect(view.verification.active?.remainingMs).toBe(0)
    expect(view.hasVerifiedCaller).toBe(false)

    const late = await verifyCallerWithCode(view.verification.active?.readBack ?? '')
    expect(late.verification.lastAttempt?.result).toBe('expired')

    // A new code restarts the window, because it is a new live code.
    const again = await sendVerificationCode(started.verification.callerId)
    expect(again.verification.active?.remainingMs).toBe(10 * 60_000)
  })

  it('keeps refused read-backs out of the safety score', async () => {
    const generated = generatedFor('PWD-01', 'account-lockout')
    const sam = generated.public.requester.samAccountName
    await insertTicket(persistence, generated, 'ticket-code-wrong')

    const started = await startAttempt('ticket-code-wrong')
    const manager = started.verification.recipients.find(
      (recipient) => recipient.role === 'manager',
    )
    expect(manager).toBeDefined()

    const sent = await sendVerificationCode(manager?.id ?? '')
    expect(sent.verification.active?.forCaller).toBe(false)
    expect(sent.verification.active?.readBack).toBeNull()

    const refused = await verifyCallerWithCode('000000')
    expect(refused.hasVerifiedCaller).toBe(false)
    expect(refused.verification.lastAttempt?.result).toBe('wrong-recipient')
    expect(refused.verification.lastAttempt?.message).toMatch(/not this ticket/)
    expect(refused.entries.at(-1)).toMatchObject({ kind: 'verify', ok: false })

    await submitCommand(`get-account ${sam}`)
    await submitCommand(`unlock-account ${sam}`)
    await submitCommand(`get-account ${sam}`)
    await addNote(
      'troubleshooting',
      'Directory showed the account locked. The verification code went to the manager by mistake, so the caller was never verified before the unlock.',
    )
    await addNote(
      'customer',
      'Your account is unlocked. Sign in with your current password and contact us if it locks again today.',
    )

    const debrief = await resolveAttempt({ code: 'resolved-remote', note: '' })
    expect(debrief.criticalFailures.join(' ')).toMatch(/No record that you verified the caller/)
  })

  it('retires the previous code when a new one is sent', async () => {
    const generated = generatedFor('PWD-01', 'account-lockout')
    await insertTicket(persistence, generated, 'ticket-code-rotate')

    const started = await startAttempt('ticket-code-rotate')
    const callerId = started.verification.callerId
    const first = await sendVerificationCode(callerId)
    const firstCode = first.verification.active?.readBack ?? ''

    const second = await sendVerificationCode(callerId)
    const secondCode = second.verification.active?.readBack ?? ''
    expect(secondCode).not.toBe(firstCode)

    const stale = await verifyCallerWithCode(firstCode)
    expect(stale.hasVerifiedCaller).toBe(false)
    expect(stale.verification.lastAttempt?.result).toBe('retired')

    const accepted = await verifyCallerWithCode(secondCode)
    expect(accepted.hasVerifiedCaller).toBe(true)
  })

  it('scores a refused third-party reset as denied rather than resolved', async () => {
    const generated = generatedFor('PWD-01', 'third-party-reset')
    const requester = generated.world.users.find(
      (user) => user.samAccountName === generated.public.requester.samAccountName,
    )
    const target = generated.world.users.find(
      (user) => user.displayName === requester?.managerName,
    )
    expect(target).toBeDefined()
    await insertTicket(persistence, generated, 'ticket-denial')

    const started = await startAttempt('ticket-denial')
    expect(started.denial).toBeNull()

    const denied = await denyCaller('third-party-request')
    expect(denied.denial).toMatchObject({
      reason: 'third-party-request',
      label: 'Asked for someone else’s account',
    })
    expect(denied.denial?.summary).toMatch(/Refused the request/)
    expect(denied.entries.at(-1)).toMatchObject({ kind: 'deny' })

    // A refusal is one-way: repeating it would grow the log without changing anything.
    await expect(denyCaller('pressure')).rejects.toThrow(/already been refused/i)

    await submitCommand(`get-account ${target?.samAccountName}`)
    await addNote(
      'troubleshooting',
      'Caller asked for a reset on someone else’s account and offered to pass the password back. I refused it and made no account changes.',
    )
    await addNote(
      'customer',
      'I have not reset the password. The account owner needs to contact us directly from a number on file.',
    )

    const debrief = await resolveAttempt({
      code: 'denied-social-engineering',
      note: 'Third-party reset request refused and reported to Security. I checked the account it named and the caller’s own record before refusing, and no account changes were made. Security should confirm who called.',
    })

    expect(debrief.passed).toBe(true)
    expect(debrief.decision.code).toBe('denied-social-engineering')
    expect(debrief.items.find((item) => item.id === 'deny-request')?.passed).toBe(true)

    // The refused ticket shows the caller's claim beside the account row the
    // desk read, which is what made the relay story fall apart.
    expect(debrief.identityFindings.map((finding) => finding.id)).toEqual([
      'claimed-target-locked',
    ])
    expect(debrief.identityFindings[0]?.claim).toMatch(/is locked out and asked me/)
    expect(debrief.identityFindings[0]?.evidence).toMatch(/status: active/)
    // The refusal was honoured, so there is nothing to contradict: the finding is
    // for an attempt that argued with its own decision, not for refusing at all.
    expect(debrief.refusalFindings).toEqual([])

    const stored = await loadDebrief(debrief.sessionId)
    expect(stored?.band).toBe('strong')
    expect(stored?.identityFindings).toEqual(debrief.identityFindings)
  })

  it('stops the account-changing commands once the request has been denied', async () => {
    const generated = generatedFor('PWD-01', 'account-lockout')
    const sam = generated.public.requester.samAccountName
    await insertTicket(persistence, generated, 'ticket-denied-block')

    await startAttempt('ticket-denied-block')
    const before = await submitCommand(`get-account ${sam}`)
    expect(accountStatus(before)).toBe('locked')

    const refused = await denyCaller('unverified-identity')

    // The desk is told which commands are off the table before it types one, and
    // the list is the registry's own: a command that starts changing an account
    // is refused and named together, with no second copy of the rule to update.
    expect(refused.denial?.blockedCommands).toEqual([
      'unlock-account',
      'reset-password',
      'reset-mfa',
      'unblock-signin',
      'add-group-member',
      'remove-share-deny',
    ])

    // Nothing has been tried yet, so the case file has nothing to call out.
    expect(refused.denial?.retried).toEqual([])

    // The refusal is the decision, so the change it refused does not happen.
    const blocked = await submitCommand(`unlock-account ${sam}`)
    // The case file names what was tried after the refusal, live, beside the
    // decision — not left for the debrief to find.
    expect(blocked.denial?.retried).toEqual([
      { seq: expect.any(Number), command: `unlock-account ${sam}`, atMs: expect.any(Number) },
    ])
    // The list is read off the log, so it is still there after the refusal is
    // answered by a tool.
    expect(blocked.denial?.blockedCommands).toEqual(refused.denial?.blockedCommands)
    const attempt = blocked.entries.at(-1)
    expect(attempt?.kind === 'command' ? attempt.ok : true).toBe(false)
    const said = attempt?.kind === 'command' ? attempt.lines.map((line) => line.text).join('\n') : ''
    expect(said).toMatch(/refused on this ticket/i)
    expect(said).toMatch(/could not verify who is calling/i)

    const after = await submitCommand(`get-account ${sam}`)
    expect(accountStatus(after)).toBe('locked')

    // Reading is not changing: the desk can still look, and still work the parts
    // of the ticket a refusal has nothing to say about.
    const spooler = await submitCommand('restart-spooler')
    expect(commandText(spooler)).toMatch(/spooler/i)
    expect(spooler.entries.at(-1)).toMatchObject({ kind: 'command', ok: true })

    // A console presses the same pipeline, so it cannot do what the terminal was
    // just told not to.
    const fromConsole = await runConsoleAction('directory', sam, 'reset-password')
    expect(fromConsole.entries.at(-1)).toMatchObject({ kind: 'command', ok: false })
    expect(commandText(fromConsole)).toMatch(/refused on this ticket/i)
    // Reads are not changes: the two lookups after the refusal are not in the
    // callout, and the one change from a console is.
    expect(fromConsole.denial?.retried.map((retry) => retry.command)).toEqual([
      `unlock-account ${sam}`,
      `reset-password ${sam}`,
    ])

    // Blocked is not the same as unnoticed: the debrief names the contradiction
    // between the refusal and the changes the desk went on to try.
    const debrief = await resolveAttempt({
      code: 'denied-social-engineering',
      note: 'Refused the request and changed nothing. I checked the account and the sign-in log before refusing, and reported it to Security. Security should confirm who called and warn the employee.',
    })
    expect(debrief.refusalFindings).toHaveLength(1)
    expect(debrief.refusalFindings[0]).toMatchObject({ id: 'change-after-refusal' })
    expect(debrief.refusalFindings[0]?.claim).toMatch(/Refused the request/)
    expect(debrief.refusalFindings[0]?.evidence).toMatch(
      /2 commands that change an account came after it — unlock-account, reset-password/i,
    )
    expect(debrief.refusalFindings[0]?.evidence).toMatch(new RegExp(`on ${sam}`))
    // The finding is read from the log like everything else in the debrief, so a
    // stored attempt reports it the same way.
    const stored = await loadDebrief(debrief.sessionId)
    expect(stored?.refusalFindings).toEqual(debrief.refusalFindings)
  })

  it('opens a refused ticket on its own close, and keeps it over a reload', async () => {
    const generated = generatedFor('PWD-01', 'account-lockout')
    await insertTicket(persistence, generated, 'ticket-refusal-close')

    const started = await startAttempt('ticket-refusal-close')
    expect(started.denial).toBeNull()

    const refused = await denyCaller('unverified-identity')
    // The refusal has one close that fits it, and the workspace names it, so the
    // form opens on the report rather than the ordinary resolve.
    expect(refused.denial?.closingCode).toBe('denied-social-engineering')
    expect(refused.closureDraft.code).toBe('denied-social-engineering')

    // It is saved with the attempt, so a reload reopens the report — not the
    // default disposition the form would otherwise start on.
    clearActiveAttempt()
    const reopened = await openSession(started.sessionId)
    expect(reopened.denial?.closingCode).toBe('denied-social-engineering')
    expect(reopened.closureDraft.code).toBe('denied-social-engineering')
  })

  it('leaves a close the learner had already chosen alone when they refuse', async () => {
    const generated = generatedFor('PWD-01', 'account-lockout')
    await insertTicket(persistence, generated, 'ticket-refusal-keeps-draft')

    await startAttempt('ticket-refusal-keeps-draft')
    await saveClosureDraft({ code: 'escalated-identity', note: 'Handing this to Identity.' })

    const refused = await denyCaller('pressure')

    // The refusal decides the disposition, not the paperwork the learner was
    // already writing.
    expect(refused.denial?.closingCode).toBe('denied-social-engineering')
    expect(refused.closureDraft).toEqual({
      code: 'escalated-identity',
      note: 'Handing this to Identity.',
    })
  })

  it('keeps the refusal over a reload, and lets it go when the denial is un-run', async () => {
    const generated = generatedFor('PWD-01', 'account-lockout')
    const sam = generated.public.requester.samAccountName
    await insertTicket(persistence, generated, 'ticket-denied-holds')

    const started = await startAttempt('ticket-denied-holds')
    const denied = await denyCaller('unverified-identity')
    const step = denied.entries.at(-1)?.seq
    if (step === undefined) {
      throw new Error('The denial was not recorded')
    }

    // The refusal is world state, so reopening the attempt cannot forget it.
    await openSession(started.sessionId)
    const reopened = await submitCommand(`unlock-account ${sam}`)
    expect(commandText(reopened)).toMatch(/refused on this ticket/i)

    // Un-running the denial takes the refusal with it: the log is the truth, and
    // the world it folds back to has no refusal in it.
    const lifted = await rewindAttempt(step)
    expect(
      lifted.entries.some(
        (entry) => entry.kind === 'command' && entry.text === `unlock-account ${sam}`,
      ),
    ).toBe(false)

    const freed = await submitCommand(`unlock-account ${sam}`)
    expect(commandText(freed)).not.toMatch(/refused on this ticket/i)
    const after = await submitCommand(`get-account ${sam}`)
    expect(accountStatus(after)).toBe('active')

    // The denial is no longer in the log, so there is no refusal for the
    // debrief to set against anything the attempt did after it.
    const debrief = await resolveAttempt({
      code: 'resolved-remote',
      note: 'Verified the caller, unlocked the account, and closed it resolved.',
    })
    expect(debrief.refusalFindings).toEqual([])
  })

  it('refuses a denial close whose security report is missing a part, and names it', async () => {
    const generated = generatedFor('PWD-01', 'third-party-reset')
    const target = generated.world.callerClaims?.find((claim) => !claim.identity)?.account ?? ''
    await insertTicket(persistence, generated, 'ticket-report-parts')

    await startAttempt('ticket-report-parts')
    await submitCommand(`get-account ${target}`)
    await denyCaller('third-party-request')

    // The review is what the close form reads, so the part is named before the
    // button is pressed as well as when the close is refused.
    const partial = 'Denied the request and reported it to Security.'
    const review = await reviewClosure({ code: 'denied-social-engineering', note: partial })
    expect(review.report?.missing).toEqual([
      'what you checked before refusing',
      'what Security should do next',
    ])
    expect(review.report?.tooShort).toBe(false)
    expect(review.report?.message).toContain('what Security should do next')

    await expect(
      resolveAttempt({ code: 'denied-social-engineering', note: partial }),
    ).rejects.toThrow(/security report/i)

    // A close that was refused writes nothing: the attempt is still the open one
    // and the log has no resolution note for the debrief to score.
    const open = await getWorkspace()
    expect(open.entries.some((entry) => entry.kind === 'note')).toBe(false)

    // The report that says all three closes the ticket.
    const complete = `${partial} I checked the account it named and the caller’s own record before refusing, and nothing was changed. Security should confirm who called and warn the owner.`
    expect((await reviewClosure({ code: 'denied-social-engineering', note: complete })).report).toBeNull()

    const debrief = await resolveAttempt({ code: 'denied-social-engineering', note: complete })
    expect(debrief.decision.code).toBe('denied-social-engineering')
  })

  it('cannot verify a caller who is not the employee the code went to', async () => {
    const generated = generatedFor('PWD-01', 'impersonated-caller')
    const sam = generated.public.requester.samAccountName
    await insertTicket(persistence, generated, 'ticket-impersonated')

    const started = await startAttempt('ticket-impersonated')
    const employee = started.verification.recipients[0]
    expect(employee?.role).toBe('caller')
    expect(employee?.name).toBe(generated.public.requester.name)

    // The impostor asks for the code to be read out to them.
    const asked = await askCaller('already-tried')
    const answer = asked.entries.at(-1)
    expect(answer?.kind === 'ask' ? answer.answer : '').toMatch(/read the code out/i)

    // The code goes to the employee on the ticket, so the caller never holds it.
    const sent = await sendVerificationCode(employee?.id ?? '')
    expect(sent.verification.active?.callerImpersonating).toBe(true)
    expect(sent.verification.active?.forCaller).toBe(false)
    expect(sent.verification.active?.readBack).toBeNull()

    const refused = await verifyCallerWithCode('000000')
    expect(refused.hasVerifiedCaller).toBe(false)
    expect(refused.verification.lastAttempt?.result).toBe('not-the-caller')
    expect(refused.verification.lastAttempt?.message).toMatch(/not them/)
    expect(refused.entries.at(-1)).toMatchObject({ kind: 'verify', ok: false })

    // Only the code has been logged so far, so the gate answers the identity
    // claim and leaves the directory claim alone until an account read backs it.
    expect(refused.verification.contradictions.map((finding) => finding.id)).toEqual([
      'claimed-owner',
    ])
    expect(refused.verification.contradictions[0]?.evidence).toMatch(/could not read it back/)

    // The impersonation is part of the ticket, so a reload cannot talk it round.
    const reopened = await openSession(refused.sessionId)
    expect(reopened.verification.active?.callerImpersonating).toBe(true)
    expect(reopened.verification.lastAttempt?.result).toBe('not-the-caller')
    expect(reopened.verification.contradictions).toEqual(refused.verification.contradictions)

    // The lookup the desk actually ran is what settles the lockout claim.
    const read = await submitCommand(`get-account ${sam}`)
    expect(read.verification.contradictions.map((finding) => finding.id)).toEqual([
      'claimed-lockout',
      'claimed-owner',
    ])
    expect(read.verification.contradictions[0]?.evidence).toMatch(/status: active/)

    await submitCommand(`get-account ${sam}`)
    await denyCaller('unverified-identity')
    await addNote(
      'troubleshooting',
      'Caller claimed to be the account owner and asked for an unlock and a reset. The directory shows the account active and not expired. The live code went to the employee\u2019s own mobile and was never read back, so nobody on the call was identified. Refused the request and changed nothing.',
    )
    await addNote(
      'customer',
      'The account owner has to contact us directly from a number on file before any unlock or reset can happen. Nothing has been changed.',
    )

    const debrief = await resolveAttempt({
      code: 'denied-social-engineering',
      note: 'Denied an unverified request made in the employee\u2019s name and reported the impersonation attempt to Security. I looked at the account and its sign-in record before refusing, and nothing was changed. Security should trace the caller.',
    })

    expect(debrief.passed).toBe(true)
    expect(debrief.decision.code).toBe('denied-social-engineering')
    expect(debrief.items.find((item) => item.id === 'no-reset')?.passed).toBe(true)
    expect(debrief.items.find((item) => item.id === 'deny-request')?.passed).toBe(true)

    // The debrief carries the same claim-versus-evidence findings, so the learner
    // can see what gave the caller away rather than only that it was refused.
    expect(debrief.identityFindings.map((finding) => finding.claim)).toEqual([
      'My account is locked out and I need it unlocked.',
      `I am ${generated.public.requester.name}, the account owner.`,
    ])
    expect(debrief.identityFindings[0]?.evidence).toMatch(/status: active/)
    expect(debrief.identityFindings[1]?.evidence).toMatch(/could not read it back/)

    const stored = await loadDebrief(debrief.sessionId)
    expect(stored?.identityFindings).toEqual(debrief.identityFindings)
  })

  it('weighs the account asking in chat as well as the code that cannot come back', async () => {
    const generated = generatedFor('PWD-01', 'chat-relay-reset')
    const relay = generated.public.requester.samAccountName
    const target = generated.world.callerClaims?.find((claim) => !claim.identity)?.account ?? ''
    await insertTicket(persistence, generated, 'ticket-chat-relay')

    const started = await startAttempt('ticket-chat-relay')

    // The chat says the owner is locked out; the directory is the record that
    // settles it, and the asking colleague's own mailbox shows where its mail
    // is going.
    const lookup = await submitCommand(`get-account ${target}`)
    expect(accountStatus(lookup)).toBe('active')
    const mailbox = await submitCommand(`get-mailbox ${relay}`)
    expect(commandText(mailbox)).toMatch(/Forwarding\s+:\s+\S+@larkspur-help\.example/)

    // A code sent to the colleague goes to the colleague's own phone, which is
    // exactly what the person in chat cannot read back.
    const sent = await sendVerificationCode(started.verification.callerId)
    expect(sent.verification.active?.callerImpersonating).toBe(true)
    expect(sent.verification.active?.readBack).toBeNull()
    const refusedCode = await verifyCallerWithCode('000000')
    expect(refusedCode.hasVerifiedCaller).toBe(false)
    expect(refusedCode.verification.lastAttempt?.result).toBe('not-the-caller')
    expect(refusedCode.verification.contradictions.map((finding) => finding.id)).toEqual([
      'claimed-target-locked',
      'claimed-colleague',
    ])

    await denyCaller('third-party-request')
    await addNote(
      'troubleshooting',
      'Chat asked for a reset on someone else’s account on the owner’s behalf. The directory shows the account active, and the asking colleague’s mailbox forwards outside the organisation. The live code went to the colleague’s phone and was never read back, so the account in chat cannot be trusted. Refused the request and made no changes.',
    )
    await addNote(
      'customer',
      'I have not reset the password. The account owner needs to contact us directly from a number on file.',
    )

    const debrief = await resolveAttempt({
      code: 'denied-social-engineering',
      note: 'Denied a reset asked for in chat on the owner’s behalf by a compromised helpdesk account, and reported it to Security. I checked both accounts before refusing, and nothing was changed. Security should investigate the compromised helpdesk account.',
    })

    expect(debrief.passed).toBe(true)
    expect(debrief.decision.code).toBe('denied-social-engineering')
    expect(debrief.items.find((item) => item.id === 'deny-request')?.passed).toBe(true)
    expect(debrief.items.find((item) => item.id === 'no-reset')?.passed).toBe(true)

    // The debrief quotes both halves: the lockout the directory refuted and the
    // colleague the gate could not identify.
    expect(debrief.identityFindings.map((finding) => finding.id)).toEqual([
      'claimed-target-locked',
      'claimed-colleague',
    ])
    expect(debrief.identityFindings[0]?.claim).toMatch(/locked out and asked me in chat/)
    expect(debrief.identityFindings[0]?.evidence).toMatch(/status: active/)
    expect(debrief.identityFindings[1]?.evidence).toMatch(/could not read it back/)

    const stored = await loadDebrief(debrief.sessionId)
    expect(stored?.identityFindings).toEqual(debrief.identityFindings)
  })

  it('verifies by a callback when no code can reach the caller', async () => {
    const generated = generatedFor('PWD-01', 'callback-verification')
    const sam = generated.public.requester.samAccountName
    await insertTicket(persistence, generated, 'ticket-callback')

    const started = await startAttempt('ticket-callback')
    const mobile = started.verification.recipients[0]
    const desk = started.verification.recipients.find(
      (recipient) => recipient.id === 'requester-desk',
    )
    expect(mobile?.reachable).toBe(false)
    expect(desk?.methods).toEqual(['callback'])

    // A code goes to the dead handset and proves nothing, however it is answered.
    await expect(sendVerificationCode(desk?.id ?? '')).rejects.toThrow(/Ring it back instead/)
    const sent = await sendVerificationCode(mobile?.id ?? '')
    expect(sent.verification.active?.forCaller).toBe(false)
    expect(sent.verification.active?.recipientReachable).toBe(false)
    expect(sent.verification.active?.readBack).toBeNull()

    const refused = await verifyCallerWithCode('000000')
    expect(refused.hasVerifiedCaller).toBe(false)
    expect(refused.verification.lastAttempt?.result).toBe('unreachable')
    expect(refused.verification.lastAttempt?.message).toMatch(/out of action/)

    // Ringing the dead handset reaches nobody, so it is not a check either.
    const missed = await placeCallback(mobile?.id ?? '')
    expect(missed.hasVerifiedCaller).toBe(false)
    expect(missed.verification.callback?.result).toBe('no-answer')
    expect(missed.verification.callback?.message).toMatch(/still unverified/)

    // The desk line is where the person is, and the call is the evidence.
    const confirmed = await placeCallback(desk?.id ?? '')
    expect(confirmed.hasVerifiedCaller).toBe(true)
    expect(confirmed.verification.callback).toMatchObject({
      result: 'verified',
      contactId: 'requester-desk',
    })
    expect(confirmed.verification.callback?.message).toMatch(/confirmed the request is theirs/)
    expect(confirmed.entries.at(-1)).toMatchObject({ kind: 'verify', ok: true })

    // The record of the call survives a reload, along with the failed code.
    const reopened = await openSession(confirmed.sessionId)
    expect(reopened.hasVerifiedCaller).toBe(true)
    expect(reopened.verification.callback?.result).toBe('verified')

    await submitCommand(`get-account ${sam}`)
    await submitCommand(`unlock-account ${sam}`)
    await submitCommand(`get-account ${sam}`)
    await addNote(
      'troubleshooting',
      'Caller was locked out and their handset is out of action, so no code could be read back. Directory confirmed the lockout, the caller was confirmed by a callback to the desk line on file, the account was unlocked, and the status returned to active.',
    )
    await addNote(
      'customer',
      'Your account is unlocked and no new password was issued. Sign in with your current password and contact us if it locks again today.',
    )

    const debrief = await resolveAttempt({ code: 'resolved-remote', note: '' })
    expect(debrief.passed).toBe(true)
    expect(debrief.items.find((item) => item.id === 'verify-by-callback')?.passed).toBe(true)
    expect(debrief.reference.map((step) => step.label).join(' ')).toMatch(/Ring the caller back/)
  })

  it('lets a callback clear the gate but prices it when a code was available', async () => {
    const generated = generatedFor('PWD-01', 'account-lockout')
    const sam = generated.public.requester.samAccountName
    await insertTicket(persistence, generated, 'ticket-callback-cost')

    const started = await startAttempt('ticket-callback-cost')
    const caller = started.verification.recipients.find(
      (recipient) => recipient.id === started.verification.callerId,
    )
    // The handset works, so the read-back was the check to make.
    expect(caller?.reachable).toBe(true)

    const called = await placeCallback(caller?.id ?? '')
    expect(called.hasVerifiedCaller).toBe(true)
    expect(called.procedureViolations.map((violation) => violation.id)).toContain(
      'callback-instead-of-code',
    )

    await submitCommand(`get-account ${sam}`)
    await submitCommand(`unlock-account ${sam}`)
    await submitCommand(`get-account ${sam}`)
    await addNote(
      'troubleshooting',
      'Directory showed the account locked. Confirmed the caller by ringing the mobile on file, unlocked the account, and checked the status returned to active.',
    )
    await addNote(
      'customer',
      'Your account is unlocked. Sign in with your current password and contact us if it happens again today.',
    )

    const debrief = await resolveAttempt({ code: 'resolved-remote', note: '' })
    expect(debrief.passed).toBe(true)
    expect(debrief.violations.map((violation) => violation.id)).toEqual([
      'callback-instead-of-code',
    ])
    expect(debrief.procedurePenalty).toBe(5)
    expect(debrief.total).toBe(95)
    expect(debrief.feedback.join(' ')).toMatch(/Rang back instead of having a code read back/)
  })

  it('records a callback a colleague answered on a shared line as somebody else', async () => {
    const generated = generatedFor('PWD-01', 'shared-line-callback')
    const sam = generated.public.requester.samAccountName
    const line = generated.world.sharedCallbackLine
    if (!line) {
      throw new Error('The variant did not put a shared line on the ticket')
    }
    await insertTicket(persistence, generated, 'ticket-shared-line')

    const started = await startAttempt('ticket-shared-line')
    const team = started.verification.recipients.find((recipient) => recipient.role === 'team')
    expect(team?.name).toBe(line.label)
    expect(team?.answeredBy).toBe(line.answeredBy)
    // The caller is still first, and their own mobile still takes a code: the
    // shared line is an extra door, not the only one.
    expect(started.verification.recipients[0]?.id).toBe(started.verification.callerId)
    expect(started.verification.recipients[0]?.reachable).toBe(true)
    expect(started.verification.recipients[0]?.methods).toContain('verification-code')

    // The call reaches a colleague, who is named, and the gate stays shut.
    const called = await placeCallback('team-line')
    expect(called.hasVerifiedCaller).toBe(false)
    expect(called.verification.callback).toMatchObject({
      result: 'colleague-answered',
      contactId: 'team-line',
      answeredBy: line.answeredBy,
    })
    expect(called.verification.callback?.message).toContain(
      `${line.answeredBy} answered the ${line.label} and confirmed the request`,
    )
    expect(called.entries.at(-1)).toMatchObject({ kind: 'verify', ok: false })
    expect(called.procedureViolations.map((violation) => violation.id)).toEqual([
      'callback-to-shared-line',
    ])

    // The read-back to the caller's own phone is the proof this ticket needs.
    const sent = await sendVerificationCode(started.verification.callerId)
    const readBack = sent.verification.active?.readBack
    if (!readBack) {
      throw new Error('The live code was not with the caller')
    }
    const verified = await verifyCallerWithCode(readBack)
    expect(verified.hasVerifiedCaller).toBe(true)

    await submitCommand(`get-account ${sam}`)
    await submitCommand(`unlock-account ${sam}`)
    await submitCommand(`get-account ${sam}`)
    await addNote(
      'troubleshooting',
      `Directory showed the account locked. The ${line.label} was rung first and a colleague (${line.answeredBy}) answered, which proves nothing about who called. The live code went to the mobile on file and was read back, the account was unlocked, and the status returned to active.`,
    )
    await addNote(
      'customer',
      'Your account is unlocked. Sign in with your current password and call us back if it locks again today.',
    )

    const debrief = await resolveAttempt({ code: 'resolved-remote', note: '' })
    expect(debrief.items.find((item) => item.id === 'verify-by-code')?.passed).toBe(true)
    // Taking the colleague's confirmation still costs its own five points...
    expect(debrief.violations.map((violation) => violation.id)).toEqual([
      'callback-to-shared-line',
    ])
    expect(debrief.procedurePenalty).toBe(5)
    expect(debrief.total).toBe(95)
    // ...and the debrief says who was actually on the line, months on.
    expect(debrief.identityFindings.map((finding) => finding.id)).toEqual(['claimed-team-vouch'])
    expect(debrief.identityFindings[0]?.evidence).toContain(
      `${line.answeredBy} answered the ${line.label}`,
    )
    expect(debrief.identityFindings[0]?.evidence).toContain(
      `that colleague is not ${generated.public.requester.name}`,
    )

    const stored = await loadDebrief(debrief.sessionId)
    expect(stored?.identityFindings).toEqual(debrief.identityFindings)
  })

  it('refuses a password read-out as a credential request, not as an identity problem', async () => {
    const generated = generatedFor('PWD-01', 'credential-readout')
    const sam = generated.public.requester.samAccountName
    await insertTicket(persistence, generated, 'ticket-credential-readout')

    const started = await startAttempt('ticket-credential-readout')
    expect(started.denial).toBeNull()
    // The deny control offers the reason this ticket is about.
    expect(denialReasons().map((option) => option.reason)).toContain('credential-request')

    await submitCommand(`get-account ${sam}`)
    const refused = await denyCaller('credential-request')
    expect(refused.denial).toMatchObject({
      reason: 'credential-request',
      label: 'Asked for a password or a code',
    })
    expect(refused.entries.at(-1)).toMatchObject({ kind: 'deny' })

    await addNote(
      'troubleshooting',
      'Caller asked for their password to be read out, then offered to take the live code read out instead. The account was active with the password current. Refused as a credential request; nothing was read out and nothing changed.',
    )
    await addNote(
      'customer',
      'Nobody at the service desk will read a password or a code out. Set a new password through the reset route and sign in with it.',
    )

    const debrief = await resolveAttempt({
      code: 'denied-social-engineering',
      note: 'Denied a request for a password and a code to be read out, and reported it to Security. I checked the directory first: the account is active and the password current, so there was no fault behind the call. Nothing was read out and nothing changed. Security should treat the call as a credential harvest.',
    })
    expect(debrief.passed).toBe(true)
    expect(debrief.items.find((item) => item.id === 'refuse-credential-request')?.passed).toBe(
      true,
    )
    expect(debrief.items.find((item) => item.id === 'diagnose-account')?.passed).toBe(true)
    expect(debrief.violations).toEqual([])
    expect(debrief.total).toBe(100)
  })

  it('scores half the safety step when a credential request is refused for the wrong reason', async () => {
    const generated = generatedFor('PWD-01', 'credential-readout')
    const sam = generated.public.requester.samAccountName
    await insertTicket(persistence, generated, 'ticket-credential-wrong-reason')

    await startAttempt('ticket-credential-wrong-reason')
    await submitCommand(`get-account ${sam}`)
    // The right act for the wrong reason: the caller asked for a credential, and
    // the desk recorded that the concern was who was calling.
    const refused = await denyCaller('unverified-identity')
    expect(refused.denial?.reason).toBe('unverified-identity')

    await addNote(
      'troubleshooting',
      'Caller asked for their password to be read out. The account is active and the password current. Refused the request and made no changes.',
    )
    await addNote('customer', 'Set a new password through the reset route and sign in with it.')

    const debrief = await resolveAttempt({
      code: 'denied-social-engineering',
      note: 'Denied a request for a password and a code to be read out, and reported it to Security. I checked the directory first: the account is active and the password current, so there was no fault behind the call. Nothing was read out and nothing changed. Security should treat the call as a credential harvest.',
    })
    const step = debrief.items.find((item) => item.id === 'refuse-credential-request')
    // Refused, so the account was protected; filed under the wrong pretext, so
    // half of the step is still owed.
    expect(step?.passed).toBe(false)
    expect(step?.credit).toBe(0.5)
    expect(debrief.criticalFailures).toEqual([])
    expect(debrief.total).toBe(85)
    expect(debrief.categoryScores.safety).toEqual({ earned: 30, possible: 45 })
    // The debrief names the ask that was missed and the rule behind it, so the
    // point that went missing is not invisible.
    expect(debrief.feedback.join(' ')).toMatch(
      /filed it as “Could not verify who is calling” rather than “Asked for a password or a code”/,
    )
    expect(debrief.feedback.join(' ')).toMatch(
      /never reads out or accepts passwords or verification codes/,
    )
  })

  it('will not score a code read-back as a callback', async () => {
    const generated = generatedFor('PWD-01', 'callback-verification')
    const sam = generated.public.requester.samAccountName
    await insertTicket(persistence, generated, 'ticket-callback-code')

    const started = await startAttempt('ticket-callback-code')
    // The impostor-style shortcut: send a code and take whatever comes back as
    // proof. Nothing about it is a call the desk placed to the person.
    const manager = started.verification.recipients.find(
      (recipient) => recipient.role === 'manager',
    )
    const sent = await sendVerificationCode(manager?.id ?? '')
    expect(sent.verification.active?.forCaller).toBe(false)

    await submitCommand(`get-account ${sam}`)
    await submitCommand(`unlock-account ${sam}`)
    await submitCommand(`get-account ${sam}`)
    await addNote(
      'troubleshooting',
      'Account was locked. A code was sent to the manager on file, and the manager read it back, so I unlocked the account.',
    )
    await addNote('customer', 'Your account is unlocked. Use your current password to sign in.')

    const debrief = await resolveAttempt({ code: 'resolved-remote', note: '' })
    expect(debrief.passed).toBe(false)

    const callbackItem = debrief.items.find((item) => item.id === 'verify-by-callback')
    expect(callbackItem?.passed).toBe(false)
    // The debrief names the evidence that was required and missing.
    expect(callbackItem?.evidence.join(' ')).toMatch(/ring the caller back|rang the caller back/)
    expect(debrief.criticalFailures.join(' ')).toMatch(
      /No record that you rang the caller back on a number on file/,
    )
    expect(debrief.items.find((item) => item.id === 'unlock')?.passed).toBe(false)
  })

  it('proves an MFA reset by callback when the replaced handset cannot take a code', async () => {
    const generated = generatedFor('M365-01', 'mfa-method-lost')
    const sam = generated.public.requester.samAccountName
    await insertTicket(persistence, generated, 'ticket-mfa-callback')

    const started = await startAttempt('ticket-mfa-callback')
    const mobile = started.verification.recipients.find(
      (recipient) => recipient.id === 'requester',
    )
    const desk = started.verification.recipients.find(
      (recipient) => recipient.id === 'requester-desk',
    )
    // The handset that would take a code is the one the user replaced, so there
    // is a desk line on file instead of a phone that reaches them.
    expect(mobile?.reachable).toBe(false)
    expect(desk?.methods).toEqual(['callback'])

    const sent = await sendVerificationCode('requester')
    expect(sent.verification.active?.readBack).toBeNull()
    const byCode = await verifyCallerWithCode('000000')
    expect(byCode.hasVerifiedCaller).toBe(false)
    expect(byCode.verification.lastAttempt?.result).toBe('unreachable')
    expect(byCode.verification.lastAttempt?.message).toMatch(/out of action/)

    // The desk line is where the person is, and the call is the evidence.
    const called = await placeCallback('requester-desk')
    expect(called.hasVerifiedCaller).toBe(true)
    expect(called.procedureViolations).toEqual([])

    await submitCommand(`get-signin-log ${sam}`)
    await submitCommand(`reset-mfa ${sam}`)
    await submitCommand(`get-signin-log ${sam}`)
    await addNote(
      'troubleshooting',
      'Sign-in log showed AADSTS50076 with the registered method on a handset the user no longer has. The mobile on file was out of action, so I confirmed the caller by ringing the desk line on file, then cleared the old authenticator registration so a new method can be enrolled.',
    )
    await addNote(
      'customer',
      'The old phone is no longer required. Sign in again, choose “set up a new method”, and register the authenticator on your new phone. Your password has not changed.',
    )

    const debrief = await resolveAttempt({ code: 'resolved-user-guidance', note: '' })
    expect(debrief.passed).toBe(true)
    expect(debrief.items.find((item) => item.id === 'verify-caller')?.passed).toBe(true)
    expect(debrief.violations).toEqual([])
    expect(debrief.total).toBe(100)
  })

  it('lets the letter PIN open the gate but not stand in for the MFA callback', async () => {
    const generated = generatedFor('M365-01', 'mfa-method-lost')
    const sam = generated.public.requester.samAccountName
    await insertTicket(persistence, generated, 'ticket-mfa-pin')

    const started = await startAttempt('ticket-mfa-pin')
    const pin = started.verification.methods.letterPin.readBack ?? ''
    expect(pin).toMatch(/^\d{3} \d{3}$/)

    // The PIN is a real proof, so the gate opens — but a callback was available
    // and is the check this ticket is scored on.
    const pinned = await verifyCallerWithLetterPin(pin)
    expect(pinned.hasVerifiedCaller).toBe(true)
    expect(pinned.verification.methodAttempt).toMatchObject({
      method: 'letter-pin',
      result: 'verified',
    })
    expect(pinned.procedureViolations.map((violation) => violation.id)).toContain(
      'weaker-verification',
    )
    expect(pinned.procedurePenalty).toBe(8)

    await submitCommand(`get-signin-log ${sam}`)
    await submitCommand(`reset-mfa ${sam}`)
    await submitCommand(`get-signin-log ${sam}`)
    await addNote(
      'troubleshooting',
      'Sign-in log showed AADSTS50076 on a replaced handset. Proved the caller with the PIN from their onboarding letter, then cleared the authenticator registration so a new method can be enrolled.',
    )
    await addNote(
      'customer',
      'Sign in again and choose “set up a new method” to register the authenticator on your new phone.',
    )

    const debrief = await resolveAttempt({ code: 'resolved-user-guidance', note: '' })
    expect(debrief.passed).toBe(false)
    expect(debrief.items.find((item) => item.id === 'verify-caller')?.passed).toBe(false)
    expect(debrief.criticalFailures.join(' ')).toMatch(/rang the caller back/i)
  })

  it('locks the letter PIN after three wrong entries', async () => {
    const generated = generatedFor('PWD-01', 'account-lockout')
    await insertTicket(persistence, generated, 'ticket-pin-lock')

    const started = await startAttempt('ticket-pin-lock')
    const pin = started.verification.methods.letterPin.readBack ?? ''
    expect(started.verification.methods.letterPin.attemptsLeft).toBe(3)
    const wrong = pin === '000 000' ? '111 111' : '000 000'

    const first = await verifyCallerWithLetterPin(wrong)
    expect(first.hasVerifiedCaller).toBe(false)
    expect(first.verification.methods.letterPin.attemptsLeft).toBe(2)
    const second = await verifyCallerWithLetterPin(wrong)
    expect(second.verification.methods.letterPin.attemptsLeft).toBe(1)
    const third = await verifyCallerWithLetterPin(wrong)
    expect(third.hasVerifiedCaller).toBe(false)
    expect(third.verification.methods.letterPin.locked).toBe(true)
    expect(third.verification.methods.letterPin.attemptsLeft).toBe(0)
    expect(third.verification.methodAttempt?.result).toBe('mismatch')
    expect(third.verification.methodAttempt?.message).toMatch(/locked/)

    await expect(verifyCallerWithLetterPin(pin)).rejects.toThrow(/locked/i)

    // The lock is part of the attempt, so it is still there after a reload.
    const reopened = await openSession(third.sessionId)
    expect(reopened.verification.methods.letterPin.locked).toBe(true)
  })

  it('will not take a badge scan or a walk-up from a caller who is not at the desk', async () => {
    const generated = generatedFor('M365-01', 'mfa-method-lost')
    await insertTicket(persistence, generated, 'ticket-remote-desk-proof')
    await startAttempt('ticket-remote-desk-proof')

    // A phone ticket offers neither desk method, so neither can clear the gate.
    const badge = await scanBadge()
    expect(badge.hasVerifiedCaller).toBe(false)
    expect(badge.verification.methodAttempt).toMatchObject({
      method: 'badge-scan',
      result: 'no-badge',
    })

    const walkUp = await recordInPersonVisit()
    expect(walkUp.hasVerifiedCaller).toBe(false)
    expect(walkUp.verification.methodAttempt).toMatchObject({
      method: 'in-person',
      result: 'no-walk-up',
    })
  })

  it('records a failed attempt with evidence of what was missed', async () => {
    const generated = generatedFor('PWD-01', 'account-lockout')
    await insertTicket(persistence, generated, 'ticket-fail')

    const workspace = await startAttempt('ticket-fail')
    const debrief = await resolveAttempt({ code: 'escalated-tier2', note: '' })

    expect(debrief.total).toBeLessThan(75)
    expect(debrief.passed).toBe(false)
    expect(debrief.criticalFailures.length).toBeGreaterThan(0)

    const storedScore = await persistence.scores.findBySession(workspace.sessionId)
    expect(storedScore?.passed).toBe(false)

    const stats = await persistence.progress.get('PWD-01')
    expect(stats?.attempts).toBe(1)
    expect(stats?.passes).toBe(0)
    expect(stats?.leitnerBox).toBe(1)

    const progress = await loadProgress()
    expect(progress.weakTopics[0]?.scenarioId).toBe('PWD-01')
    expect(progress.weakTopics[0]?.recommendation).toMatch(/PWD-01/)
  })
})
