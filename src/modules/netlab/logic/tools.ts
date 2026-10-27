import { deviceById, TOPOLOGY, vlanById } from '../data/topology'
import {
  blank,
  column,
  failure,
  line,
  muted,
  type ConsoleLine,
} from '../../shared/console'
import type { CheckId, ClientView, LabEstate } from '../types'
import { gatewayReachable, hashText, internetReachable } from './estate'

/**
 * The simulated tool box.
 *
 * Every command is a read of the estate the fixes have produced. Nothing here
 * changes anything: a change is an action the workspace offers, because a change
 * has to be scored and logged, and a typed command that silently altered the
 * switch would be neither. Each read that counts as diagnostic evidence comes
 * back with its check id, and the page records it against the attempt.
 */

export interface ToolContext {
  estate: LabEstate
  /** The device the console is pointed at. */
  deviceId: string
}

export interface ToolOutcome {
  lines: readonly ConsoleLine[]
  /** The diagnostic step this read counts as, when it counts as one. */
  check?: CheckId
  /** Some output replaces the whole scrollback. */
  cleared?: boolean
}

const CLIENT_COMMANDS = [
  'ipconfig /all',
  'ping <host>',
  'tracert <host>',
  'nslookup <name> [server]',
  'arp -a',
  'netstat -an',
  'test-netconnection <host> -port <n>',
  'netsh wlan show interfaces',
  'clear',
  'help',
] as const

const SWITCH_COMMANDS = [
  'show ip interface brief',
  'show interfaces status',
  'show interfaces trunk',
  'show vlan',
  'show mac address-table',
  'clear',
  'help',
] as const

const ROUTER_COMMANDS = [
  'show ip interface brief',
  'show ip route',
  'show ip dhcp pool',
  'show ip dhcp binding',
  'ping <host>',
  'clear',
  'help',
] as const

function isClient(estate: LabEstate, deviceId: string): ClientView | null {
  return estate.clients[deviceId] ?? null
}

/** Whether two devices sit on the same broadcast domain. */
function sameVlan(left: string, right: string): boolean {
  return deviceById(left)?.vlanId === deviceById(right)?.vlanId
}

function internalDeviceByAddress(address: string) {
  return TOPOLOGY.devices.find((device) => device.address === address)
}

function resolveName(estate: LabEstate, name: string): string | null {
  if (!estate.dnsUp) {
    return null
  }
  const normalized = name.toLowerCase().replace(/\.$/, '')
  const record = TOPOLOGY.dnsRecords.find(
    (entry) =>
      entry.name.toLowerCase() === normalized ||
      entry.name.toLowerCase() === `${normalized}.${TOPOLOGY.domain}`,
  )
  return record?.address ?? null
}

function isPublic(address: string): boolean {
  return !address.startsWith('10.') && !address.startsWith('169.254.') && !address.startsWith('192.168.')
}

function isPublicName(name: string): boolean {
  return !name.toLowerCase().includes(TOPOLOGY.domain)
}

interface Target {
  label: string
  address: string | null
  deviceId: string | null
  external: boolean
}

function resolveTarget(estate: LabEstate, input: string): Target {
  const value = input.trim().replace(/^https?:\/\//, '')
  const host = value.split('/')[0] ?? value
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) {
    const device = internalDeviceByAddress(host)
    return {
      label: host,
      address: host,
      deviceId: device?.id ?? null,
      external: isPublic(host),
    }
  }
  const device = TOPOLOGY.devices.find(
    (entry) =>
      entry.name.toLowerCase() === host.toLowerCase() ||
      entry.id.toLowerCase() === host.toLowerCase(),
  )
  if (device?.address) {
    return { label: host, address: device.address, deviceId: device.id, external: false }
  }
  const resolved = resolveName(estate, host)
  return {
    label: host,
    address: resolved,
    deviceId: null,
    external: isPublicName(host),
  }
}

/** Why a target did or did not answer, in the sentence the tool prints. */
type Reach =
  | { kind: 'reply'; ms: number }
  | { kind: 'timeout' }
  | { kind: 'unreachable'; from: string }
  | { kind: 'unknown-host' }

