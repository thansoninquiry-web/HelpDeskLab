/**
 * The Intune simulator's own vocabulary.
 *
 * Nothing here is shared with the ticket world's `World`, on purpose: this module
 * is meant to be lifted out of the app whole, so it depends on the domain only
 * for the few constants it genuinely reuses (the scoring thresholds).
 */

export type IntunePlatform = 'Windows' | 'iOS' | 'Android'

/** How a device stands against its policies, in the console's own words. */
export type ComplianceState = 'compliant' | 'non-compliant' | 'in-grace' | 'not-evaluated'

/**
 * What has happened to a device from the console's point of view. A retired or
 * wiped device stays in the list — the audit trail is the point — but stops being
 * a thing actions can be aimed at.
 */
export type DeviceLifecycle = 'managed' | 'retired' | 'wiped'

export type AppInstallStatus = 'installed' | 'pending' | 'failed' | 'not-installed'

export type UserStatus = 'active' | 'disabled'

export interface IntuneUser {
  id: string
  displayName: string
  upn: string
  department: string
  jobTitle: string
  status: UserStatus
  /** The group every app assignment can target, alongside the platform ones. */
  groupId: string
}

/** One requirement a policy places on a device. */
export type PolicyRule =
  | { kind: 'bitlocker' }
  | { kind: 'passcode' }
  | { kind: 'encryption' }
  | { kind: 'min-os'; version: string }

export type PolicyPlatform = 'Windows' | 'mobile'

export interface CompliancePolicy {
  id: string
  name: string
  description: string
  platform: PolicyPlatform
  rules: readonly PolicyRule[]
  /** How long a newly non-compliant device is tolerated before it is marked. */
  graceDays: number
}

export interface AppAssignment {
  /**
   * The groups the app targets. Groups stay plain ids: this module models
   * membership, not the directory that would normally hold it.
   */
  groupIds: readonly string[]
  install: 'required' | 'available'
}

export interface IntuneApp {
  id: string
  name: string
  publisher: string
  platform: IntunePlatform | 'all'
  assignment: AppAssignment
}

export interface DeviceApp {
  appId: string
  status: AppInstallStatus
  /** Set when the app was assigned but the device has not reported back. */
  lastAttempt: number | null
}

export interface IntuneDevice {
  id: string
  name: string
  /** The primary user. Null once the device is wiped, and on unowned devices. */
  ownerUserId: string | null
  platform: IntunePlatform
  osVersion: string
  enrolledAt: number
  lastCheckIn: number | null
  lifecycle: DeviceLifecycle
  groupId: string | null
  /** Device-side settings the policies are judged against. */
  bitlocker: boolean
  passcodeSet: boolean
  encrypted: boolean
  /**
   * A lost device is still managed; it is just not in the owner's hands.
   */
  lost: boolean
  /**
   * When this device last started failing a policy it had been passing. Grace is
   * measured from here rather than from enrolment, so a laptop that went wrong
   * yesterday is tolerated even though it was enrolled two years ago.
   */
  nonComplianceSince: number | null
  /**
   * The device checked in, but the service has not evaluated it since the policy
   * changed: the console shows a stale verdict until the next sync. This is the
   * "stuck on not evaluated" case, which is a different fault from silence.
   */
  policyStale: boolean
  compliance: ComplianceState
  complianceReasons: readonly string[]
  apps: DeviceApp[]
}

/** What the console can do to a device. Order is the order the UI offers them. */
export const DEVICE_ACTIONS = [
  'sync',
  'restart',
  'assign-apps',
  'reassign-user',
  'remove-group',
  'retire',
  'wipe',
] as const

export type DeviceAction = (typeof DEVICE_ACTIONS)[number]

/** The two that destroy data; the UI asks twice and the scorer charges for them. */
export const DESTRUCTIVE_ACTIONS: readonly DeviceAction[] = ['wipe', 'retire']

export function isDestructive(action: DeviceAction): boolean {
  return DESTRUCTIVE_ACTIONS.includes(action)
}

/**
 * What the activity log can hold. `review` is the read step: opening the record
 * and reading the reasons before deciding, which changes nothing on the device
 * but is what the diagnosis category is scored from.
 */
export type IntuneEventAction = DeviceAction | 'review'

export interface IntuneEvent {
  id: number
  deviceId: string
  action: IntuneEventAction
  at: number
  /** Whether the console carried the action out, or refused it. */
  outcome: 'applied' | 'refused' | 'failed'
  summary: string
  /** What changed, line by line, for the device's activity log. */
  notes: readonly string[]
}

export interface IntuneState {
  users: readonly IntuneUser[]
  devices: readonly IntuneDevice[]
  policies: readonly CompliancePolicy[]
  apps: readonly IntuneApp[]
  events: readonly IntuneEvent[]
}

/** The group ids the seed uses; apps are assigned to these, never to a user. */
export const GROUPS = {
  windows: 'grp-windows-managed',
  mobile: 'grp-mobile-managed',
  field: 'grp-field-ops',
  engineering: 'grp-engineering',
} as const
