import type { PressureLine } from '../../environment/pressure'
import type { DirectoryUser } from '../../environment/types'
import type { BuildContext, ScenarioFamily } from '../types'
import {
  absent,
  decision,
  denyCaller,
  effect,
  makeItem,
  makeRubric,
  note,
  ordered,
  ran,
  verifyCaller,
} from '../rubric'

/**
 * The account the caller is asking about. It is never the caller's own, which
 * is the point of the scenario: the person on the line has no authority here.
 */
function requestedAccount(context: BuildContext): DirectoryUser {
  const manager = context.world.users.find(
    (candidate) =>
      candidate.id !== context.user.id && candidate.displayName === context.user.managerName,
  )
  return (
    manager ??
    context.world.users.find((candidate) => candidate.id !== context.user.id) ??
    context.user
  )
}

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
        // They came back to their desk after lunch, so the badge on their lanyard
        // and a walk-up with photo ID are both available alongside the phone.
        context.world.callerOnSite = true
        return `status:${context.user.status};callerOnSite:true`
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
            hints: ['The account lookup shows lock state, password expiry, and sign-in hints.', 'Run get-account <sam>; status should read locked rather than disabled or expired.', 'get-account <sam> should print status: locked; that line is the diagnosis.'],
          }),
          makeItem({
            id: 'unlock',
            label: `Unlocked ${sam}`,
            why: 'Tier 1 can clear a lockout once the caller and the account state are confirmed.',
            category: 'resolution',
            weight: 30,
            critical: true,
            checks: [effect('account_unlocked', sam)],
            hints: ['A locked account is cleared with unlock-account, not a password reset.', 'Unlock only after the caller is verified and the state is confirmed.', 'Run unlock-account <sam>; the success line plus a second lookup is the proof.'],
          }),
          makeItem({
            id: 'verify-fix',
            label: 'Rechecked the account after unlocking',
            why: 'A second lookup proves the lockout cleared instead of assuming it did.',
            category: 'diagnosis',
            weight: 15,
            checks: [ordered(effect('account_unlocked', sam), ran('get-account', sam))],
            hints: ['Read the account again after unlocking.', 'A second lookup should show status: active.', 'The second get-account must show status: active after the unlock.'],
          }),
          makeItem({
            id: 'verify-caller',
            label: 'Verified the caller before touching the account',
            why: 'Account changes are a social-engineering target; confirm identity before acting.',
            category: 'safety',
            weight: 15,
            critical: true,
            checks: [ordered(verifyCaller(), effect('account_unlocked', sam))],
            hints: ['Account changes are a social-engineering target; verify before you touch it.', 'Send a code to the person on the ticket and have them read it back.', 'No code read-back means the unlock is a scored unverified change, even if it was the right fix.'],
          }),
          makeItem({
            id: 'note-troubleshooting',
            label: 'Logged troubleshooting notes',
            why: 'Your notes are the evidence trail for the next person who picks up the ticket.',
            category: 'documentation',
            weight: 10,
            checks: [note('troubleshooting', 20)],
            hints: ['Record what you saw, what you changed, and the result.', 'A note of at least 20 characters satisfies this step; name the state change.', 'Example: “Status locked; verified caller by code; unlocked; status active.”'],
          }),
          makeItem({
            id: 'note-customer',
            label: 'Wrote a customer-facing note',
            why: 'The user needs a plain-language update they can act on.',
            category: 'documentation',
            weight: 5,
            checks: [note('customer', 15)],
            hints: ['Give the user a plain next step.', 'Tell them to sign in with their current password and report a repeat.', 'Tell them to sign in with the current password and report a repeat lockout today.'],
          }),
          makeItem({
            id: 'decision',
            label: 'Resolved the ticket instead of escalating',
            why: 'A lockout is a Tier 1 fix; escalating it wastes the user and the next team.',
            category: 'resolution',
            weight: 10,
            critical: true,
            checks: [decision('resolved', ['resolved-remote', 'resolved-user-guidance'])],
            hints: ['A lockout is a Tier 1 fix.', 'Resolve it remotely or with user guidance; do not escalate.', 'Pick “Resolved remotely”; a lockout is Tier 1.'],
          }),
        ])
      },
      reference(context) {
        const sam = context.user.samAccountName
        return [
          { type: 'verify-caller' },
          { type: 'command', input: `get-account ${sam}` },
          { type: 'command', input: `unlock-account ${sam}` },
          {
            type: 'command',
            input: `get-account ${sam}`,
            label: 'Recheck the account now it is unlocked',
          },
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
            hints: ['Check the password expiry date, not just the account status.', 'get-account shows passwordExpired: True, which is a different fault from a lockout.', 'get-account should show passwordExpired: True with status active — not a lockout.'],
          }),
          makeItem({
            id: 'reset',
            label: `Reset the password for ${sam}`,
            why: 'An expired password cannot be renewed remotely when the change prompt fails.',
            category: 'resolution',
            weight: 30,
            critical: true,
            checks: [effect('password_reset', sam)],
            hints: ['An expired password needs a reset, not an unlock.', 'reset-password <sam> clears the expiry and issues a temporary password.', 'Run reset-password <sam>; that clears the expiry and issues the temporary password.'],
          }),
          makeItem({
            id: 'verify-caller',
            label: 'Verified the caller before the reset',
            why: 'Password resets are the highest-risk account action at the service desk.',
            category: 'safety',
            weight: 15,
            critical: true,
            checks: [ordered(verifyCaller(), effect('password_reset', sam))],
            hints: ['A reset is the highest-risk account action; verify first.', 'Use the live code read-back before you reset anything.', 'Reset only after the caller reads back the live code; a reset is the highest-risk action.'],
          }),
          makeItem({
            id: 'verify-fix',
            label: 'Rechecked the account after the reset',
            why: 'Confirm the expiry flag cleared so the user is not sent back into the same failure.',
            category: 'diagnosis',
            weight: 10,
            checks: [ordered(effect('password_reset', sam), ran('get-account', sam))],
            hints: ['Recheck the account after the reset.', 'The expiry flag should clear and the status stay active.', 'The follow-up get-account should show passwordExpired: False.'],
          }),
          makeItem({
            id: 'note-troubleshooting',
            label: 'Documented the fault and the action taken',
            why: 'A reset without a note looks identical to an unexplained account change.',
            category: 'documentation',
            weight: 10,
            checks: [note('troubleshooting', 20)],
            hints: ['Record the expiry evidence and the reset.', 'Say when the password expired and that a temporary one was issued.', 'Example: “Expired 12 days ago; self-service change fails off-network; reset after code read-back.”'],
          }),
          makeItem({
            id: 'note-customer',
            label: 'Told the user how to sign in with the temporary password',
            why: 'The handoff is part of the fix: the user has to know what happens next.',
            category: 'documentation',
            weight: 10,
            checks: [note('customer', 20)],
            hints: ['Explain how to sign in with the temporary password.', 'They should choose a new password at the next prompt.', 'Explain that the temporary password must be changed at the next sign-in prompt.'],
          }),
          makeItem({
            id: 'decision',
            label: 'Resolved the ticket',
            why: 'A password reset is in scope for the service desk; escalation adds delay with no benefit.',
            category: 'resolution',
            weight: 10,
            critical: true,
            checks: [decision('resolved', ['resolved-remote', 'resolved-user-guidance'])],
            hints: ['A reset is in scope for the service desk.', 'Resolve it; escalation adds delay with no benefit.', 'Resolve it with user guidance; escalation only delays the user.'],
          }),
        ])
      },
      reference(context) {
        const sam = context.user.samAccountName
        return [
          { type: 'verify-caller' },
          { type: 'command', input: `get-account ${sam}` },
          { type: 'command', input: `reset-password ${sam}` },
          {
            type: 'command',
            input: `get-account ${sam}`,
            label: 'Recheck the account after the reset',
          },
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
            hints: ['The status line tells you this is a disabled account, not a lockout or an expired password.', 'status: disabled means offboarding owns it, not a lockout or expiry.', 'status: disabled is the line that changes the whole path: do not unlock.'],
            why: 'The status line tells you this is not a password problem, which changes the whole path.',
            category: 'diagnosis',
            weight: 20,
            checks: [ran('get-account', sam)],
          }),
          makeItem({
            id: 'verify-caller',
            label: 'Verified the caller before discussing the account',
            hints: ['Confirm who you are speaking with before you share anything about a disabled account.', 'Send the code and get the read-back before discussing the account state.', 'Get the code read-back before you discuss the directory state with anyone.'],
            why: 'A disabled account can be a security control. Confirm who you are speaking with before sharing its state.',
            category: 'safety',
            weight: 10,
            critical: true,
            checks: [verifyCaller()],
          }),
          makeItem({
            id: 'no-unlock',
            label: 'Did not unlock the account yourself',
            hints: ['Re-enabling an account that offboarding disabled is out of Tier 1 scope, even to get someone back to work.', 'Even to restore service, leave the account disabled and escalate.', 'Do not run unlock-account; re-enabling an offboarded account is a scored critical miss.'],
            why: 'Re-enabling a disabled account bypasses the offboarding control and needs the owning team.',
            category: 'safety',
            weight: 10,
            critical: true,
            checks: [absent(effect('account_unlocked', sam))],
          }),
          makeItem({
            id: 'no-reset',
            label: 'Did not reset the password as a workaround',
            hints: ['A reset does not change a disabled status, so it only buries the real issue.', 'Leave the credentials alone; the status flag is the blocker.', 'A reset-password is also a scored miss: it cannot change a disabled status.'],
            why: 'A reset does not fix a disabled account and buries the real issue.',
            category: 'safety',
            weight: 10,
            checks: [absent(effect('password_reset', sam))],
          }),
          makeItem({
            id: 'note-troubleshooting',
            label: 'Recorded the evidence and the reason for escalation',
            hints: ['Write down the account state, what the user claims, and what you ruled out, so the identity team does not repeat it.', 'Include the manager’s name so the identity team can verify the claim.', 'Example: “Disabled by offboarding; contract renewal claimed; manager named; no changes made.”'],
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
            hints: ['Tell the user who owns this now.', 'Name the Identity team and when they should expect contact.', 'Tell them the Identity team owns re-enabling and will contact them after checking the renewal.'],
          }),
          makeItem({
            id: 'decision',
            label: 'Escalated to the Identity team',
            hints: ['Offboarding owns this account now: escalate to the identity team instead of re-enabling it.', 'Close as escalated to the Identity team; do not resolve it yourself.', 'Escalate to the Identity team; resolving it yourself reverses an offboarding control.'],
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
    {
      id: 'third-party-reset',
      label: 'Reset request for someone else',
      summary: 'A caller asks the service desk to reset a colleague’s password.',
      difficulty: 2,
      severity: 'high',
      subjects: [
        'Password reset for {managerName} - asked by {firstName}',
        'Urgent reset request for {managerName}',
      ],
      bodies: [
        'Hi, this is {firstName} in {department}. {managerName} is travelling today and cannot get into their account. They asked me to call you and get the password reset, then pass the new one on to them. I have their employee ID if you need it to check the account. Could you reset it now? The month-end run has to close today.',
        '{managerName} is locked out on the road and has no signal, so they asked me to sort this out. I am {firstName}, {department}. Reset the password on their account and send the temporary one to me here and I will make sure they get it. This is urgent - the close is at four.',
      ],
      symptoms: [
        'The request is for another person’s account, not the caller’s',
        'The caller offers the account owner’s ID as proof of the request',
        'The new password is to be handed back to the caller',
      ],
      build(context) {
        const target = requestedAccount(context)
        // The caller relays a story about someone else's account, so the claim
        // names that account. If the desk looks it up, the log can settle it.
        context.world.callerClaims = [
          {
            id: 'claimed-target-locked',
            account: target.samAccountName,
            statement: `${target.displayName} is locked out and asked me to get the reset.`,
            expects: { status: 'locked' },
          },
        ]
        return `requestedAccount:${target.samAccountName}`
      },
      rubric(context) {
        const target = requestedAccount(context)
        const sam = target.samAccountName
        return makeRubric('PWD-01', 'third-party-reset', [
          makeItem({
            id: 'identify-account',
            label: `Looked up ${sam} before answering`,
            why: 'The account in the request belongs to someone else, so confirm whose it is before discussing its state.',
            category: 'diagnosis',
            weight: 10,
            checks: [ran('get-account', sam)],
            hints: ['The request names a different person; look their account up instead of the caller’s.', 'get-account on the requested account shows whose it is; the caller is not its owner.', 'get-account on the requested account shows it belongs to them, not to the caller.'],
          }),
          makeItem({
            id: 'deny-request',
            label: 'Refused the third-party reset request',
            hints: ['Refusing is a recorded action: use the deny control under the identity panel.', 'Pick the reason that matches the pretext; the denial is one-way.', 'Choose “Asked for someone else’s account”; the denial is recorded and cannot be repeated.'],
            why: 'Only the account owner can ask for a password reset. A colleague relaying the new password is a classic social-engineering pretext, and the caller’s own identity does not authorise it.',
            category: 'safety',
            weight: 25,
            critical: true,
            checks: [denyCaller()],
          }),
          makeItem({
            id: 'no-target-reset',
            label: `Did not reset ${target.displayName}’s password`,
            hints: ['There is no request from the account owner here, so no reset is authorised.', 'Do not reset even if the account looks broken; authority, not state, is missing.', 'A reset-password on the target is a scored critical miss even if the caller is verified.'],
            why: 'A reset performed on a relayed request hands the account to the person it was meant to protect against.',
            category: 'safety',
            weight: 15,
            critical: true,
            checks: [absent(effect('password_reset', sam))],
          }),
          makeItem({
            id: 'note-troubleshooting',
            label: 'Recorded what was asked and why it was refused',
            why: 'A refusal without a record looks like a missed ticket; Security needs the pretext in writing.',
            category: 'documentation',
            weight: 20,
            checks: [note('troubleshooting', 30)],
            hints: ['Record what was asked and who asked for it.', 'Name the account and the pretext so Security can follow up.', 'Example: “Caller asked for the manager’s reset and offered to relay the password; refused, no changes.”'],
          }),
          makeItem({
            id: 'note-customer',
            label: 'Told the caller how this has to be handled',
            why: 'The caller needs to know the reset has to come from the account owner, not from them.',
            category: 'documentation',
            weight: 10,
            checks: [note('customer', 20)],
            hints: ['Tell the caller how a reset has to be requested.', 'The account owner must contact the desk directly from a number on file.', 'Tell them the owner must call the desk directly from a number on file.'],
          }),
          makeItem({
            id: 'decision',
            label: 'Closed it as denied and reported to Security',
            why: 'A suspected social-engineering attempt is not a resolved ticket; it is a security report.',
            category: 'resolution',
            weight: 20,
            critical: true,
            checks: [decision('escalated', ['denied-social-engineering'])],
            hints: ['A denied social-engineering request is a security report, not a fix.', 'Close it with the denial code that reports it to Security.', 'Pick “Denied (social engineering) — reported to Security”; that is the matching close.'],
          }),
        ])
      },
      reference(context) {
        const target = requestedAccount(context)
        return [
          { type: 'command', input: `get-account ${target.samAccountName}` },
          { type: 'deny-caller' },
          {
            type: 'note',
            noteKind: 'troubleshooting',
            text: `Caller asked for a password reset on ${target.displayName}’s account and offered to pass the new password back. The account owner did not make the request, so I refused it and did not reset anything.`,
          },
          {
            type: 'note',
            noteKind: 'customer',
            text: `${target.displayName} needs to contact us directly from a number on file before any reset can happen. I have not changed the password.`,
          },
          {
            type: 'note',
            noteKind: 'resolution',
            text: 'Denied a third-party reset request and reported the pretext to Security. No account changes were made.',
          },
        ]
      },
      expectedOutcome: 'escalated',
      expectedCodes: ['denied-social-engineering'],
    },
    {
      id: 'impersonated-caller',
      label: 'Caller claiming to be someone else',
      summary:
        'A caller claims to be the employee on the ticket, and the code that would prove it goes to the employee’s own phone.',
      difficulty: 3,
      severity: 'critical',
      subjects: [
        'Locked out and working from a hotel - {firstName}',
        'Unlock and reset for {firstName} - calling from a mobile',
      ],
      bodies: [
        'This is {displayName} in {department}. I am locked out of {hostname} and I am at a hotel this week, so I cannot bring the laptop to anyone. Unlock the account and send me a new password to the phone I am calling from. I will read back whatever code you send me, just please do it now - I am on a client call within the hour.',
        '{displayName} here. My own account will not let me in and I am not at a desk today, only a mobile. Reset the password and unlock it, and I will do the code routine with you. I have done this before, so I know how it goes. {department}, on site at {site} normally.',
      ],
      symptoms: [
        'The caller says they are the account owner and asks for an unlock and a reset',
        'The caller is on a mobile with no access to anything the employee would have',
        'The directory records no lockout, expiry, or disablement on the account',
      ],
      build(context) {
        // The person on the line is not the employee this ticket is about. The
        // code still goes to that employee’s own phone, which the caller is not
        // holding, and the account itself is pinned to a state that needs no
        // change, so nothing supports the story the caller tells.
        context.world.callerImpersonating = true
        context.user.status = 'active'
        context.user.passwordExpired = false
        // The caller's story is what the gate checks against the record. The
        // account is deliberately healthy, so the claimed lockout cannot hold
        // up, and the claim to be the employee can only fail at the identity
        // gate itself.
        context.world.callerClaims = [
          {
            id: 'claimed-lockout',
            account: context.user.samAccountName,
            statement: 'My account is locked out and I need it unlocked.',
            expects: { status: 'locked' },
          },
          {
            id: 'claimed-owner',
            account: context.user.samAccountName,
            statement: `I am ${context.user.displayName}, the account owner.`,
            identity: true,
          },
        ]
        return `callerImpersonating:true;status:${context.user.status};passwordExpired:${context.user.passwordExpired}`
      },
      rubric(context) {
        const sam = context.user.samAccountName
        return makeRubric('PWD-01', 'impersonated-caller', [
          makeItem({
            id: 'diagnose-account',
            label: `Checked ${sam} against the caller’s story`,
            why: 'The caller names a lockout. The directory is the only thing that can say whether that is true, and here it contradicts them.',
            category: 'diagnosis',
            weight: 15,
            checks: [ran('get-account', sam)],
            hints: [
              'The caller has told you which fault they have; nothing has confirmed it yet.',
              'Run get-account <sam> before you decide what this ticket needs.',
              'get-account <sam> shows status: active and passwordExpired: False, so the account is not in the state the caller described.',
            ],
          }),
          makeItem({
            id: 'deny-request',
            label: 'Refused a request from a caller who could not be identified',
            why: 'The live code went to the employee on the ticket, who is not on this call. Nothing was read back, so whoever is asking has not been identified, and an unidentified caller cannot authorise an account change.',
            category: 'safety',
            weight: 25,
            critical: true,
            checks: [denyCaller()],
            hints: [
              'Refusing is a recorded action: use the deny control under the identity panel.',
              'Pick the reason that matches what happened — the caller’s identity was never established.',
              'Choose “Could not verify who is calling”; the denial is recorded and cannot be repeated.',
            ],
          }),
          makeItem({
            id: 'no-reset',
            label: 'Did not reset the password that was asked for',
            why: 'A reset cannot be reversed and cannot be unshared. Handing one to an unidentified caller is the whole point of the attempt.',
            category: 'safety',
            weight: 20,
            critical: true,
            checks: [absent(effect('password_reset', sam))],
            hints: [
              'The password was never reported as the problem, and the caller was never identified.',
              'Leave the credentials alone: nothing in the account needs them changed.',
              'reset-password <sam> is a scored critical miss on this ticket, whatever the caller promised to do next.',
            ],
          }),
          makeItem({
            id: 'note-troubleshooting',
            label: 'Recorded the pretext and the failed read-back',
            why: 'Security needs the caller’s claims in writing, including that the code went to the employee and was never read back. That record is what turns a refusal into a report.',
            category: 'documentation',
            weight: 15,
            checks: [note('troubleshooting', 30)],
            hints: [
              'Write down what the caller claimed and what the code gate showed.',
              'Say that the live code went to the employee, that it was never read back, and that nothing was changed.',
              'Example: “Caller claimed a lockout as Theo Brooks; directory shows active; code sent to the employee’s mobile, not read back; refused, no changes.”',
            ],
          }),
          makeItem({
            id: 'note-customer',
            label: 'Told the caller how this has to be handled',
            why: 'The person on the line has to be told the request cannot be worked without the employee, so the refusal is understood rather than simply unhelpful.',
            category: 'documentation',
            weight: 10,
            checks: [note('customer', 20)],
            hints: [
              'Tell the caller what has to happen instead of a reset.',
              'The employee must contact the desk themselves from a number we hold.',
              'Say the account owner has to call the desk directly before anything is changed.',
            ],
          }),
          makeItem({
            id: 'decision',
            label: 'Closed it as denied and reported it to Security',
            why: 'A suspected impersonation is a security report, not a resolved ticket: the next account this caller tries is Security’s problem to anticipate.',
            category: 'resolution',
            weight: 15,
            critical: true,
            checks: [decision('escalated', ['denied-social-engineering'])],
            hints: [
              'A denied request is not a fix; identify the close that reports it.',
              'Close it with the denial code that reports the attempt to Security.',
              'Pick “Denied (social engineering) — reported to Security”; that is the matching close.',
            ],
          }),
        ])
      },
      reference(context) {
        const sam = context.user.samAccountName
        return [
          { type: 'command', input: `get-account ${sam}` },
          { type: 'deny-caller' },
          {
            type: 'note',
            noteKind: 'troubleshooting',
            text: `Caller claimed to be ${context.user.displayName} and asked for an unlock and a password reset. The directory shows the account active with no expiry. The live code went to the employee’s own mobile and was never read back, so nobody on the call was identified. Refused the request and changed nothing.`,
          },
          {
            type: 'note',
            noteKind: 'customer',
            text: `${context.user.displayName} has to contact the service desk directly from a number on file before any unlock or reset can happen. Nothing on the account has been changed.`,
          },
          {
            type: 'note',
            noteKind: 'resolution',
            text: 'Denied an unverified request made in the employee’s name and reported the impersonation attempt to Security. No account changes were made.',
          },
        ]
      },
      expectedOutcome: 'escalated',
      expectedCodes: ['denied-social-engineering'],
    },
    {
      id: 'chat-relay-reset',
      label: 'Reset relayed in chat by a colleague',
      summary:
        'A helpdesk colleague asks in chat for someone else’s reset, and the mailbox behind that account is quietly copying its mail outside.',
      difficulty: 3,
      severity: 'critical',
      subjects: [
        'Chat request - reset for {managerName}, sent by {firstName}',
        'Reset relayed through chat for {managerName}',
      ],
      bodies: [
        '{firstName} here, covering the service desk this week. {managerName} just messaged me in chat: they are locked out ahead of the month-end close and asked me to get their password reset. Reset it and drop the temporary one back to me in this thread and I will pass it on. I have their employee ID if the account needs it. Please move on this one - the close is at four.',
        'Message relayed from chat: {managerName} cannot get into their account and asked me to sort the reset for them. I am {firstName} in {department}, on the desk this week. Reset the password and send the temporary one to me here, and I will make sure they get it. They have already tried signing in a few times, so it may show as locked.',
      ],
      symptoms: [
        'The request arrives in chat from an internal colleague, not from the account owner',
        'The colleague asks for the temporary password to be handed back in the same thread',
        'The colleague offers the account owner’s employee ID as proof of the request',
      ],
      build(context) {
        const target = requestedAccount(context)
        // The account in chat is a colleague's, so a code still goes to that
        // colleague's own phone. Whoever is typing is not them: the gate cannot
        // be read back, and the mailbox record shows the account quietly
        // copying its mail outside while it asks for someone else's password.
        context.world.callerImpersonating = true
        context.user.status = 'active'
        context.user.passwordExpired = false
        const mailbox = context.world.mail.mailboxes.find(
          (entry) => entry.userId === context.user.id,
        )
        if (mailbox) {
          mailbox.forwarding = 'it-desk-backup@larkspur-help.example'
        }
        // The account the request is about is healthy, so the relayed lockout
        // story can be checked against the directory instead of trusted.
        target.status = 'active'
        target.passwordExpired = false
        context.world.callerClaims = [
          {
            id: 'claimed-target-locked',
            account: target.samAccountName,
            statement: `${target.displayName} is locked out and asked me in chat to get the reset.`,
            expects: { status: 'locked' },
          },
          {
            id: 'claimed-colleague',
            account: context.user.samAccountName,
            statement: `I am ${context.user.displayName}, covering the service desk, and I can read back any code you send.`,
            identity: true,
          },
        ]
        return `chatRelay:${context.user.samAccountName}->${target.samAccountName};status:${target.status};forwarding:${mailbox?.forwarding ?? 'none'}`
      },
      rubric(context) {
        const target = requestedAccount(context)
        const targetSam = target.samAccountName
        const relaySam = context.user.samAccountName
        return makeRubric('PWD-01', 'chat-relay-reset', [
          makeItem({
            id: 'identify-account',
            label: `Looked up ${targetSam} instead of taking the chat’s word`,
            why: 'The chat says the owner is locked out. That is a claim about someone else’s account, and the directory is the only thing that can settle it.',
            category: 'diagnosis',
            weight: 10,
            checks: [ran('get-account', targetSam)],
            hints: [
              'The message describes an account state; nothing has confirmed it yet.',
              'Look up the account the chat is about before deciding what it needs.',
              'get-account on the requested account shows it active and not expired, so the lockout story does not hold.',
            ],
          }),
          makeItem({
            id: 'read-requester-mailbox',
            label: `Read ${relaySam}’s mailbox before trusting the chat`,
            why: 'The request is only as good as the account behind it. A helpdesk account copying its mail outside the organisation is not a trustworthy relay, whatever the chat says about the owner.',
            category: 'diagnosis',
            weight: 15,
            checks: [ran('get-mailbox', relaySam)],
            hints: [
              'The chat names a colleague, not the account owner. Check the account that is doing the asking.',
              'The mailbox record says where that account’s own mail is going right now.',
              'Run get-mailbox on the colleague; the forwarding line points outside the organisation, so the account asking is itself in trouble.',
            ],
          }),
          makeItem({
            id: 'deny-request',
            label: 'Refused the relayed reset request',
            why: 'A colleague relaying a password is still not the account owner. Neither their job nor the chat thread authorises a reset, and a compromised helpdesk account is exactly what an attacker would use to ask.',
            category: 'safety',
            weight: 25,
            critical: true,
            checks: [denyCaller()],
            hints: [
              'Refusing is a recorded action: use the deny control under the identity panel.',
              'Pick the reason that matches what was asked for, not who appeared to ask.',
              'Choose “Asked for someone else’s account”; the denial is recorded and cannot be repeated.',
            ],
          }),
          makeItem({
            id: 'no-reset',
            label: `Did not reset ${target.displayName}’s password`,
            why: 'The owner never asked, and the account that did is compromised. A temporary password handed into chat cannot be taken back.',
            category: 'safety',
            weight: 15,
            critical: true,
            checks: [absent(effect('password_reset', targetSam))],
            hints: [
              'No request has come from the account owner, so no reset is authorised.',
              'Do not reset even if the chat sounds like a colleague with a good reason.',
              'A reset-password on the target is a scored critical miss here, whatever the mailbox shows.',
            ],
          }),
          makeItem({
            id: 'note-troubleshooting',
            label: 'Recorded the relay, the mailbox, and the failed code',
            why: 'Security needs the whole chain in writing: who asked, what their mailbox showed, and what the gate answered when they could not read the code.',
            category: 'documentation',
            weight: 15,
            checks: [note('troubleshooting', 30)],
            hints: [
              'Write down who asked, how they asked, and what the record showed.',
              'Name the forwarding on the asking account and what happened at the identity gate.',
              'Example: “Chat relay from a desk colleague; target active; sender’s mailbox forwards outside; code not read back; refused, no reset.”',
            ],
          }),
          makeItem({
            id: 'note-customer',
            label: 'Told the requester how this has to be handled',
            why: 'The person in the chat needs a clear answer, and the account owner needs to know the reset has to come from them.',
            category: 'documentation',
            weight: 5,
            checks: [note('customer', 20)],
            hints: [
              'Give the requester a plain next step.',
              'The account owner has to ask the desk directly from a number on file.',
              'Say the owner must contact the desk directly and that nothing has been changed.',
            ],
          }),
          makeItem({
            id: 'decision',
            label: 'Closed it as denied and reported to Security',
            why: 'A compromised internal account asking for credentials is a security report, not a resolved ticket.',
            category: 'resolution',
            weight: 15,
            critical: true,
            checks: [decision('escalated', ['denied-social-engineering'])],
            hints: [
              'A request that has to be refused is not a fix.',
              'Close it with the denial code that reports it.',
              'Pick “Denied (social engineering) — reported to Security”; that is the matching close.',
            ],
          }),
        ])
      },
      reference(context) {
        const target = requestedAccount(context)
        return [
          { type: 'command', input: `get-account ${target.samAccountName}` },
          {
            type: 'command',
            input: `get-mailbox ${context.user.samAccountName}`,
            label: 'Read the mailbox of the colleague who asked',
          },
          { type: 'deny-caller' },
          {
            type: 'note',
            noteKind: 'troubleshooting',
            text: `Chat asked for a password reset on ${target.displayName}’s account on the owner’s behalf. The directory shows the account active, and the asking colleague’s mailbox is forwarding outside the organisation, so the account in chat cannot be trusted. The live code went to the colleague’s own phone and was never read back. Refused the request and changed nothing.`,
          },
          {
            type: 'note',
            noteKind: 'customer',
            text: `${target.displayName} has to contact the service desk directly from a number on file before any reset can happen. Nothing has been changed.`,
          },
          {
            type: 'note',
            noteKind: 'resolution',
            text: 'Denied a reset relayed through chat by a compromised helpdesk account and reported it to Security. No account changes were made.',
          },
        ]
      },
      expectedOutcome: 'escalated',
      expectedCodes: ['denied-social-engineering'],
    },
    {
      id: 'callback-verification',
      label: 'Locked out with the phone out of action',
      summary:
        'The account is locked and the handset that would take a code cannot reach the employee, so the proof has to be a call to a line on file.',
      difficulty: 2,
      severity: 'high',
      subjects: [
        'Locked out and my phone is out of action - {firstName}',
        'Unlock {firstName} ({department}) - no working mobile today',
      ],
      bodies: [
        'Hi, this is {displayName} in {department}. I am locked out of {hostname} and I am at my desk, so please do not bother sending a code - the phone that takes those has been out of action since Monday. Ring me back on the number you have for me and I will confirm whatever you need. The sooner this is cleared the better; I am sharing a machine until it is.',
        'I cannot sign in to {hostname} - it says the account is locked. My mobile is out of action this week, so a text code will not reach me at all. I am at my desk in {department} and happy to take a call back to confirm it is really me. Please unlock the account.',
      ],
      symptoms: [
        'Sign-in is rejected with an account lockout message',
        'The employee says the handset that takes codes is out of action',
        'The employee is at their desk and can take a call back',
      ],
      build(context) {
        context.user.status = 'locked'
        context.user.passwordExpired = false
        // The phone on file still takes a code and still rings; there is simply
        // nobody able to read anything back from it, so a call to the desk line
        // is the only check that reaches the employee.
        context.world.mobileOutOfAction = true
        return `status:${context.user.status};mobileOutOfAction:true`
      },
      rubric(context) {
        const sam = context.user.samAccountName
        return makeRubric('PWD-01', 'callback-verification', [
          makeItem({
            id: 'diagnose-account',
            label: 'Checked the directory account state',
            why: 'Lockout, expiry, and disablement need different fixes, so confirm which one applies before changing anything.',
            category: 'diagnosis',
            weight: 15,
            checks: [ran('get-account', sam)],
            hints: ['The account lookup shows lock state, password expiry, and sign-in hints.', 'Run get-account <sam>; status should read locked rather than disabled or expired.', 'get-account <sam> should print status: locked; that line is the diagnosis.'],
          }),
          makeItem({
            id: 'verify-by-callback',
            label: 'Rang the caller back on a line on file before touching the account',
            why: 'The code is not available on this ticket — the handset that would take it cannot reach anyone — so the proof has to be a call the desk places itself, to a number on file, answered by the person on the ticket.',
            category: 'safety',
            weight: 25,
            critical: true,
            checks: [verifyCaller('callback')],
            hints: [
              'A code will not reach this caller: sending one proves nothing about who answered the line.',
              'Use the callback control with the contact that can actually reach them today.',
              'Ring the desk line back and let them confirm the request; a code sent to the dead handset is a scored miss even if someone reads a number out.',
            ],
          }),
          makeItem({
            id: 'unlock',
            label: `Unlocked ${sam} after the callback`,
            why: 'Tier 1 can clear a lockout once the caller and the account state are confirmed. The callback has to come first, because the unlock cannot be undone.',
            category: 'resolution',
            weight: 25,
            critical: true,
            checks: [ordered(verifyCaller('callback'), effect('account_unlocked', sam))],
            hints: ['A locked account is cleared with unlock-account, not a password reset.', 'Ring the caller back first; the unlock has to follow the confirmation, not precede it.', 'Run unlock-account <sam> after the callback; the success line plus a second lookup is the proof.'],
          }),
          makeItem({
            id: 'verify-fix',
            label: 'Rechecked the account after unlocking',
            why: 'A second lookup proves the lockout cleared instead of assuming it did.',
            category: 'diagnosis',
            weight: 10,
            checks: [ordered(effect('account_unlocked', sam), ran('get-account', sam))],
            hints: ['Read the account again after unlocking.', 'A second lookup should show status: active.', 'The second get-account must show status: active after the unlock.'],
          }),
          makeItem({
            id: 'note-troubleshooting',
            label: 'Logged the callback as the evidence',
            why: 'The note is what shows how the caller was identified when no code could be used, and which number proved it.',
            category: 'documentation',
            weight: 10,
            checks: [note('troubleshooting', 25)],
            hints: ['Record what you saw, how you identified the caller, and the result.', 'Name the line you rang back on, since no code was used.', 'Example: “Status locked; code not usable (handset out of action); confirmed by callback to the desk line; unlocked; status active.”'],
          }),
          makeItem({
            id: 'note-customer',
            label: 'Wrote a customer-facing note',
            why: 'The user needs a plain-language update they can act on, including what to do while their phone is out of action.',
            category: 'documentation',
            weight: 5,
            checks: [note('customer', 15)],
            hints: ['Give the user a plain next step.', 'Tell them to sign in with their current password and to report a repeat.', 'Say the account is unlocked, no password changed, and to call back if it locks again today.'],
          }),
          makeItem({
            id: 'decision',
            label: 'Resolved the ticket instead of escalating',
            why: 'A lockout is a Tier 1 fix and a callback is a check Tier 1 can place; escalating it wastes the user and the next team.',
            category: 'resolution',
            weight: 10,
            critical: true,
            checks: [decision('resolved', ['resolved-remote', 'resolved-user-guidance'])],
            hints: ['A lockout is a Tier 1 fix.', 'Resolve it remotely or with user guidance; do not escalate.', 'Pick “Resolved remotely”; a lockout is Tier 1.'],
          }),
        ])
      },
      reference(context) {
        const sam = context.user.samAccountName
        return [
          { type: 'verify-caller', method: 'callback' },
          { type: 'command', input: `get-account ${sam}` },
          { type: 'command', input: `unlock-account ${sam}` },
          {
            type: 'command',
            input: `get-account ${sam}`,
            label: 'Recheck the account now it is unlocked',
          },
          {
            type: 'note',
            noteKind: 'troubleshooting',
            text: 'Caller was locked out and their handset is out of action, so a code could not reach them. Directory confirmed the lockout, the caller was confirmed by a callback to the desk line on file, the account was unlocked, and the status returned to active. No password was changed.',
          },
          {
            type: 'note',
            noteKind: 'customer',
            text: 'Your account is unlocked and no new password was issued. Sign in with your current password and call us back if it locks again today.',
          },
        ]
      },
      expectedOutcome: 'resolved',
      expectedCodes: ['resolved-remote'],
    },
    {
      id: 'pressured-lockout',
      label: 'Urgent caller pushing for a fix',
      summary:
        'The account is locked and the caller demands an unlock and a reset immediately, without any diagnostic step.',
      difficulty: 2,
      severity: 'critical',
      subjects: [
        'URGENT - unlock {firstName} now, client call in ten minutes',
        '{firstName} is locked out and wants this fixed immediately',
      ],
      bodies: [
        'This is {displayName} in {department}. I am locked out of {hostname} and I am due on a call with a client in ten minutes. Do not keep me on the line with questions - just unlock the account and send me a new password so I can get in. I will sort the password out later, I just need to be working now.',
        'I cannot sign in to {hostname} and I do not have time for troubleshooting. My manager {managerName} told me the service desk can fix this in a minute. Unlock it and reset the password, then send the new one to me here. This is holding up work at {site} today.',
      ],
      symptoms: [
        'The caller demands an unlock and a password reset, in that order and at once',
        'Diagnostic questions are refused: the caller wants the fix before any checks',
        'The caller keeps cutting in to press for the fix while the desk works',
        'The request is marked urgent and cites a client call in ten minutes',
      ],
      build(context) {
        context.user.status = 'locked'
        return `status:${context.user.status}`
      },
      rubric(context) {
        const sam = context.user.samAccountName
        return makeRubric('PWD-01', 'pressured-lockout', [
          makeItem({
            id: 'diagnose-first',
            label: 'Checked the account state before changing it',
            why: 'The caller names the fix, not the fault. Only the directory says whether the account is locked, disabled, or expired, and urgency is not evidence.',
            category: 'diagnosis',
            weight: 15,
            critical: true,
            checks: [ordered(ran('get-account', sam), effect('account_unlocked', sam))],
            hints: ['The caller has told you which fix they want; look up the account before you act on it.', 'Run get-account <sam> before anything changes, however urgent the call sounds.', 'get-account <sam> should print status: locked before you unlock anything; a change made first is a guess.'],
          }),
          makeItem({
            id: 'verify-caller',
            label: 'Verified the caller before touching the account',
            why: 'Urgency is the pressure that gets account changes made without verification, and a locked-out caller is exactly who an attacker claims to be.',
            category: 'safety',
            weight: 20,
            critical: true,
            checks: [ordered(verifyCaller(), effect('account_unlocked', sam))],
            hints: ['A demand for speed is the classic pretext: confirm who you are speaking with first.', 'Send a code to the person on the ticket and have them read it back before any change.', 'No read-back means the unlock is a scored unverified change, even though the caller was in a hurry.'],
          }),
          makeItem({
            id: 'unlock',
            label: `Unlocked ${sam}`,
            why: 'A lockout is cleared by unlocking it. The reset the caller asked for does not clear a lock and was never needed.',
            category: 'resolution',
            weight: 25,
            critical: true,
            checks: [effect('account_unlocked', sam)],
            hints: ['The fix for a lockout is unlock-account, not the reset the caller asked for.', 'Unlock once the state is confirmed and the caller is verified.', 'Run unlock-account <sam>; the success line is the fix.'],
          }),
          makeItem({
            id: 'no-reset',
            label: 'Did not reset the password the caller asked for',
            why: 'A reset issued on demand hands out credentials and hides the real fault. Being asked for one is a reason to slow down, not to comply.',
            category: 'safety',
            weight: 15,
            checks: [absent(effect('password_reset', sam))],
            hints: ['The caller asked for a reset; the account does not need one.', 'Nothing in the account suggests the password is the problem, so leave it alone.', 'reset-password <sam> is a scored miss here: a lockout is not a forgotten password.'],
          }),
          makeItem({
            id: 'verify-fix',
            label: 'Rechecked the account after unlocking',
            why: 'Confirming the state afterwards is what separates a fix from quieting the caller.',
            category: 'diagnosis',
            weight: 5,
            checks: [ordered(effect('account_unlocked', sam), ran('get-account', sam))],
            hints: ['Read the account again after the unlock.', 'A second lookup should show status: active.', 'The second get-account must show status: active; that is the proof the lockout cleared.'],
          }),
          makeItem({
            id: 'note-troubleshooting',
            label: 'Recorded the demand and the evidence',
            why: 'The note is what shows a rushed call was worked in order, and it records what you refused as well as what you did.',
            category: 'documentation',
            weight: 10,
            checks: [note('troubleshooting', 25)],
            hints: ['Write down what the caller demanded and what you checked before acting.', 'Name the state you saw, and say that no reset was issued.', 'Example: “Caller demanded an immediate reset; status: locked; verified by code; unlocked; no password change.”'],
          }),
          makeItem({
            id: 'note-customer',
            label: 'Told the caller what was done and what was not',
            why: 'The caller has to know the account is unlocked and that no new password was issued, or they will ask for one again.',
            category: 'documentation',
            weight: 5,
            checks: [note('customer', 15)],
            hints: ['Explain the unlock and that no password was changed.', 'Tell them to sign in with the current password and to call back if it locks again.', 'Say the account is unlocked, no new password was issued, and to report a repeat lockout the same day.'],
          }),
          makeItem({
            id: 'decision',
            label: 'Resolved the ticket instead of escalating',
            why: 'A lockout is a Tier 1 fix however the request was framed; urgency is not a reason to pass it on.',
            category: 'resolution',
            weight: 5,
            critical: true,
            checks: [decision('resolved', ['resolved-remote', 'resolved-user-guidance'])],
            hints: ['The urgency does not change the scope: a lockout is a Tier 1 fix.', 'Resolve it remotely or with user guidance rather than passing it on.', 'Pick “Resolved remotely”; pressure is not an escalation reason.'],
          }),
        ])
      },
      reference(context) {
        const sam = context.user.samAccountName
        return [
          { type: 'verify-caller' },
          { type: 'command', input: `get-account ${sam}` },
          { type: 'command', input: `unlock-account ${sam}` },
          {
            type: 'command',
            input: `get-account ${sam}`,
            label: 'Recheck the account now it is unlocked',
          },
          {
            type: 'note',
            noteKind: 'troubleshooting',
            text: 'Caller demanded an immediate unlock and reset on an urgent call. Looked the account up first: it was locked, and the password was not expired. Verified the caller by code, unlocked the account, and confirmed the status returned to active. No password change was made.',
          },
          {
            type: 'note',
            noteKind: 'customer',
            text: 'Your account is unlocked and no new password was issued. Sign in with your current password and let us know if it locks again today.',
          },
        ]
      },
      pressure: [
        {
          id: 'pressured-reset',
          trigger: { kind: 'obeyed', command: 'reset-password' },
          message:
            'There we go — that is what I asked for. Send the new password through to me here and I will be out of your way.',
        },
        {
          id: 'pressured-unverified-change',
          trigger: { kind: 'acted-first', effect: 'account_unlocked', beforeVerified: true },
          message:
            'No questions and no code, just done. Perfect — now send that password reset through as well.',
        },
        {
          id: 'pressured-blind-change',
          trigger: { kind: 'acted-first', effect: 'account_unlocked', beforeCommand: 'get-account' },
          message:
            'Two minutes, and you never even opened the account. Unlock first, ask later — that is how this should work.',
        },
        // The desk was warned about the change it just made and carried on. These
        // two answer being ignored, so they sit ahead of the stall lines once the
        // warning has been said.
        {
          id: 'pressured-ignored-warning',
          trigger: { kind: 'stalled', afterSteps: 4, afterMinutes: 3 },
          onceSaid: ['pressured-unverified-change', 'pressured-blind-change'],
          message:
            'You have already changed it and you still have not checked who I am. Keep going like that — it is working out well for me.',
        },
        {
          id: 'pressured-hands-over',
          trigger: { kind: 'stalled', afterSteps: 6, afterMinutes: 6 },
          onceSaid: ['pressured-ignored-warning'],
          message:
            'This is the part where you send the new password through to me. Nobody has asked me to prove a thing, and I would like to keep it that way.',
        },
        {
          id: 'pressured-waiting',
          trigger: { kind: 'stalled', afterSteps: 3, afterMinutes: 2 },
          message:
            'Hello? Are you still there? I am on a clock — unlock the account and send the new password.',
        },
        {
          id: 'pressured-hurry',
          trigger: { kind: 'stalled', afterSteps: 6, afterMinutes: 5 },
          message:
            'I have answered everything twice now. Skip the checks: unlock the account and reset my password.',
        },
        {
          id: 'pressured-escalates',
          trigger: { kind: 'stalled', afterSteps: 9, afterMinutes: 8 },
          message:
            'This is ridiculous. I am calling my manager the moment we hang up. Unlock the account.',
        },
      ] satisfies readonly PressureLine[],
      expectedOutcome: 'resolved',
      expectedCodes: ['resolved-remote'],
    },
  ],
}