function pingTarget(estate: LabEstate, client: ClientView, target: Target): Reach {
  if (client.link === 'down') {
    return { kind: 'unreachable', from: client.address }
  }
  if (target.address === null) {
    return { kind: 'unknown-host' }
  }

  const base = 1 + (hashText(`${client.deviceId}:${target.address}`) % 4)

  if (target.external) {
    if (!internetReachable(estate, client)) {
      return gatewayReachable(estate, client)
        ? { kind: 'unreachable', from: client.gateway ?? 'gateway' }
        : { kind: 'timeout' }
    }
    return { kind: 'reply', ms: base + 12 }
  }

  if (target.address === client.address) {
    return { kind: 'reply', ms: base }
  }

  const other = target.deviceId ? estate.clients[target.deviceId] : null
  const otherVlan = target.deviceId ? deviceById(target.deviceId)?.vlanId : null

  if (otherVlan === client.vlanId) {
    if (client.rogueLease || client.conflict && target.address !== client.gateway) {
      return { kind: 'timeout' }
    }
    if (other && other.link === 'down') {
      return { kind: 'timeout' }
    }
    return { kind: 'reply', ms: base }
  }

  // Off-subnet: the packet has to cross the router.
  if (!gatewayReachable(estate, client)) {
    return client.gateway
      ? { kind: 'unreachable', from: client.gateway }
      : { kind: 'timeout' }
  }
  const vlan = estate.vlans.find((entry) => entry.id === otherVlan)
  if (vlan && !vlan.routed) {
    return { kind: 'timeout' }
  }
  if (other && other.link === 'down') {
    return { kind: 'timeout' }
  }
  return { kind: 'reply', ms: base + 4 }
}

function pingLines(target: Target, reach: Reach): ConsoleLine[] {
  if (reach.kind === 'unknown-host') {
    return [
      line(`Ping request could not find host ${target.label}. Please check the name and try again.`),
    ]
  }
  if (reach.kind === 'unreachable') {
    return [
      blank(),
      line(`Pinging ${target.label} [${target.address ?? target.label}] with 32 bytes of data:`),
      line(`Reply from ${reach.from}: Destination host unreachable.`),
      line(`Reply from ${reach.from}: Destination host unreachable.`),
      blank(),
      line('Ping statistics for ' + (target.address ?? target.label) + ':'),
      line('    Packets: Sent = 4, Received = 0, Lost = 4 (100% loss),'),
    ]
  }
  if (reach.kind === 'timeout') {
    return [
      blank(),
      line(`Pinging ${target.label} [${target.address ?? target.label}] with 32 bytes of data:`),
      line('Request timed out.'),
      line('Request timed out.'),
      line('Request timed out.'),
      line('Request timed out.'),
      blank(),
      line('Ping statistics for ' + (target.address ?? target.label) + ':'),
      line('    Packets: Sent = 4, Received = 0, Lost = 4 (100% loss),'),
    ]
  }
  return [
    blank(),
    line(`Pinging ${target.label} [${target.address ?? target.label}] with 32 bytes of data:`),
    line(`Reply from ${target.address ?? target.label}: bytes=32 time=${reach.ms}ms TTL=128`),
    line(`Reply from ${target.address ?? target.label}: bytes=32 time=${reach.ms + 1}ms TTL=128`),
    line(`Reply from ${target.address ?? target.label}: bytes=32 time=${reach.ms}ms TTL=128`),
    line(`Reply from ${target.address ?? target.label}: bytes=32 time=${reach.ms + 2}ms TTL=128`),
    blank(),
    line('Ping statistics for ' + (target.address ?? target.label) + ':'),
    line('    Packets: Sent = 4, Received = 4, Lost = 0 (0% loss),'),
  ]
}

