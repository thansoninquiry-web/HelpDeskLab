import { describe, expect, it } from 'vitest'
import { generateTicket } from '../../../src/domain/generator'
import { applyCommand } from '../../../src/domain/environment/reducer'
import { focusedRemoteSession } from '../../../src/domain/environment/remoteDesktop'
import {
  foldWorld,
  worldsMatch,
  type ReplayStep,
} from '../../../src/domain/environment/replay'
import {
  emptyVerificationState,
  issueVerificationCode,
  nextVerificationCode,
  verificationRecipients,
} from '../../../src/domain/environment/verification'
import type { World } from '../../../src/domain/environment/types'

const CODE_SEED = 'ticket-1:7'

function command(command: string, source = 'terminal'): ReplayStep {
  return { kind: 'command', atMs: 0, input: { command, source }, output: {} }
}

/** The live path: each submitted command is applied straight to the world. */
function runLive(initial: World, commands: readonly string[]): World {
  return commands.reduce((world, input) => applyCommand(world, input).world, initial)
}

describe('foldWorld', () => {
  it('rebuilds a command log exactly as the attempt ran it', () => {
    const generated = generateTicket(7, { familyId: 'PWD-01' })
    const sam = generated.public.requester.samAccountName
    const inputs = [`get-account ${sam}`, `unlock-account ${sam}`, `get-account ${sam}`]

    const folded = foldWorld(
      generated.world,
      inputs.map((input) => command(input)),
      { codeSeed: CODE_SEED },
    )

    expect(worldsMatch(folded, runLive(generated.world, inputs))).toBe(true)
  })

  it('runs a desktop terminal command on the machine its session was open on', () => {
    const generated = generateTicket(7, { familyId: 'PWD-01' })
    const host = generated.public.device.hostname
    // Another user machine, since a server is read from the server room instead.
    const other = generated.world.devices.find(
      (device) =>
        device.hostname !== host &&
        device.kind !== 'server' &&
        (device.assignedUserId ?? device.loggedInUserId) !== null,
    )
    if (!other) {
      throw new Error('The fixture world has no second user machine')
    }

    const steps: ReplayStep[] = [
      command(`connect-remote ${other.hostname}`),
      { ...command('ipconfig /all', 'remote-desktop-terminal') },
    ]

    const folded = foldWorld(generated.world, steps, { codeSeed: CODE_SEED })

    const connected = applyCommand(generated.world, `connect-remote ${other.hostname}`).world
    const live = applyCommand(connected, 'ipconfig /all', { deviceId: other.id }).world

    expect(worldsMatch(folded, live)).toBe(true)
    expect(
      folded.remoteSessions.filter(
        (session) => session.machineId === other.id && session.state === 'active',
      ),
    ).toHaveLength(1)

    // The fold agrees on which machine is open, which is how the replay of a
    // desktop command knows where to run it.
    expect(focusedRemoteSession(folded)?.machineId).toBe(other.id)
  })

  it('replays a machine console action in the desk context, not on the machine it names', () => {
    const generated = generateTicket(7, { familyId: 'PWD-01' })
    const step: ReplayStep = {
      kind: 'command',
      atMs: 0,
      input: {
        command: 'connect-remote LT-4472',
        source: 'remote-desktop',
        // The console filed it under the machine whose row ran it, even though
        // the command itself ran from the desk's own machine.
        machine: 'LT-4472',
      },
      output: {},
    }

    const folded = foldWorld(generated.world, [step], { codeSeed: CODE_SEED })
    const live = applyCommand(generated.world, 'connect-remote LT-4472').world

    expect(worldsMatch(folded, live)).toBe(true)
    expect(focusedRemoteSession(folded)?.machineId).toBe('lt-4472')
  })

  it('draws the code a send issued, from the same counter the attempt used', () => {
    const generated = generateTicket(7, { familyId: 'PWD-01' })
    const recipient = verificationRecipients({
      name: generated.public.requester.name,
      employeeId: generated.public.requester.employeeId,
      managerName: generated.world.users[0]?.managerName ?? null,
      mobileInService: true,
    })[0]
    if (!recipient) {
      throw new Error('The fixture ticket has no contact to reach')
    }

    const now = generated.world.clock + 60_000
    const live = {
      ...generated.world,
      verification: issueVerificationCode(emptyVerificationState(), {
        code: nextVerificationCode(CODE_SEED, 0),
        recipient,
        now,
      }),
    }

    const folded = foldWorld(
      generated.world,
      [
        {
          kind: 'code-sent',
          atMs: now,
          input: {
            method: 'verification-code',
            recipientId: recipient.id,
            recipientName: recipient.name,
            destination: recipient.destination,
          },
          output: { sent: true },
        },
      ],
      { codeSeed: CODE_SEED },
    )

    expect(worldsMatch(folded, live)).toBe(true)
    expect(folded.verification?.issued).toBe(1)
  })

  it('folds a recorded refusal into the world, so the log still means it', () => {
    const generated = generateTicket(7, { familyId: 'PWD-01' })
    const steps: ReplayStep[] = [
      {
        kind: 'deny-caller',
        atMs: 0,
        input: { reason: 'third-party-request', label: 'Asked for someone else’s account' },
        output: { denied: true },
      },
    ]

    const folded = foldWorld(generated.world, steps, { codeSeed: CODE_SEED })

    expect(folded.refusal).toMatchObject({
      reason: 'third-party-request',
      label: 'Asked for someone else’s account',
    })
    // The world it was handed had no refusal in it, and still has none.
    expect(generated.world.refusal).toBeUndefined()
    // A log held without the denial folds back to a world without the refusal,
    // which is what makes un-running the denial lift the block.
    expect(foldWorld(generated.world, [], { codeSeed: CODE_SEED }).refusal).toBeUndefined()
  })

  it('leaves the world alone for steps that only record what happened', () => {
    const generated = generateTicket(7, { familyId: 'PWD-01' })
    const steps: ReplayStep[] = [
      { kind: 'ask-user', atMs: 0, input: { intent: 'when-start' }, output: { answer: 'Today.' } },
      { kind: 'note', atMs: 0, input: { noteKind: 'troubleshooting', text: 'Checked.' }, output: {} },
      { kind: 'hint', atMs: 0, input: { itemId: 'x', hint: 'read the status' }, output: {} },
      { kind: 'verify-caller', atMs: 0, input: { method: 'verification-code' }, output: {} },
      { kind: 'rewind', atMs: 0, input: { dropped: 2 }, output: {} },
    ]

    expect(worldsMatch(foldWorld(generated.world, steps, { codeSeed: CODE_SEED }), generated.world)).toBe(
      true,
    )
  })

  it('does not change the world it was given', () => {
    const generated = generateTicket(7, { familyId: 'PWD-01' })
    const before = JSON.stringify(generated.world)

    foldWorld(generated.world, [command('help')], { codeSeed: CODE_SEED })

    expect(JSON.stringify(generated.world)).toBe(before)
  })
})

describe('worldsMatch', () => {
  it('compares values, not the order their keys were written in', () => {
    expect(worldsMatch({ a: 1, b: [1, 2] }, { b: [1, 2], a: 1 })).toBe(true)
  })

  it('sees a difference anywhere in the world', () => {
    expect(worldsMatch({ a: { b: 1 } }, { a: { b: 2 } })).toBe(false)
    expect(worldsMatch({ a: [1, 2] }, { a: [1, 2, 3] })).toBe(false)
    expect(worldsMatch({ a: 1 }, { a: 1, b: null })).toBe(false)
    expect(worldsMatch(null, {})).toBe(false)
  })
})
