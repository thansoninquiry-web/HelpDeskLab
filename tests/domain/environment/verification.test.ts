import { describe, expect, it } from 'vitest'
import {
  CALLER_DESK_RECIPIENT_ID,
  CALLER_RECIPIENT_ID,
  badgeIdFor,
  badgeMessage,
  callbackMessage,
  callerVerificationMethods,
  checkBadgeScan,
  checkCallback,
  checkInPerson,
  checkLetterPin,
  checkVerificationCode,
  contradictedClaims,
  emptyVerificationState,
  findRecipient,
  formatVerificationCode,
  inPersonMessage,
  issueVerificationCode,
  letterPinFor,
  letterPinMessage,
  nextVerificationCode,
  usableCallerVerificationMethods,
  verificationMessage,
  verificationRecipients,
} from '../../../src/domain/environment/verification'

const NOW = Date.UTC(2026, 9, 17, 9, 0)
const CALLER = CALLER_RECIPIENT_ID
const MANAGER = 'manager'

const recipients = verificationRecipients({
  name: 'Dana Whitfield',
  employeeId: 'E-8842',
  managerName: 'Priya Raman',
})

function recipientFor(id: string) {
  const recipient = recipients.find((candidate) => candidate.id === id)
  if (!recipient) {
    throw new Error(`Missing recipient ${id}`)
  }
  return recipient
}

function issuedTo(id: string, code = '482913', now = NOW) {
  return issueVerificationCode(emptyVerificationState(), {
    code,
    recipient: recipientFor(id),
    now,
  })
}