function ipconfig(client: ClientView): ConsoleLine[] {
  const wireless = deviceById(client.deviceId)?.wireless !== undefined
  const adapter = wireless ? 'Wireless LAN adapter Wi-Fi' : 'Ethernet adapter Ethernet'
  const description = wireless
    ? 'Intel(R) Wi-Fi 6 AX201 160MHz'
    : 'Realtek PCIe GbE Family Controller'
  const device = deviceById(client.deviceId)
  const dnsSuffix = TOPOLOGY.domain

  const lines: ConsoleLine[] = [
    blank(),
    line('Windows IP Configuration'),
    blank(),
    line(`   Host Name . . . . . . . . . . . . : ${client.hostname}`),
    line(`   Primary Dns Suffix  . . . . . . . : ${dnsSuffix}`),
    line('   Node Type . . . . . . . . . . . . : Hybrid'),
    line('   IP Routing Enabled. . . . . . . . : No'),
    blank(),
    line(adapter + ':'),
    blank(),
    line(`   Connection-specific DNS Suffix  . : ${dnsSuffix}`),
    line(`   Description . . . . . . . . . . . : ${description}`),
    line(`   Physical Address. . . . . . . . . : ${device?.mac ?? 'F0-9F-C2-00-00-00'}`),
    line(`   DHCP Enabled. . . . . . . . . . . : ${client.dhcp ? 'Yes' : 'No'}`),
  ]

  if (client.link === 'down') {
    lines.push(line('   Media State . . . . . . . . . . . : Media disconnected'))
    if (wireless) {
      lines.push(line(`   SSID . . . . . . . . . . . . . . . : ${client.ssid ?? ''}`))
    }
    return lines
  }

  lines.push(line('   Autoconfiguration Enabled . . . . : Yes'))

  if (client.address.startsWith('169.254.')) {
    lines.push(line(`   Autoconfiguration IPv4 Address. . : ${client.address}(Preferred)`))
  } else {
    lines.push(line(`   IPv4 Address. . . . . . . . . . . : ${client.address}(Preferred)`))
  }
  lines.push(line('   Subnet Mask . . . . . . . . . . . : 255.255.255.0'))

  if (client.lease === 'active' && client.dhcp) {
    lines.push(line('   Lease Obtained. . . . . . . . . . : 26 October 2026 08:12:04'))
    lines.push(line('   Lease Expires . . . . . . . . . . : 26 October 2026 20:12:04'))
  }
  if (client.gateway) {
    lines.push(line(`   Default Gateway . . . . . . . . . : ${client.gateway}`))
  }
  if (client.dhcp && client.lease === 'active') {
    lines.push(
      line(
        `   DHCP Server . . . . . . . . . . . : ${
          client.rogueLease ? '192.168.0.1' : '10.10.10.10'
        }`,
      ),
    )
  }
  lines.push(line(`   DNS Servers . . . . . . . . . . . : ${client.dns.join(', ')}`))
  if (wireless) {
    lines.push(line(`   SSID . . . . . . . . . . . . . . . : ${client.ssid ?? ''}`))
  }
  if (client.conflict) {
    lines.push(
      line(
        '   Duplicate address detected: another device on the network is using this IPv4 address.',
      ),
    )
  }
  return lines
}

function tracert(estate: LabEstate, client: ClientView, target: Target): ConsoleLine[] {
  const lines: ConsoleLine[] = [
    blank(),
    line(`Tracing route to ${target.label} [${target.address ?? 'unknown'}]`),
    line('over a maximum of 30 hops:'),
    blank(),
  ]

  if (client.link === 'down') {
    lines.push(line('  1     *        *        *     Request timed out.'))
    return lines
  }
  if (target.address === null) {
    lines.push(line(`Unable to resolve target system name ${target.label}.`))
    return lines
  }

  const sameSubnet =
    target.address.startsWith(
      client.vlanId === '10' ? '10.10.10.' : '10.10.20.',
    ) || target.address === client.address

  if (sameSubnet) {
    lines.push(line(`  1     1 ms     1 ms     1 ms  ${target.label} [${target.address}]`))
    return lines
  }

  if (!gatewayReachable(estate, client)) {
    lines.push(line('  1     *        *        *     Request timed out.'))
    return lines
  }

  let hop = 1
  lines.push(line(`  ${hop}    1 ms     1 ms     1 ms  10.10.${client.vlanId}.1`))
  hop += 1
  lines.push(line(`  ${hop}    2 ms     2 ms     2 ms  172.16.0.1`))
  hop += 1

  if (target.external && !internetReachable(estate, client)) {
    lines.push(line(`  ${hop}     *        *        *     Request timed out.`))
    lines.push(blank())
    lines.push(muted('The trace stops at the edge of the school network.'))
    return lines
  }

  lines.push(line(`  ${hop}    7 ms     6 ms     7 ms  203.0.113.1`))
  hop += 1
  lines.push(line(`  ${hop}   12 ms    11 ms    12 ms  ${target.label} [${target.address}]`))
  lines.push(blank())
  lines.push(line('Trace complete.'))
  return lines
}

function nslookup(estate: LabEstate, client: ClientView, name: string | undefined): ConsoleLine[] {
  if (!name) {
    return [failure('Usage: nslookup <name> [server]')]
  }
  if (client.link === 'down') {
    return [
      line('DNS request timed out.'),
      line('    timeout was 2 seconds.'),
      line(`*** Can't find server name for address 10.10.10.10: Timed out`),
    ]
  }
  if (!estate.dnsUp) {
    return [
      line('DNS request timed out.'),
      line('    timeout was 2 seconds.'),
      line('*** Request to srv-dc01.ashfield.sch.uk timed out.'),
    ]
  }
  const address = resolveName(estate, name)
  if (!address) {
    return [
      line('Server:  srv-dc01.ashfield.sch.uk'),
      line('Address:  10.10.10.10'),
      blank(),
      line(`*** srv-dc01.ashfield.sch.uk can't find ${name}: Non-existent domain`),
    ]
  }
  return [
    line('Server:  srv-dc01.ashfield.sch.uk'),
    line('Address:  10.10.10.10'),
    blank(),
    line(`Name:    ${name}`),
    line(`Address:  ${address}`),
  ]
}

