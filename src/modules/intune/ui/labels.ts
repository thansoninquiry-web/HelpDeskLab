import { GROUPS, type IntuneEventAction } from '../types'

/** Group ids are stored as ids; a console shows what they mean. */
export const GROUP_LABELS: Record<string, string> = {
  [GROUPS.windows]: 'Windows managed devices',
  [GROUPS.mobile]: 'Mobile managed devices',
  [GROUPS.field]: 'Field operations',
  [GROUPS.engineering]: 'Engineering',
}

export function groupLabel(groupId: string | null): string {
  if (groupId === null) {
    return 'no group'
  }
  return GROUP_LABELS[groupId] ?? groupId
}

/** The activity log's verbs, including the read step, which changes nothing. */
export const EVENT_ACTION_LABELS: Record<IntuneEventAction, string> = {
  sync: 'Sync',
  restart: 'Restart',
  'assign-apps': 'Assign apps',
  'reassign-user': 'Change primary user',
  'remove-group': 'Remove from group',
  retire: 'Retire',
  wipe: 'Wipe',
  review: 'Record read',
}
