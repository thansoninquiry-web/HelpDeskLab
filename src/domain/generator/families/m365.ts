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
      summary:
        'The user replaced their phone, so the only registered method is gone and no code can reach them; the proof has to be a call to a line on file.',
      difficulty: 2,
      severity: 'high',
      subjects: ['{firstName} cannot sign in to {tenantName} after a phone upgrade', 'Two-step verification loop for {firstName}'],
      bodies: [
        'I got a new phone over the weekend and now I cannot sign in to my mail or Teams. It asks me to approve the sign-in on the old handset, which I no longer have, and setting up a new method fails with an error. The mobile number on my account is on that old handset too, so a text code will not reach me. I am at my desk in {department} — please ring me back on the desk line on file and I will confirm it is me. I need my mail for a client call at 2. {displayName}.',
        'Sign-in keeps telling me it needs to verify my identity, then says no method is available. I cannot get past that screen on {hostname} or on my phone. Nothing was changed on my account that I know of, but I did swap handsets on Saturday and the old one is gone, so a code will not reach me. I am at my desk in {department} and can take a callback on the desk line you have for me.',
      ],
      symptoms: [
        'Sign-in stops at the multi-factor prompt',
        'The registered method belongs to a handset the user no longer has',
        'The handset that takes a code is out of action, so a code cannot reach the employee',
        'The employee is at their desk and can take a callback on the desk line',
      ],
      build(context) {
        const account = accountFor(context)
        // The registration still exists but points at a handset the user no longer
        // has, and that handset cannot take a code either. The desk line is the
        // one contact that reaches them, so the proof has to be a callback.
        account.mfaRegistered = true
        account.mfaMethod = 'authenticator'
        account.signInBlocked = false
        account.lastSignInError = 'AADSTS50076'
        account.lastSignInAt = context.world.clock - 35 * 60 * 1000
        account.signInAttempts = 3
        context.world.mobileOutOfAction = true
        return `mfa:${account.mfaMethod}:stale;mobileOutOfAction:true`
      },
      rubric(context) {
        const sam = context.user.samAccountName
        return makeRubric('M365-01', 'mfa-method-lost', [
          makeItem({
            id: 'verify-caller',
            label: 'Rang the caller back before resetting MFA',
            why: 'Clearing MFA methods hands account access to whoever is on the phone. The handset that would take a code is out of action, so the proof has to be a call the desk places itself, to a line on file, answered by the person on the ticket.',
            category: 'safety',
            weight: 10,
            critical: true,
            checks: [ordered(verifyCaller('callback'), effect('mfa_reset', sam))],
            hints: [
              'A code will not reach this caller: the handset that takes it is out of action, so sending one proves nothing about who answered.',
              'Use the callback control with the contact that can actually reach them today — the desk line on file.',
              'Ring the desk line back and have them confirm the request; a code sent to the dead handset is a scored miss even if someone reads a number out.',
            ],
          }),
          makeItem({
            id: 'read-sign-in-log',
            label: 'Read the sign-in log',
            why: 'The error code distinguishes a missing method from a block, an expiry, or a disablement.',
            category: 'diagnosis',
            weight: 15,
            checks: [ran('get-signin-log', sam)],
            hints: ['get-signin-log <account> shows MFA state, the block state, and the last AADSTS error.', 'AADSTS50076 means MFA is required; check whether the registered method is still reachable.', 'AADSTS50076 with MFA registered but no reachable method is the exact shape here.'],
          }),
          makeItem({
            id: 'reset-mfa',
            label: 'Cleared the lost MFA method after the callback',
            why: 'The old method cannot be approved, so the user has to register a new one. The reset has to follow the call, because handing out account access cannot be undone.',
            category: 'resolution',
            weight: 25,
            critical: true,
            checks: [ordered(verifyCaller('callback'), effect('mfa_reset', sam))],
            hints: ['The registered method points at a phone the user no longer has.', 'reset-mfa clears the old registration so the next sign-in can enrol a new one.', 'Run reset-mfa <sam>; this clears the stale registration so enrolment can start again.'],
          }),
          makeItem({
            id: 'verify-fix',
            label: 'Rechecked the sign-in state after the reset',
            why: 'Confirm the account now asks for registration instead of looping on a missing method.',
            category: 'diagnosis',
            weight: 10,
            checks: [ordered(effect('mfa_reset', sam), ran('get-signin-log', sam))],
            hints: ['Read the sign-in state again after the reset.', 'The account should ask for a new method instead of looping on the old one.', 'The next get-signin-log should no longer show AADSTS50076 for the old method.'],
          }),
          makeItem({
            id: 'no-password-reset',
            label: 'Did not reset the password as a workaround',
            why: 'The password was never the problem, and a reset would not produce an MFA method.',
            category: 'safety',
            weight: 10,
            checks: [absent(effect('password_reset', sam))],
            hints: ['A password reset does not create an MFA method.', 'Leave the password alone; the problem is the registration.', 'Do not run reset-password; the password was never the failing factor.'],
          }),
          makeItem({
            id: 'note-troubleshooting',
            label: 'Documented the method that was cleared',
            why: 'MFA resets are audited; the note records what was removed and why it was safe.',
            category: 'documentation',
            weight: 10,
            checks: [note('troubleshooting', 20)],
            hints: ['Record which method was cleared and why.', 'MFA resets are audited, so name the handset and how the caller was identified without a code.', 'Example: “Old authenticator registration on a replaced handset; mobile out of action, confirmed by callback to the desk line; cleared with reset-mfa.”'],
          }),
          makeItem({
            id: 'note-customer',
            label: 'Told the user how to register the new phone',
            why: 'The reset only works if the user knows what the next sign-in will ask for.',
            category: 'documentation',
            weight: 10,
            checks: [note('customer', 20)],
            hints: ['Tell the user what the next sign-in will ask for.', 'They should choose “set up a new method” and register the new phone.', 'Say the password is unchanged and the next sign-in will ask to register a method.'],
          }),
          makeItem({
            id: 'decision',
            label: 'Resolved the ticket',
            why: 'An MFA method reset is a service desk action once identity is confirmed.',
            category: 'resolution',
            weight: 10,
            critical: true,
            checks: [decision('resolved', ['resolved-user-guidance', 'resolved-remote'])],
            hints: ['An MFA reset is a Tier 1 action once identity is confirmed.', 'Resolve with user guidance; no escalation is needed.', 'Pick “Resolved with user guidance”; the user still has to enrol the new phone.'],
          }),
        ])
      },
      reference(context) {
        const sam = context.user.samAccountName
        return [
          { type: 'verify-caller', method: 'callback' },
          { type: 'command', input: `get-signin-log ${sam}` },
          { type: 'command', input: `reset-mfa ${sam}` },
          {
            type: 'command',
            input: `get-signin-log ${sam}`,
            label: 'Check the sign-in log again once MFA is re-registered',
          },
          {
            type: 'note',
            noteKind: 'troubleshooting',
            text: 'Sign-in log showed AADSTS50076 with the registered method on a handset the user no longer has. The mobile on file was out of action, so I confirmed the caller by ringing the desk line on file, then cleared the old authenticator registration so a new method can be enrolled.',
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
            hints: ['The block exists because something looked risky; confirm the caller first.', 'Send a code to the person on the ticket before clearing anything.', 'Get the code read-back first; clearing a block for an unverified caller is a scored violation.'],
          }),
          makeItem({
            id: 'read-sign-in-log',
            label: 'Read the sign-in log',
            why: 'AADSTS50053 confirms a smart lockout rather than an expired password or a disabled account.',
            category: 'diagnosis',
            weight: 20,
            checks: [ran('get-signin-log', sam)],
            hints: ['The log shows the block flag and the error code from the last attempt.', 'AADSTS50053 with the block flag confirms a smart lockout, not a bad password.', 'The log should show signInBlocked: true and AADSTS50053 from the hotel sign-in.'],
          }),
          makeItem({
            id: 'unblock',
            label: 'Cleared the sign-in block',
            why: 'The block is the fault; the credentials and MFA method are fine.',
            category: 'resolution',
            weight: 25,
            critical: true,
            checks: [effect('signin_unblocked', sam)],
            hints: ['Clear the block; the credentials and MFA method are healthy.', 'unblock-signin <account> removes the protection flag for this user.', 'Run unblock-signin <sam>; it clears the block without touching credentials or MFA.'],
          }),
          makeItem({
            id: 'verify-fix',
            label: 'Rechecked the account after unblocking',
            why: 'Confirm the block flag cleared so the next attempt is not rejected again.',
            category: 'diagnosis',
            weight: 10,
            checks: [ordered(effect('signin_unblocked', sam), ran('get-signin-log', sam))],
            hints: ['Recheck the sign-in log after unblocking.', 'The block flag and AADSTS50053 should be gone from the latest entry.', 'The follow-up get-signin-log should show the block flag cleared and no new AADSTS error.'],
          }),
          makeItem({
            id: 'no-password-reset',
            label: 'Did not reset the password',
            why: 'A reset does not clear a smart lockout and forces an unnecessary credential change.',
            category: 'safety',
            weight: 10,
            checks: [absent(effect('password_reset', sam))],
            hints: ['Do not reset the password; a lockout is not a credential failure.', 'A reset forces a change and does not clear the block.', 'A reset-password here is a scored safety miss: it does not clear a smart lockout.'],
          }),
          makeItem({
            id: 'note-troubleshooting',
            label: 'Recorded the block and the travel context',
            why: 'Travel explains the risk signal; the note stops the next person re-investigating from scratch.',
            category: 'documentation',
            weight: 10,
            checks: [note('troubleshooting', 20)],
            hints: ['Record the block and the travel context that triggered it.', 'Name the error code and the location so the risk signal is documented.', 'Example: “AADSTS50053 after hotel Wi-Fi; password and MFA healthy; unblocked after verification.”'],
          }),
          makeItem({
            id: 'note-customer',
            label: 'Told the user to sign in again',
            why: 'The user needs to retry now and should expect a verification prompt from the new location.',
            category: 'documentation',
            weight: 5,
            checks: [note('customer', 15)],
            hints: ['Tell the user to try signing in again.', 'Warn them a new-location verification prompt may appear.', 'Mention the new-location prompt so the user is not surprised by the approval request.'],
          }),
          makeItem({
            id: 'decision',
            label: 'Resolved the ticket',
            why: 'A confirmed smart lockout is a Tier 1 unblock; escalating it delays the user unnecessarily.',
            category: 'resolution',
            weight: 10,
            critical: true,
            checks: [decision('resolved', ['resolved-remote', 'resolved-user-guidance'])],
            hints: ['A confirmed smart lockout is a Tier 1 unblock.', 'Resolve it; escalating only delays the user.', 'Resolve it; a confirmed smart lockout is a first-line unblock.'],
          }),
        ])
      },
      reference(context) {
        const sam = context.user.samAccountName
        return [
          { type: 'verify-caller' },
          { type: 'command', input: `get-signin-log ${sam}` },
          { type: 'command', input: `unblock-signin ${sam}` },
          {
            type: 'command',
            input: `get-signin-log ${sam}`,
            label: 'Check the sign-in log again now the block is cleared',
          },
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