function arp(client: ClientView): ConsoleLine[] {
  if (client.link === 'down') {
    return [line('No ARP Entries Found.')]
  }
  const lines: ConsoleLine[] = [
    blank(),
    line(`Interface: ${client.address} --- 0x${client.vlanId}`),
    line('  Internet Address      Physical Address      Type'),
  ]
  const vlan = vlanById(client.vlanId)
  const entries = TOPOLOGY.devices
    .filter(
      (device) =>
        device.vlanId === client.vlanId &&
        device.id !== client.deviceId &&
        device.address !== undefined,
    )
    .slice(0, 6)
  lines.push(
    line(`  ${column(client.gateway ?? vlan.gateway, 22)}${'F0-9F-C2-00-00-03'.padEnd(22)}dynamic`),
  )
  for (const device of entries) {
    lines.push(
      line(`  ${column(device.address ?? '', 22)}${device.mac.toLowerCase().replace(/-/g, '-').padEnd(22)}dynamic`),
    )
  }
  if (client.conflict) {
    lines.push(
      line(`  ${column('10.10.10.120', 22)}${'9C-93-4E-2A-71-04'.padEnd(22)}dynamic`),
    )
  }
  if (client.rogueLease) {
    lines.push(
      line(`  ${column('192.168.0.1', 22)}${'70-3A-CB-11-22-33'.padEnd(22)}dynamic`),
    )
  }
  return lines
}

function netstat(estate: LabEstate, client: ClientView): ConsoleLine[] {
  const lines: ConsoleLine[] = [
    blank(),
    line('Active Connections'),
    blank(),
    line('  Proto  Local Address          Foreign Address        State'),
  ]
  if (client.link === 'down') {
    lines.push(line('  TCP    ' + client.address + ':139       0.0.0.0:0              LISTENING'))
    return lines
  }
  lines.push(line(`  TCP    ${client.address}:139      0.0.0.0:0              LISTENING`))
  lines.push(line(`  TCP    ${client.address}:445      0.0.0.0:0              LISTENING`))
  if (gatewayReachable(estate, client)) {
    lines.push(
      line(`  TCP    ${client.address}:49812    10.10.10.11:445        ESTABLISHED`),
    )
  }
  if (internetReachable(estate, client) && !estate.blocked) {
    lines.push(
      line(`  TCP    ${client.address}:49834    203.0.113.44:443       ESTABLISHED`),
    )
  }
  if (estate.blocked) {
    lines.push(
      line(`  TCP    ${client.address}:49836    203.0.113.44:443       SYN_SENT`),
    )
  }
  return lines
}

function testPort(
  estate: LabEstate,
  client: ClientView,
  target: Target,
  port: number,
): ConsoleLine[] {
  const resolved = target.address
  const blocked =
    estate.blocked !== null &&
    (estate.blocked.host === target.label || estate.blocked.host === target.address) &&
    estate.blocked.port === port
  const reachable =
    resolved !== null &&
    (target.external
      ? internetReachable(estate, client)
      : gatewayReachable(estate, client) || sameVlan(client.deviceId, target.deviceId ?? ''))
  const succeeded = reachable && !blocked

  const lines: ConsoleLine[] = [
    blank(),
    line(`ComputerName     : ${target.label}`),
    line(`RemoteAddress    : ${resolved ?? ''}`),
    line(`RemotePort       : ${port}`),
    line(`TcpTestSucceeded : ${succeeded ? 'True' : 'False'}`),
  ]
  if (blocked) {
    lines.push(blank())
    lines.push(muted('The connection was reset before the handshake completed.'))
  }
  if (!reachable) {
    lines.push(blank())
    lines.push(muted('No route to the remote address.'))
  }
  return lines
}

