import { commandAccess } from '../environment/commands'
import { HELD_SHELF_VARIANT } from '../generator/families/deployment'
import type { ScoreHistoryEntry } from '../progress/types'
import type { RubricCategory } from '../scoring/types'
import type { JsonObject } from '../shared/json'
import type { JobTarget } from '../targets/types'
import { extractListing } from '../targets/extract'
import type { Session, SessionAction } from '../tickets/types'
import { emptyEvidence, type ModuleEvidence } from './modules'

const ACCOUNT_FAMILIES = new Set(['PWD-01', 'M365-01'])
const NETWORK_FAMILIES = new Set(['NET-01', 'DHCP-01'])
const MAIL_FAMILIES = new Set(['MAIL-01'])
const MAIL_SECURITY_FAMILIES = new Set(['MAILSEC-01'])
const DEPLOYMENT_FAMILIES = new Set(['DEP-01'])
/** Reads that answer a mail question without changing the tenant. */
const MAILBOX_READ = 'get-mailbox'
const MESSAGE_TRACE = 'trace-message'
/** The shelf register, read as a queue and as one machine's record. */
const DEPLOYMENT_QUEUE_READ = 'get-deployment-queue'
const DEPLOYMENT_READ = 'get-deployment'
/** The effect a sequence reports when it really finished. */
const DEPLOYMENT_COMPLETED_EFFECT = 'deployment_completed'
/** The shelf bay, and one machine's record read from it. */
const SHELF_READ = 'get-shelf'
/** The shipping board, read as a whole or one movement at a time. */
const SHIPMENT_BOARD_READ = 'get-shipments'
const SHIPMENT_READ = 'get-shipment'
/** The effects the shelf and the shipping desk report when the work really happened. */
const MACHINE_ISSUED_EFFECT = 'machine_issued'
const SHELF_HELD_EFFECT = 'shelf_held'
const SHIPMENT_DISPATCHED_EFFECT = 'shipment_dispatched'
const SHIPMENT_DELIVERED_EFFECT = 'shipment_delivered'
const SHIPMENT_REBOOKED_EFFECT = 'shipment_rebooked'
/** Shorter notes are greetings, not records. Matches the note editor's floor. */
const MIN_NOTE_LENGTH = 10
const HANDED_OFF = /^(escalated|denied)/
/**
 * Session plumbing: opening or closing a session changes the session record,
 * not the machine, so it is neither a read of the machine nor a change to it.
 * The registry labels those two as changes because that is what they are; this
 * set is what keeps them out of the machine's read-before-change order.
 */
const SESSION_COMMANDS = new Set([
  'connect-remote',
  'end-remote-session',
  'get-sessions',
  // Choosing which open desktop to look at reads no machine.
  'use-remote-session',
])
const SESSION_OPENER = 'connect-remote'
/** The effect `connect-remote` reports when it opens a session. */
const REMOTE_OPENED_EFFECT = 'remote_connected'

function commandLine(action: SessionAction): string {
  const command = action.input.command
  return typeof command === 'string' ? command.trim() : ''
}

function commandName(action: SessionAction): string {
  return commandLine(action).split(/\s+/)[0]?.toLowerCase() ?? ''
}

/**
 * The machine the console itself runs on, read from the world the attempt saved.
 * Without it there is nothing to compare a command's machine against, so a
 * session with no readable world takes no part in the remote-work count.
 */
function ownHostname(session: Session | undefined): string | null {
  const world = session?.world
  if (typeof world !== 'object' || world === null || Array.isArray(world)) {
    return null
  }
  const currentDeviceId = world.currentDeviceId
  const devices = world.devices
  if (typeof currentDeviceId !== 'string' || !Array.isArray(devices)) {
    return null
  }
  for (const device of devices) {
    if (
      typeof device === 'object' &&
      device !== null &&
      !Array.isArray(device) &&
      device.id === currentDeviceId &&
      typeof device.hostname === 'string'
    ) {
      return device.hostname
    }
  }
  return null
}

