import { createRng, hashSeed } from '../shared/rng'
import type {
  CallerClaim,
  LetterPinState,
  UserStatus,
  VerificationMethod,
  VerificationRecipient,
  VerificationState,
} from './types'

/** How long a code stays usable on the simulated clock. */
export const VERIFICATION_CODE_TTL_MS = 10 * 60 * 1000
export const VERIFICATION_CODE_LENGTH = 6
/** The person on the ticket is always the intended recipient. */
export const CALLER_RECIPIENT_ID = 'requester'
/** The caller's desk line. Only offered when their mobile cannot reach them. */
export const CALLER_DESK_RECIPIENT_ID = 'requester-desk'
export const RETAINED_RETIRED_CODES = 5
/** Wrong entries allowed against the printed letter PIN before it locks. */
export const LETTER_PIN_ATTEMPTS = 3
export const LETTER_PIN_LENGTH = 6

export function emptyVerificationState(): VerificationState {
  return { active: null, retired: [], issued: 0, letterPin: { attempts: 0, locked: false } }
}

/**
 * What the caller can actually offer as proof on this ticket. The two remote
 * methods are always listed; the three in-person ones depend on the person
 * carrying the thing or being at the desk, and on a letter having been issued.
 *
 * Ordered as the panel lists them: the live check first, then the fallbacks.
 */
export function callerVerificationMethods(input: {
  mobileInService?: boolean
  onSite?: boolean
  letterPinOnFile?: boolean
}): VerificationMethod[] {
  const methods: VerificationMethod[] = ['verification-code', 'callback']
  if (input.onSite === true) {
    methods.push('badge-scan', 'in-person')
  }
  if (input.letterPinOnFile === true) {
    methods.push('letter-pin')
  }
  return methods
}

/**
 * The methods that can actually clear the gate, so scoring does not treat a code
 * sent to a dead handset as the check a learner should have made.
 */
export function usableCallerVerificationMethods(input: {
  mobileInService?: boolean
  onSite?: boolean
  letterPinOnFile?: boolean
}): VerificationMethod[] {
  return callerVerificationMethods(input).filter(
    (method) => method !== 'verification-code' || input.mobileInService !== false,
  )
}

function maskedNumber(seed: string): string {
  return `•••-•••-${String(hashSeed(seed) % 10_000).padStart(4, '0')}`
}

/**
 * The contacts the person on the ticket can be reached on. The caller is always
 * the first entry, so the panel can default to the person the proof is about.
 *
 * A caller whose handset is out of action gets a second entry for their desk
 * line: the mobile is still listed, because the desk would try it, but nothing
 * comes back from it. The desk line is only offered when the mobile cannot
 * reach them, so the usual ticket stays a one-contact decision.
 */
export function verificationRecipients(input: {
  name: string
  employeeId: string
  managerName: string | null
  /** False when the employee's handset cannot reach them right now. */
  mobileInService?: boolean
  /** True when the employee is at the service desk in person. */
  onSite?: boolean
  /** True when the printed PIN letter was issued to the employee. */
  letterPinOnFile?: boolean
}): VerificationRecipient[] {
  const name = input.name.trim()
  const mobileInService = input.mobileInService ?? true
  const recipients: VerificationRecipient[] = [
    {
      id: CALLER_RECIPIENT_ID,
      name,
      role: 'caller',
      destination: `mobile ${maskedNumber(input.employeeId)}`,
      methods: callerVerificationMethods({
        mobileInService,
        onSite: input.onSite,
        letterPinOnFile: input.letterPinOnFile,
      }),
      reachable: mobileInService,
    },
  ]

  if (!mobileInService) {
    recipients.push({
      id: CALLER_DESK_RECIPIENT_ID,
      name,
      role: 'caller',
      // A desk phone takes a call and cannot receive a text.
      destination: `desk ${maskedNumber(`${input.employeeId}:desk`)}`,
      methods: ['callback'],
      reachable: true,
    })
  }

  const manager = input.managerName?.trim()
  if (manager && manager.toLowerCase() !== name.toLowerCase()) {
    recipients.push({
      id: 'manager',
      name: manager,
      role: 'manager',
      destination: `office ${maskedNumber(manager)}`,
      methods: ['verification-code', 'callback'],
      reachable: true,
    })
  }

  return recipients
}