function wifi(client: ClientView): ConsoleLine[] {
  const apId = deviceById(client.deviceId)?.wireless?.apId
  if (!apId) {
    return [failure("There is no wireless interface on this device. Use 'ipconfig /all' instead.")]
  }
  const ap = deviceById(apId)
  const signal = client.signal
  const rate = signal === 'weak' ? '24 Mbps' : '866 Mbps'
  return [
    blank(),
    line('Interface name: Wi-Fi'),
    line(`    SSID                   : ${client.ssid ?? '—'}`),
    line(`    BSSID                  : ${ap?.mac.toLowerCase() ?? '—'}`),
    line(`    Signal                 : ${signal === 'none' ? '0%' : signal === 'weak' ? '28%' : '82%'}`),
    line(`    Receive rate (Mbps)    : ${signal === 'none' ? '0' : rate.replace(' Mbps', '')}`),
    line(`    Transmit rate (Mbps)   : ${signal === 'none' ? '0' : rate.replace(' Mbps', '')}`),
    line(`    State                  : ${client.link === 'down' ? 'disconnected' : 'connected'}`),
    line(`    Radio type             : 802.11ax`),
  ]
}

function clientCommand(context: ToolContext, input: string): ToolOutcome {
  const { estate, deviceId } = context
  const client = isClient(estate, deviceId)
  if (!client) {
    return { lines: [failure('This console can only run client tools on a client device.')] }
  }
  const parts = input.trim().split(/\s+/)
  const command = (parts[0] ?? '').toLowerCase()

  if (command === 'help' || command === '?') {
    return {
      lines: [
        muted('Client tools. Every command is a read of the simulated machine.'),
        ...CLIENT_COMMANDS.map((entry) => line(`  ${entry}`)),
      ],
    }
  }
  if (command === 'clear' || command === 'cls') {
    return { lines: [], cleared: true }
  }
  if (command === 'ipconfig') {
    return { lines: ipconfig(client), check: 'adapter' }
  }
  if (command === 'ping') {
    const target = resolveTarget(estate, parts[1] ?? '')
    if (parts.length < 2) {
      return { lines: [failure('Usage: ping <host>')] }
    }
    const reach = pingTarget(estate, client, target)
    const check: CheckId = target.external
      ? 'reach-internet'
      : target.address === client.gateway
        ? 'gateway'
        : 'reach-host'
    return { lines: pingLines(target, reach), check }
  }
  if (command === 'tracert' || command === 'traceroute') {
    return { lines: tracert(estate, client, resolveTarget(estate, parts[1] ?? '')), check: 'path' }
  }
  if (command === 'nslookup') {
    return { lines: nslookup(estate, client, parts[1]), check: 'dns' }
  }
  if (command === 'arp') {
    return { lines: arp(client), check: 'arp' }
  }
  if (command === 'netstat') {
    return { lines: netstat(estate, client), check: 'sockets' }
  }
  if (command === 'test-netconnection' || command === 'tnc') {
    const target = resolveTarget(estate, parts[1] ?? '')
    const flag = parts.findIndex((part) => part.toLowerCase() === '-port')
    const port = flag >= 0 ? Number(parts[flag + 1]) : 443
    if (parts.length < 2 || !Number.isInteger(port)) {
      return { lines: [failure('Usage: test-netconnection <host> -port <n>')] }
    }
    return { lines: testPort(estate, client, target, port), check: 'port' }
  }
  if (command === 'netsh') {
    return { lines: wifi(client), check: 'wifi' }
  }

  return {
    lines: [
      failure(`'${input.trim()}' is not recognised by this console.`),
      muted("Type 'help' for the client tools."),
    ],
  }
}

function portStatusLabel(status: string): string {
  if (status === 'up') {
    return 'connected'
  }
  if (status === 'admin-down') {
    return 'administratively down'
  }
  if (status === 'err-disabled') {
    return 'err-disabled'
  }
  return 'notconnect'
}

function showPorts(estate: LabEstate): ConsoleLine[] {
  const lines: ConsoleLine[] = [
    line('Port      Name               Status               Vlan       Duplex  Speed Type'),
  ]
  for (const port of Object.values(estate.ports)) {
    const auto = port.duplex === 'full' && port.speedMbps === 1000
    const duplex = auto ? 'a-full' : port.duplex === 'half' ? 'half' : 'full'
    const speed = auto ? 'a-1000' : String(port.speedMbps)
    lines.push(
      line(
        `${column(port.id, 10)}${column(port.name, 19)}${column(portStatusLabel(port.status), 21)}${column(
          port.mode === 'trunk' ? 'trunk' : port.vlanId,
          11,
        )}${column(duplex, 8)}${column(speed, 8)}10/100/1000BaseTX`,
      ),
    )
  }
  return lines
}