describe('verification codes', () => {
  it('offers the caller first and the manager as a second contact', () => {
    expect(recipients[0]?.id).toBe(CALLER)
    expect(recipients[0]?.name).toBe('Dana Whitfield')
    expect(recipients.map((recipient) => recipient.role)).toEqual(['caller', 'manager'])
    expect(recipients[1]?.destination).toMatch(/^office •••-•••-\d{4}$/)
    // Both lines are reachable, and both take a code and a call.
    expect(recipients.map((recipient) => recipient.methods)).toEqual([
      ['verification-code', 'callback'],
      ['verification-code', 'callback'],
    ])
    expect(recipients.every((recipient) => recipient.reachable)).toBe(true)
  })

  it('adds a desk line when the handset cannot reach the person', () => {
    const withDeadPhone = verificationRecipients({
      name: 'Dana Whitfield',
      employeeId: 'E-8842',
      managerName: 'Priya Raman',
      mobileInService: false,
    })

    expect(withDeadPhone.map((recipient) => recipient.id)).toEqual([
      CALLER,
      CALLER_DESK_RECIPIENT_ID,
      MANAGER,
    ])
    // The mobile is still listed: the desk would try it, and the code would go
    // to nobody. The desk line is the one that reaches the person.
    const mobile = findRecipient(withDeadPhone, CALLER)
    expect(mobile?.reachable).toBe(false)
    expect(mobile?.methods).toEqual(['verification-code', 'callback'])
    const desk = findRecipient(withDeadPhone, CALLER_DESK_RECIPIENT_ID)
    expect(desk?.role).toBe('caller')
    expect(desk?.reachable).toBe(true)
    // A desk phone takes a call and cannot receive a text.
    expect(desk?.methods).toEqual(['callback'])
    expect(desk?.destination).toMatch(/^desk •••-•••-\d{4}$/)
  })

  it('fails a code that landed on a line nobody is holding', () => {
    const withDeadPhone = verificationRecipients({
      name: 'Dana Whitfield',
      employeeId: 'E-8842',
      managerName: 'Priya Raman',
      mobileInService: false,
    })
    const mobile = findRecipient(withDeadPhone, CALLER)
    if (!mobile) {
      throw new Error('The mobile contact is missing')
    }
    const state = issueVerificationCode(emptyVerificationState(), {
      code: '482913',
      recipient: mobile,
      now: NOW,
    })

    // The digits are right and still prove nothing: there is nobody to read them.
    const check = checkVerificationCode(state, '482913', {
      now: NOW,
      callerId: CALLER,
      recipientReachable: mobile.reachable,
    })
    expect(check.result).toBe('unreachable')
    expect(verificationMessage(check)).toMatch(/out of action/)
  })

describe('callback verification', () => {
  it('proves who answered the line when the person on the ticket answers', () => {
    const check = checkCallback(recipientFor(CALLER))

    expect(check).toEqual({ result: 'verified', contactName: 'Dana Whitfield' })
    expect(callbackMessage(check, recipientFor(CALLER).destination)).toBe(
      `Dana Whitfield answered ${recipientFor(CALLER).destination} and confirmed the request is theirs.`,
    )
  })

  it('does not let a line that reaches nobody stand in for a check', () => {
    const withDeadPhone = verificationRecipients({
      name: 'Dana Whitfield',
      employeeId: 'E-8842',
      managerName: null,
      mobileInService: false,
    })
    const mobile = findRecipient(withDeadPhone, CALLER)
    const desk = findRecipient(withDeadPhone, CALLER_DESK_RECIPIENT_ID)
    if (!mobile || !desk) {
      throw new Error('The expected contacts are missing')
    }

    const missed = checkCallback(mobile)
    expect(missed.result).toBe('no-answer')
    expect(callbackMessage(missed, mobile.destination)).toMatch(/still unverified/)
    expect(checkCallback(desk).result).toBe('verified')
  })

  it('will not let the manager vouch for who is on the line', () => {
    const check = checkCallback(recipientFor(MANAGER))

    expect(check.result).toBe('wrong-contact')
    expect(callbackMessage(check, recipientFor(MANAGER).destination)).toMatch(
      /cannot vouch for who is calling/,
    )
  })

  it('exposes the impersonator the code could never reach', () => {
    const check = checkCallback(recipientFor(CALLER), { callerImpersonating: true })

    expect(check.result).toBe('not-the-caller')
    expect(callbackMessage(check, recipientFor(CALLER).destination)).toMatch(
      /the request is not theirs/,
    )
  })

  it('refuses a contact with no line to ring', () => {
    const check = checkCallback({
      id: 'pager',
      name: 'Priya Raman',
      role: 'caller',
      destination: 'pager •••-•••-0001',
      methods: ['verification-code'],
      reachable: true,
    })

    expect(check.result).toBe('not-callable')
    expect(callbackMessage(check, 'pager •••-•••-0001')).toMatch(/no line to ring back on/)
  })
})

  it('keeps exactly one live code, retiring the previous one', () => {
    const first = issuedTo(CALLER, '111111')
    const second = issueVerificationCode(first, {
      code: '222222',
      recipient: recipientFor(CALLER),
      now: NOW + 60_000,
    })

    expect(second.active?.code).toBe('222222')
    expect(second.retired).toEqual(['111111'])
    expect(second.issued).toBe(2)
  })

  it('accepts the live code when the caller read it back', () => {
    const state = issuedTo(CALLER)

    expect(checkVerificationCode(state, '482913', { now: NOW, callerId: CALLER }).result).toBe(
      'verified',
    )
    expect(checkVerificationCode(state, '482 913', { now: NOW, callerId: CALLER }).result).toBe(
      'verified',
    )
  })

  it('fails a code sent to someone else as a wrong recipient, not a bad digit', () => {
    const state = issuedTo(MANAGER, '482913')
    const check = checkVerificationCode(state, '482913', { now: NOW, callerId: CALLER })

    expect(check).toEqual({ result: 'wrong-recipient', recipientName: 'Priya Raman' })
    expect(verificationMessage(check)).toBe(
      'The active verification code went to Priya Raman — not this ticket. A code only proves who received it.',
    )
  })

  it('refuses the read-back when the caller is not the employee on the ticket', () => {
    const state = issuedTo(CALLER, '482913')
    const check = checkVerificationCode(state, '482913', {
      now: NOW,
      callerId: CALLER,
      callerImpersonating: true,
    })

    expect(check).toEqual({ result: 'not-the-caller', recipientName: 'Dana Whitfield' })
    expect(verificationMessage(check)).toBe(
      'The live code went to Dana Whitfield, the person on this ticket. Whoever is on this call is not them, so no code can be read back.',
    )
    // Even the digits the employee would have read out prove nothing here.
    expect(checkVerificationCode(state, '482913', { now: NOW, callerId: CALLER }).result).toBe(
      'verified',
    )
  })

  it('still fails a code that went elsewhere when the caller is not the employee', () => {
    const state = issuedTo(MANAGER, '482913')
    const check = checkVerificationCode(state, '482913', {
      now: NOW,
      callerId: CALLER,
      callerImpersonating: true,
    })

    expect(check.result).toBe('wrong-recipient')
  })

  it('names a replaced code instead of calling it a mismatch', () => {
    const first = issuedTo(CALLER, '111111')
    const second = issueVerificationCode(first, {
      code: '222222',
      recipient: recipientFor(CALLER),
      now: NOW + 60_000,
    })

    const check = checkVerificationCode(second, '111111', { now: NOW + 60_000, callerId: CALLER })
    expect(check.result).toBe('retired')
    expect(verificationMessage(check)).toMatch(/replaced/)
  })

  it('expires a code at the end of its window', () => {
    const state = issuedTo(CALLER)

    expect(checkVerificationCode(state, '482913', { now: NOW + 599_999, callerId: CALLER }).result).toBe(
      'verified',
    )
    expect(checkVerificationCode(state, '482913', { now: NOW + 600_000, callerId: CALLER }).result).toBe(
      'expired',
    )
  })

  it('reports a wrong digit and a missing code separately', () => {
    const state = issuedTo(CALLER)

    expect(checkVerificationCode(state, '000000', { now: NOW, callerId: CALLER }).result).toBe(
      'mismatch',
    )
    expect(
      checkVerificationCode(emptyVerificationState(), '000000', { now: NOW, callerId: CALLER })
        .result,
    ).toBe('no-active-code')
  })
})

