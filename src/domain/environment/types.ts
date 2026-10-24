import type { VoicemailArrival } from '../tickets/voicemail'

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

export type StockState = 'ready' | 'needs-image' | 'awaiting-parts' | 'quarantined'

/** One machine sitting on a site's spare shelf, with its asset tag. */
export interface StockItem {
  id: string
  kind: DeviceKind
  model: string
  siteId: SiteId
  state: StockState
  daysOnShelf: number
  notes: string
}

export type ShipmentDirection = 'outbound' | 'return'
export type ShipmentState = 'preparing' | 'in-transit' | 'delivered' | 'delayed'

/** One movement of equipment between sites, as the shipping desk tracks it. */
export interface Shipment {
  id: string
  carrier: string
  direction: ShipmentDirection
  state: ShipmentState
  fromSiteId: SiteId
  toSiteId: SiteId
  /** The machine travelling, when it left the shelf and has a tag. */
  assetTag: string | null
  contents: string
  /** When the shipment is due, as the simulated clock counts. */
  dueOn: number
  /** The most recent tracking event, in the carrier's words. */
  lastEvent: string
}

export type MailMessageState = 'delivered' | 'quarantined' | 'blocked' | 'deferred'

/** One step in a message's life, as the transport recorded it. */
export interface MailEvent {
  at: number
  text: string
}

/** One message the tenant handled, in the form a trace can read back. */
export interface MailMessage {
  id: string
  from: string
  to: string
  subject: string
  receivedAt: number
  state: MailMessageState
  /** The filter's verdict, in its own words, when it held or blocked the mail. */
  reason: string | null
  events: MailEvent[]
}

/** One mailbox, as the mail admin reads it. */
export interface MailboxRecord {
  userId: UserId
  /** How full the mailbox is, as a percentage of its quota. */
  quotaPercent: number
  /** An external auto-forward someone set, or null when there is none. */
  forwarding: string | null
  /** The mailbox is on hold, so the desk must not empty it. */
  onHold: boolean
}

export interface MailTenant {
  domain: string
  mailboxes: MailboxRecord[]
  messages: MailMessage[]
  blockedSenders: string[]
}

export type RemoteSessionState = 'active' | 'disconnected'

/** A remote desktop connection into a user's machine. */
export interface RemoteSession {
  machineId: DeviceId
  userId: UserId
  state: RemoteSessionState
  startedAt: number
  client: string
}

export type DeploymentState = 'queued' | 'running' | 'complete' | 'failed'

