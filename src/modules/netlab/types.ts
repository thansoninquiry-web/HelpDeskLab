/**
 * The Networking Lab's own vocabulary.
 *
 * Like the Intune and Azure consoles beside it, nothing here is shared with the
 * ticket world's `World`: the module is meant to be lifted out whole, so it owns
 * its topology, its faults and its vocabulary and imports the app only for the
 * scoring thresholds it reuses.
 */

export type VlanId = '10' | '20'

export type DeviceKind = 'modem' | 'firewall' | 'router' | 'switch' | 'ap' | 'client' | 'server'

/** OSI-ish depth. A working diagnosis starts low and works up. */
export type Layer = 1 | 2 | 3 | 4 | 7

export interface NetVlan {
  id: VlanId
  name: string
  subnet: string
  gateway: string
  dhcpStart: string
  dhcpEnd: string
  purpose: string
}

export interface NetDevice {
  id: string
  name: string
  kind: DeviceKind
  model: string
  /** VLAN for clients, APs and servers; infrastructure is untagged or trunked. */
  vlanId?: VlanId
  /** The address the device sits on. Clients get theirs from DHCP. */
  address?: string
  mac: string
  /** The switch port the device is patched into, for edge devices. */
  port?: string
  /** The upstream device, for infrastructure. */
  uplink?: string
  /** Service set an AP broadcasts. */
  ssid?: string
  /** The room or space the device lives in. */
  area: string
  /** One line the device page shows under the name. */
  role: string
  /** Set for the clients that join over Wi-Fi rather than a cable. */
  wireless?: { apId: string }
}

export interface Topology {
  site: string
  domain: string
  isp: { name: string; circuit: string; publicAddress: string; lanAddress: string }
  vlans: readonly NetVlan[]
  devices: readonly NetDevice[]
  /** Internal names the DNS server answers for. */
  dnsRecords: readonly { name: string; address: string }[]
}

/**
 * One injected fault, read by the estate builder.
 *
 * The faults are a closed union rather than free strings so a scenario cannot
 * name a fault the estate does not know how to apply, and a test can walk every
 * variant.
 */
export type Fault =
  | { kind: 'none' }
  | { kind: 'cable'; deviceId: string; detail: string }
  | { kind: 'bad-port'; deviceId: string; port: string }
  | { kind: 'trunk-vlan'; vlanId: VlanId }
  | { kind: 'dhcp-exhausted'; vlanId: VlanId }
  | { kind: 'ip-conflict'; deviceId: string; address: string }
  | { kind: 'wrong-vlan'; deviceId: string; expectedVlan: VlanId; actualVlan: VlanId }
  | { kind: 'ap-down'; deviceId: string }
  | { kind: 'weak-coverage'; deviceId: string }
  | { kind: 'dns-service' }
  | { kind: 'firewall-block'; host: string; port: number }
  | { kind: 'wrong-gateway'; deviceId: string; gateway: string }
  | { kind: 'duplex'; port: string }
  | { kind: 'isp-outage' }
  | { kind: 'firewall-wan-down' }
  | { kind: 'rogue-dhcp'; vlanId: VlanId; port: string }

/** Every change the lab can make. Order is the order the reference paths use. */
export const LAB_FIXES = [
  'reseat-cable',
  'replace-patch-lead',
  'restore-trunk-vlan',
  'release-stale-leases',
  'renew-lease',
  'clear-static-address',
  'set-port-vlan',
  'power-cycle-ap',
  'reposition-ap',
  'start-dns-service',
  'remove-block-rule',
  'set-correct-gateway',
  'set-port-auto',
  'confirm-outage',
  'raise-isp-ticket',
  'bring-wan-up',
  'shutdown-rogue-port',
  // Plausible changes that do not fix these faults. They are offered because a
  // real action bar offers them, and the scorer charges for taking one.
  'restart-switch',
  'reboot-firewall',
  'factory-reset-ap',
  'extend-dhcp-scope',
  'flush-dns-cache',
] as const

export type FixId = (typeof LAB_FIXES)[number]

/** The changes that take something away, priced higher when taken at random. */
export const DESTRUCTIVE_FIXES: readonly FixId[] = [
  'restart-switch',
  'reboot-firewall',
  'factory-reset-ap',
]

export const FIX_LABELS: Record<FixId, string> = {
  'reseat-cable': 'Reseat the network cable at the wall socket',
  'replace-patch-lead': 'Replace the patch lead',
  'restore-trunk-vlan': 'Add the missing VLAN back to the uplink trunk',
  'release-stale-leases': 'Release the stale DHCP leases',
  'renew-lease': 'Renew the DHCP lease on the affected device',
  'clear-static-address': 'Clear the hand-set static address',
  'set-port-vlan': 'Move the switch port to the right VLAN',
  'power-cycle-ap': 'Power-cycle the access point',
  'reposition-ap': 'Move the access point out of the cabinet',
  'start-dns-service': 'Start the DNS Server service',
  'remove-block-rule': 'Remove the outbound block rule',
  'set-correct-gateway': 'Set the default gateway back to the router',
  'set-port-auto': 'Set the switch port back to auto-negotiate',
  'confirm-outage': 'Confirm the fault is upstream of the firewall',
  'raise-isp-ticket': 'Raise the outage with the ISP',
  'bring-wan-up': 'Bring the firewall WAN interface up',
  'shutdown-rogue-port': 'Shut the port carrying the unauthorised router',
  'restart-switch': 'Restart the core switch',
  'reboot-firewall': 'Reboot the edge firewall',
  'factory-reset-ap': 'Factory-reset the access point',
  'extend-dhcp-scope': 'Extend the DHCP scope range',
  'flush-dns-cache': 'Flush the DNS cache on a client',
}