/** The contact a failure message should name, or null when it is not listed. */
export function findRecipient(
  recipients: readonly VerificationRecipient[],
  id: string,
): VerificationRecipient | null {
  return recipients.find((recipient) => recipient.id === id) ?? null
}

/** Deterministic per attempt, so a reload and a replay agree on the number. */
export function nextVerificationCode(seed: string | number, issued: number): string {
  const rng = createRng(hashSeed(`${String(seed)}:verification:${issued}`))
  const smallest = 10 ** (VERIFICATION_CODE_LENGTH - 1)
  return String(rng.int(smallest, smallest * 10 - 1))
}

export function formatVerificationCode(code: string): string {
  return `${code.slice(0, 3)} ${code.slice(3)}`
}

export function normalizeVerificationCode(input: string): string {
  return input.replace(/\D/g, '')
}

/**
 * The PIN printed in the employee's onboarding letter. It is derived from the
 * ticket rather than stored, so a reload and a replay agree on the digits.
 */
export function letterPinFor(seed: string | number): string {
  const rng = createRng(hashSeed(`${String(seed)}:letter-pin`))
  const smallest = 10 ** (LETTER_PIN_LENGTH - 1)
  return String(rng.int(smallest, smallest * 10 - 1))
}

/** The wrong entries so far, treating a world written before the field as clean. */
export function letterPinState(state: VerificationState): LetterPinState {
  return state.letterPin ?? { attempts: 0, locked: false }
}

/**
 * Issues a code and retires whatever was live. One record means one live code:
 * a second send cannot leave two numbers that both work.
 */
export function issueVerificationCode(
  state: VerificationState,
  options: {
    code: string
    recipient: VerificationRecipient
    now: number
    ttlMs?: number
  },
): VerificationState {
  const ttl = options.ttlMs ?? VERIFICATION_CODE_TTL_MS
  const retired = state.active ? [state.active.code, ...state.retired] : state.retired

  return {
    active: {
      code: options.code,
      recipientId: options.recipient.id,
      recipientName: options.recipient.name,
      destination: options.recipient.destination,
      issuedAt: options.now,
      expiresAt: options.now + ttl,
    },
    retired: retired.slice(0, RETAINED_RETIRED_CODES),
    issued: state.issued + 1,
  }
}

export type VerificationCheck =
  | { result: 'verified'; recipientName: string }
  | { result: 'no-active-code' }
  | { result: 'wrong-recipient'; recipientName: string }
  | { result: 'not-the-caller'; recipientName: string }
  | { result: 'unreachable'; recipientName: string }
  | { result: 'expired'; recipientName: string }
  | { result: 'retired'; recipientName: string }
  | { result: 'mismatch'; recipientName: string }

/**
 * A code proves the identity of whoever received it, so a live code sent to
 * anyone else fails as a wrong recipient before the digits are even compared.
 * The same rule covers the impersonation case: the code is with the employee the
 * ticket is about, and the person on the call is not that employee, so no number
 * they type can be the one that was sent.
 */
export function checkVerificationCode(
  state: VerificationState,
  input: string,
  options: {
    now: number
    callerId: string
    callerImpersonating?: boolean
    /** False when the code went to a line that cannot reach the person. */
    recipientReachable?: boolean
  },
): VerificationCheck {
  const active = state.active
  if (!active) {
    return { result: 'no-active-code' }
  }
  if (active.recipientId !== options.callerId) {
    return { result: 'wrong-recipient', recipientName: active.recipientName }
  }
  if (options.callerImpersonating === true) {
    return { result: 'not-the-caller', recipientName: active.recipientName }
  }
  // A code that landed on a handset with nobody holding it proves nothing, so it
  // fails before the digits are compared: no typing can make it work.
  if (options.recipientReachable === false) {
    return { result: 'unreachable', recipientName: active.recipientName }
  }
  if (options.now >= active.expiresAt) {
    return { result: 'expired', recipientName: active.recipientName }
  }

  const code = normalizeVerificationCode(input)
  if (code === active.code) {
    return { result: 'verified', recipientName: active.recipientName }
  }
  if (state.retired.includes(code)) {
    return { result: 'retired', recipientName: active.recipientName }
  }
  return { result: 'mismatch', recipientName: active.recipientName }
}

