import { deviceById, TOPOLOGY, vlanById, VLAN_IDS } from '../data/topology'
import type {
  AttemptState,
  ClientView,
  Fault,
  FixId,
  Incident,
  LabEstate,
  NetDevice,
  PortView,
  ServerView,
  VlanId,
  VlanView,
} from '../types'

/**
 * The estate the tools read.
 *
 * Nothing is mutated by a scenario: the topology is a constant and a scenario is
 * a fault plus the changes the learner has made. `buildEstate` folds the two into
 * the picture every probe sees, so a ping, an `ipconfig` and the switch's own
 * table cannot disagree about what is plugged in where. A fix is a row; the
 * estate is recomputed from it.
 */

function apipa(deviceId: string): string {
  let hash = 0
  for (const character of deviceId) {
    hash = (hash * 31 + character.charCodeAt(0)) % 65_521
  }
  return `169.254.${(hash % 200) + 20}.${(hash % 250) + 2}`
}

/** 81 usable addresses in a /24 pool from .100 to .180. */
const POOL_SIZE = 81

interface PortSeed {
  id: string
  vlanId: VlanId
  deviceId?: string
  mode?: 'access' | 'trunk'
}

const PORT_SEEDS: readonly PortSeed[] = [
  { id: 'Gi1/0/1', vlanId: '10', mode: 'trunk' },
  { id: 'Gi1/0/2', vlanId: '10', deviceId: 'ap-staff' },
  { id: 'Gi1/0/3', vlanId: '20', deviceId: 'ap-student' },
  { id: 'Gi1/0/5', vlanId: '10', deviceId: 'pc-staff-01' },
  { id: 'Gi1/0/6', vlanId: '10', deviceId: 'pc-staff-02' },
  { id: 'Gi1/0/7', vlanId: '10', deviceId: 'pc-staff-03' },
  { id: 'Gi1/0/8', vlanId: '10', deviceId: 'pc-staff-04' },
  { id: 'Gi1/0/9', vlanId: '10', deviceId: 'pc-staff-05' },
  { id: 'Gi1/0/10', vlanId: '20', deviceId: 'pc-lab-01' },
  { id: 'Gi1/0/11', vlanId: '20', deviceId: 'pc-lab-02' },
  { id: 'Gi1/0/12', vlanId: '20', deviceId: 'pc-lab-03' },
  { id: 'Gi1/0/13', vlanId: '20', deviceId: 'pc-lab-04' },
  { id: 'Gi1/0/20', vlanId: '10', deviceId: 'srv-dc01' },
  { id: 'Gi1/0/21', vlanId: '10', deviceId: 'srv-files' },
  { id: 'Gi1/0/24', vlanId: '20' },
]

const CLIENT_IDS = TOPOLOGY.devices
  .filter((device) => device.kind === 'client')
  .map((device) => device.id)

function basePorts(): Record<string, PortView> {
  const ports: Record<string, PortView> = {}
  for (let index = 1; index <= 24; index += 1) {
    const id = `Gi1/0/${index}`
    const seed = PORT_SEEDS.find((entry) => entry.id === id)
    ports[id] = {
      id,
      name: seed?.deviceId ? (deviceById(seed.deviceId)?.name ?? seed.deviceId) : '—',
      vlanId: seed?.vlanId ?? '10',
      mode: seed?.mode ?? 'access',
      status: seed ? 'up' : 'down',
      speedMbps: 1000,
      duplex: 'full',
      allowedVlans: seed?.mode === 'trunk' ? ['10', '20'] : [seed?.vlanId ?? '10'],
      errors: 0,
      deviceId: seed?.deviceId,
    }
  }
  return ports
}

/** The switch port a device is patched into, or null for wireless gear. */
export function switchPortOf(device: NetDevice): string | null {
  return device.port ?? null
}

function portIdFor(deviceId: string): string | null {
  const device = deviceById(deviceId)
  return device ? switchPortOf(device) : null
}

function vlanLeased(vlanId: VlanId, fault: Fault, fixes: readonly FixId[]): number {
  if (fault.kind === 'dhcp-exhausted' && fault.vlanId === vlanId) {
    return fixes.includes('release-stale-leases') ? 69 : POOL_SIZE
  }
  return vlanId === '10' ? 58 : 47
}

