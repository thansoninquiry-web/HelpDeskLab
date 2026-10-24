import { hashSeed } from '../shared/rng'

/**
 * A request that arrived as a message rather than as a conversation.
 *
 * Some tickets are left on the desk's voicemail: the person rang, nobody picked
 * up, and the recording is the whole of what they said. The arrival is a fact
 * about the request, drawn when the ticket is made and kept with the attempt, so
 * the workspace can play the message and the curriculum can tell a voicemail
 * attempt from one that arrived on a live line.
 *
 * It is drawn from the ticket's seed rather than from the world's random stream:
 * the arrival must not move what that seed generates, or every ticket already in
 * someone's queue would become a different ticket.
 */
export interface VoicemailArrival {
  /** The simulated time the message was left — the ticket's own report time. */
  leftAt: number
  /** How long the recording runs, in seconds. */
  durationSeconds: number
  /**
   * The line the message asks to be rung back on. The mobile on file takes a
   * call unless the handset is out of action, in which case the recording names
   * the desk line instead.
   */
  callbackLine: 'mobile' | 'desk'
}

/** One ticket in three is left this way. */
const VOICEMAIL_EVERY = 3

/**
 * Whether one seed's ticket arrives as a message. It depends on the seed alone,
 * so a caller that needs a voicemail ticket can look for a seed that has one
 * rather than fight the draw after the ticket is built.
 */
export function arrivesAsVoicemail(seed: number): boolean {
  return hashSeed(`voicemail:${seed}`) % VOICEMAIL_EVERY === 0
}

/**
 * The first seed at or after `seed` whose ticket arrives as a message.
 *
 * Module 5 starts on a voicemail, and a draw that misses would open a live
 * ticket instead. The ticket is still generated from the seed the queue stores,
 * so a reload or a replay rebuilds the same message.
 */
export function voicemailSeed(seed: number): number {
  for (let step = 0; step < 64; step += 1) {
    const candidate = seed + step
    if (arrivesAsVoicemail(candidate)) {
      return candidate
    }
  }
  return seed
}

/**
 * The arrival for one ticket, or null when it came in live.
 *
 * Deterministic in the seed and in the fault, so the same ticket always arrives
 * the same way: a reload, a retry and a replay all read one message rather than
 * three different ones.
 */
export function voicemailFor(
  seed: number,
  leftAt: number,
  mobileOutOfAction: boolean,
): VoicemailArrival | null {
  if (!arrivesAsVoicemail(seed)) {
    return null
  }

  // 24–59 seconds, in five-second steps, like a real handset's counter.
  const durationSeconds = 24 + (hashSeed(`voicemail-length:${seed}`) % 8) * 5
  return {
    leftAt,
    durationSeconds,
    callbackLine: mobileOutOfAction ? 'desk' : 'mobile',
  }
}

/**
 * Reads a stored arrival back. A ticket written before voicemails existed, or a
 * row whose shape has been damaged, simply arrived live: the workspace shows its
 * report as it always did rather than a half-played message.
 */
export function isVoicemailArrival(value: unknown): value is VoicemailArrival {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false
  }
  const record = value as Record<string, unknown>
  return (
    Number.isFinite(record.leftAt) &&
    Number.isFinite(record.durationSeconds) &&
    (record.callbackLine === 'mobile' || record.callbackLine === 'desk')
  )
}