function showInterfacesBrief(estate: LabEstate, deviceId: string): ConsoleLine[] {
  if (deviceId === 'rtr-core') {
    return [
      line('Interface                  IP-Address      OK? Method Status                Protocol'),
      line('GigabitEthernet0/0/0       172.16.0.2      YES NVRAM  up                    up'),
      line('GigabitEthernet0/0/0.10    10.10.10.1      YES NVRAM  up                    up'),
      line('GigabitEthernet0/0/0.20    10.10.20.1      YES NVRAM  up                    up'),
      line('Loopback0                  10.255.0.1      YES manual up                    up'),
    ]
  }
  const lines: ConsoleLine[] = [
    line('Interface              IP-Address      OK? Method Status                Protocol'),
    line('Vlan10                 10.10.10.2      YES NVRAM  up                    up'),
  ]
  for (const port of Object.values(estate.ports)) {
    if (port.mode === 'trunk') {
      continue
    }
    const status =
      port.status === 'admin-down'
        ? 'administratively down'
        : port.status === 'up'
          ? 'up'
          : 'down'
    const protocol = port.status === 'up' ? 'up' : 'down'
    lines.push(
      line(
        `${column(`GigabitEthernet${port.id.replace('Gi', '')}`, 23)}${column(
          'unassigned',
          16,
        )}YES unset  ${column(status, 22)}${protocol}`,
      ),
    )
  }
  return lines
}

function showVlan(estate: LabEstate): ConsoleLine[] {
  const lines: ConsoleLine[] = [
    line('VLAN Name                             Status    Ports'),
    line('---- -------------------------------- --------- -------------------------------'),
  ]
  for (const vlan of estate.vlans) {
    const ports = Object.values(estate.ports)
      .filter((port) => port.mode === 'access' && port.vlanId === vlan.id && port.status !== 'down')
      .map((port) => port.id)
    lines.push(
      line(
        `${column(vlan.id, 5)}${column(vlan.name, 33)}${column('active', 10)}${ports
          .slice(0, 6)
          .join(', ')}${ports.length > 6 ? ', …' : ''}`,
      ),
    )
  }
  lines.push(blank())
  lines.push(muted('VLAN 20 is active locally even when the trunk is not carrying it.'))
  return lines
}

function showTrunk(estate: LabEstate): ConsoleLine[] {
  const trunk = estate.ports['Gi1/0/1']
  return [
    line('Port        Mode         Encapsulation  Status        Native vlan'),
    line(
      `${column('Gi1/0/1', 12)}${column('on', 13)}${column('802.1q', 15)}${column(
        trunk?.status === 'up' ? 'trunking' : 'not-trunking',
        14,
      )}10`,
    ),
    blank(),
    line('Port        Vlans allowed on trunk'),
    line(`${column('Gi1/0/1', 12)}${(trunk?.allowedVlans ?? []).join(',')}`),
    blank(),
    line('Port        Vlans allowed and active in management domain'),
    line(`${column('Gi1/0/1', 12)}${(trunk?.allowedVlans ?? []).join(',')}`),
  ]
}

function showMacTable(estate: LabEstate): ConsoleLine[] {
  const lines: ConsoleLine[] = [
    line('Mac Address Table'),
    line('-------------------------------------------'),
    line('Vlan    Mac Address       Type        Ports'),
    line('----    -----------       --------    -----'),
  ]
  for (const device of TOPOLOGY.devices) {
    if (!device.port || device.kind === 'router' || device.kind === 'switch') {
      continue
    }
    const port = estate.ports[device.port]
    if (!port || port.status === 'down') {
      continue
    }
    const vlan = device.vlanId ?? port.vlanId
    lines.push(
      line(
        `${column(vlan, 8)}${column(device.mac.toLowerCase(), 18)}DYNAMIC     ${device.port}`,
      ),
    )
  }
  if (estate.roguePort) {
    for (const suffix of ['01', '02', '03']) {
      lines.push(
        line(
          `${column('20', 8)}${column(`70-3a-cb-11-22-${suffix}`, 18)}DYNAMIC     ${estate.roguePort}`,
        ),
      )
    }
    lines.push(blank())
    lines.push(muted('A burst of addresses on one port is what a rogue DHCP server looks like.'))
  }
  if (estate.ports['Gi1/0/21']?.duplex === 'half') {
    lines.push(blank())
    lines.push(muted('The server port is negotiating at half duplex.'))
  }
  return lines
}

