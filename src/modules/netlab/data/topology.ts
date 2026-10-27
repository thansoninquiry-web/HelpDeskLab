import type { NetDevice, Topology, VlanId } from '../types'

/**
 * Ashfield Primary School's network.
 *
 * Fictional in every particular: the addresses are documentation ranges, the
 * school is invented, and every MAC in the estate comes from the same made-up
 * prefix. Two VLANs, one of each kind the lab teaches — staff and student.
 */

export const VLAN_IDS: readonly VlanId[] = ['10', '20']

export const TOPOLOGY: Topology = {
  site: 'Ashfield Primary School',
  domain: 'ashfield.sch.uk',
  isp: {
    name: 'Brookline Fibre',
    circuit: 'FTTP 500/100',
    publicAddress: '203.0.113.10',
    lanAddress: '203.0.113.9',
  },
  vlans: [
    {
      id: '10',
      name: 'Staff',
      subnet: '10.10.10.0/24',
      gateway: '10.10.10.1',
      dhcpStart: '10.10.10.100',
      dhcpEnd: '10.10.10.180',
      purpose: 'Offices, staff laptops, the two servers and the office printer.',
    },
    {
      id: '20',
      name: 'Student',
      subnet: '10.10.20.0/24',
      gateway: '10.10.20.1',
      dhcpStart: '10.10.20.100',
      dhcpEnd: '10.10.20.180',
      purpose: 'The computer room, the classroom bank and the student Wi-Fi.',
    },
  ],
  devices: [
    {
      id: 'modem-1',
      name: 'ISP modem',
      kind: 'modem',
      model: 'Brookline ONT (FTTP)',
      address: '203.0.113.9',
      mac: 'F0-9F-C2-00-00-01',
      uplink: 'fw-edge',
      area: 'Server cupboard',
      role: 'The fibre terminates here. It bridges the ISP circuit to the firewall.',
    },
    {
      id: 'fw-edge',
      name: 'Edge firewall',
      kind: 'firewall',
      model: 'FortiGate 60F',
      address: '203.0.113.9',
      mac: 'F0-9F-C2-00-00-02',
      uplink: 'modem-1',
      area: 'Server cupboard',
      role: 'WAN on the ISP side, LAN to the core router, and the outbound rules.',
    },
    {
      id: 'rtr-core',
      name: 'Core router',
      kind: 'router',
      model: 'Cisco ISR 4331',
      address: '10.10.10.1',
      mac: 'F0-9F-C2-00-00-03',
      uplink: 'fw-edge',
      area: 'Server cupboard',
      role: 'Routes between the two VLANs and runs both DHCP pools.',
    },
    {
      id: 'sw-core',
      name: 'Core switch',
      kind: 'switch',
      model: 'Cisco Catalyst 1000-24T',
      address: '10.10.10.2',
      mac: 'F0-9F-C2-00-00-04',
      uplink: 'rtr-core',
      area: 'Server cupboard',
      role: 'Twenty-four access ports and the trunk to the router.',
    },
    {
      id: 'ap-staff',
      name: 'Staff room AP',
      kind: 'ap',
      model: 'UniFi U6 Lite',
      vlanId: '10',
      address: '10.10.10.20',
      mac: 'F0-9F-C2-00-00-05',
      port: 'Gi1/0/2',
      uplink: 'sw-core',
      ssid: 'ASHFIELD-STAFF',
      area: 'Staff room',
      role: 'Staff Wi-Fi, bridged onto VLAN 10 and powered by the switch port.',
    },
    {
      id: 'ap-student',
      name: 'Classroom AP',
      kind: 'ap',
      model: 'UniFi U6 Lite',
      vlanId: '20',
      address: '10.10.20.20',
      mac: 'F0-9F-C2-00-00-06',
      port: 'Gi1/0/3',
      uplink: 'sw-core',
      ssid: 'ASHFIELD-STUDENT',
      area: 'Classroom 6',
      role: 'Student Wi-Fi, mounted high on the classroom wall.',
    },
    {
      id: 'srv-dc01',
      name: 'SRV-DC01',
      kind: 'server',
      model: 'Windows Server 2022',
      vlanId: '10',
      address: '10.10.10.10',
      mac: 'F0-9F-C2-00-00-10',
      port: 'Gi1/0/20',
      uplink: 'sw-core',
      area: 'Server cupboard',
      role: 'Domain controller and the only DNS server for the school.',
    },
    {
      id: 'srv-files',
      name: 'SRV-FILES',
      kind: 'server',
      model: 'Windows Server 2022',
      vlanId: '10',
      address: '10.10.10.11',
      mac: 'F0-9F-C2-00-00-11',
      port: 'Gi1/0/21',
      uplink: 'sw-core',
      area: 'Server cupboard',
      role: 'Shared drives for staff and the student work folders.',
    },
    {
      id: 'pc-staff-01',
      name: 'PC-STAFF-01',
      kind: 'client',
      model: 'Dell OptiPlex 7010',
      vlanId: '10',
      address: '10.10.10.101',
      mac: 'F0-9F-C2-00-00-21',
      port: 'Gi1/0/5',
      area: 'Main office',
      role: 'The office machine the head teacher uses.',
    },
    {
      id: 'pc-staff-02',
      name: 'PC-STAFF-02',
      kind: 'client',
      model: 'Dell OptiPlex 7010',
      vlanId: '10',
      address: '10.10.10.102',
      mac: 'F0-9F-C2-00-00-22',
      port: 'Gi1/0/6',
      area: 'Main office',
      role: 'The office machine the admin team shares.',
    },
    {
      id: 'pc-staff-03',
      name: 'PC-STAFF-03',
      kind: 'client',
      model: 'HP ProDesk 400 G9',
      vlanId: '10',
      address: '10.10.10.103',
      mac: 'F0-9F-C2-00-00-23',
      port: 'Gi1/0/7',
      area: 'Staff room',
      role: 'The staff-room machine, usually on DHCP.',
    },
    {
      id: 'pc-staff-04',
      name: 'PC-STAFF-04',
      kind: 'client',
      model: 'HP ProDesk 400 G9',
      vlanId: '10',
      address: '10.10.10.104',
      mac: 'F0-9F-C2-00-00-24',
      port: 'Gi1/0/8',
      area: 'Staff room',
      role: 'The new starter laptop dock, patched in last week.',
    },
    {
      id: 'pc-staff-05',
      name: 'PC-STAFF-05',
      kind: 'client',
      model: 'Dell OptiPlex 7010',
      vlanId: '10',
      address: '10.10.10.105',
      mac: 'F0-9F-C2-00-00-25',
      port: 'Gi1/0/9',
      area: 'Deputy head office',
      role: 'The deputy head’s machine.',
    },
    {
      id: 'pc-lab-01',
      name: 'PC-LAB-01',
      kind: 'client',
      model: 'Lenovo ThinkCentre M70q',
      vlanId: '20',
      address: '10.10.20.101',
      mac: 'F0-9F-C2-00-00-31',
      port: 'Gi1/0/10',
      area: 'Computer room',
      role: 'The first machine on the classroom bank.',
    },
    {
      id: 'pc-lab-02',
      name: 'PC-LAB-02',
      kind: 'client',
      model: 'Lenovo ThinkCentre M70q',
      vlanId: '20',
      address: '10.10.20.102',
      mac: 'F0-9F-C2-00-00-32',
      port: 'Gi1/0/11',
      area: 'Computer room',
      role: 'The second machine on the classroom bank.',
    },
    {
      id: 'pc-lab-03',
      name: 'PC-LAB-03',
      kind: 'client',
      model: 'Lenovo ThinkCentre M70q',
      vlanId: '20',
      address: '10.10.20.103',
      mac: 'F0-9F-C2-00-00-33',
      port: 'Gi1/0/12',
      area: 'Computer room',
      role: 'The third machine on the classroom bank.',
    },
    {
      id: 'pc-lab-04',
      name: 'PC-LAB-04',
      kind: 'client',
      model: 'Lenovo ThinkCentre M70q',
      vlanId: '20',
      address: '10.10.20.104',
      mac: 'F0-9F-C2-00-00-34',
      port: 'Gi1/0/13',
      area: 'Computer room',
      role: 'The fourth machine on the classroom bank.',
    },
    {
      id: 'laptop-staff-01',
      name: 'LAPTOP-STAFF-01',
      kind: 'client',
      model: 'Lenovo ThinkPad T14',
      vlanId: '10',
      address: '10.10.10.110',
      mac: 'F0-9F-C2-00-00-41',
      area: 'Staff room',
      role: 'The head teacher’s laptop, joined to the staff Wi-Fi.',
      wireless: { apId: 'ap-staff' },
    },
    {
      id: 'laptop-student-01',
      name: 'LAPTOP-STUDENT-01',
      kind: 'client',
      model: 'HP ProBook 450',
      vlanId: '20',
      address: '10.10.20.110',
      mac: 'F0-9F-C2-00-00-42',
      area: 'Classroom 6',
      role: 'The trolley laptop used for reading groups.',
      wireless: { apId: 'ap-student' },
    },
  ],
  dnsRecords: [
    { name: 'srv-dc01.ashfield.sch.uk', address: '10.10.10.10' },
    { name: 'srv-files.ashfield.sch.uk', address: '10.10.10.11' },
    { name: 'intranet.ashfield.sch.uk', address: '10.10.10.12' },
    { name: 'portal.bramble-academy.org', address: '203.0.113.44' },
    { name: 'www.brookline-news.example', address: '203.0.113.80' },
  ],
}

export function deviceById(id: string): NetDevice | undefined {
  return TOPOLOGY.devices.find((device) => device.id === id)
}

export function vlanById(id: VlanId): Topology['vlans'][number] {
  const vlan = TOPOLOGY.vlans.find((entry) => entry.id === id)
  if (!vlan) {
    throw new Error(`Unknown VLAN ${id}`)
  }
  return vlan
}

/** The switch's own management address, for the CLI prompt and records. */
export const SWITCH_ID = 'sw-core'
export const ROUTER_ID = 'rtr-core'
export const FIREWALL_ID = 'fw-edge'
export const MODEM_ID = 'modem-1'
export const DNS_SERVER_ID = 'srv-dc01'

/** External names the lab's firewall rule can block, so the test can pick one. */
export const BLOCKED_SITE = 'portal.bramble-academy.org'