/** Diagnostic reads a tool or a device page performs. */
export const CHECKS = {
  adapter: { label: 'Read the adapter and lease', layer: 1 },
  'link-status': { label: 'Read the switch port status', layer: 1 },
  wifi: { label: 'Read the Wi-Fi signal', layer: 1 },
  'wan-status': { label: 'Read the WAN equipment status', layer: 1 },
  vlan: { label: 'Read the VLAN table', layer: 2 },
  trunk: { label: 'Read the trunk allowed VLANs', layer: 2 },
  'mac-table': { label: 'Read the MAC address table', layer: 2 },
  gateway: { label: 'Ping the default gateway', layer: 3 },
  arp: { label: 'Read the ARP cache', layer: 3 },
  path: { label: 'Trace the path', layer: 3 },
  'reach-internet': { label: 'Test a public address', layer: 3 },
  'reach-host': { label: 'Test an internal host', layer: 3 },
  port: { label: 'Test a TCP port', layer: 4 },
  sockets: { label: 'Read open sockets', layer: 4 },
  dns: { label: 'Resolve a name', layer: 7 },
  'dhcp-pool': { label: 'Read the DHCP pool', layer: 7 },
} as const satisfies Record<string, { label: string; layer: Layer }>

export type CheckId = keyof typeof CHECKS

export interface RecordedCheck {
  id: CheckId
  /** The device the tool or page was pointed at. */
  deviceId: string
  at: number
}

export interface FixOption {
  id: FixId
  label: string
  /** What the change does, in the action bar's own words. */
  detail: string
  /** True for the changes that take something away. */
  risk?: boolean
}

/** A read that genuinely isolates the fault, and where it has to be run. */
export interface Evidence {
  id: CheckId
  deviceId?: string
}

export interface Incident {
  id: string
  title: string
  difficulty: 1 | 2 | 3
  category: 'physical' | 'switching' | 'addressing' | 'wireless' | 'services' | 'routing' | 'wan'
  /** The one-line symptom the queue shows. */
  symptom: string
  /** What the person at the desk is reported to have said. */
  report: string
  /** The device the symptom is about. */
  subjectId: string
  fault: Fault
  /** The lowest layer a working diagnosis can start at. */
  faultLayer: Layer
  /** The reads that actually isolate this fault. */
  evidence: readonly Evidence[]
  /** Changes the action bar offers, expected ones first. */
  fixOptions: readonly FixOption[]
  /** The reference path, in order. */
  expectedFix: readonly FixId[]
  hints: readonly [string, string, string]
  explanation: readonly string[]
  /** The rest of the course that explains this fault. */
  conceptIds: readonly string[]
  /** The end state, read from the derived estate rather than a keystroke. */
  verify: (estate: LabEstate) => boolean
  /** What a resolved estate looks like, in plain sentences. */
  verifyText: string
}

export type PortStatus = 'up' | 'down' | 'admin-down' | 'err-disabled'

export interface PortView {
  id: string
  name: string
  /** The VLAN an access port carries. A trunk's native VLAN lives here too. */
  vlanId: VlanId
  mode: 'access' | 'trunk'
  status: PortStatus
  speedMbps: number
  duplex: 'full' | 'half'
  allowedVlans: readonly VlanId[]
  errors: number
  /** The device patched in, when one is. */
  deviceId?: string
}

export interface VlanView extends NetVlan {
  leased: number
  free: number
  /** False when the VLAN is not carried on the uplink trunk. */
  routed: boolean
}

export interface ClientView {
  deviceId: string
  hostname: string
  vlanId: VlanId
  switchPort: string | null
  link: 'up' | 'down'
  /** The Windows sentence for the adapter. */
  media: string
  dhcp: boolean
  address: string
  prefix: number
  gateway: string | null
  dns: readonly string[]
  lease: 'active' | 'expired' | 'none'
  /** Two devices hold this address. */
  conflict: boolean
  /** The address came from the student router, not the school's server. */
  rogueLease: boolean
  ssid: string | null
  signal: 'good' | 'weak' | 'none'
  speedMbps: number
  duplex: 'full' | 'half'
}

export interface ServerView {
  deviceId: string
  hostname: string
  address: string
  role: string
  services: readonly string[]
}

export interface WanView {
  modemSync: boolean
  firewallWanUp: boolean
  routerWanUp: boolean
  publicAddress: string
  wanUp: boolean
  /** Whether the outage has been raised with the ISP. */
  ticketRaised: boolean
}

export interface LabEstate {
  incidentId: string
  fixes: readonly FixId[]
  vlans: readonly VlanView[]
  ports: Readonly<Record<string, PortView>>
  clients: Readonly<Record<string, ClientView>>
  servers: Readonly<Record<string, ServerView>>
  apSignal: Readonly<Record<string, 'good' | 'weak' | 'down'>>
  apClients: Readonly<Record<string, readonly string[]>>
  wan: WanView
  dnsUp: boolean
  blocked: { host: string; port: number } | null
  roguePort: string | null
}

/** One change, as the attempt keeps it. */
export interface ChangeRecord {
  fix: FixId
  at: number
}

/** What an attempt stores between visits. */
export interface AttemptState {
  fixes: readonly FixId[]
  changes: readonly ChangeRecord[]
  checks: readonly RecordedCheck[]
}

export function isDestructiveFix(fix: FixId): boolean {
  return DESTRUCTIVE_FIXES.includes(fix)
}

export function layerOf(check: CheckId): Layer {
  return CHECKS[check].layer
}