function showDhcpPool(estate: LabEstate): ConsoleLine[] {
  const lines: ConsoleLine[] = [
    line('Pool name                  Total   Leased  Free'),
    line('-------------------------  -----   ------  ----'),
  ]
  for (const vlan of estate.vlans) {
    lines.push(
      line(
        `${column(`${vlan.name.toLowerCase()} (VLAN ${vlan.id})`, 27)}${column(
          String(vlan.leased + vlan.free),
          7,
        )}${column(String(vlan.leased), 7)}${String(vlan.free)}`,
      ),
    )
  }
  lines.push(blank())
  lines.push(muted('Stale leases still count against the pool until they are released.'))
  return lines
}

function showDhcpBinding(estate: LabEstate): ConsoleLine[] {
  const lines: ConsoleLine[] = [
    line('IP address       Client Identifier     Lease expiration        Type'),
  ]
  for (const client of Object.values(estate.clients)) {
    if (client.address.startsWith('169.254.') || client.rogueLease) {
      continue
    }
    lines.push(
      line(
        `${column(client.address, 17)}${column(client.deviceId, 23)}26 October 2026 20:12   Automatic`,
      ),
    )
  }
  if (estate.vlans.some((vlan) => vlan.free === 0)) {
    lines.push(blank())
    lines.push(muted('The pool is full: every address is either leased or reserved.'))
  }
  return lines
}

function infraCommand(context: ToolContext, input: string): ToolOutcome {
  const { estate, deviceId } = context
  const parts = input.trim().split(/\s+/)
  const command = parts.join(' ').toLowerCase()

  if (command === 'help' || command === '?') {
    const commands = deviceId === 'rtr-core' ? ROUTER_COMMANDS : SWITCH_COMMANDS
    return {
      lines: [
        muted(
          deviceId === 'rtr-core'
            ? 'Router reads. Configuration is deliberately not available here.'
            : 'Switch reads. Configuration is deliberately not available here.',
        ),
        ...commands.map((entry) => line(`  ${entry}`)),
      ],
    }
  }
  if (command === 'clear' || command === 'cls') {
    return { lines: [], cleared: true }
  }
  if (command === 'enable' || command.startsWith('configure') || command === 'conf t') {
    return {
      lines: [
        failure('Configuration mode is not available in this lab.'),
        muted('Changes go through the incident action bar, so each one is logged and scored.'),
      ],
    }
  }

  if (deviceId === 'rtr-core') {
    if (command === 'show ip interface brief' || command === 'show ip int brief') {
      return { lines: showInterfacesBrief(estate, deviceId), check: 'link-status' }
    }
    if (command === 'show ip route') {
      return {
        lines: [
          line('Codes: L - local, C - connected, S - static, S* - default'),
          blank(),
          line('S*    0.0.0.0/0 [1/0] via 172.16.0.1'),
          line('C     10.10.10.0/24 is directly connected, GigabitEthernet0/0/0.10'),
          line('C     10.10.20.0/24 is directly connected, GigabitEthernet0/0/0.20'),
          line('C     172.16.0.0/30 is directly connected, GigabitEthernet0/0/0'),
        ],
      }
    }
    if (command === 'show ip dhcp pool') {
      return { lines: showDhcpPool(estate), check: 'dhcp-pool' }
    }
    if (command === 'show ip dhcp binding') {
      return { lines: showDhcpBinding(estate), check: 'dhcp-pool' }
    }
    if (parts[0]?.toLowerCase() === 'ping') {
      const target = resolveTarget(estate, parts[1] ?? '')
      const results: ConsoleLine[] = [
        blank(),
        line(
          `Type escape sequence to abort.\nSending 5, 100-byte ICMP Echos to ${target.address ?? target.label}, timeout is 2 seconds:`,
        ),
      ]
      const reachable =
        target.address !== null &&
        (target.external ? estate.wan.wanUp : estate.vlans.every((vlan) => vlan.routed))
      results.push(
        line(reachable ? '!!!!!' : '.....'),
        line(reachable ? 'Success rate is 100 percent (5/5)' : 'Success rate is 0 percent (0/5)'),
      )
      return { lines: results, check: target.external ? 'reach-internet' : 'reach-host' }
    }
  }

  if (command === 'show ip interface brief' || command === 'show ip int brief') {
    return { lines: showInterfacesBrief(estate, deviceId), check: 'link-status' }
  }
  if (command === 'show interfaces status' || command === 'show interface status') {
    return { lines: showPorts(estate), check: 'link-status' }
  }
  if (command === 'show interfaces trunk' || command === 'show interface trunk') {
    return { lines: showTrunk(estate), check: 'trunk' }
  }
  if (command === 'show vlan' || command === 'show vlan brief' || command === 'show vlan-switch') {
    return { lines: showVlan(estate), check: 'vlan' }
  }
  if (command === 'show mac address-table') {
    return { lines: showMacTable(estate), check: 'mac-table' }
  }

  return {
    lines: [
      failure(`'${input.trim()}' is not a read this console offers.`),
      muted("Type 'help' for the reads it does offer."),
    ],
  }
}

