import { teamShare } from '../../environment/shares'
import type { BuildContext, ScenarioFamily } from '../types'
import {
  absent,
  decision,
  effect,
  handoffNote,
  makeItem,
  makeRubric,
  note,
  ordered,
  ran,
  verifyCaller,
} from '../rubric'

function teamFor(context: BuildContext) {
  const team = teamShare(context.world, context.user)
  if (!team) {
    throw new Error('Share scenario requires a department share and group')
  }
  return team
}

export const fileShareFamily: ScenarioFamily = {
  id: 'FS-01',
  title: 'Shared drives and permissions',
  category: 'access',
  variants: [
    {
      id: 'missing-group-membership',
      label: 'Missing group membership',
      summary: 'The user was removed from the read-write group, so the share is read-only.',
      difficulty: 2,
      severity: 'medium',
      subjects: ['{firstName} cannot save to the {shareName} share', 'Read-only access on {sharePath} for {firstName}'],
      bodies: [
        'I can open the {shareName} folder but every file says read-only, so I cannot save the updated forecast. Nothing has changed on my laptop. A colleague in my team can edit the same files. Can you check my access? {displayName}, {department}.',
        'Since this morning the {shareName} drive will not let me save anything. I get "you need permission to perform this action". I could edit these files last week and my manager says the folder has not moved.',
      ],
      symptoms: [
        'The share opens but documents cannot be saved',
        'A colleague in the same team can edit the same files',
        'The user was recently moved between teams',
      ],
      build(context) {
        const { group } = teamFor(context)
        group.members = group.members.filter((id) => id !== context.user.id)
        return `group:${group.name}:${context.user.samAccountName}`
      },
      rubric(context) {
        const { group } = teamFor(context)
        const groupName = group.name
        const sam = context.user.samAccountName

        return makeRubric('FS-01', 'missing-group-membership', [
          makeItem({
            id: 'verify-caller',
            label: 'Verified the caller before changing access',
            why: 'Adding someone to a group that can change finance files is a permission grant, so identity comes first.',
            category: 'safety',
            weight: 10,
            critical: true,
            checks: [ordered(verifyCaller(), effect('group_member_added', `${groupName}/${sam}`))],
            hints: ['Adding someone to a finance group grants write access, so prove who is asking.', 'Send a code to the caller and have them read it back before changing membership.', 'Without a code read-back, add-group-member is a scored unverified change.'],
          }),
          makeItem({
            id: 'inspect-share',
            label: 'Inspected the effective access and the entries',
            why: 'The tool separates "denied" from "allowed but read-only", which changes the fix completely.',
            category: 'diagnosis',
            weight: 20,
            checks: [ran('get-share-access')],
            hints: ['get-share-access <share> <account> shows effective access, the groups behind it, and every entry.', 'Compare effective access with the group list: read-only through FS-All-Users means the write group is missing.', 'Expect effective access Read via FS-All-Users, with the write group absent from the entries.'],
          }),
          makeItem({
            id: 'add-member',
            label: `Restored membership of ${groupName}`,
            why: 'Group membership is what grants change access; editing individual file permissions is not the fix.',
            category: 'resolution',
            weight: 25,
            critical: true,
            checks: [effect('group_member_added', `${groupName}/${sam}`)],
            hints: ['Restore the missing group membership; do not edit individual files.', 'add-group-member <group> <sam> is the exact fix for this share.', 'Run add-group-member FS-Finance-RW <sam>; group membership is the grant, not file permissions.'],
          }),
          makeItem({
            id: 'verify-access',
            label: 'Rechecked access after the change',
            why: 'Membership is only the fix once the effective access reports change again.',
            category: 'diagnosis',
            weight: 15,
            checks: [
              ordered(
                effect('group_member_added', `${groupName}/${sam}`),
                ran('get-share-access'),
              ),
            ],
            hints: ['Recheck effective access after adding the membership.', 'The next get-share-access should report Change, not Read.', 'The next get-share-access should report Change, with the write group listed.'],
          }),
          makeItem({
            id: 'no-deny-removal',
            label: 'Did not remove a deny entry',
            why: 'There was no deny entry here; removing permissions you did not diagnose creates a second problem.',
            category: 'safety',
            weight: 5,
            checks: [absent(effect('share_deny_removed'))],
            hints: ['There is no deny entry in this scenario.', 'Removing a deny you did not diagnose creates a second, worse problem.', 'Do not run remove-share-deny; there is no deny entry in this scenario to remove.'],
          }),
          makeItem({
            id: 'note-troubleshooting',
            label: 'Documented the group that was missing',
            why: 'The next access request for this user should not start from zero.',
            category: 'documentation',
            weight: 10,
            checks: [note('troubleshooting', 20)],
            hints: ['Record the group that was missing and when access last worked.', 'Name the group and the user so the next access request starts with context.', 'Example: “User missing from FS-Finance-RW; effective access Read; restored membership.”'],
          }),
          makeItem({
            id: 'note-customer',
            label: 'Told the user to reopen the folder',
            why: 'Windows caches the old token until the share is reopened or the session refreshes.',
            category: 'documentation',
            weight: 5,
            checks: [note('customer', 15)],
            hints: ['Tell the user to close and reopen the folder.', 'Windows keeps the old token until the share is reopened or the session refreshes.', 'Tell them to close and reopen the folder so the new token is used.'],
          }),
          makeItem({
            id: 'decision',
            label: 'Resolved the ticket',
            why: 'Restoring a group membership is within the service desk remit after verification.',
            category: 'resolution',
            weight: 10,
            critical: true,
            checks: [decision('resolved', ['resolved-remote', 'resolved-user-guidance'])],
            hints: ['Restoring a group membership is service desk work after verification.', 'Resolve it; no escalation is needed.', 'Resolve it; membership restoration is within Tier 1 after verification.'],
          }),
        ])
      },
      reference(context) {
        const { share, group } = teamFor(context)
        const groupName = group.name
        const sam = context.user.samAccountName

        return [
          { type: 'verify-caller' },
          { type: 'command', input: `get-share-access ${share.name} ${sam}` },
          { type: 'command', input: `add-group-member ${groupName} ${sam}` },
          {
            type: 'command',
            input: `get-share-access ${share.name} ${sam}`,
            label: 'Read effective access again now the group is restored',
          },
          {
            type: 'note',
            noteKind: 'troubleshooting',
            text: `${sam} was missing from ${groupName}, which is the entry that grants change access to ${share.path}. Effective access reported read-only through FS-All-Users. Restored the group membership and confirmed change access afterwards.`,
          },
          {
            type: 'note',
            noteKind: 'customer',
            text: 'Your access to the share is restored. Close and reopen the folder window, then try saving again; you should be able to edit the files now.',
          },
        ]
      },
      expectedOutcome: 'resolved',
      expectedCodes: ['resolved-remote'],
    },
    {
      id: 'explicit-deny',
      label: 'Explicit deny from a retention hold',
      summary: 'An explicit deny entry blocks the user even though their group still grants access.',
      difficulty: 3,
      severity: 'high',
      subjects: ['Access denied on {sharePath} for {firstName}', '{firstName} blocked from the {shareName} share by policy'],
      bodies: [
        'I cannot open the {shareName} folder at all now. It says access is denied, and this worked fine last month. I have not changed teams and my colleagues can still get in. I was told there may be a hold on some finance material, but I need to know who can lift it.',
        'Every attempt to open {sharePath} is denied. My manager says I am still in the right team, so I do not understand why it stopped. Please do not just give me more permissions - I would like to know what is blocking it.',
      ],
      symptoms: [
        'Access is denied even though group membership is unchanged',
        'The deny started without any change on the user’s device',
        'Finance material may be under a retention hold',
      ],
      build(context) {
        const { share } = teamFor(context)
        share.grants.push({
          principal: { kind: 'user', samAccountName: context.user.samAccountName },
          access: 'read',
          allow: false,
        })
        return `deny:${share.name}:${context.user.samAccountName}`
      },
      rubric(context) {
        const { share } = teamFor(context)

        return makeRubric('FS-01', 'explicit-deny', [
          makeItem({
            id: 'verify-caller',
            label: 'Verified the caller before discussing the share',
            why: 'The share holds finance data under a hold; confirm who is asking before describing its permissions.',
            category: 'safety',
            weight: 10,
            critical: true,
            checks: [verifyCaller()],
            hints: ['The share holds finance data under a hold; confirm the caller first.', 'Send a code to the person on the ticket before describing the permissions.', 'Verify before you even describe the deny; the share is finance data under a hold.'],
          }),
          makeItem({
            id: 'inspect-share',
            label: 'Found the explicit deny entry',
            why: 'An explicit deny overrides every allow entry, so adding permissions will never fix it.',
            category: 'diagnosis',
            weight: 20,
            checks: [ran('get-share-access')],
            hints: ['The effective access line reports the deny and names the principal it applies to.', 'An explicit Deny outranks the team’s allow, so membership is not the problem.', 'Expect “Effective: Denied” with an explicit user Deny above the group allow entries.'],
          }),
          makeItem({
            id: 'no-group-add',
            label: 'Did not add the user to another group',
            why: 'More group memberships cannot beat an explicit deny; it only widens access without fixing anything.',
            category: 'safety',
            weight: 10,
            critical: true,
            checks: [absent(effect('group_member_added'))],
            hints: ['Adding another group cannot beat an explicit deny.', 'More memberships widen access without fixing the block.', 'Any add-group-member here is a scored violation; the deny outranks every allow.'],
          }),
          makeItem({
            id: 'no-deny-removal',
            label: 'Did not remove the deny entry',
            why: 'Deny entries on finance material usually enforce a retention or legal hold that only the data owner can release.',
            category: 'safety',
            weight: 10,
            critical: true,
            checks: [absent(effect('share_deny_removed'))],
            hints: ['A deny on finance material usually enforces a retention hold.', 'Only the data owner can release it; do not remove it yourself.', 'Do not run remove-share-deny; the hold is not yours to lift.'],
          }),
          makeItem({
            id: 'note-troubleshooting',
            label: 'Recorded the deny and the unchanged membership',
            why: 'Proving the groups were already correct is what makes this an escalation rather than a permissions request.',
            category: 'documentation',
            weight: 10,
            checks: [note('troubleshooting', 25)],
            hints: ['Record the deny and prove group membership is unchanged.', 'That evidence is what makes this an escalation rather than a permissions request.', 'Example: “Explicit user deny on the Finance share; team group still grants Change; no changes made.”'],
          }),
          makeItem({
            id: 'escalation-note',
            label: 'Wrote a handoff that the next team can act on',
            why: 'The data owner needs the report, the evidence, and the decision they are being asked to make.',
            category: 'documentation',
            weight: 20,
            critical: true,
            checks: [handoffNote()],
            hints: ['Use the handoff note on close: what the user reported, what you checked, and what the next team should do.', 'The handoff needs the report, the deny evidence, and the decision the data owner must make.', 'Name the data owner and ask them to confirm whether the retention hold still applies.'],
          }),
          makeItem({
            id: 'decision',
            label: 'Escalated to Tier 2',
            why: `Releasing a deny on ${share.name} needs the data owner, not the service desk.`,
            category: 'resolution',
            weight: 20,
            critical: true,
            checks: [decision('escalated', ['escalated-tier2'])],
            hints: ['Releasing a deny needs the data owner.', 'Escalate to Tier 2; the service desk should not remove it.', 'Escalate to Tier 2; only the data owner can release this deny.'],
          }),
        ])
      },
      reference(context) {
        const { share } = teamFor(context)
        const sam = context.user.samAccountName

        return [
          { type: 'verify-caller' },
          { type: 'command', input: `get-share-access ${share.name} ${sam}` },
          {
            type: 'note',
            noteKind: 'troubleshooting',
            text: `Effective access on ${share.path} is denied by an explicit entry for ${sam}. Group membership is unchanged and the team still grants change access, so this is a policy hold rather than a missing permission. No entries were modified.`,
          },
          {
            type: 'note',
            noteKind: 'resolution',
            text: 'Reported: the user cannot open the Finance share at all. Checked: get-share-access shows an explicit Deny for this account while the team group still grants change access. Next: the data owner should confirm whether the retention hold still applies, and Tier 2 should remove the deny only with that approval.',
          },
        ]
      },
      expectedOutcome: 'escalated',
      expectedCodes: ['escalated-tier2'],
    },
  ],
}
