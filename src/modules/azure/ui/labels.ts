import type { AzureEventAction, Exposure, ResourceAction } from '../types'

export const ACTION_LABELS: Record<ResourceAction, string> = {
  start: 'Start',
  deallocate: 'Deallocate',
  restart: 'Restart',
  'open-port': 'Open port',
  'close-port': 'Close port',
  'restrict-public-access': 'Turn off public blob access',
  'enable-soft-delete': 'Enable soft delete',
  'require-tls': 'Require TLS 1.2',
  'scale-up': 'Scale up',
  'assign-role': 'Change role',
  'delete-vm': 'Delete VM',
  'delete-resource-group': 'Delete resource group',
}

/** The activity log's verbs, including the read step, which changes nothing. */
export const EVENT_ACTION_LABELS: Record<AzureEventAction, string> = {
  ...ACTION_LABELS,
  review: 'Record read',
}

export const EXPOSURE_LABELS: Record<Exposure, string> = {
  low: 'Low exposure',
  medium: 'Medium exposure',
  high: 'High exposure',
}

export const KIND_LABELS: Record<string, string> = {
  vm: 'Virtual machine',
  storage: 'Storage account',
  nsg: 'Network security group',
  webapp: 'App Service',
}