function addressFor(device: NetDevice): string {
  return device.address ?? apipa(device.id)
}

/**
 * One client's adapter, after the fault and the fixes.
 *
 * The order is deliberate: link first (nothing else is visible without it), then
 * whether DHCP could answer, then the address the adapter would hold as a
 * result. A fix that restores the path but leaves a stale lease still reads as
 * APIPA until the lease is renewed — which is the distinction between "the
 * network is back" and "this machine now knows it".
 */
function clientView(
  device: NetDevice,
  fault: Fault,
  fixes: readonly FixId[],
  ports: Record<string, PortView>,
): ClientView {
  const fixed = (id: FixId) => fixes.includes(id)
  const deviceVlan = device.vlanId ?? '10'
  const vlan = vlanById(deviceVlan)
  const portId = switchPortOf(device)
  const basePort = portId ? ports[portId] : undefined
  const wirelessAp = device.wireless?.apId ?? null

  let link: 'up' | 'down' = 'up'
  let media = 'Connected'
  let signal: 'good' | 'weak' | 'none' = wirelessAp ? 'good' : 'none'
  const ssid = wirelessAp ? (deviceById(wirelessAp)?.ssid ?? null) : null
  let vlanId: VlanId = deviceVlan
  // The hand-set gateway is the first thing applied, so the renewal below puts
  // the router's own address back rather than the one it was told.
  let gateway: string | null =
    fault.kind === 'wrong-gateway' && fault.deviceId === device.id ? fault.gateway : vlan.gateway
  const dns = ['10.10.10.10']
  let dhcp = true
  let address = addressFor(device)
  let lease: ClientView['lease'] = 'active'
  let conflict = false
  let rogueLease = false
  let speedMbps = basePort?.speedMbps ?? 866
  let duplex: 'full' | 'half' = basePort?.duplex ?? 'full'
  let pendingRenew = false

  if (fault.kind === 'cable' && fault.deviceId === device.id && !fixed('reseat-cable')) {
    link = 'down'
    media = 'Media disconnected'
  }

  if (fault.kind === 'bad-port' && fault.port === portId && !fixed('replace-patch-lead')) {
    link = 'down'
    media = 'Media disconnected'
  }

  if (
    fault.kind === 'ap-down' &&
    wirelessAp === fault.deviceId &&
    !fixed('power-cycle-ap')
  ) {
    link = 'down'
    media = 'The wireless network is not available'
    signal = 'none'
  }

  if (
    fault.kind === 'weak-coverage' &&
    wirelessAp === fault.deviceId &&
    !fixed('reposition-ap')
  ) {
    signal = 'weak'
    speedMbps = 24
  }

  if (fault.kind === 'trunk-vlan' && fault.vlanId === vlanId && !fixed('restore-trunk-vlan')) {
    address = apipa(device.id)
    lease = 'none'
    gateway = null
  }

  if (fault.kind === 'dhcp-exhausted' && fault.vlanId === vlanId) {
    if (!fixed('release-stale-leases')) {
      address = apipa(device.id)
      lease = 'none'
    } else if (!fixed('renew-lease')) {
      address = apipa(device.id)
      lease = 'expired'
      pendingRenew = true
    }
  }

  if (fault.kind === 'ip-conflict' && fault.deviceId === device.id) {
    if (!fixed('clear-static-address')) {
      dhcp = false
      address = fault.address
      conflict = true
      lease = 'none'
    } else if (!fixed('renew-lease')) {
      address = apipa(device.id)
      lease = 'expired'
      pendingRenew = true
    }
  }

  if (fault.kind === 'wrong-vlan' && fault.deviceId === device.id) {
    if (!fixed('set-port-vlan')) {
      vlanId = fault.actualVlan
      address = `10.10.20.${address.split('.').pop() ?? '104'}`
      gateway = vlanById(fault.actualVlan).gateway
      signal = 'none'
    } else if (!fixed('renew-lease')) {
      address = apipa(device.id)
      lease = 'expired'
      pendingRenew = true
    }
  }

  if (fault.kind === 'duplex' && fault.port === portId && !fixed('set-port-auto')) {
    speedMbps = 100
    duplex = 'half'
  }

  if (fault.kind === 'rogue-dhcp' && fault.vlanId === vlanId && portId !== fault.port) {
    if (!fixed('shutdown-rogue-port')) {
      rogueLease = true
      address = `192.168.0.${50 + (device.id.length % 40)}`
      gateway = '192.168.0.1'
      lease = 'active'
    } else if (!fixed('renew-lease')) {
      address = apipa(device.id)
      lease = 'expired'
      pendingRenew = true
    }
  }

  if (link === 'down') {
    address = apipa(device.id)
    lease = 'none'
    gateway = null
    signal = wirelessAp ? 'none' : signal
  }

  // A renewal that has been paid for takes the base address back, whatever the
  // fault had left behind.
  if (pendingRenew && fixed('renew-lease')) {
    address = addressFor(device)
    lease = 'active'
    gateway = vlanById(vlanId).gateway
  }

  // The gateway fix is the one change that touches the adapter directly, so it
  // is applied last and survives every other branch.
  if (
    fault.kind === 'wrong-gateway' &&
    fault.deviceId === device.id &&
    fixed('set-correct-gateway') &&
    link === 'up'
  ) {
    gateway = vlanById(vlanId).gateway
  }


  return {
    deviceId: device.id,
    hostname: device.name,
    vlanId,
    switchPort: portId,
    link,
    media,
    dhcp,
    address,
    prefix: 24,
    gateway,
    dns,
    lease,
    conflict,
    rogueLease,
    ssid,
    signal,
    speedMbps,
    duplex,
  }
}