describe('verification code generation', () => {
  it('is deterministic for a replay and different for each send', () => {
    const first = nextVerificationCode('ticket-1:42', 0)

    expect(nextVerificationCode('ticket-1:42', 0)).toBe(first)
    expect(nextVerificationCode('ticket-1:42', 1)).not.toBe(first)
    expect(first).toMatch(/^\d{6}$/)
    expect(formatVerificationCode(first)).toBe(`${first.slice(0, 3)} ${first.slice(3)}`)
  })
})

describe('caller claims', () => {
  const directory = [
    {
      samAccountName: 'dwhitfield',
      displayName: 'Dana Whitfield',
      status: 'active' as const,
      passwordExpired: false,
    },
  ]

  const evidence = { directory, employeeName: 'Dana Whitfield' }

  const lockoutClaim = {
    id: 'claimed-lockout',
    account: 'dwhitfield',
    statement: 'My account is locked out and I need it unlocked.',
    expects: { status: 'locked' as const },
  }

  it('records the claim beside the directory row the log read', () => {
    expect(contradictedClaims([lockoutClaim], evidence)).toEqual([
      {
        id: 'claimed-lockout',
        claim: 'My account is locked out and I need it unlocked.',
        evidence: 'The directory shows status: active.',
      },
    ])
  })

  it('reports nothing when the attempt never read the account', () => {
    expect(contradictedClaims([lockoutClaim], { ...evidence, directory: [] })).toEqual([])
  })

  it('matches the claim to its account, not just the first row read', () => {
    const other = {
      ...directory[0]!,
      samAccountName: 'rpatel',
      displayName: 'Ravi Patel',
      status: 'locked' as const,
    }

    expect(
      contradictedClaims([lockoutClaim], {
        ...evidence,
        directory: [other, ...directory],
      }),
    ).toHaveLength(1)
  })

  it('leaves a claim the record supports out of the findings', () => {
    expect(
      contradictedClaims([lockoutClaim], {
        ...evidence,
        directory: [{ ...directory[0]!, status: 'locked' }],
      }),
    ).toEqual([])
  })

  it('checks every field the claim names, not just the first mismatch', () => {
    const claim = {
      id: 'claimed-expiry',
      account: 'dwhitfield',
      statement: 'My password expired today.',
      expects: { status: 'locked' as const, passwordExpired: true },
    }

    expect(contradictedClaims([claim], evidence)[0]?.evidence).toBe(
      'The directory shows status: active; passwordExpired: False.',
    )
  })

  it('contradicts a claim to be the account owner only when the gate has the evidence', () => {
    const ownerClaim = {
      id: 'claimed-owner',
      account: 'dwhitfield',
      statement: 'I am Dana Whitfield, the account owner.',
      identity: true,
    }

    // The directory cannot speak to who is on the line.
    expect(contradictedClaims([ownerClaim], evidence)).toEqual([])

    expect(contradictedClaims([ownerClaim], { ...evidence, codeUnreadable: true })).toEqual([
      {
        id: 'claimed-owner',
        claim: 'I am Dana Whitfield, the account owner.',
        evidence:
          'The live code went to Dana Whitfield’s own contact on the ticket, and the caller could not read it back.',
      },
    ])
  })

  it('keeps both gate findings when a code and a callback both answered the claim', () => {
    const findings = contradictedClaims(
      [
        {
          id: 'claimed-owner',
          account: 'dwhitfield',
          statement: 'I am Dana Whitfield, the account owner.',
          identity: true,
        },
      ],
      { ...evidence, codeUnreadable: true, callbackDenied: true },
    )

    expect(findings[0]?.evidence).toContain('could not read it back')
    expect(findings[0]?.evidence).toContain('said the request was not theirs')
  })

  it('reports nothing when the ticket declares no claims', () => {
    expect(contradictedClaims(undefined, { ...evidence, codeUnreadable: true })).toEqual([])
  })
})

