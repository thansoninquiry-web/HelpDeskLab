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
          }),
          makeItem({
            id: 'inspect-share',
            label: 'Inspected the effective access and the entries',
            why: 'The tool separates "denied" from "allowed but read-only", which changes the fix completely.',
            category: 'diagnosis',
            weight: 20,
            checks: [ran('get-share-access')],
            hint: 'get-share-access <share> <account> shows effective access, the groups behind it, and every entry.',
          }),
          makeItem({
            id: 'add-member',
            label: `Restored membership of ${groupName}`,
            why: 'Group membership is what grants change access; editing individual file permissions is not the fix.',
            category: 'resolution',
            weight: 25,
            critical: true,
            checks: [effect('group_member_added', `${groupName}/${sam}`)],
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
          }),
          makeItem({
            id: 'no-deny-removal',
            label: 'Did not remove a deny entry',
            why: 'There was no deny entry here; removing permissions you did not diagnose creates a second problem.',
            category: 'safety',
            weight: 5,
            checks: [absent(effect('share_deny_removed'))],
          }),
          makeItem({
            id: 'note-troubleshooting',
            label: 'Documented the group that was missing',
            why: 'The next access request for this user should not start from zero.',
            category: 'documentation',
            weight: 10,
            checks: [note('troubleshooting', 20)],
          }),
          makeItem({
            id: 'note-customer',
            label: 'Told the user to reopen the folder',
            why: 'Windows caches the old token until the share is reopened or the session refreshes.',
            category: 'documentation',
            weight: 5,
            checks: [note('customer', 15)],
          }),
          makeItem({
            id: 'decision',
            label: 'Resolved the ticket',
            why: 'Restoring a group membership is within the service desk remit after verification.',
            category: 'resolution',
            weight: 10,
            critical: true,
            checks: [decision('resolved', ['resolved-remote', 'resolved-user-guidance'])],
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
          { type: 'command', input: `get-share-access ${share.name} ${sam}` },
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
          }),
          makeItem({
            id: 'inspect-share',
            label: 'Found the explicit deny entry',
            why: 'An explicit deny overrides every allow entry, so adding permissions will never fix it.',
            category: 'diagnosis',
            weight: 20,
            checks: [ran('get-share-access')],
            hint: 'The effective access line reports the deny and names the principal it applies to.',
          }),
          makeItem({
            id: 'no-group-add',
            label: 'Did not add the user to another group',
            why: 'More group memberships cannot beat an explicit deny; it only widens access without fixing anything.',
            category: 'safety',
            weight: 10,
            critical: true,
            checks: [absent(effect('group_member_added'))],
          }),
          makeItem({
            id: 'no-deny-removal',
            label: 'Did not remove the deny entry',
            why: 'Deny entries on finance material usually enforce a retention or legal hold that only the data owner can release.',
            category: 'safety',
            weight: 10,
            critical: true,
            checks: [absent(effect('share_deny_removed'))],
          }),
          makeItem({
            id: 'note-troubleshooting',
            label: 'Recorded the deny and the unchanged membership',
            why: 'Proving the groups were already correct is what makes this an escalation rather than a permissions request.',
            category: 'documentation',
            weight: 10,
            checks: [note('troubleshooting', 25)],
          }),
          makeItem({
            id: 'escalation-note',
            label: 'Wrote a handoff that the next team can act on',
            why: 'The data owner needs the report, the evidence, and the decision they are being asked to make.',
            category: 'documentation',
            weight: 20,
            critical: true,
            checks: [handoffNote()],
            hint: 'Use the handoff note on close: what the user reported, what you checked, and what the next team should do.',
          }),
          makeItem({
            id: 'decision',
            label: 'Escalated to Tier 2',
            why: `Releasing a deny on ${share.name} needs the data owner, not the service desk.`,
            category: 'resolution',
            weight: 20,
            critical: true,
            checks: [decision('escalated', ['escalated-tier2'])],
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
