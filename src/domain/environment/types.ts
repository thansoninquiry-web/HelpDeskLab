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