/** Applies a partial change to a port that exists, leaving the rest untouched. */
function patchPort(
  ports: Record<string, PortView>,
  id: string,
  patch: Partial<PortView>,
): void {
  const current = ports[id]
  if (current) {
    ports[id] = { ...current, ...patch }
  }
}

export function buildEstate(
  incident: Pick<Incident, 'id' | 'fault'>,
  fixes: readonly FixId[],
): LabEstate {
  const fault = incident.fault
  const ports = basePorts()

  if (fault.kind === 'bad-port' && !fixes.includes('replace-patch-lead')) {
    patchPort(ports, fault.port, { status: 'down', errors: 1_240, speedMbps: 100 })
  }

  if (fault.kind === 'trunk-vlan' && !fixes.includes('restore-trunk-vlan')) {
    patchPort(ports, 'Gi1/0/1', { allowedVlans: ['10'] })
  }

  if (fault.kind === 'duplex' && !fixes.includes('set-port-auto')) {
    patchPort(ports, fault.port, { speedMbps: 100, duplex: 'half', errors: 318 })
  }

  if (fault.kind === 'cable' && !fixes.includes('reseat-cable')) {
    const port = portIdFor(fault.deviceId)
    if (port) {
      patchPort(ports, port, { status: 'down' })
    }
  }

  if (fault.kind === 'ap-down' && !fixes.includes('power-cycle-ap')) {
    const port = deviceById(fault.deviceId)?.port
    if (port) {
      patchPort(ports, port, { status: 'down' })
    }
  }

  if (fault.kind === 'rogue-dhcp' && !fixes.includes('shutdown-rogue-port')) {
    patchPort(ports, fault.port, { status: 'up', name: 'Unauthorised device' })
  }

  const clients: Record<string, ClientView> = {}
  for (const device of TOPOLOGY.devices) {
    if (device.kind === 'client') {
      clients[device.id] = clientView(device, fault, fixes, ports)
    }
  }

  const vlans: VlanView[] = VLAN_IDS.map((id) => {
    const vlan = vlanById(id)
    const leased = vlanLeased(id, fault, fixes)
    const routed =
      !(fault.kind === 'trunk-vlan' && fault.vlanId === id) || fixes.includes('restore-trunk-vlan')
    return { ...vlan, leased, free: Math.max(0, POOL_SIZE - leased), routed }
  })

  const servers: Record<string, ServerView> = {}
  for (const device of TOPOLOGY.devices) {
    if (device.kind !== 'server') {
      continue
    }
    const dnsStopped =
      device.id === 'srv-dc01' &&
      fault.kind === 'dns-service' &&
      !fixes.includes('start-dns-service')
    servers[device.id] = {
      deviceId: device.id,
      hostname: device.name,
      address: device.address ?? '',
      role: device.role,
      services:
        device.id === 'srv-dc01'
          ? [dnsStopped ? 'DNS (stopped)' : 'DNS', 'Kerberos', 'LDAP']
          : ['SMB file sharing', 'Print spooler'],
    }
  }

  const apSignal: Record<string, 'good' | 'weak' | 'down'> = {}
  const apClients: Record<string, readonly string[]> = {}
  for (const device of TOPOLOGY.devices) {
    if (device.kind !== 'ap') {
      continue
    }
    const down =
      fault.kind === 'ap-down' &&
      fault.deviceId === device.id &&
      !fixes.includes('power-cycle-ap')
    const weak =
      fault.kind === 'weak-coverage' &&
      fault.deviceId === device.id &&
      !fixes.includes('reposition-ap')
    apSignal[device.id] = down ? 'down' : weak ? 'weak' : 'good'
    apClients[device.id] = CLIENT_IDS.filter(
      (clientId) => deviceById(clientId)?.wireless?.apId === device.id,
    )
  }

  const modemSync = fault.kind !== 'isp-outage'
  const firewallWanUp = !(
    fault.kind === 'firewall-wan-down' && !fixes.includes('bring-wan-up')
  )
  const routerWanUp = modemSync && firewallWanUp

  return {
    incidentId: incident.id,
    fixes: [...fixes],
    vlans,
    ports,
    clients,
    servers,
    apSignal,
    apClients,
    wan: {
      modemSync,
      firewallWanUp,
      routerWanUp,
      publicAddress: TOPOLOGY.isp.publicAddress,
      wanUp: modemSync && firewallWanUp && routerWanUp,
      ticketRaised:
        fault.kind === 'isp-outage' &&
        fixes.includes('confirm-outage') &&
        fixes.includes('raise-isp-ticket'),
    },
    dnsUp: !(fault.kind === 'dns-service' && !fixes.includes('start-dns-service')),
    blocked:
      fault.kind === 'firewall-block' && !fixes.includes('remove-block-rule')
        ? { host: fault.host, port: fault.port }
        : null,
    roguePort:
      fault.kind === 'rogue-dhcp' && !fixes.includes('shutdown-rogue-port') ? fault.port : null,
  }
}