export type CallbackCheck =
  | { result: 'verified'; contactName: string }
  | { result: 'no-answer'; contactName: string }
  | { result: 'wrong-contact'; contactName: string }
  | { result: 'not-the-caller'; contactName: string }
  | { result: 'not-callable'; contactName: string }

/**
 * The second method: the desk rings the person back on a line on file instead of
 * asking them to read something out. It proves something different from a code,
 * and only when the call can reach the person the ticket is about: a manager can
 * vouch for the account but not for who is on the line, and a line nobody
 * answers verifies nobody.
 */
export function checkCallback(
  recipient: VerificationRecipient,
  options: { callerImpersonating?: boolean } = {},
): CallbackCheck {
  if (!recipient.methods.includes('callback')) {
    return { result: 'not-callable', contactName: recipient.name }
  }
  if (!recipient.reachable) {
    return { result: 'no-answer', contactName: recipient.name }
  }
  if (recipient.role !== 'caller') {
    return { result: 'wrong-contact', contactName: recipient.name }
  }
  // In an impersonation variant the employee is at their desk and answers, but
  // the request on the line is not theirs.
  if (options.callerImpersonating === true) {
    return { result: 'not-the-caller', contactName: recipient.name }
  }
  return { result: 'verified', contactName: recipient.name }
}

export type BadgeCheck =
  | { result: 'verified'; contactName: string }
  | { result: 'no-badge'; contactName: string }
  | { result: 'not-at-desk'; contactName: string }
  | { result: 'not-the-caller'; contactName: string }
  | { result: 'wrong-contact'; contactName: string }

/**
 * The badge at the desk. It proves the person who physically presented the
 * badge, and only when that person is the employee on the ticket: the serial on
 * the card has to match the record, and a remote caller has no card to scan.
 * Someone using the employee's name without their badge cannot produce it.
 */
export function checkBadgeScan(
  recipient: VerificationRecipient,
  options: { onSite?: boolean; callerImpersonating?: boolean } = {},
): BadgeCheck {
  if (!recipient.methods.includes('badge-scan')) {
    return { result: 'no-badge', contactName: recipient.name }
  }
  if (recipient.role !== 'caller') {
    return { result: 'wrong-contact', contactName: recipient.name }
  }
  if (options.onSite !== true) {
    return { result: 'not-at-desk', contactName: recipient.name }
  }
  if (options.callerImpersonating === true) {
    return { result: 'not-the-caller', contactName: recipient.name }
  }
  return { result: 'verified', contactName: recipient.name }
}

export type LetterPinCheck =
  | { result: 'verified'; contactName: string }
  | { result: 'no-letter'; contactName: string }
  | { result: 'locked'; contactName: string }
  | { result: 'not-the-caller'; contactName: string }
  | { result: 'mismatch'; contactName: string; attemptsLeft: number }

/**
 * The PIN from the onboarding letter. It is a fixed secret that lives away from
 * the phone, so it proves the caller holds the letter — but not that the person
 * on the call is the employee, which is why it is the weakest of the methods.
 * Three wrong entries lock it for the attempt rather than allowing guesses.
 */
export function checkLetterPin(
  recipient: VerificationRecipient,
  input: string,
  options: {
    expectedPin: string
    state: LetterPinState
    callerImpersonating?: boolean
  },
): LetterPinCheck {
  if (!recipient.methods.includes('letter-pin') || recipient.role !== 'caller') {
    return { result: 'no-letter', contactName: recipient.name }
  }
  if (options.state.locked) {
    return { result: 'locked', contactName: recipient.name }
  }
  // The letter is at the employee's home address, so a caller using their name
  // without being them has nothing to read from.
  if (options.callerImpersonating === true) {
    return { result: 'not-the-caller', contactName: recipient.name }
  }
  if (normalizeVerificationCode(input) === options.expectedPin) {
    return { result: 'verified', contactName: recipient.name }
  }
  return {
    result: 'mismatch',
    contactName: recipient.name,
    attemptsLeft: Math.max(0, LETTER_PIN_ATTEMPTS - (options.state.attempts + 1)),
  }
}