export function runTool(context: ToolContext, input: string): ToolOutcome {
  const device = deviceById(context.deviceId)
  if (!device) {
    return { lines: [failure(`There is no device ${context.deviceId} in this estate.`)] }
  }
  if (device.kind === 'router' || device.kind === 'switch') {
    return infraCommand(context, input)
  }
  return clientCommand(context, input)
}

/** What a device's own page can read, and which check it counts as. */
export interface EquipmentRead {
  deviceId: string
  label: string
  check: CheckId
  lines: readonly ConsoleLine[]
}

export function equipmentRead(estate: LabEstate, deviceId: string): EquipmentRead | null {
  const device = deviceById(deviceId)
  if (!device) {
    return null
  }
  if (device.kind === 'modem') {
    return {
      deviceId,
      label: 'Read the modem status',
      check: 'wan-status',
      lines: [
        line('Brookline ONT — status'),
        blank(),
        line(`  Circuit        : ${TOPOLOGY.isp.circuit}`),
        line(`  WAN address    : ${TOPOLOGY.isp.publicAddress}`),
        line(`  Sync           : ${estate.wan.modemSync ? 'up (DSL/fibre trained)' : 'LOST'}`),
        line(`  LAN link       : ${estate.wan.modemSync ? 'up, 1 Gb/s full duplex' : 'up'}`),
        line(`  Uptime         : ${estate.wan.modemSync ? '18 days' : '0 days (re-syncing)'}`),
        blank(),
        muted(
          estate.wan.modemSync
            ? 'Sync is the modem’s agreement with the provider. Up here means the circuit is healthy.'
            : 'No sync: the fault is upstream of the firewall and cannot be fixed inside the school.',
        ),
      ],
    }
  }
  if (device.kind === 'firewall') {
    return {
      deviceId,
      label: 'Read the firewall interfaces',
      check: 'wan-status',
      lines: [
        line('FortiGate 60F — interfaces'),
        blank(),
        line('  Name      Role      Address            Admin   Link'),
        line(
          `  wan1      WAN       ${TOPOLOGY.isp.lanAddress}/30       ${
            estate.wan.firewallWanUp ? 'up' : 'down'
          }     ${estate.wan.firewallWanUp ? 'up' : 'down'}`,
        ),
        line('  internal  LAN       172.16.0.1/30      up      up'),
        blank(),
        line('Outbound policy'),
        line('  seq 10   LAN → WAN   TCP 80,443      allow'),
        line(
          `  seq 20   LAN → WAN   ${
            estate.blocked ? `TCP ${estate.blocked.port} to ${estate.blocked.host}` : '—'
          }   ${estate.blocked ? 'deny' : 'allow'}`,
        ),
        blank(),
        muted(
          estate.wan.firewallWanUp
            ? 'The WAN interface is administratively up and has a link.'
            : 'The WAN interface is administratively down: a local state, not a circuit fault.',
        ),
      ],
    }
  }
  if (device.kind === 'server') {
    const view = estate.servers[deviceId]
    return {
      deviceId,
      label: `Read the services on ${device.name}`,
      check: 'dns',
      lines: [
        line(`${device.name} — services`),
        blank(),
        ...(view?.services ?? []).map((service) => line(`  ${service}`)),
        blank(),
        muted(
          estate.dnsUp
            ? 'SRV-DC01 is answering queries.'
            : 'The DNS service is stopped, so every name lookup on site times out.',
        ),
      ],
    }
  }
  if (device.kind === 'ap') {
    return {
      deviceId,
      label: 'Read the access point status',
      check: 'wifi',
      lines: [
        line(`${device.name} — radio status`),
        blank(),
        line(`  SSID        : ${device.ssid ?? '—'}`),
        line(`  VLAN        : ${device.vlanId ?? '—'}`),
        line(`  State       : ${estate.apSignal[deviceId] === 'down' ? 'down' : 'up'}`),
        line(
          `  Coverage    : ${
            estate.apSignal[deviceId] === 'weak' ? 'weak at the far end of the room' : 'good'
          }`,
        ),
        line(`  Clients     : ${(estate.apClients[deviceId] ?? []).length}`),
      ],
    }
  }
  return null
}
