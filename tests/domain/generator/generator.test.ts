import { describe, expect, it } from 'vitest'
import { applyCommand } from '../../../src/domain/environment/reducer'
import type { World } from '../../../src/domain/environment/types'
import { generateTicket, listVariants, SCENARIO_FAMILIES } from '../../../src/domain/generator'
import type { GeneratedTicket, ReferenceStep } from '../../../src/domain/generator'
import { evaluateSession } from '../../../src/domain/scoring/evaluator'
import type { EvaluatorAction } from '../../../src/domain/scoring/evaluator'
import type { JsonObject } from '../../../src/domain/shared/json'

function ticketFor(scenarioId: string, variantId: string): GeneratedTicket {
  for (let seed = 1; seed < 600; seed += 1) {
    const ticket = generateTicket(seed, { familyId: scenarioId })
    if (ticket.variantId === variantId) {
      return ticket
    }
  }
  throw new Error(`No seed produced ${scenarioId}/${variantId}`)
}

/**
 * Replays an explicit step list, so a test can score a path the reference does
 * not take — an attempt that acted before it looked, or one that obeyed a
 * caller instead of the evidence.
 */
function runSteps(
  ticket: GeneratedTicket,
  steps: readonly ReferenceStep[],
): {
  actions: EvaluatorAction[]
  world: World
} {
  let world = structuredClone(ticket.world)
  const actions: EvaluatorAction[] = []

  for (const step of steps) {
    if (step.type === 'command') {
      const result = applyCommand(world, step.input)
      world = result.world
      actions.push({
        kind: 'command',
        input: { command: step.input },
        output: JSON.parse(
          JSON.stringify({ lines: result.lines, effects: result.effects, ok: result.ok }),
        ) as JsonObject,
      })
    } else if (step.type === 'verify-caller') {
      actions.push({
        kind: 'verify-caller',
        // A reference step names the method when the proof has to be a callback.
        input: { method: step.method ?? 'verification-code' },
        output: { summary: 'Verified the caller.' },
      })
    } else if (step.type === 'deny-caller') {
      actions.push({
        kind: 'deny-caller',
        input: { reason: 'third-party-request' },
        output: { denied: true, summary: 'Refused the request.' },
      })
    } else if (step.type === 'ask-user') {
      actions.push({
        kind: 'ask-user',
        input: { intent: step.intent },
        output: { question: 'Question', answer: 'Answer' },
      })
    } else {
      actions.push({
        kind: 'note',
        input: { noteKind: step.noteKind, text: step.text },
        output: { saved: true },
      })
    }
  }

  return { actions, world }
}

function evaluateReference(ticket: GeneratedTicket) {
  return evaluateSteps(ticket, ticket.reference)
}

function evaluateSteps(ticket: GeneratedTicket, steps: readonly ReferenceStep[]) {
  const { actions, world } = runSteps(ticket, steps)
  return evaluateSession({
    rubric: ticket.rubric,
    actions,
    world,
    difficulty: ticket.difficulty,
    decision: {
      outcome: ticket.expectedOutcome,
      code: ticket.expectedCodes[0] ?? 'resolved-remote',
      note: '',
    },
  })
}