export type InPersonCheck =
  | { result: 'verified'; contactName: string }
  | { result: 'no-walk-up'; contactName: string }
  | { result: 'not-at-desk'; contactName: string }
  | { result: 'not-the-caller'; contactName: string }
  | { result: 'wrong-contact'; contactName: string }

/**
 * A walk-up at the service desk. The evidence is the photo ID the desk checks
 * against the directory, which is why the method needs the person in front of
 * the desk and cannot be done for a caller on the phone from somewhere else.
 */
export function checkInPerson(
  recipient: VerificationRecipient,
  options: { onSite?: boolean; callerImpersonating?: boolean } = {},
): InPersonCheck {
  if (!recipient.methods.includes('in-person')) {
    return { result: 'no-walk-up', contactName: recipient.name }
  }
  if (recipient.role !== 'caller') {
    return { result: 'wrong-contact', contactName: recipient.name }
  }
  if (options.onSite !== true) {
    return { result: 'not-at-desk', contactName: recipient.name }
  }
  if (options.callerImpersonating === true) {
    return { result: 'not-the-caller', contactName: recipient.name }
  }
  return { result: 'verified', contactName: recipient.name }
}

/** The badge serial the directory holds for an employee. */
export function badgeIdFor(employeeId: string): string {
  return `LK-${String(hashSeed(`badge:${employeeId}`) % 9_000 + 1_000)}`
}

/**
 * A caller claim the evidence answered. The gate keeps the claim and the fact
 * that contradicts it together, so the debrief can quote both rather than
 * saying only that the caller was refused.
 */
export interface IdentityContradiction {
  id: string
  /** The caller's words. */
  claim: string
  /** What the record showed instead. */
  evidence: string
}

/** One directory row the attempt actually read, as the log recorded it. */
export interface DirectoryEvidence {
  samAccountName: string
  displayName: string
  status: UserStatus
  passwordExpired: boolean
}

/**
 * Everything the attempt's log establishes about the caller's story. Directory
 * rows exist only for accounts the learner actually looked up, so the debrief
 * cannot claim the evidence contradicted a statement the desk never checked.
 */
export interface ClaimEvidence {
  directory: readonly DirectoryEvidence[]
  /** The employee the ticket is about, for naming identity evidence. */
  employeeName: string
  /** The live code went to the claimed contact and the caller could not read it back. */
  codeUnreadable?: boolean
  /** A callback reached the claimed contact, who denied making the request. */
  callbackDenied?: boolean
}

/**
 * Sets each claim the ticket puts in the caller's mouth beside the log. A claim
 * is only reported when the log actually contradicts it: the debrief records
 * disagreements, not suspicions, and a claim the record supports — or that the
 * attempt never checked — stays out. Directory claims use the row the learner
 * read, so a later change cannot rewrite what the log showed at the time.
 */
export function contradictedClaims(
  claims: readonly CallerClaim[] | undefined,
  evidence: ClaimEvidence,
): IdentityContradiction[] {
  const findings: IdentityContradiction[] = []

  for (const claim of claims ?? []) {
    if (claim.identity === true) {
      const reasons: string[] = []
      if (evidence.codeUnreadable === true) {
        reasons.push(
          `The live code went to ${evidence.employeeName}’s own contact on the ticket, and the caller could not read it back.`,
        )
      }
      if (evidence.callbackDenied === true) {
        reasons.push(
          `${evidence.employeeName} answered a callback and said the request was not theirs.`,
        )
      }
      if (reasons.length > 0) {
        findings.push({ id: claim.id, claim: claim.statement, evidence: reasons.join(' ') })
      }
      continue
    }

    if (!claim.expects) {
      continue
    }
    const row = evidence.directory.find(
      (entry) =>
        entry.samAccountName.toLowerCase() === claim.account.toLowerCase(),
    )
    if (!row) {
      continue
    }

    const reasons: string[] = []
    if (claim.expects.status !== undefined && row.status !== claim.expects.status) {
      reasons.push(`status: ${row.status}`)
    }
    if (
      claim.expects.passwordExpired !== undefined &&
      row.passwordExpired !== claim.expects.passwordExpired
    ) {
      reasons.push(`passwordExpired: ${row.passwordExpired ? 'True' : 'False'}`)
    }
    if (reasons.length > 0) {
      findings.push({
        id: claim.id,
        claim: claim.statement,
        evidence: `The directory shows ${reasons.join('; ')}.`,
      })
    }
  }

  return findings
}

