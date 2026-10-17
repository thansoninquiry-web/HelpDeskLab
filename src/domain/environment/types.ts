export type SiteId = string
export type DeviceId = string
export type UserId = string

export interface Site {
  id: SiteId
  name: string
  subnet: string
  prefixLength: number
  gateway: string
  dhcpServer: string
  dnsServers: string[]
}

export type UserStatus = 'active' | 'locked' | 'disabled'

export interface DirectoryUser {
  id: UserId
  samAccountName: string
  displayName: string
  email: string
  department: string
  siteId: SiteId
  status: UserStatus
  passwordExpired: boolean
  passwordLastChangedAt: number | null
  employeeId: string
  managerName: string
}

export type DeviceKind = 'laptop' | 'desktop' | 'server'

export type SpoolerStatus = 'running' | 'stopped'

export interface PrintJob {
  id: string
  document: string
  owner: string
  submittedAt: number
  status: 'printing' | 'queued' | 'error'
}

export type PrinterStatus = 'online' | 'offline' | 'paused'

export interface Printer {
  id: string
  name: string
  siteId: SiteId
  model: string
  ipAddress: string
  shareName: string
  status: PrinterStatus
  jobs: PrintJob[]
}

export interface DhcpLease {
  server: string
  obtainedAt: number
  expiresAt: number
}

export type DhcpLeaseState = 'active' | 'stale'

export interface DhcpScopeLease {
  address: string
  hostname: string
  state: DhcpLeaseState
  expiresAt: number
}

/** One address pool on the site DHCP server, with its scope options. */
export interface DhcpScope {
  siteId: SiteId
  name: string
  server: string
  startAddress: string
  endAddress: string
  /** Addresses inside the range that DHCP must never hand out (printers, servers). */
  exclusions: string[]
  leaseMinutes: number
  /** Option 006. */
  dnsServers: string[]
  /** Option 003. */
  router: string | null
  leases: DhcpScopeLease[]
}

export type MfaMethod = 'authenticator' | 'sms' | 'none'

export interface M365Account {
  userId: UserId
  mfaRegistered: boolean
  mfaMethod: MfaMethod
  signInBlocked: boolean
  /** AADSTS error code from the most recent sign-in, or null when it succeeded. */
  lastSignInError: string | null
  lastSignInAt: number | null
  signInAttempts: number
}

export interface M365Tenant {
  name: string
  domain: string
  accounts: M365Account[]
}

export type ShareAccess = 'read' | 'change' | 'full'

export type SharePrincipal =
  | { kind: 'group'; name: string }
  | { kind: 'user'; samAccountName: string }

export interface ShareGrant {
  principal: SharePrincipal
  access: ShareAccess
  /** false is an explicit Deny, which outranks every allow entry. */
  allow: boolean
}

export interface FileShare {
  id: string
  name: string
  path: string
  server: string
  siteId: SiteId
  grants: ShareGrant[]
}

export interface SecurityGroup {
  name: string
  members: UserId[]
}

export interface Device {
  id: DeviceId
  hostname: string
  kind: DeviceKind
  siteId: SiteId
  os: string
  adapterDescription: string
  macAddress: string
  assignedUserId: UserId | null
  loggedInUserId: UserId | null
  linkUp: boolean
  ipMode: 'dhcp' | 'static'
  ipAddress: string | null
  subnetMask: string | null
  gateway: string | null
  dnsServers: string[]
  dhcpLease: DhcpLease | null
  domainJoined: boolean
  spoolerStatus: SpoolerStatus
  defaultPrinterId: string | null
  pendingReboot: boolean
  diskFreePercent: number
  lastUpdateDays: number
}

export interface DnsRecord {
  name: string
  address: string
}

export interface NetworkState {
  wanUp: boolean
  publicNameServers: string[]
  dnsRecords: DnsRecord[]
}

/** Everything the simulated tools can read or change. JSON-serializable. */
export interface World {
  clock: number
  orgName: string
  domain: string
  sites: Site[]
  users: DirectoryUser[]
  devices: Device[]
  printers: Printer[]
  network: NetworkState
  dhcpScopes: DhcpScope[]
  m365: M365Tenant
  shares: FileShare[]
  groups: SecurityGroup[]
  currentDeviceId: DeviceId
  /** Filled in by the ticket generator; hidden from the learner. */
  fault?: {
    code: string
    details: Record<string, string | number | boolean>
  }
}

export interface OutputLine {
  text: string
  kind?: 'default' | 'error' | 'success' | 'muted'
}

export type EffectType =
  | 'account_unlocked'
  | 'password_reset'
  | 'dns_changed'
  | 'dns_cache_flushed'
  | 'lease_renewed'
  | 'spooler_restarted'
  | 'print_queue_cleared'
  | 'default_printer_changed'
  | 'dhcp_lease_removed'
  | 'mfa_reset'
  | 'signin_unblocked'
  | 'group_member_added'
  | 'share_deny_removed'

export interface Effect {
  type: EffectType
  target?: string
  details?: Record<string, string | number | boolean>
}

export interface CommandResult {
  world: World
  lines: OutputLine[]
  effects: Effect[]
  /** False only when the command could not be executed (syntax/validation). */
  ok: boolean
}
