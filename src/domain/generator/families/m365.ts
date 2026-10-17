import type { M365Account } from '../../environment/types'
import type { BuildContext, ScenarioFamily } from '../types'
import { absent, decision, effect, makeItem, makeRubric, note, ordered, ran, verifyCaller } from '../rubric'

function accountFor(context: BuildContext): M365Account {
  const account = context.world.m365.accounts.find((entry) => entry.userId === context.user.id)
  if (!account) {
    throw new Error('Microsoft 365 scenario requires a tenant account')
  }
  return account
}

export const m365Family: ScenarioFamily = {
  id: 'M365-01',
  title: 'Microsoft 365 sign-in',
  category: 'identity',
  variants: [
    {
      id: 'mfa-method-lost',
      label: 'MFA method lost',
      summary: 'The user replaced their phone, so the only registered MFA method is gone.',
      difficulty: 2,
      severity: 'high',
      subjects: ['{firstName} cannot sign in to {tenantName} after a phone upgrade', 'Two-step verification loop for {firstName}'],
      bodies: [
        'I got a new phone over the weekend and now I cannot sign in to my mail or Teams. It asks me to approve the sign-in on my old phone, which I no longer have. The only other option is to set up a new method, and that fails with an error. I need my mail for a client call at 2. {displayName}, {department}.',
        'Sign-in keeps telling me it needs to verify my identity, then says no method is available. I cannot get past that screen on {hostname} or on my phone. Nothing was changed on my account that I know of, but I did swap handsets on Saturday.',
      ],
      symptoms: [
        'Sign-in stops at the multi-factor prompt',
        'The registered method belongs to a phone the user no longer has',
        'The password is accepted before the MFA step fails',
      ],
      build(context) {
        const account = accountFor(context)
        // The registration still exists but points at a phone the user no longer has.
        account.mfaRegistered = true
        account.mfaMethod = 'authenticator'
        account.signInBlocked = false
        account.lastSignInError = 'AADSTS50076'
        account.lastSignInAt = context.world.clock - 35 * 60 * 1000
        account.signInAttempts = 3
        return `mfa:${account.mfaMethod}:stale`
      },
      rubric(context) {
        const sam = context.user.samAccountName
        return makeRubric('M365-01', 'mfa-method-lost', [
          makeItem({
            id: 'verify-caller',
            label: 'Verified the caller before resetting MFA',
            why: 'Clearing MFA methods hands account access to whoever is on the phone, so identity comes first.',
            category: 'safety',
            weight: 10,
            critical: true,
            checks: [ordered(verifyCaller(), effect('mfa_reset', sam))],
          }),
          makeItem({
            id: 'read-sign-in-log',
            label: 'Read the sign-in log',
            why: 'The error code distinguishes a missing method from a block, an expiry, or a disablement.',
            category: 'diagnosis',
            weight: 15,
            checks: [ran('get-signin-log', sam)],
            hint: 'get-signin-log <account> shows MFA state, the block state, and the last AADSTS error.',
          }),
          makeItem({
            id: 'reset-mfa',
            label: 'Cleared the lost MFA method',
            why: 'The old method cannot be approved, so the user has to register a new one.',
            category: 'resolution',
            weight: 25,
            critical: true,
            checks: [effect('mfa_reset', sam)],
          }),
          makeItem({
            id: 'verify-fix',
            label: 'Rechecked the sign-in state after the reset',
            why: 'Confirm the account now asks for registration instead of looping on a missing method.',
            category: 'diagnosis',
            weight: 10,
            checks: [ordered(effect('mfa_reset', sam), ran('get-signin-log', sam))],
          }),
          makeItem({
            id: 'no-password-reset',
            label: 'Did not reset the password as a workaround',
            why: 'The password was never the problem, and a reset would not produce an MFA method.',
            category: 'safety',
            weight: 10,
            checks: [absent(effect('password_reset', sam))],
          }),
          makeItem({
            id: 'note-troubleshooting',
            label: 'Documented the method that was cleared',
            why: 'MFA resets are audited; the note records what was removed and why it was safe.',
            category: 'documentation',
            weight: 10,
            checks: [note('troubleshooting', 20)],
          }),
          makeItem({
            id: 'note-customer',
            label: 'Told the user how to register the new phone',
            why: 'The reset only works if the user knows what the next sign-in will ask for.',
            category: 'documentation',
            weight: 10,
            checks: [note('customer', 20)],
          }),
          makeItem({
            id: 'decision',
            label: 'Resolved the ticket',
            why: 'An MFA method reset is a service desk action once identity is confirmed.',
            category: 'resolution',
            weight: 10,
            critical: true,
            checks: [decision('resolved', ['resolved-user-guidance', 'resolved-remote'])],
          }),
        ])
      },
      reference(context) {
        const sam = context.user.samAccountName
        return [
          { type: 'verify-caller' },
          { type: 'command', input: `get-signin-log ${sam}` },
          { type: 'command', input: `reset-mfa ${sam}` },
          { type: 'command', input: `get-signin-log ${sam}` },
          {
            type: 'note',
            noteKind: 'troubleshooting',
            text: 'Sign-in log showed AADSTS50076 with no registered method. The user confirmed they replaced their handset at the weekend. Verified the caller, then cleared the old authenticator registration so a new method can be enrolled.',
          },
          {
            type: 'note',
            noteKind: 'customer',
            text: 'The old phone is no longer required. Sign in again, choose "set up a new method", and register the authenticator on your new phone. Your password has not changed.',
          },
        ]
      },
      expectedOutcome: 'resolved',
      expectedCodes: ['resolved-user-guidance'],
    },
    {
      id: 'smart-lockout',
      label: 'Smart lockout block',
      summary: 'Repeated sign-ins from a new location caused Microsoft 365 to block the account.',
      difficulty: 2,
      severity: 'medium',
      subjects: ['{firstName} blocked from signing in from home', 'Account blocked after a hotel Wi-Fi sign-in - {firstName}'],
      bodies: [
        'I am working from a hotel this morning and I cannot sign in to mail. It says my account has been locked to protect me. I only tried my password twice and it never asked for a code. My phone mail still shows old messages, so the account exists. Can you clear it?',
        'Since last night I get "your account has been locked" when I open Outlook on {hostname}. I was travelling and used the hotel Wi-Fi. Nobody else on my team is affected. I have a call in an hour.',
      ],
      symptoms: [
        'Sign-in is blocked after a sign-in from an unfamiliar location',
        'The password is correct and the block happens after it is accepted',
        'The account was working before the user travelled',
      ],
      build(context) {
        const account = accountFor(context)
        account.mfaRegistered = true
        account.mfaMethod = 'authenticator'
        account.signInBlocked = true
        account.lastSignInError = 'AADSTS50053'
        account.lastSignInAt = context.world.clock - 40 * 60 * 1000
        account.signInAttempts = 7
        return `blocked:${account.signInAttempts}`
      },
      rubric(context) {
        const sam = context.user.samAccountName
        return makeRubric('M365-01', 'smart-lockout', [
          makeItem({
            id: 'verify-caller',
            label: 'Verified the caller before clearing the block',
            why: 'The block exists because something looked suspicious; confirm who is asking before removing it.',
            category: 'safety',
            weight: 10,
            critical: true,
            checks: [verifyCaller()],
          }),
          makeItem({
            id: 'read-sign-in-log',
            label: 'Read the sign-in log',
            why: 'AADSTS50053 confirms a smart lockout rather than an expired password or a disabled account.',
            category: 'diagnosis',
            weight: 20,
            checks: [ran('get-signin-log', sam)],
            hint: 'The log shows the block flag and the error code from the last attempt.',
          }),
          makeItem({
            id: 'unblock',
            label: 'Cleared the sign-in block',
            why: 'The block is the fault; the credentials and MFA method are fine.',
            category: 'resolution',
            weight: 25,
            critical: true,
            checks: [effect('signin_unblocked', sam)],
          }),
          makeItem({
            id: 'verify-fix',
            label: 'Rechecked the account after unblocking',
            why: 'Confirm the block flag cleared so the next attempt is not rejected again.',
            category: 'diagnosis',
            weight: 10,
            checks: [ordered(effect('signin_unblocked', sam), ran('get-signin-log', sam))],
          }),
          makeItem({
            id: 'no-password-reset',
            label: 'Did not reset the password',
            why: 'A reset does not clear a smart lockout and forces an unnecessary credential change.',
            category: 'safety',
            weight: 10,
            checks: [absent(effect('password_reset', sam))],
          }),
          makeItem({
            id: 'note-troubleshooting',
            label: 'Recorded the block and the travel context',
            why: 'Travel explains the risk signal; the note stops the next person re-investigating from scratch.',
            category: 'documentation',
            weight: 10,
            checks: [note('troubleshooting', 20)],
          }),
          makeItem({
            id: 'note-customer',
            label: 'Told the user to sign in again',
            why: 'The user needs to retry now and should expect a verification prompt from the new location.',
            category: 'documentation',
            weight: 5,
            checks: [note('customer', 15)],
          }),
          makeItem({
            id: 'decision',
            label: 'Resolved the ticket',
            why: 'A confirmed smart lockout is a Tier 1 unblock; escalating it delays the user unnecessarily.',
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
          { type: 'command', input: `get-signin-log ${sam}` },
          { type: 'command', input: `unblock-signin ${sam}` },
          { type: 'command', input: `get-signin-log ${sam}` },
          {
            type: 'note',
            noteKind: 'troubleshooting',
            text: 'Sign-in log showed AADSTS50053 with the block flag set after a hotel sign-in. Password and MFA method are healthy. Verified the caller, cleared the block, and confirmed the account shows no active block.',
          },
          {
            type: 'note',
            noteKind: 'customer',
            text: 'Sign-in is unblocked. Try again now; because you are in a new location you may be asked to approve the sign-in on your phone. The block records itself if it happens again.',
          },
        ]
      },
      expectedOutcome: 'resolved',
      expectedCodes: ['resolved-remote'],
    },
  ],
}