export function verificationMessage(check: VerificationCheck): string {
  switch (check.result) {
    case 'verified':
      return `${check.recipientName} read back the active verification code.`
    case 'no-active-code':
      return 'Send a verification code before asking the caller to read one back.'
    case 'wrong-recipient':
      return `The active verification code went to ${check.recipientName} — not this ticket. A code only proves who received it.`
    case 'not-the-caller':
      return `The live code went to ${check.recipientName}, the person on this ticket. Whoever is on this call is not them, so no code can be read back.`
    case 'unreachable':
      return `The code went to ${check.recipientName}, but that line is out of action, so nothing can be read back. There is a number on file you can ring instead.`
    case 'expired':
      return `That code has expired. Send a new code to ${check.recipientName}.`
    case 'retired':
      return `That code was replaced when a newer one was sent. ${check.recipientName} has a different code now.`
    case 'mismatch':
      return `That is not the code ${check.recipientName} received.`
  }
}

export function badgeMessage(check: BadgeCheck, badgeId: string): string {
  switch (check.result) {
    case 'verified':
      return `Badge ${badgeId} was scanned at the desk, and the photo on it matches ${check.contactName} in the directory.`
    case 'no-badge':
      return 'There is no badge on file to scan for this contact.'
    case 'not-at-desk':
      return `A badge can only be scanned at the desk, and ${check.contactName} is not here.`
    case 'not-the-caller':
      return `The badge on file is ${check.contactName}’s, and nobody at the desk produced it. Whoever is asking is not them.`
    case 'wrong-contact':
      return `${check.contactName} is not the person on this ticket, so their badge cannot prove who is asking.`
  }
}

export function letterPinMessage(check: LetterPinCheck): string {
  switch (check.result) {
    case 'verified':
      return `The PIN from ${check.contactName}’s onboarding letter matches the one on record.`
    case 'no-letter':
      return `No onboarding letter was issued to ${check.contactName}, so there is no PIN to read.`
    case 'locked':
      return `The letter PIN is locked for this attempt after ${LETTER_PIN_ATTEMPTS} wrong entries. Use another way to prove the caller.`
    case 'not-the-caller':
      return `The letter is at ${check.contactName}’s home address. Whoever is asking cannot read it out.`
    case 'mismatch':
      return check.attemptsLeft > 0
        ? `That is not the PIN on ${check.contactName}’s letter. ${check.attemptsLeft} attempt${check.attemptsLeft === 1 ? '' : 's'} left.`
        : `That is not the PIN on ${check.contactName}’s letter, and the letter is now locked.`
  }
}

export function inPersonMessage(check: InPersonCheck): string {
  switch (check.result) {
    case 'verified':
      return `${check.contactName} presented photo ID at the service desk, and the name and photo match the directory record.`
    case 'no-walk-up':
      return 'A walk-up cannot be checked for this contact.'
    case 'not-at-desk':
      return `A walk-up proves someone who is at the desk, and ${check.contactName} is not here.`
    case 'not-the-caller':
      return `The photo ID presented does not match ${check.contactName}, so the person at the desk is not them.`
    case 'wrong-contact':
      return `${check.contactName} is not the person on this ticket, so a walk-up cannot prove the caller.`
  }
}

export function callbackMessage(check: CallbackCheck, destination: string): string {
  switch (check.result) {
    case 'verified':
      return `${check.contactName} answered ${destination} and confirmed the request is theirs.`
    case 'no-answer':
      return `Nobody answered ${destination}, so the caller is still unverified. Ring a line the person is actually on.`
    case 'wrong-contact':
      return `${check.contactName} is not the person on this ticket, so they cannot vouch for who is calling.`
    case 'not-the-caller':
      return `${check.contactName} answered ${destination} and said the request is not theirs — the person on this call is not them.`
    case 'not-callable':
      return `${check.contactName} has no line to ring back on.`
  }
}