/** FNV-ish hash, used for deterministic reply times and addresses. */
export function hashText(value: string): number {
  let hash = 2_166_136_261
  for (const character of value) {
    hash ^= character.charCodeAt(0)
    hash = Math.imul(hash, 16_777_619)
  }
  return hash >>> 0
}

/** Whether an address is on a VLAN's own subnet. */
export function onSubnet(address: string, subnet: string): boolean {
  const prefix = subnet.split('/')[0] ?? ''
  return address.split('.').slice(0, 3).join('.') === prefix.split('.').slice(0, 3).join('.')
}

/** Whether the client can reach its own VLAN's gateway. */
export function gatewayReachable(estate: LabEstate, client: ClientView): boolean {
  if (client.link === 'down' || client.rogueLease || client.conflict) {
    return false
  }
  const vlan = estate.vlans.find((entry) => entry.id === client.vlanId)
  if (!vlan || !vlan.routed) {
    return false
  }
  return client.gateway === vlan.gateway
}

/** Whether the client has a working path off the school's own network. */
export function internetReachable(estate: LabEstate, client: ClientView): boolean {
  return gatewayReachable(estate, client) && estate.wan.wanUp
}

/** The estate a stored attempt describes. */
export function estateFor(incident: Incident, state: AttemptState): LabEstate {
  return buildEstate(incident, state.fixes)
}

/** The healthy school network: what the topology and device pages show. */
export function baselineEstate(): LabEstate {
  return buildEstate({ id: 'baseline', fault: { kind: 'none' } }, [])
}

export { POOL_SIZE, apipa }