/** One imaging run against a machine on a shelf. */
export interface DeploymentTask {
  assetTag: string
  sequence: string
  state: DeploymentState
  /** The step the sequence is on, in the deployment tool's words. */
  step: string
  attempts: number
  startedAt: number | null
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
  /**
   * The message this request arrived as, when it was left on the voicemail.
   * Absent on a ticket that came in live, and on every attempt made before
   * voicemails were recorded.
   */
  voicemail?: VoicemailArrival
  sites: Site[]
  users: DirectoryUser[]
  devices: Device[]
  printers: Printer[]
  network: NetworkState
  /** Machines on the spare shelves, by site. */
  stock: StockItem[]
  /** Equipment movements between sites. */
  shipments: Shipment[]
  dhcpScopes: DhcpScope[]
  m365: M365Tenant
  /** The mail tenant: mailboxes, the messages it handled, blocked senders. */
  mail: MailTenant
  /** Remote desktop connections into users' machines. */
  remoteSessions: RemoteSession[]
  /**
   * The desktop in front of the desk, by machine, while more than one support
   * session is open. Only a machine whose session is active can be in view; a
   * world that names none, or names a session that has since ended, reads as the
   * most recently opened active one. Recorded like any other change, because the
   * desktop terminal runs on the machine this names.
   */
  remoteFocus?: DeviceId | null
  /** Imaging runs against machines on the shelves. */
  deploymentTasks: DeploymentTask[]
  shares: FileShare[]
  groups: SecurityGroup[]
  currentDeviceId: DeviceId
  /** Identity gate state; hidden from the learner's tools. */
  verification?: VerificationState
  /** What the caller asserted, declared by the variant for the gate to check. */
  callerClaims?: readonly CallerClaim[]
  /**
   * Set by an impersonation variant: the person on the call is not the employee
   * the ticket is about. A code still goes to that employee's own phone, so
   * nothing can be read back to whoever is asking.
   */
  callerImpersonating?: boolean
  /**
   * Set by a variant whose caller is at the service desk in person: their badge
   * can be scanned and a walk-up with photo ID is possible. A remote caller can
   * do neither, so neither method is offered.
   */
  callerOnSite?: boolean
  /**
   * The employee was issued the printed PIN letter at onboarding. Every
   * Larkspur employee has one, so the method is offered unless a world says
   * otherwise; a letter that was never issued cannot be read from.
   */
  letterPinOnFile?: boolean
  /**
   * Set by a variant where the employee's handset is lost or broken. The mobile
   * on file still takes a code and still rings; it just cannot reach anyone, so
   * the person has to be reached on another line on file.
   */
  mobileOutOfAction?: boolean
  /**
   * A line on the caller's record that a whole team answers, set by a variant
   * where a callback to it reaches a colleague instead of the employee. The
   * label is what the record calls the line; `answeredBy` is the colleague who
   * picks it up, so the gate can name who actually confirmed.
   */
  sharedCallbackLine?: {
    label: string
    answeredBy: string
  }
  /**
   * The request the desk refused on this call. Once it is set, the commands
   * that change an account will not run: the refusal is the decision, and a
   * refusal is not carried out the moment the caller is not looking.
   */
  refusal?: RequestRefusal
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

/**
 * One thing the caller asserts about the account or about who they are. The
 * ticket declares these when it is generated, and the identity gate sets them
 * beside the evidence instead of trusting the story on the ticket.
 */
export interface CallerClaim {
  id: string
  /** The caller's words, quoted back in the gate and the debrief. */
  statement: string
  /** The account the claim is about: the caller's own, or one they named. */
  account: string
  /**
   * What the directory would have to show for the claim to be true. Only the
   * fields named are checked, so a claim about a lockout does not also assert
   * anything about the password's age.
   */
  expects?: {
    status?: UserStatus
    passwordExpired?: boolean
  }
  /**
   * True when the claim is about who is on the line rather than the account.
   * Only the identity gate itself can contradict it — a code that never comes
   * back, or a callback that denies the request.
   */
  identity?: boolean
}

export type VerificationRecipientRole = 'caller' | 'manager' | 'team'

/**
 * How a contact can be used to prove who is on the call. Two methods reach a
 * person remotely (a live code they read back, or a call the desk places), and
 * three need something the person carries or can do in front of the desk: a
 * badge scanned at the service desk, the printed PIN from their onboarding
 * letter, and a walk-up visit where the desk checks photo ID.
 */
export type VerificationMethod =
  | 'verification-code'
  | 'callback'
  | 'badge-scan'
  | 'letter-pin'
  | 'in-person'

/** A contact the identity gate can reach the person on. */
export interface VerificationRecipient {
  id: string
  name: string
  role: VerificationRecipientRole
  /** Masked, so the simulated console never shows a full personal number. */
  destination: string
  /**
   * What this contact is good for. A code needs a line that receives text; a
   * callback needs a number the person answers; a badge, a letter PIN or a
   * walk-up needs the person themselves at the desk.
   */
  methods: readonly VerificationMethod[]
  /**
   * False when the line cannot reach the person right now, such as a handset
   * that is lost. A code is still sent to it, but nothing can be read back.
   */
  reachable: boolean
  /**
   * The colleague who answers a shared team line. Absent on the caller's own
   * contacts: only a line the whole team picks up needs to say who picked it up.
   */
  answeredBy?: string
}

export interface ActiveVerificationCode {
  code: string
  recipientId: string
  recipientName: string
  destination: string
  issuedAt: number
  expiresAt: number
}

/**
 * Identity-gate state for the attempt. Hidden from the learner's tools the same
 * way `fault` is: it is read through `verification`, never printed by a command.
 */
export interface RequestRefusal {
  reason: string
  /** The reason as the deny control worded it, for the terminal to repeat. */
  label: string
  atMs: number
}

/**
 * The printed PIN from the employee's onboarding letter. It is a fixed secret
 * rather than a live one, so the attempt counts the wrong entries: three, and
 * the letter is locked until the ticket is retried.
 */
export interface LetterPinState {
  attempts: number
  locked: boolean
}

export interface VerificationState {
  /** At most one live code, so an older one can never be read back. */
  active: ActiveVerificationCode | null
  /** Codes invalidated by a newer send, newest first. */
  retired: string[]
  /** Codes issued this attempt, so each send produces a different number. */
  issued: number
  /** Wrong entries against the printed PIN. Absent on worlds from before it existed. */
  letterPin?: LetterPinState
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
  | 'mail_released'
  | 'sender_blocked'
  | 'forwarding_cleared'
  | 'remote_connected'
  | 'remote_ended'
  | 'machine_rebooted'
  | 'updates_installed'
  | 'disk_cleaned'
  | 'user_signed_out'
  | 'deployment_started'
  | 'deployment_completed'
  | 'machine_issued'
  | 'shelf_held'
  | 'shipment_dispatched'
  | 'shipment_delivered'
  | 'shipment_rebooked'

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
