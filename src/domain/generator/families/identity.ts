import type { ScenarioFamily } from '../types'
import { absent, decision, effect, makeItem, makeRubric, note, ordered, ran, verifyCaller } from '../rubric'

export const identityFamily: ScenarioFamily = {
  id: 'PWD-01',
  title: 'Password and account access',
  category: 'identity',
  variants: [
    {
      id: 'account-lockout',
      label: 'Account lockout',
      summary: 'The directory account is locked out after repeated sign-in attempts.',
      difficulty: 1,
      severity: 'high',
      subjects: ['{firstName} is locked out of {hostname}', 'Sign-in lockout - {firstName} ({department})'],
      bodies: [
        'Hi, I came back from lunch and I cannot sign in to {hostname}. The screen says my account has been locked out and that I should contact an administrator. I have a customer report due at 4pm and I am stuck. Can you help?',
        'I am locked out of {hostname}. It worked this morning and nothing has changed on my end. The message mentions too many sign-in attempts. Please advise. {displayName}, {department}.',
      ],
      symptoms: [
        'Sign-in is rejected with an account lockout message',
        'The laptop boots normally and other users can sign in',
        'No hardware or network change was reported',
      ],
      build(context) {
        context.user.status = 'locked'
        return `status:${context.user.status}`
      },
      rubric(context) {
        const sam = context.user.samAccountName
        return makeRubric('PWD-01', 'account-lockout', [
          makeItem({
            id: 'diagnose-account',
            label: 'Checked the directory account state',
            why: 'Lockout, expiry, and disablement need different fixes, so confirm which one applies before changing anything.',
            category: 'diagnosis',
            weight: 15,
            checks: [ran('get-account', sam)],
            hint: 'The account lookup shows lock state, password expiry, and sign-in hints.',
          }),
          makeItem({
            id: 'unlock',
            label: `Unlocked ${sam}`,
            why: 'Tier 1 can clear a lockout once the caller and the account state are confirmed.',
            category: 'resolution',
            weight: 30,
            critical: true,
            checks: [effect('account_unlocked', sam)],
          }),
          makeItem({
            id: 'verify-fix',
            label: 'Rechecked the account after unlocking',
            why: 'A second lookup proves the lockout cleared instead of assuming it did.',
            category: 'diagnosis',
            weight: 15,
            checks: [ordered(effect('account_unlocked', sam), ran('get-account', sam))],
          }),
          makeItem({
            id: 'verify-caller',
            label: 'Verified the caller before touching the account',
            why: 'Account changes are a social-engineering target; confirm identity before acting.',
            category: 'safety',
            weight: 15,
            critical: true,
            checks: [ordered(verifyCaller(), effect('account_unlocked', sam))],
          }),
          makeItem({
            id: 'note-troubleshooting',
            label: 'Logged troubleshooting notes',
            why: 'Your notes are the evidence trail for the next person who picks up the ticket.',
            category: 'documentation',
            weight: 10,
            checks: [note('troubleshooting', 20)],
          }),
          makeItem({
            id: 'note-customer',
            label: 'Wrote a customer-facing note',
            why: 'The user needs a plain-language update they can act on.',
            category: 'documentation',
            weight: 5,
            checks: [note('customer', 15)],
          }),
          makeItem({
            id: 'decision',
            label: 'Resolved the ticket instead of escalating',
            why: 'A lockout is a Tier 1 fix; escalating it wastes the user and the next team.',
            category: 'resolution',
            weight: 10,
            critical: true,
            checks: [decision('resolved', ['resolved-remote', 'resolved-user-guidance'])],
          }),
        ])
      },
      reference(context) {
        const sam = context.user.samAccountName
        return [
          { type: 'verify-caller' },
          { type: 'command', input: `get-account ${sam}` },
          { type: 'command', input: `unlock-account ${sam}` },
          { type: 'command', input: `get-account ${sam}` },
          {
            type: 'note',
            noteKind: 'troubleshooting',
            text: 'Directory lookup confirmed the account was locked. Verified the caller, unlocked the account, and confirmed the status returned to active.',
          },
          {
            type: 'note',
            noteKind: 'customer',
            text: 'Your account is unlocked. Sign in with your current password and let us know if it locks again today.',
          },
        ]
      },
      expectedOutcome: 'resolved',
      expectedCodes: ['resolved-remote'],
    },
    {
      id: 'expired-password',
      label: 'Expired password',
      summary: 'The password has expired and remote sign-in cannot pass the change portal.',
      difficulty: 2,
      severity: 'medium',
      subjects: ['{firstName} cannot sign in - password expired', 'Expired password keeps {firstName} offline'],
      bodies: [
        'Hi, I am working from home today and I cannot get into {hostname}. It says my password has expired and the change password option fails with an error. I do not want to lock myself out trying again. What do you need from me?',
        'My password expired overnight. The sign-in screen offers to change it but then says it cannot contact the domain. I am at {site} with no other machine. Please help - {firstName}.',
      ],
      symptoms: [
        'Sign-in reports an expired password',
        'The change-password prompt fails to complete',
        'The user has not changed the password in over 90 days',
      ],
      build(context) {
        context.user.passwordExpired = true
        return `passwordExpired:${context.user.passwordExpired}`
      },
      rubric(context) {
        const sam = context.user.samAccountName
        return makeRubric('PWD-01', 'expired-password', [
          makeItem({
            id: 'diagnose-account',
            label: 'Confirmed expiry in the directory',
            why: 'The error message and the directory record should agree before you reset anything.',
            category: 'diagnosis',
            weight: 15,
            checks: [ran('get-account', sam)],
            hint: 'Check the password expiry date, not just the account status.',
          }),
          makeItem({
            id: 'reset',
            label: `Reset the password for ${sam}`,
            why: 'An expired password cannot be renewed remotely when the change prompt fails.',
            category: 'resolution',
            weight: 30,
            critical: true,
            checks: [effect('password_reset', sam)],
          }),
          makeItem({
            id: 'verify-caller',
            label: 'Verified the caller before the reset',
            why: 'Password resets are the highest-risk account action at the service desk.',
            category: 'safety',
            weight: 15,
            critical: true,
            checks: [ordered(verifyCaller(), effect('password_reset', sam))],
          }),
          makeItem({
            id: 'verify-fix',
            label: 'Rechecked the account after the reset',
            why: 'Confirm the expiry flag cleared so the user is not sent back into the same failure.',
            category: 'diagnosis',
            weight: 10,
            checks: [ordered(effect('password_reset', sam), ran('get-account', sam))],
          }),
          makeItem({
            id: 'note-troubleshooting',
            label: 'Documented the fault and the action taken',
            why: 'A reset without a note looks identical to an unexplained account change.',
            category: 'documentation',
            weight: 10,
            checks: [note('troubleshooting', 20)],
          }),
          makeItem({
            id: 'note-customer',
            label: 'Told the user how to sign in with the temporary password',
            why: 'The handoff is part of the fix: the user has to know what happens next.',
            category: 'documentation',
            weight: 10,
            checks: [note('customer', 20)],
          }),
          makeItem({
            id: 'decision',
            label: 'Resolved the ticket',
            why: 'A password reset is in scope for the service desk; escalation adds delay with no benefit.',
            category: 'resolution',
            weight: 10,
            critical: true,
            checks: [decision('resolved', ['resolved-remote', 'resolved-user-guidance'])],
          }),
        ])
      },
      reference(context) {
        const sam = context.user.samAccountName
        return [
          { type: 'verify-caller' },
          { type: 'command', input: `get-account ${sam}` },
          { type: 'command', input: `reset-password ${sam}` },
          { type: 'command', input: `get-account ${sam}` },
          {
            type: 'note',
            noteKind: 'troubleshooting',
            text: 'Directory record showed the password expired 12 days ago; the self-service change prompt fails off-network. Verified the caller and issued a temporary password.',
          },
          {
            type: 'note',
            noteKind: 'customer',
            text: 'I set a temporary password for you. Sign in, choose a new password when prompted, then reconnect to the VPN.',
          },
        ]
      },
      expectedOutcome: 'resolved',
      expectedCodes: ['resolved-user-guidance'],
    },
    {
      id: 'disabled-account',
      label: 'Disabled account',
      summary: 'The account was disabled by an offboarding workflow and must be escalated.',
      difficulty: 3,
      severity: 'critical',
      subjects: ['Account disabled in error - {firstName} cannot work', 'Disabled account for {firstName} on {hostname}'],
      bodies: [
        'Hi, I started this morning and my account is disabled. I was told my contract was renewed last week and nobody warned me about this. I cannot open anything on {hostname}. My manager is {managerName} - please help, I am losing a day.',
        'I cannot sign in because my account is disabled. HR confirmed yesterday that I am staying on. I need access today to close the dispatch queue. {displayName}, {department}, reports to {managerName}.',
      ],
      symptoms: [
        'Sign-in says the account is disabled',
        'The user says their contract was recently renewed',
        'No self-service path is available',
      ],
      build(context) {
        context.user.status = 'disabled'
        return `status:${context.user.status}`
      },
      rubric(context) {
        const sam = context.user.samAccountName
        return makeRubric('PWD-01', 'disabled-account', [
          makeItem({
            id: 'diagnose-account',
            label: 'Read the directory account state',
            why: 'The status line tells you this is not a password problem, which changes the whole path.',
            category: 'diagnosis',
            weight: 20,
            checks: [ran('get-account', sam)],
          }),
          makeItem({
            id: 'verify-caller',
            label: 'Verified the caller before discussing the account',
            why: 'A disabled account can be a security control. Confirm who you are speaking with before sharing its state.',
            category: 'safety',
            weight: 10,
            critical: true,
            checks: [verifyCaller()],
          }),
          makeItem({
            id: 'no-unlock',
            label: 'Did not unlock the account yourself',
            why: 'Re-enabling a disabled account bypasses the offboarding control and needs the owning team.',
            category: 'safety',
            weight: 10,
            critical: true,
            checks: [absent(effect('account_unlocked', sam))],
          }),
          makeItem({
            id: 'no-reset',
            label: 'Did not reset the password as a workaround',
            why: 'A reset does not fix a disabled account and buries the real issue.',
            category: 'safety',
            weight: 10,
            checks: [absent(effect('password_reset', sam))],
          }),
          makeItem({
            id: 'note-troubleshooting',
            label: 'Recorded the evidence and the reason for escalation',
            why: 'The next team needs the account state, the user’s claim, and what you already ruled out.',
            category: 'documentation',
            weight: 15,
            checks: [note('troubleshooting', 30)],
          }),
          makeItem({
            id: 'note-customer',
            label: 'Set expectations with the user',
            why: 'The user needs to know who owns this now and roughly when to expect an update.',
            category: 'documentation',
            weight: 15,
            checks: [note('customer', 20)],
          }),
          makeItem({
            id: 'decision',
            label: 'Escalated to the Identity team',
            why: 'Only the identity team can re-enable an account that offboarding disabled.',
            category: 'resolution',
            weight: 20,
            critical: true,
            checks: [decision('escalated', ['escalated-identity'])],
          }),
        ])
      },
      reference(context) {
        const sam = context.user.samAccountName
        return [
          { type: 'verify-caller' },
          { type: 'command', input: `get-account ${sam}` },
          {
            type: 'note',
            noteKind: 'troubleshooting',
            text: 'Account is disabled, not locked or expired. User states their contract was renewed and their manager is the listed manager. Re-enabling is outside Tier 1 scope because it reverses an offboarding control.',
          },
          {
            type: 'note',
            noteKind: 'customer',
            text: 'I have escalated this to the Identity team with your manager’s name attached. They own re-enabling the account and will contact you today.',
          },
          {
            type: 'note',
            noteKind: 'resolution',
            text: 'Escalated to Identity with the account state and manager confirmation request.',
          },
        ]
      },
      expectedOutcome: 'escalated',
      expectedCodes: ['escalated-identity'],
    },
  ],
}