/**
 * Remote work is decided by the machine a command acted on, not by the surface
 * it was typed in. Anything filed under a machine other than the one the
 * console is running on was work on a user's machine, whether the tag came from
 * the desktop terminal or a machine console action; the source is not read. A
 * command with no machine tag — a console action that acted on no single
 * machine, or a log written before the tag existed — is not counted: the log
 * does not say where it ran, so the curriculum does not guess.
 */
function isRemoteWork(action: SessionAction, own: string | null): boolean {
  if (action.kind !== 'command' || own === null) {
    return false
  }
  const machine = action.input.machine
  return typeof machine === 'string' && machine.length > 0 && machine !== own
}

/** The effects a command reported, in the plain shape the action log stores. */
function effectsOf(action: SessionAction): JsonObject[] {
  const effects = action.output.effects
  if (!Array.isArray(effects)) {
    return []
  }

  const records: JsonObject[] = []
  for (const effect of effects) {
    if (typeof effect === 'object' && effect !== null && !Array.isArray(effect)) {
      records.push(effect)
    }
  }
  return records
}

/**
 * Opening or closing a session is plumbing: it is neither reading the machine
 * nor changing it, so it must not be mistaken for either.
 */
function isSessionPlumbing(action: SessionAction): boolean {
  return SESSION_COMMANDS.has(commandName(action))
}

/**
 * A connect that really opened a session says so with a `remote_connected`
 * effect. Connecting to a machine someone else is already on only reports that
 * the session is busy, which is not a session the learner opened.
 */
function openedSession(action: SessionAction): boolean {
  if (action.output.ok !== true || commandName(action) !== SESSION_OPENER) {
    return false
  }
  return effectsOf(action).some((effect) => effect.type === REMOTE_OPENED_EFFECT)
}

/** A note the learner actually wrote: one of the three kinds, long enough to count. */
function recordedNote(
  action: SessionAction,
): 'troubleshooting' | 'customer' | 'resolution' | null {
  if (action.kind !== 'note') {
    return null
  }
  const noteKind = action.input.noteKind
  if (noteKind !== 'troubleshooting' && noteKind !== 'customer' && noteKind !== 'resolution') {
    return null
  }
  const text = typeof action.input.text === 'string' ? action.input.text.trim() : ''
  return text.length >= MIN_NOTE_LENGTH ? noteKind : null
}

function countsFor(
  history: readonly ScoreHistoryEntry[],
  families: ReadonlySet<string>,
): { passes: number; diagnosis: number; safety: number } {
  let passes = 0
  let diagnosis = 0
  let safety = 0

  for (const entry of history) {
    if (!families.has(entry.scenarioId)) {
      continue
    }
    if (entry.passed) {
      passes += 1
    }
    if (isPerfect(entry, 'diagnosis')) {
      diagnosis += 1
    }
    if (isPerfect(entry, 'safety')) {
      safety += 1
    }
  }

  return { passes, diagnosis, safety }
}

function isPerfect(entry: ScoreHistoryEntry, category: RubricCategory): boolean {
  const score = entry.categoryScores?.[category]
  return score !== undefined && score.possible > 0 && score.earned >= score.possible
}

function groupBySession(actions: readonly SessionAction[]): Map<string, SessionAction[]> {
  const grouped = new Map<string, SessionAction[]>()
  for (const action of actions) {
    const list = grouped.get(action.sessionId) ?? []
    list.push(action)
    grouped.set(action.sessionId, list)
  }
  for (const list of grouped.values()) {
    list.sort((left, right) => left.seq - right.seq)
  }
  return grouped
}

/**
 * Turns stored history into the counters the curriculum reads. Pure so the
 * rules can be tested without a database: everything the modules claim is
 * measured from records the app already keeps, never from a second ledger.
 */
