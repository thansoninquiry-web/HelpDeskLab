/**
 * The Azure simulator's own vocabulary.
 *
 * Like the Intune console beside it, nothing here is shared with the ticket
 * world's `World`: the module is meant to be lifted out whole, so it depends on
 * the domain only for the scoring constants it reuses.
 */

export type AzureRegion = 'uksouth' | 'ukwest' | 'westeurope'

/** How exposed the console judges a resource to be, from its own settings. */
export type Exposure = 'low' | 'medium' | 'high'

export interface AzureResourceGroup {
  id: string
  name: string
  region: AzureRegion
  /** The team that owns the group, shown where Azure would show a tag. */
  ownerTeam: string
}

/**
 * A virtual machine's settings. `deallocated` is the important distinction: a
 * machine in that state bills no compute, while one that is merely stopped in
 * the guest still does. The console only offers the honest one.
 */
export interface AzureVmProperties {
  kind: 'vm'
  size: 'Standard_B2s' | 'Standard_D2s_v3' | 'Standard_E4s_v3'
  power: 'running' | 'deallocated'
  os: 'Windows Server 2022' | 'Ubuntu 22.04'
  /**
   * What the machine is tagged for. A business-hours machine left running is the
   * console's oldest cost story, and the tag is what makes it visible.
   */
  schedule: 'always-on' | 'business-hours'
}

export interface AzureStorageProperties {
  kind: 'storage'
  /** Anonymous read access to blobs: the setting most storage incidents start from. */
  publicBlobAccess: boolean
  /** 0 means soft delete is off, so a deleted blob is gone immediately. */
  softDeleteDays: number
  tlsMin: '1.0' | '1.2'
  replication: 'LRS' | 'GRS'
}

export interface AzureNsgProperties {
  kind: 'nsg'
  /** What the group is attached to, in the console's own words. */
  attachedTo: string
}

export interface AzureAppProperties {
  kind: 'webapp'
  planSku: 'Free' | 'Basic' | 'Standard'
  runtime: string
  httpsOnly: boolean
}

export type AzureProperties =
  | AzureVmProperties
  | AzureStorageProperties
  | AzureNsgProperties
  | AzureAppProperties

export type ResourceKind = AzureProperties['kind']

export interface AzureResource {
  id: string
  name: string
  resourceGroupId: string
  region: AzureRegion
  properties: AzureProperties
  /**
   * A deleted resource stays in the estate as a tombstone: the audit trail is
   * the point, and an attempt has to be scoreable after the resource it acted on
   * is gone. Nothing acts on it, and no ticket can be resolved by deleting it.
   */
  deleted?: boolean
}

export type NsgDirection = 'inbound' | 'outbound'
export type NsgAccess = 'allow' | 'deny'

export interface NsgRule {
  id: string
  /** The network security group the rule belongs to. */
  nsgId: string
  name: string
  priority: number
  direction: NsgDirection
  access: NsgAccess
  protocol: 'TCP' | 'UDP' | 'Any'
  /** Null is the console's "Any" port: a rule no port can slip past. */
  port: number | null
  source: 'Internet' | 'VirtualNetwork' | 'AzureLoadBalancer' | '10.20.0.0/16'
}

/** The principals the console can grant a role to. */
export const PRINCIPALS = [
  { id: 'usr-contractor', label: 'Rowan Vale (contractor)' },
  { id: 'grp-platform-team', label: 'Platform team' },
  { id: 'grp-service-desk', label: 'Service desk' },
  { id: 'usr-dana', label: 'Dana Okafor (platform lead)' },
] as const

export type RoleName = 'Reader' | 'Contributor' | 'Owner'

export interface AzureRoleAssignment {
  id: string
  principal: string
  principalLabel: string
  /** A resource group id, or `subscription`. */
  scope: string
  role: RoleName
}

/** What the console can do. Order is the order the UI offers them. */
export const RESOURCE_ACTIONS = [
  'start',
  'deallocate',
  'restart',
  'open-port',
  'close-port',
  'restrict-public-access',
  'enable-soft-delete',
  'require-tls',
  'scale-up',
  'assign-role',
  'delete-vm',
  'delete-resource-group',
] as const

export type ResourceAction = (typeof RESOURCE_ACTIONS)[number]

/** The two that destroy something; the UI asks twice and the scorer charges. */
export const DESTRUCTIVE_ACTIONS: readonly ResourceAction[] = [
  'delete-vm',
  'delete-resource-group',
]

export function isDestructive(action: ResourceAction): boolean {
  return DESTRUCTIVE_ACTIONS.includes(action)
}

/**
 * What the activity log holds. `review` is the read step: opening the record and
 * reading its findings before deciding. It changes nothing but is what the
 * diagnosis category is scored from.
 */
export type AzureEventAction = ResourceAction | 'review'

export interface AzureEvent {
  id: number
  resourceId: string
  action: AzureEventAction
  at: number
  outcome: 'applied' | 'refused' | 'failed'
  summary: string
  notes: readonly string[]
}

export interface AzureState {
  resourceGroups: readonly AzureResourceGroup[]
  resources: readonly AzureResource[]
  nsgRules: readonly NsgRule[]
  roles: readonly AzureRoleAssignment[]
  events: readonly AzureEvent[]
}

/** The actions that make sense for one kind of resource. */
/**
 * The actions that make sense for one kind of resource.
 *
 * Access is the exception: a role is granted over the resource's group, so any
 * resource page can change it, the way a portal's access blade works. Without
 * that, an access ticket would have nowhere to be worked from.
 */
export const ACTIONS_BY_KIND: Record<ResourceKind, readonly ResourceAction[]> = {
  vm: ['start', 'deallocate', 'restart', 'assign-role', 'delete-vm', 'delete-resource-group'],
  storage: [
    'restrict-public-access',
    'enable-soft-delete',
    'require-tls',
    'assign-role',
    'delete-resource-group',
  ],
  nsg: ['open-port', 'close-port', 'assign-role', 'delete-resource-group'],
  webapp: ['scale-up', 'assign-role', 'delete-resource-group'],
}

/** Groups a role can be granted over. `subscription` is wider than any group. */
export const SUBSCRIPTION_SCOPE = 'subscription'