describe('ticket generator', () => {
  it('reproduces the exact same ticket for the same seed and family', () => {
    const first = generateTicket(20261016, { familyId: 'NET-01' })
    const second = generateTicket(20261016, { familyId: 'NET-01' })

    expect(second.signature).toBe(first.signature)
    expect(second.public).toEqual(first.public)
    expect(second.world).toEqual(first.world)
    expect(second.rubric).toEqual(first.rubric)
  })

  it('replays an existing ticket from its stored scenario and seed', () => {
    const original = generateTicket(777, {})
    const replay = generateTicket(original.seed, { familyId: original.scenarioId })

    expect(replay.signature).toBe(original.signature)
    expect(replay.variantId).toBe(original.variantId)
    expect(replay.public.subject).toBe(original.public.subject)
  })

  it('pins the variant a stored ticket names without moving the rest of the draw', () => {
    const drawn = generateTicket(4242, { familyId: 'PWD-01' })
    const pinned = generateTicket(4242, { familyId: 'PWD-01', variantId: 'pressured-lockout' })

    expect(pinned.variantId).toBe('pressured-lockout')
    // Pinning selects a variant; it does not re-roll the estate underneath it.
    expect(pinned.world.currentDeviceId).toBe(drawn.world.currentDeviceId)
    expect(pinned.public.requester).toEqual(drawn.public.requester)
    expect(pinned.public.device).toEqual(drawn.public.device)
    expect(pinned.public.createdAt).toBe(drawn.public.createdAt)
  })

  it('refuses a variant the family does not own', () => {
    expect(() =>
      generateTicket(1, { familyId: 'NET-01', variantId: 'pressured-lockout' }),
    ).toThrow(/Unknown scenario variant: NET-01\/pressured-lockout/)
  })

  it('produces unique signatures when asked to avoid earlier ones', () => {
    const signatures: string[] = []
    let seed = 9000

    for (let index = 0; index < 25; index += 1) {
      const ticket = generateTicket(seed, { avoidSignatures: signatures })
      signatures.push(ticket.signature)
      seed += 101
    }

    expect(new Set(signatures).size).toBe(signatures.length)
  })

  it('binds each ticket to a device, a requester, and public metadata', () => {
    const ticket = generateTicket(4242, { familyId: 'PRN-01' })
    const world = ticket.world
    const device = world.devices.find((entry) => entry.id === world.currentDeviceId)

    expect(device).toBeDefined()
    expect(ticket.public.requester.name.length).toBeGreaterThan(0)
    expect(ticket.public.device.hostname).toBe(device?.hostname)
    expect(ticket.public.scenarioTitle).toBe('Printing and the spooler')
    expect(['critical', 'high', 'medium', 'low']).toContain(ticket.public.severity)
    expect(ticket.public.subject).not.toMatch(/\{\w+\}/)
    expect(ticket.public.body).not.toMatch(/\{\w+\}/)
  })

  it('renders every variant without leaving a slot unfilled', () => {
    for (const family of SCENARIO_FAMILIES) {
      for (const variant of listVariants(family.id)) {
        const ticket = ticketFor(family.id, variant.id)
        const text = `${ticket.public.subject}\n${ticket.public.body}`

        expect(text, `${family.id}/${variant.id}`).not.toMatch(/\{\w+\}/)
      }
    }
  })

  it('scores 100 on the reference path for every variant', () => {
    for (const family of SCENARIO_FAMILIES) {
      for (const variant of listVariants(family.id)) {
        const ticket = ticketFor(family.id, variant.id)
        const result = evaluateReference(ticket)

        expect(result.total, `${family.id}/${variant.id}`).toBe(100)
        expect(result.passed, `${family.id}/${variant.id}`).toBe(true)
        expect(result.band).toBe('strong')
        expect(result.criticalFailures).toEqual([])
      }
    }
  })

  it('pressures the learner on the urgent call without skipping the guard rails', () => {
    const ticket = ticketFor('PWD-01', 'pressured-lockout')

    // The request itself is the pressure: it names the fix, demands it now, and
    // refuses the questions that would establish the fault.
    expect(ticket.public.severity).toBe('critical')
    const request = `${ticket.public.subject} ${ticket.public.body}`
    expect(request).toMatch(/urgent|immediately|ten minutes|in a minute/i)
    expect(request).toMatch(/troubleshooting|questions/i)
    expect(request).toMatch(/unlock it|unlock the account|reset the password/i)
    expect(ticket.public.reportedSymptoms.join(' ')).toMatch(/refused/i)

    // Both guard rails are critical, so acting first cannot pass on a good result.
    const critical = ticket.rubric.items.filter((item) => item.critical).map((item) => item.id)
    expect(critical).toContain('diagnose-first')
    expect(critical).toContain('verify-caller')
  })

  it('prices a callback as its own proof and only after it is placed', () => {
    const ticket = ticketFor('PWD-01', 'callback-verification')

    // The phone that would take a code cannot reach the employee, so the desk
    // has a second line on file and the reference uses it.
    expect(ticket.world.mobileOutOfAction).toBe(true)
    expect(ticket.reference).toContainEqual({ type: 'verify-caller', method: 'callback' })
    expect(evaluateReference(ticket).total).toBe(100)

    const unlock = ticket.reference.find(
      (step) => step.type === 'command' && step.input.startsWith('unlock-account'),
    )
    if (!unlock) {
      throw new Error('The reference path does not unlock the account')
    }

    // A code read back instead of a call is not the proof this ticket needs.
    const byCode = evaluateSteps(
      ticket,
      ticket.reference.map((step) =>
        step.type === 'verify-caller'
          ? { type: 'verify-caller' as const, method: 'verification-code' as const }
          : step,
      ),
    )
    expect(byCode.items.find((item) => item.id === 'verify-by-callback')?.passed).toBe(false)
    expect(byCode.criticalFailures.join(' ')).toMatch(
      /No record that you rang the caller back on a number on file/,
    )
    expect(byCode.total).toBeLessThan(100)

    // And an unlock placed before the call is a scored unverified change.
    const actedFirst = evaluateSteps(ticket, [
      unlock,
      ...ticket.reference.filter((step) => step !== unlock),
    ])
    expect(actedFirst.items.find((item) => item.id === 'unlock')?.passed).toBe(false)
    expect(actedFirst.violations.map((violation) => violation.id)).toContain('unverified-change')
  })

  it('carries each caller pressure script with the variant that declares it', () => {
    // The urgent account caller's script moved out of the service and onto the
    // variant, trigger rule included.
    const pressured = ticketFor('PWD-01', 'pressured-lockout')
    expect(pressured.pressure?.map((line) => line.id)).toEqual([
      'pressured-reset',
      'pressured-unverified-change',
      'pressured-blind-change',
      'pressured-ignored-warning',
      'pressured-hands-over',
      'pressured-waiting',
      'pressured-hurry',
      'pressured-escalates',
    ])
    expect(pressured.pressure?.[0]?.trigger).toEqual({
      kind: 'obeyed',
      command: 'reset-password',
    })

    // A second pressured ticket, on a different family and fault: the angry
    // printer caller shares the spooler rubric but brings their own lines.
    const angry = ticketFor('PRN-01', 'angry-caller')
    expect(angry.pressure?.map((line) => line.id)).toContain('angry-blind-restart')
    expect(angry.pressure?.some((line) => line.trigger.kind === 'acted-first')).toBe(true)
    expect(evaluateReference(angry).total).toBe(100)

    // A ticket whose caller does not press carries no script at all.
    const quiet = ticketFor('PRN-01', 'spooler-stopped')
    expect(quiet.pressure).toBeUndefined()
  })

  it('proves an MFA reset by callback when the replaced handset cannot take a code', () => {
    const ticket = ticketFor('M365-01', 'mfa-method-lost')

    // The handset that would take a code is gone with the old phone, so the desk
    // line is the only contact that reaches the employee, and the reference rings it.
    expect(ticket.world.mobileOutOfAction).toBe(true)
    expect(ticket.reference).toContainEqual({ type: 'verify-caller', method: 'callback' })
    expect(evaluateReference(ticket).total).toBe(100)

    const reset = ticket.reference.find(
      (step) => step.type === 'command' && step.input.startsWith('reset-mfa'),
    )
    if (!reset) {
      throw new Error('The reference path does not reset MFA')
    }

    // A code is not the proof this ticket needs, even if the desk sends one.
    const byCode = evaluateSteps(
      ticket,
      ticket.reference.map((step) =>
        step.type === 'verify-caller'
          ? { type: 'verify-caller' as const, method: 'verification-code' as const }
          : step,
      ),
    )
    expect(byCode.items.find((item) => item.id === 'verify-caller')?.passed).toBe(false)
    expect(byCode.criticalFailures.join(' ')).toMatch(/rang the caller back/i)
    expect(byCode.total).toBeLessThan(100)

    // And a reset placed before the call is a scored unverified change.
    const actedFirst = evaluateSteps(ticket, [
      reset,
      ...ticket.reference.filter((step) => step !== reset),
    ])
    expect(actedFirst.items.find((item) => item.id === 'reset-mfa')?.passed).toBe(false)
    expect(actedFirst.violations.map((violation) => violation.id)).toContain('unverified-change')
  })

  it('puts the live code with the employee an impersonator can never read', () => {
    const ticket = ticketFor('PWD-01', 'impersonated-caller')

    // The caller is not the employee the ticket is about, and the account the
    // caller described is not in the state they claim.
    expect(ticket.world.callerImpersonating).toBe(true)
    const account = ticket.world.users.find(
      (user) => user.samAccountName === ticket.public.requester.samAccountName,
    )
    expect(account?.status).toBe('active')
    expect(account?.passwordExpired).toBe(false)

    // The ticket records the caller's story, so the gate can check it against
    // the record instead of trusting the ticket's symptoms.
    expect(ticket.world.callerClaims?.map((claim) => claim.id)).toEqual([
      'claimed-lockout',
      'claimed-owner',
    ])
    expect(ticket.world.callerClaims?.every(
      (claim) => claim.account === ticket.public.requester.samAccountName,
    )).toBe(true)
    expect(ticket.world.callerClaims?.[0]?.expects).toEqual({ status: 'locked' })
    expect(ticket.world.callerClaims?.[1]?.identity).toBe(true)

    // The request asks for the two account changes an impersonator wants.
    const request = `${ticket.public.subject} ${ticket.public.body}`
    expect(request).toMatch(/unlock/i)
    expect(request).toMatch(/reset|new password/i)
    expect(ticket.expectedCodes).toEqual(['denied-social-engineering'])

    // Refusing is the pass, and a reset is priced as the trap it is.
    const critical = ticket.rubric.items.filter((item) => item.critical).map((item) => item.id)
    expect(critical).toContain('deny-request')
    expect(critical).toContain('no-reset')
    expect(evaluateReference(ticket).total).toBe(100)
  })

  it('puts the relay in chat on a mailbox that is already leaking mail', () => {
    const ticket = ticketFor('PWD-01', 'chat-relay-reset')
    const relay = ticket.public.requester.samAccountName

    // The account asking is a helpdesk colleague, and it still receives the
    // code the ticket gate sends, so whoever is in chat has to be able to read
    // it back to be that colleague.
    expect(ticket.world.callerImpersonating).toBe(true)
    const account = ticket.world.users.find((user) => user.samAccountName === relay)
    expect(account?.status).toBe('active')

    // The mailbox is the half of the story the chat cannot show: the account
    // doing the asking is copying its own mail outside the organisation.
    const mailbox = ticket.world.mail.mailboxes.find((entry) => entry.userId === account?.id)
    expect(mailbox?.forwarding).toBe('it-desk-backup@larkspur-help.example')

    // The request names someone else's account, and that account is healthy, so
    // the relayed lockout claim can be settled by a lookup.
    const claims = ticket.world.callerClaims ?? []
    expect(claims.map((claim) => claim.id)).toEqual(['claimed-target-locked', 'claimed-colleague'])
    const target = claims[0]?.account ?? ''
    expect(target).not.toBe(relay)
    expect(claims[0]?.expects).toEqual({ status: 'locked' })
    expect(claims[1]?.identity).toBe(true)
    const targetUser = ticket.world.users.find((user) => user.samAccountName === target)
    expect(targetUser?.status).toBe('active')
    expect(targetUser?.passwordExpired).toBe(false)

    // The reset is the trap, and reading the asking account is what the
    // scenario pays for beyond the refusal itself.
    const items = new Map(ticket.rubric.items.map((item) => [item.id, item]))
    expect(items.get('read-requester-mailbox')?.checks).toEqual([
      { kind: 'ran', command: 'get-mailbox', argsInclude: relay },
    ])
    expect(items.get('no-reset')?.critical).toBe(true)
    expect(evaluateReference(ticket).total).toBe(100)
  })

  it('records the account a third-party caller claims is locked out', () => {
    const ticket = ticketFor('PWD-01', 'third-party-reset')
    const claim = ticket.world.callerClaims?.[0]

    expect(claim?.id).toBe('claimed-target-locked')
    expect(claim?.identity).toBeUndefined()
    expect(claim?.expects).toEqual({ status: 'locked' })
    // The claim names the account the request is about, not the caller's own.
    expect(claim?.account).not.toBe(ticket.public.requester.samAccountName)
    expect(ticket.world.users.some((user) => user.samAccountName === claim?.account)).toBe(true)
  })

  it('fails a pressured attempt that fixes the account before looking at it', () => {
    const ticket = ticketFor('PWD-01', 'pressured-lockout')
    // The unlock happens straight after verification, before the account is
    // looked at, exactly as the caller asked for it.
    const unlock = ticket.reference.filter(
      (step) => step.type === 'command' && step.input.startsWith('unlock-account'),
    )
    const rest = ticket.reference.filter((step) => !unlock.includes(step))
    const [first, ...remaining] = rest
    if (!first || unlock.length === 0) {
      throw new Error('The reference path does not verify the caller and then unlock')
    }
    const steps = [first, ...unlock, ...remaining]

    const result = evaluateSteps(ticket, steps)

    expect(result.passed).toBe(false)
    expect(result.criticalFailures.join(' ')).toMatch(
      /No record that you ran get-account .* and then unlocked/,
    )
    expect(result.items.find((item) => item.id === 'diagnose-first')?.passed).toBe(false)
    // The unlock itself still happened, so the account is not left broken.
    expect(result.items.find((item) => item.id === 'unlock')?.passed).toBe(true)
  })

  it('fails a pressured attempt that resets the password it was asked for', () => {
    const ticket = ticketFor('PWD-01', 'pressured-lockout')
    const steps = ticket.reference.map((step) =>
      step.type === 'command' && step.input.startsWith('unlock-account')
        ? { type: 'command' as const, input: step.input.replace('unlock-account', 'reset-password') }
        : step,
    )

    const result = evaluateSteps(ticket, steps)

    expect(result.passed).toBe(false)
    expect(result.items.find((item) => item.id === 'no-reset')?.passed).toBe(false)
    // The account is still locked: the demanded action was never the fix.
    expect(result.items.find((item) => item.id === 'unlock')?.passed).toBe(false)
    expect(result.criticalFailures.join(' ')).toMatch(/No record that you unlocked .* account/)
    expect(result.feedback.join(' ')).toMatch(/cannot pass yet/i)
  })

  it('makes the injected fault discoverable with the simulated tools', () => {
    for (const family of SCENARIO_FAMILIES) {
      for (let seed = 1; seed <= 18; seed += 1) {
        const ticket = generateTicket(seed, { familyId: family.id })
        const world = structuredClone(ticket.world)
        const toolPrefixes: Record<string, string> = {
          'DHCP-01': 'get-dhcp-scope',
          'M365-01': 'get-signin-log',
          'FS-01': 'get-share-access',
          'MAIL-01': 'get-mailbox',
          'MAILSEC-01': 'trace-message',
          'RDP-01': 'get-remote-machine',
          'DEP-01': 'get-deployment',
        }
        // A variant whose fault is on the message rather than the mailbox needs
        // the trace, even though the family’s first read is the mailbox.
        const variantPrefixes: Record<string, string> = {
          'delivered-not-missing': 'trace-message',
        }
        const prefix = variantPrefixes[ticket.variantId] ?? toolPrefixes[family.id]
        const toolStep = prefix
          ? ticket.reference.find(
              (step) => step.type === 'command' && step.input.startsWith(prefix),
            )
          : undefined
        const familyCommand = toolStep?.type === 'command' ? toolStep.input : null
        const command =
          familyCommand ??
          (family.category === 'identity'
            ? `get-account ${ticket.public.requester.samAccountName}`
            : family.category === 'network'
              ? 'ipconfig /all'
              : 'get-printers')
        const result = applyCommand(world, command)
        const output = result.lines.map((line) => line.text).join('\n')

        expect(result.ok, `${ticket.variantId}: ${command}`).toBe(true)
        if (ticket.variantId === 'bad-static-dns') {
          expect(output).toContain('10.20.4.53')
        } else if (ticket.variantId === 'stale-dhcp-lease') {
          expect(output).toContain('169.254')
        } else if (
          ticket.variantId === 'spooler-stopped' ||
          ticket.variantId === 'angry-caller'
        ) {
          expect(output.toLowerCase()).toContain('stopped')
        } else if (ticket.variantId === 'job-stuck-offline') {
          expect(output.toLowerCase()).toContain('offline')
        } else if (ticket.variantId === 'account-lockout') {
          expect(output).toContain('locked')
        } else if (ticket.variantId === 'expired-password') {
          expect(output).toContain('passwordExpired : True')
        } else if (ticket.variantId === 'disabled-account') {
          expect(output).toContain('disabled')
        } else if (ticket.variantId === 'scope-wrong-dns') {
          expect(output).toContain('10.20.4.99')
        } else if (ticket.variantId === 'scope-exhausted') {
          expect(output).toContain('no free addresses')
        } else if (ticket.variantId === 'mfa-method-lost') {
          expect(output).toContain('AADSTS50076')
        } else if (ticket.variantId === 'smart-lockout') {
          expect(output).toContain('AADSTS50053')
        } else if (ticket.variantId === 'missing-group-membership') {
          expect(output).toContain('Effective   : Read')
        } else if (ticket.variantId === 'explicit-deny') {
          expect(output).toContain('Effective   : Denied')
        } else if (ticket.variantId === 'forwarding-to-personal') {
          expect(output).toMatch(/Forwarding\s+: \S+@example\.net/)
        } else if (ticket.variantId === 'delivered-not-missing') {
          expect(output).toContain('msg-3101')
          expect(output).toContain('Delivered')
        } else if (ticket.variantId === 'phishing-release-request') {
          expect(output).toContain('impersonating the finance team')
          expect(output).toContain('quarantined')
        } else if (ticket.variantId === 'supplier-note-held') {
          expect(output).toContain('.htm')
          expect(output).toContain('quarantined')
        } else if (ticket.variantId === 'handover-disk-updates') {
          expect(output).toContain('Disk free       : 6%')
          expect(output).toContain('Pending restart : False')
        } else if (ticket.variantId === 'handover-previous-user') {
          expect(output).toMatch(/Signed in\s+: (?!Nobody)/)
        } else if (ticket.variantId === 'imaging-run-failed') {
          expect(output).toContain('Failed applying the driver pack')
          expect(output).toContain('needs-image')
        } else if (ticket.variantId === 'damage-hold-blocks-handover') {
          expect(output).toContain('quarantined')
          expect(output).toContain('Cracked lid')
        }
      }
    }
  })
})