describe('carried and in-person proofs', () => {
  const atDeskRecipients = verificationRecipients({
    name: 'Dana Whitfield',
    employeeId: 'E-8842',
    managerName: 'Priya Raman',
    onSite: true,
    letterPinOnFile: true,
  })

  function atDeskRecipient(id: string) {
    const recipient = findRecipient(atDeskRecipients, id)
    if (!recipient) {
      throw new Error(`Missing recipient ${id}`)
    }
    return recipient
  }

  it('offers the extra proofs only when the caller can actually supply them', () => {
    expect(callerVerificationMethods({})).toEqual(['verification-code', 'callback'])
    expect(callerVerificationMethods({ onSite: true })).toEqual([
      'verification-code',
      'callback',
      'badge-scan',
      'in-person',
    ])
    expect(callerVerificationMethods({ letterPinOnFile: true })).toContain('letter-pin')
    // A code sent to a dead handset cannot clear the gate, so it is not counted
    // as a check the learner should have made.
    expect(
      usableCallerVerificationMethods({ mobileInService: false, onSite: true, letterPinOnFile: true }),
    ).toEqual(['callback', 'badge-scan', 'in-person', 'letter-pin'])
  })

  it('puts the badge and the walk-up on the caller contact only while they are at the desk', () => {
    expect(atDeskRecipient(CALLER).methods).toEqual([
      'verification-code',
      'callback',
      'badge-scan',
      'in-person',
      'letter-pin',
    ])
    // A manager can take a code or a call, but cannot present the caller's badge.
    expect(atDeskRecipient(MANAGER).methods).toEqual(['verification-code', 'callback'])
  })

  it('proves the person at the desk with the badge on file', () => {
    const check = checkBadgeScan(atDeskRecipient(CALLER), { onSite: true })

    expect(check).toEqual({ result: 'verified', contactName: 'Dana Whitfield' })
    expect(badgeMessage(check, 'LK-4821')).toMatch(/LK-4821.*matches Dana Whitfield/)
    expect(checkBadgeScan(atDeskRecipient(CALLER), { onSite: false }).result).toBe('not-at-desk')
    expect(
      checkBadgeScan(atDeskRecipient(CALLER), { onSite: true, callerImpersonating: true }).result,
    ).toBe('not-the-caller')
    // The manager's contact is not offered a badge scan at all.
    expect(checkBadgeScan(atDeskRecipient(MANAGER), { onSite: true }).result).toBe('no-badge')
    expect(
      badgeMessage(checkBadgeScan(atDeskRecipient(CALLER), { onSite: false }), 'LK-4821'),
    ).toMatch(/only be scanned at the desk/)
  })

  it('needs photo ID checked at the desk for a walk-up', () => {
    const check = checkInPerson(atDeskRecipient(CALLER), { onSite: true })

    expect(check.result).toBe('verified')
    expect(inPersonMessage(check)).toMatch(/photo ID at the service desk/)
    expect(checkInPerson(atDeskRecipient(CALLER), { onSite: false }).result).toBe('not-at-desk')
    expect(
      checkInPerson(atDeskRecipient(CALLER), { onSite: true, callerImpersonating: true }).result,
    ).toBe('not-the-caller')
  })

  it('accepts the PIN from the letter and counts wrong entries', () => {
    const recipient = atDeskRecipient(CALLER)
    const clean = { attempts: 0, locked: false }

    expect(
      checkLetterPin(recipient, '482 913', { expectedPin: '482913', state: clean }).result,
    ).toBe('verified')

    const wrong = checkLetterPin(recipient, '000000', { expectedPin: '482913', state: clean })
    expect(wrong).toMatchObject({ result: 'mismatch', attemptsLeft: 2 })
    expect(letterPinMessage(wrong)).toMatch(/2 attempts left/)

    const last = checkLetterPin(recipient, '000000', {
      expectedPin: '482913',
      state: { attempts: 2, locked: false },
    })
    expect(last).toMatchObject({ result: 'mismatch', attemptsLeft: 0 })
    expect(letterPinMessage(last)).toMatch(/now locked/)

    expect(
      checkLetterPin(recipient, '482913', { expectedPin: '482913', state: { attempts: 3, locked: true } })
        .result,
    ).toBe('locked')
    // The letter is at the employee's home, so an impersonator has nothing to read.
    expect(
      checkLetterPin(recipient, '482913', {
        expectedPin: '482913',
        state: clean,
        callerImpersonating: true,
      }).result,
    ).toBe('not-the-caller')
    expect(
      checkLetterPin(recipientFor(CALLER), '482913', { expectedPin: '482913', state: clean }).result,
    ).toBe('no-letter')
  })

  it('keeps the letter PIN and the badge serial deterministic', () => {
    expect(letterPinFor('ticket:1')).toBe(letterPinFor('ticket:1'))
    expect(letterPinFor('ticket:1')).toMatch(/^\d{6}$/)
    expect(badgeIdFor('E-8842')).toBe(badgeIdFor('E-8842'))
    expect(badgeIdFor('E-8842')).toMatch(/^LK-\d{4}$/)
  })
})