export function evidenceFrom(input: {
  history: readonly ScoreHistoryEntry[]
  sessions: readonly Session[]
  actions: readonly SessionAction[]
  listings: readonly JobTarget[]
}): ModuleEvidence {
  const evidence = emptyEvidence()
  const { history, sessions, actions, listings } = input

  evidence.scoredAttempts = history.length
  evidence.passedAttempts = history.filter((entry) => entry.passed).length
  evidence.familiesPlayed = new Set(history.map((entry) => entry.scenarioId)).size
  evidence.familiesPassed = new Set(
    history.filter((entry) => entry.passed).map((entry) => entry.scenarioId),
  ).size
  evidence.perfectSafety = history.filter((entry) => isPerfect(entry, 'safety')).length
  evidence.perfectDiagnosis = history.filter((entry) => isPerfect(entry, 'diagnosis')).length
  evidence.perfectDocumentation = history.filter((entry) =>
    isPerfect(entry, 'documentation'),
  ).length

  const accounts = countsFor(history, ACCOUNT_FAMILIES)
  evidence.passwordPasses = accounts.passes
  evidence.accountPerfectDiagnosis = accounts.diagnosis
  evidence.accountPerfectSafety = accounts.safety

  const network = countsFor(history, NETWORK_FAMILIES)
  evidence.networkAddressPasses = network.passes
  evidence.networkPerfectDiagnosis = network.diagnosis

  evidence.mailboxPasses = countsFor(history, MAIL_FAMILIES).passes
  evidence.mailSecurityPasses = countsFor(history, MAIL_SECURITY_FAMILIES).passes

  const deployment = countsFor(history, DEPLOYMENT_FAMILIES)
  evidence.deploymentPasses = deployment.passes
  // A pass only counts for the hold when it is the variant that put the machine
  // on hold: finishing a failed run is a different decision from leaving a
  // quarantined machine alone.
  evidence.deploymentHoldPasses = history.filter(
    (entry) =>
      entry.scenarioId === 'DEP-01' &&
      entry.variantId === HELD_SHELF_VARIANT &&
      entry.passed,
  ).length

  const intents = new Set<string>()
  for (const action of actions) {
    if (action.kind === 'note') {
      const noteKind = recordedNote(action)
      if (noteKind === 'troubleshooting') {
        evidence.troubleshootingNotes += 1
      } else if (noteKind === 'customer') {
        evidence.customerNotes += 1
      } else if (noteKind === 'resolution') {
        evidence.resolutionNotes += 1
      }
      continue
    }

    if (action.kind === 'command') {
      // The command that opens a session, whichever surface it was pressed on.
      if (openedSession(action)) {
        evidence.remoteSessionsOpened += 1
      }

      // Console work is judged by the reads it made and the changes it
      // reported: a trace that failed is not a message read, a block that only
      // said the sender was already blocked reports no effect and is not a
      // block, and a run the shelf refused never finished a sequence.
      if (action.output.ok === true) {
        const command = commandName(action)
        if (command === MAILBOX_READ) {
          evidence.mailboxReads += 1
        } else if (command === MESSAGE_TRACE) {
          evidence.mailMessageTraces += 1
        } else if (command === DEPLOYMENT_QUEUE_READ) {
          evidence.deploymentQueueReads += 1
        } else if (command === DEPLOYMENT_READ) {
          evidence.deploymentReads += 1
        } else if (command === SHELF_READ) {
          evidence.shelfReads += 1
        } else if (command === SHIPMENT_BOARD_READ || command === SHIPMENT_READ) {
          evidence.shipmentReads += 1
        }
        for (const effect of effectsOf(action)) {
          if (effect.type === 'mail_released') {
            evidence.quarantineReleases += 1
          } else if (effect.type === 'sender_blocked') {
            evidence.sendersBlocked += 1
          } else if (effect.type === DEPLOYMENT_COMPLETED_EFFECT) {
            evidence.deploymentRuns += 1
          } else if (effect.type === MACHINE_ISSUED_EFFECT) {
            evidence.machinesIssued += 1
          } else if (effect.type === SHELF_HELD_EFFECT) {
            evidence.shelfHolds += 1
          } else if (effect.type === SHIPMENT_DISPATCHED_EFFECT) {
            evidence.shipmentsDispatched += 1
          } else if (effect.type === SHIPMENT_DELIVERED_EFFECT) {
            evidence.shipmentsDelivered += 1
          } else if (effect.type === SHIPMENT_REBOOKED_EFFECT) {
            evidence.shipmentsRebooked += 1
          }
        }
      }
      continue
    }

    if (action.kind === 'ask-user') {
      evidence.callerQuestions += 1
      const intent = action.input.intent
      if (typeof intent === 'string' && intent.length > 0) {
        intents.add(intent)
      }
      continue
    }

    if (action.kind === 'verify-caller' && action.output.verified === true) {
      evidence.callerVerifications += 1
      continue
    }

    if (action.kind === 'deny-caller' && action.output.denied !== false) {
      evidence.refusedRequests += 1
    }
  }
  evidence.callerIntents = intents.size

  const sessionsById = new Map(sessions.map((session) => [session.id, session]))

  for (const [sessionId, stored] of groupBySession(actions)) {
    const own = ownHostname(sessionsById.get(sessionId))
    const firstCommand = stored.findIndex((action) => action.kind === 'command')
    const firstQuestion = stored.findIndex((action) => action.kind === 'ask-user')
    if (firstQuestion >= 0 && (firstCommand < 0 || firstQuestion < firstCommand)) {
      evidence.askedBeforeTouching += 1
    }

    const firstVerification = stored.findIndex(
      (action) => action.kind === 'verify-caller' && action.output.verified === true,
    )
    if (firstVerification >= 0 && (firstCommand < 0 || firstVerification < firstCommand)) {
      evidence.verifiedBeforeTouching += 1
    }

    // Remote Desktop is judged per attempt: did the learner look at the machine
    // before changing it, and did they write down what they did to it?
    let firstRemote = -1
    let firstRemoteRead = -1
    let firstRemoteChange = -1
    for (const [index, action] of stored.entries()) {
      if (!isRemoteWork(action, own)) {
        continue
      }
      if (firstRemote < 0) {
        firstRemote = index
      }
      if (isSessionPlumbing(action)) {
        continue
      }
      // Read against change comes from the registry's label, not from whether
      // the run reported an effect. A read that prints facts is a look; a
      // change that found nothing left to do is still a change; and a command
      // that failed did neither, so it moves neither marker.
      if (action.output.ok !== true) {
        continue
      }
      const access = commandAccess(commandLine(action))
      if (access === 'read') {
        if (firstRemoteRead < 0) {
          firstRemoteRead = index
        }
      } else if (access === 'change' && firstRemoteChange < 0) {
        firstRemoteChange = index
      }
    }

    if (firstRemoteRead >= 0 && (firstRemoteChange < 0 || firstRemoteRead < firstRemoteChange)) {
      evidence.remoteReadBeforeChange += 1
    }

    if (firstRemote >= 0) {
      const documented = stored.some((action, index) => {
        if (index <= firstRemote) {
          return false
        }
        const noteKind = recordedNote(action)
        return noteKind === 'troubleshooting' || noteKind === 'resolution'
      })
      if (documented) {
        evidence.remoteWorkDocumented += 1
      }
    }
  }

  evidence.handedOff = sessions.filter(
    (session) => session.resolution !== null && HANDED_OFF.test(session.resolution),
  ).length

  const extracts = listings.map((listing) => extractListing(listing.rawDescription))
  evidence.listingsSaved = listings.length
  evidence.listingsWithSkills = extracts.filter((extract) => extract.skills.length > 0).length

  const demanded = new Set<string>()
  for (const extract of extracts) {
    for (const family of extract.families) {
      demanded.add(family.scenarioId)
    }
  }
  const passed = new Set(history.filter((entry) => entry.passed).map((entry) => entry.scenarioId))
  evidence.demandedFamiliesPassed = [...demanded].filter((family) => passed.has(family)).length

  return evidence
}
