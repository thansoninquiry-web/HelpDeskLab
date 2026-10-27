import { TOPOLOGY } from './topology'
import {
  FIX_LABELS,
  type FixId,
  type FixOption,
  type Incident,
  type LabEstate,
} from '../types'

/**
 * The fifteen incidents the lab can drop a learner into.
 *
 * Each one names a seeded device, the fault that device is living with, the reads
 * that isolate it and the changes that fix it. The verify function is the single
 * source of truth for "done": it reads the estate those changes produce, so any
 * path that reaches a working network closes the incident, and no path that only
 * pressed the right buttons does.
 */

function option(id: FixId, detail: string, risk = false): FixOption {
  return { id, label: FIX_LABELS[id], detail, risk }
}

function client(estate: LabEstate, deviceId: string) {
  return estate.clients[deviceId]
}

function baseAddress(deviceId: string): string {
  return TOPOLOGY.devices.find((device) => device.id === deviceId)?.address ?? ''
}

function workingOnVlan(estate: LabEstate, deviceId: string, vlanId: '10' | '20'): boolean {
  const view = client(estate, deviceId)
  return (
    view?.link === 'up' &&
    view.vlanId === vlanId &&
    view.address.startsWith(vlanId === '10' ? '10.10.10.' : '10.10.20.') &&
    view.lease === 'active'
  )
}

export const INCIDENTS: readonly Incident[] = [
  {
    id: 'one-pc-no-internet',
    title: 'One office PC has no network',
    difficulty: 1,
    category: 'physical',
    symptom: 'PC-STAFF-02 shows a red cross on its network icon. Every other machine in the office is online.',
    report:
      '“My computer says there is no internet, but everyone else in here is fine. It worked on Friday — they moved the desks about over the weekend.”',
    subjectId: 'pc-staff-02',
    fault: {
      kind: 'cable',
      deviceId: 'pc-staff-02',
      detail: 'The patch lead is loose at the wall socket after the desks were moved.',
    },
    faultLayer: 1,
    evidence: [
      { id: 'adapter', deviceId: 'pc-staff-02' },
      { id: 'link-status', deviceId: 'sw-core' },
    ],
    fixOptions: [
      option('reseat-cable', 'Push the patch lead back into the wall socket until it clicks.'),
      option('replace-patch-lead', 'Swap the lead between the PC and the wall for a spare.'),
      option('flush-dns-cache', 'Clear the resolver cache on the PC.'),
      option('restart-switch', 'Restart the core switch.', true),
    ],
    expectedFix: ['reseat-cable'],
    hints: [
      'The report says one machine, and the timing points at the furniture move. Start at the socket.',
      'Read the adapter before anything else: what does it say about the media?',
      'The switch port for PC-STAFF-02 is down while its neighbours are up. Reseat the cable at the wall.',
    ],
    explanation: [
      'A single machine with no link, right after desks were moved, is a cabling fault until proved otherwise.',
      'The adapter reports Media disconnected and the switch port shows no carrier, which puts the fault at layer 1 and rules out DHCP, DNS and the firewall in one look.',
      'Reseating the lead at the wall restores the link; the PC renews its lease by itself.',
    ],
    conceptIds: ['lan-wan-wlan', 'osi'],
    verify: (estate) => workingOnVlan(estate, 'pc-staff-02', '10'),
    verifyText: 'PC-STAFF-02 has a link and an address on the staff VLAN.',
  },
  {
    id: 'office-pc-link-errors',
    title: 'One office PC keeps dropping',
    difficulty: 2,
    category: 'physical',
    symptom: 'PC-STAFF-01 disappears from the network for a minute at a time. The switch port shows CRC errors.',
    report:
      '“My PC keeps dropping off the shared drive. IT said the switch port is flapping. It is only my machine.”',
    subjectId: 'pc-staff-01',
    fault: {
      kind: 'bad-port',
      deviceId: 'pc-staff-01',
      port: 'Gi1/0/5',
    },
    faultLayer: 1,
    evidence: [
      { id: 'link-status', deviceId: 'sw-core' },
      { id: 'adapter', deviceId: 'pc-staff-01' },
    ],
    fixOptions: [
      option('replace-patch-lead', 'Replace the patch lead between the PC and the wall.'),
      option('reseat-cable', 'Reseat the lead at the wall socket.'),
      option('restart-switch', 'Restart the core switch.', true),
    ],
    expectedFix: ['replace-patch-lead'],
    hints: [
      'A port that flaps with errors is a physical fault, not a configuration one.',
      'Read the port status on the switch: is it the port, the lead, or the PC?',
      'The port errors clear when the lead is replaced. The port itself is fine.',
    ],
    explanation: [
      'CRC errors and a flapping link point at the cable, not at DHCP or DNS.',
      'A spare lead proves it: the port comes up clean and stays up.',
      'Restarting the switch would have dropped the whole floor to fix one lead.',
    ],
    conceptIds: ['osi', 'lan-wan-wlan'],
    verify: (estate) =>
      workingOnVlan(estate, 'pc-staff-01', '10') &&
      estate.ports['Gi1/0/5']?.status === 'up' &&
      (estate.ports['Gi1/0/5']?.errors ?? 0) === 0,
    verifyText: 'PC-STAFF-01 is on a clean gigabit port with a working address.',
  },
  {
    id: 'classroom-offline',
    title: 'The whole computer room is offline',
    difficulty: 2,
    category: 'switching',
    symptom: 'Every machine in the computer room and the student Wi-Fi is down. The office is unaffected.',
    report:
      '“None of the classroom PCs can get on. The office computers are fine. We have a lesson starting in ten minutes.”',
    subjectId: 'pc-lab-01',
    fault: { kind: 'trunk-vlan', vlanId: '20' },
    faultLayer: 2,
    evidence: [
      { id: 'trunk', deviceId: 'sw-core' },
      { id: 'vlan', deviceId: 'sw-core' },
    ],
    fixOptions: [
      option('restore-trunk-vlan', 'Add VLAN 20 back to the allowed list on the uplink trunk.'),
      option('set-port-vlan', 'Move one of the classroom ports to a different VLAN.'),
      option('reboot-firewall', 'Reboot the edge firewall.', true),
    ],
    expectedFix: ['restore-trunk-vlan'],
    hints: [
      'One VLAN is down and the other is fine. That is a trunk or a VLAN problem, not a cable.',
      'Read the trunk: which VLANs is it actually carrying to the router?',
      'VLAN 20 exists on the switch, but the uplink only allows VLAN 10. Restore it on the trunk.',
    ],
    explanation: [
      'A whole VLAN failing while another works isolates the fault to the path that carries it, not to any one PC.',
      'The switch still knows VLAN 20 locally, so the VLAN table looks healthy; the trunk is where it is missing.',
      'Restoring VLAN 20 on the uplink lets DHCP and the gateway answer again for every classroom machine at once.',
    ],
    conceptIds: ['lan-wan-wlan', 'osi', 'subnetting'],
    verify: (estate) => workingOnVlan(estate, 'pc-lab-01', '20'),
    verifyText: 'PC-LAB-01 has an address on the student VLAN again.',
  },
  {
    id: 'dhcp-scope-exhausted',
    title: 'A new laptop cannot get an address',
    difficulty: 3,
    category: 'services',
    symptom: 'The new staff laptop holds a 169.254 address while every other staff machine is fine.',
    report:
      '“The new laptop will not connect properly — it shows that 169 address. My old one works. The office is full today.”',
    subjectId: 'laptop-staff-01',
    fault: { kind: 'dhcp-exhausted', vlanId: '10' },
    faultLayer: 7,
    evidence: [
      { id: 'adapter', deviceId: 'laptop-staff-01' },
      { id: 'dhcp-pool', deviceId: 'rtr-core' },
    ],
    fixOptions: [
      option('release-stale-leases', 'Release leases whose devices have not been seen for weeks.'),
      option('renew-lease', 'Renew the laptop’s lease after the pool has room.'),
      option('extend-dhcp-scope', 'Widen the DHCP pool into addresses the router already uses.'),
      option('restart-switch', 'Restart the core switch.', true),
    ],
    expectedFix: ['release-stale-leases', 'renew-lease'],
    hints: [
      'A 169.254 address means the machine asked for a lease and nobody answered. The link is fine.',
      'Read the pool rather than the laptop: how many addresses are free?',
      'The pool is full of leases for machines that left at Easter. Release them, then renew the laptop.',
    ],
    explanation: [
      'APIPA is the address Windows gives itself when DHCP does not answer; it is a symptom of the service, not of the cable.',
      'The pool is exhausted, not broken: stale leases for devices that no longer exist are holding every free address.',
      'Releasing the stale leases frees the pool; the laptop still has to ask again, which is why the renewal is a separate step.',
    ],
    conceptIds: ['dhcp-dns-nat', 'subnetting'],
    verify: (estate) =>
      workingOnVlan(estate, 'laptop-staff-01', '10') &&
      (estate.vlans.find((vlan) => vlan.id === '10')?.free ?? 0) > 0,
    verifyText: 'The staff pool has free addresses and the laptop holds one of them.',
  },
  {
    id: 'duplicate-address',
    title: 'An address is in use twice',
    difficulty: 2,
    category: 'addressing',
    symptom: 'PC-STAFF-03 warns that another device on the network has the same IP address. Its connection drops in and out.',
    report:
      '“Windows keeps saying there is an IP address conflict. The internet works for a bit and then stops.”',
    subjectId: 'pc-staff-03',
    fault: { kind: 'ip-conflict', deviceId: 'pc-staff-03', address: '10.10.10.120' },
    faultLayer: 3,
    evidence: [
      { id: 'adapter', deviceId: 'pc-staff-03' },
      { id: 'arp', deviceId: 'pc-staff-03' },
    ],
    fixOptions: [
      option('clear-static-address', 'Put the PC back on DHCP instead of the hand-set address.'),
      option('renew-lease', 'Renew the PC’s lease once the duplicate is gone.'),
      option('flush-dns-cache', 'Clear the resolver cache.'),
    ],
    expectedFix: ['clear-static-address', 'renew-lease'],
    hints: [
      'The machine can see the network; something else is claiming its address.',
      'Read the adapter: was this address handed out, or typed in?',
      'The address is static and clashes with a printer. Put the PC back on DHCP, then renew.',
    ],
    explanation: [
      'An address conflict is layer 3, and it is visible in the adapter and the ARP cache before any change.',
      'The address was set by hand, which is why DHCP cannot move it out of the way.',
      'Clearing the static address lets DHCP give the PC a unique one; the renewal makes it take effect.',
    ],
    conceptIds: ['subnetting', 'dhcp-dns-nat'],
    verify: (estate) => {
      const view = client(estate, 'pc-staff-03')
      return (
        view?.conflict === false &&
        view.address === baseAddress('pc-staff-03') &&
        view.lease === 'active'
      )
    },
    verifyText: 'PC-STAFF-03 holds its own DHCP address with no duplicate.',
  },
  {
    id: 'wrong-vlan-port',
    title: 'A new PC cannot see the shared drive',
    difficulty: 2,
    category: 'switching',
    symptom: 'PC-STAFF-04 has internet but no access to staff shares, and holds a 10.10.20.x address.',
    report:
      '“The new starter’s PC works for the internet but cannot open the staff drive. It has a different number to mine.”',
    subjectId: 'pc-staff-04',
    fault: {
      kind: 'wrong-vlan',
      deviceId: 'pc-staff-04',
      expectedVlan: '10',
      actualVlan: '20',
    },
    faultLayer: 2,
    evidence: [
      { id: 'vlan', deviceId: 'sw-core' },
      { id: 'mac-table', deviceId: 'sw-core' },
    ],
    fixOptions: [
      option('set-port-vlan', 'Move the port from the student VLAN to the staff VLAN.'),
      option('renew-lease', 'Renew the PC’s lease after the port is moved.'),
      option('restore-trunk-vlan', 'Add a VLAN back to the uplink trunk.'),
    ],
    expectedFix: ['set-port-vlan', 'renew-lease'],
    hints: [
      'It has an address, so the link and DHCP are fine. It is on the wrong network.',
      'Compare the port’s VLAN with the machine’s own VLAN. The VLAN table shows both.',
      'The port was patched into a student port. Move it to VLAN 10 and renew.',
    ],
    explanation: [
      'A machine that works but cannot see its own servers is usually on the wrong VLAN, not broken.',
      'The VLAN and MAC tables name the port and the VLAN it carries, which is the evidence the fix hangs on.',
      'Moving the port is not enough on its own: the PC keeps its old lease until it renews.',
    ],
    conceptIds: ['lan-wan-wlan', 'subnetting', 'dhcp-dns-nat'],
    verify: (estate) => workingOnVlan(estate, 'pc-staff-04', '10'),
    verifyText: 'PC-STAFF-04 is on the staff VLAN with a staff address.',
  },
  {
    id: 'staff-wifi-down',
    title: 'Staff room Wi-Fi has disappeared',
    difficulty: 1,
    category: 'wireless',
    symptom: 'The staff room access point is not broadcasting. The office wired PCs are fine.',
    report:
      '“There is no staff Wi-Fi in the staff room at all. My laptop says the network is not available.”',
    subjectId: 'laptop-staff-01',
    fault: { kind: 'ap-down', deviceId: 'ap-staff' },
    faultLayer: 1,
    evidence: [
      { id: 'wifi', deviceId: 'laptop-staff-01' },
      { id: 'link-status', deviceId: 'sw-core' },
    ],
    fixOptions: [
      option('power-cycle-ap', 'Power-cycle the access point through its switch port.'),
      option('factory-reset-ap', 'Factory-reset the access point and rebuild its config.', true),
      option('reboot-firewall', 'Reboot the edge firewall.', true),
    ],
    expectedFix: ['power-cycle-ap'],
    hints: [
      'One AP, one room. The rest of the network is healthy.',
      'Read the laptop’s Wi-Fi state and the AP’s switch port: is the AP even powered?',
      'The PoE port is down. Power-cycle the AP and the port comes back.',
    ],
    explanation: [
      'A missing SSID that affects one room names the AP, not the network behind it.',
      'The switch port feeding the AP is down, which is why the laptop sees no network at all.',
      'A power cycle brings the AP and its broadcast back; a factory reset would erase a working config.',
    ],
    conceptIds: ['lan-wan-wlan', 'osi'],
    verify: (estate) =>
      estate.apSignal['ap-staff'] === 'good' &&
      client(estate, 'laptop-staff-01')?.link === 'up' &&
      client(estate, 'laptop-staff-01')?.signal === 'good',
    verifyText: 'The staff AP is broadcasting and the laptop is joined with a good signal.',
  },
  {
    id: 'weak-wifi-corner',
    title: 'Wi-Fi drops at the back of the classroom',
    difficulty: 2,
    category: 'wireless',
    symptom: 'The trolley laptop loses Wi-Fi at the back of Classroom 6 but works near the door.',
    report:
      '“The reading-group laptop keeps dropping out at the back of the room. It is fine if I stand by the door.”',
    subjectId: 'laptop-student-01',
    fault: { kind: 'weak-coverage', deviceId: 'ap-student' },
    faultLayer: 1,
    evidence: [
      { id: 'wifi', deviceId: 'laptop-student-01' },
      { id: 'wifi', deviceId: 'ap-student' },
    ],
    fixOptions: [
      option('reposition-ap', 'Move the AP out of the metal cabinet and back onto the wall.'),
      option('power-cycle-ap', 'Power-cycle the access point.'),
      option('factory-reset-ap', 'Factory-reset the access point.', true),
    ],
    expectedFix: ['reposition-ap'],
    hints: [
      'Only one room, only one corner, and only over Wi-Fi. That is coverage, not authentication.',
      'Read the signal strength the laptop reports in that spot.',
      'The AP was moved into the metal cabinet over half term. Move it back out.',
    ],
    explanation: [
      'A weak signal that improves near the door is a coverage problem, not a network fault.',
      'The laptop’s own Wi-Fi reading shows a weak signal and a low link rate; the wired estate is untouched.',
      'Repositioning the AP restores coverage without touching a single client setting.',
    ],
    conceptIds: ['lan-wan-wlan', 'osi'],
    verify: (estate) =>
      estate.apSignal['ap-student'] === 'good' &&
      client(estate, 'laptop-student-01')?.signal === 'good',
    verifyText: 'The classroom AP covers the room again and the laptop reports a good signal.',
  },
  {
    id: 'dns-outage',
    title: 'Nothing resolves by name',
    difficulty: 2,
    category: 'services',
    symptom: 'Names fail everywhere, but pinging a public address still works.',
    report:
      '“Nobody can open the intranet or any website by name. If I type the number for Google it works, so the internet is not down.”',
    subjectId: 'pc-staff-01',
    fault: { kind: 'dns-service' },
    faultLayer: 7,
    evidence: [
      { id: 'dns', deviceId: 'pc-staff-01' },
      { id: 'reach-internet', deviceId: 'pc-staff-01' },
      { id: 'dns', deviceId: 'srv-dc01' },
    ],
    fixOptions: [
      option('start-dns-service', 'Start the DNS Server service on SRV-DC01.'),
      option('flush-dns-cache', 'Flush the resolver cache on the PC.'),
      option('reboot-firewall', 'Reboot the edge firewall.', true),
    ],
    expectedFix: ['start-dns-service'],
    hints: [
      'The path to the internet works; only names fail. That separates DNS from connectivity.',
      'Resolve a name and ping a public address from the same machine.',
      'Every client points at SRV-DC01, whose DNS service has stopped. Start it.',
    ],
    explanation: [
      'Numbers working and names failing is the classic split between layer 3 and the resolver.',
      'One failed lookup and one successful ping prove the path is healthy and the service is not.',
      'The school has one DNS server; starting its service restores every client at once.',
    ],
    conceptIds: ['dhcp-dns-nat', 'osi'],
    verify: (estate) => estate.dnsUp,
    verifyText: 'SRV-DC01 is answering DNS queries again.',
  },
  {
    id: 'portal-blocked',
    title: 'The reading portal will not open',
    difficulty: 3,
    category: 'services',
    symptom: 'One site fails from every classroom PC over HTTPS, though other sites load.',
    report:
      '“Class 5 cannot get onto the reading portal. Every other website is fine, and it works on my phone over mobile data.”',
    subjectId: 'pc-lab-02',
    fault: { kind: 'firewall-block', host: 'portal.bramble-academy.org', port: 443 },
    faultLayer: 4,
    evidence: [
      { id: 'port', deviceId: 'pc-lab-02' },
      { id: 'dns', deviceId: 'pc-lab-02' },
      { id: 'port', deviceId: 'pc-lab-01' },
    ],
    fixOptions: [
      option('remove-block-rule', 'Remove the outbound rule blocking the portal’s HTTPS port.'),
      option('flush-dns-cache', 'Clear the resolver cache on the classroom PC.'),
      option('reboot-firewall', 'Reboot the edge firewall.', true),
    ],
    expectedFix: ['remove-block-rule'],
    hints: [
      'One site, one port, every PC. That is a rule, not a machine.',
      'Resolve the name, then test the port. If the name resolves and 443 does not answer, the block is in the path.',
      'A new outbound rule blocks that host on 443. Remove it.',
    ],
    explanation: [
      'A single destination failing from every machine points at the shared path, not at any client.',
      'DNS answering proves the name is fine; the failed TCP test on 443 isolates the block to the port.',
      'Removing the rule restores the site for everyone without touching a client.',
    ],
    conceptIds: ['dhcp-dns-nat', 'osi', 'wan-links'],
    verify: (estate) => estate.blocked === null,
    verifyText: 'Nothing is blocking the portal any more.',
  },
  {
    id: 'wrong-gateway',
    title: 'One PC cannot leave its own subnet',
    difficulty: 2,
    category: 'routing',
    symptom: 'PC-STAFF-05 reaches the shared drive but nothing on the internet.',
    report:
      '“I can open the staff drive fine, but nothing on the internet loads. Everyone else’s machine is fine.”',
    subjectId: 'pc-staff-05',
    fault: { kind: 'wrong-gateway', deviceId: 'pc-staff-05', gateway: '10.10.10.254' },
    faultLayer: 3,
    evidence: [
      { id: 'adapter', deviceId: 'pc-staff-05' },
      { id: 'gateway', deviceId: 'pc-staff-05' },
      { id: 'reach-internet', deviceId: 'pc-staff-01' },
    ],
    fixOptions: [
      option('set-correct-gateway', 'Set the default gateway back to 10.10.10.1.'),
      option('renew-lease', 'Renew the DHCP lease.'),
      option('flush-dns-cache', 'Clear the resolver cache.'),
    ],
    expectedFix: ['set-correct-gateway'],
    hints: [
      'Local works, remote does not. The boundary is the default gateway.',
      'Read the adapter: which address is it using to leave the subnet?',
      'The gateway is set to an address that does not exist on this network.',
    ],
    explanation: [
      'A machine that can reach its own subnet but nothing beyond it has a routing problem, not a DNS one.',
      'The adapter names a gateway that no router owns, so every off-subnet packet is dropped.',
      'Pointing it back at the router restores the path; the local address never needed to change.',
    ],
    conceptIds: ['subnetting', 'lan-wan-wlan'],
    verify: (estate) => {
      const view = client(estate, 'pc-staff-05')
      return view?.gateway === '10.10.10.1' && view.link === 'up'
    },
    verifyText: 'PC-STAFF-05 leaves the subnet through the core router again.',
  },
  {
    id: 'slow-file-server',
    title: 'Saving to the shared drive crawls',
    difficulty: 2,
    category: 'physical',
    symptom: 'File copies to SRV-FILES take minutes. The switch port shows a half-duplex link at 100 Mb/s.',
    report:
      '“Saving a document to the shared drive takes forever. It started this week. The server itself looks fine.”',
    subjectId: 'pc-staff-01',
    fault: { kind: 'duplex', port: 'Gi1/0/21' },
    faultLayer: 1,
    evidence: [
      { id: 'link-status', deviceId: 'sw-core' },
      { id: 'path', deviceId: 'pc-staff-01' },
    ],
    fixOptions: [
      option('set-port-auto', 'Set the server’s switch port back to auto-negotiate.'),
      option('replace-patch-lead', 'Replace the server’s patch lead.'),
      option('restart-switch', 'Restart the core switch.', true),
    ],
    expectedFix: ['set-port-auto'],
    hints: [
      'It works, but slowly. That is a link-quality symptom, not a broken service.',
      'Read the port: speed and duplex are both on the record.',
      'Someone pinned the port to 100 Mb/s half duplex. Put it back to auto.',
    ],
    explanation: [
      'A working but slow link is a layer 1 negotiation problem; nothing above it is failing.',
      'The port status shows 100 Mb/s half duplex with errors, while every other port is gigabit full duplex.',
      'Auto-negotiation restores a gigabit full-duplex link without changing any server setting.',
    ],
    conceptIds: ['osi', 'lan-wan-wlan'],
    verify: (estate) => {
      const port = estate.ports['Gi1/0/21']
      return port?.duplex === 'full' && port.speedMbps === 1000 && port.errors === 0
    },
    verifyText: 'The server port is back to a gigabit full-duplex link.',
  },
  {
    id: 'site-wide-outage',
    title: 'The whole school is offline',
    difficulty: 3,
    category: 'wan',
    symptom: 'No machine can reach the internet, but internal shares and printing still work.',
    report:
      '“Nothing can get on the internet anywhere in the school. The shared drive still works. Is it us or the provider?”',
    subjectId: 'pc-staff-01',
    fault: { kind: 'isp-outage' },
    faultLayer: 1,
    evidence: [
      { id: 'wan-status', deviceId: 'modem-1' },
      { id: 'reach-internet', deviceId: 'pc-staff-01' },
    ],
    fixOptions: [
      option('confirm-outage', 'Confirm the modem has lost sync and the fault is upstream.'),
      option('raise-isp-ticket', 'Raise the circuit outage with the provider.'),
      option('reboot-firewall', 'Reboot the edge firewall.', true),
      option('restart-switch', 'Restart the core switch.', true),
    ],
    expectedFix: ['confirm-outage', 'raise-isp-ticket'],
    hints: [
      'Internal traffic works. The boundary is the circuit, not the LAN.',
      'Read the modem before rebooting anything: does it have sync?',
      'The modem has no sync, so nothing local will fix it. Confirm that and raise it with the provider.',
    ],
    explanation: [
      'Shares and printing working proves the LAN is healthy; only the path off site is gone.',
      'The modem has lost sync, which is upstream of the firewall and cannot be repaired from the building.',
      'The right resolution is a confirmed diagnosis and a provider ticket, not a reboot that drops the site for nothing.',
    ],
    conceptIds: ['wan-links', 'lan-wan-wlan'],
    verify: (estate) => estate.wan.ticketRaised,
    verifyText: 'The upstream fault is confirmed and on a provider ticket.',
  },
  {
    id: 'looks-like-isp',
    title: 'Offline, but the circuit is up',
    difficulty: 3,
    category: 'wan',
    symptom: 'The whole site has no internet, and everyone assumes the provider is down again.',
    report:
      '“The internet is down again — same as last month. Can you call the provider?”',
    subjectId: 'pc-lab-04',
    fault: { kind: 'firewall-wan-down' },
    faultLayer: 1,
    evidence: [
      { id: 'wan-status', deviceId: 'modem-1' },
      { id: 'wan-status', deviceId: 'fw-edge' },
      { id: 'reach-internet', deviceId: 'pc-lab-04' },
    ],
    fixOptions: [
      option('bring-wan-up', 'Bring the firewall’s WAN interface back up.'),
      option('reboot-firewall', 'Reboot the edge firewall.', true),
      option('restart-switch', 'Restart the core switch.', true),
    ],
    expectedFix: ['bring-wan-up'],
    hints: [
      'The caller has already decided it is the provider. Check the two pieces of equipment yourself.',
      'Read the modem: does it have sync? Then read the firewall’s interfaces.',
      'The modem is synced; the firewall’s WAN interface is administratively down. Bring it up.',
    ],
    explanation: [
      'An outage that looks like the provider can still be local. The two status pages separate them.',
      'The modem has sync, so the circuit is healthy; the firewall’s WAN interface is down, which is a local state.',
      'Bringing the interface up restores the site without a provider call — and the evidence is what makes that call safe to skip.',
    ],
    conceptIds: ['wan-links', 'osi'],
    verify: (estate) => estate.wan.firewallWanUp && estate.wan.wanUp,
    verifyText: 'The firewall WAN interface is up and the site has its path out again.',
  },
  {
    id: 'rogue-router',
    title: 'Classroom PCs get the wrong addresses',
    difficulty: 3,
    category: 'addressing',
    symptom: 'Classroom machines hold 192.168.0.x addresses with a 192.168.0.1 gateway.',
    report:
      '“The classroom PCs say they are connected but nothing loads. The addresses look nothing like ours.”',
    subjectId: 'pc-lab-03',
    fault: { kind: 'rogue-dhcp', vlanId: '20', port: 'Gi1/0/24' },
    faultLayer: 2,
    evidence: [
      { id: 'adapter', deviceId: 'pc-lab-03' },
      { id: 'mac-table', deviceId: 'sw-core' },
    ],
    fixOptions: [
      option('shutdown-rogue-port', 'Shut the wall port carrying the unauthorised router.'),
      option('renew-lease', 'Renew the classroom PC’s lease once the ropey DHCP is gone.'),
      option('extend-dhcp-scope', 'Widen the school’s DHCP pool.'),
      option('restart-switch', 'Restart the core switch.', true),
    ],
    expectedFix: ['shutdown-rogue-port', 'renew-lease'],
    hints: [
      'The addresses are from a different network entirely. Something else is answering DHCP.',
      'Read the adapter for the DHCP server’s address, then use the MAC table to find where it lives.',
      'A travel router on the spare wall port is handing out 192.168.0.x. Shut that port, then renew.',
    ],
    explanation: [
      'An address outside the school’s own ranges means a second DHCP server is answering, which no client-side fix can solve.',
      'The adapter names the rogue gateway; the MAC table shows a burst of addresses on the spare port where the router was plugged in.',
      'Shutting the port removes the rogue server; the PC keeps its borrowed address until it renews.',
    ],
    conceptIds: ['dhcp-dns-nat', 'subnetting'],
    verify: (estate) =>
      estate.roguePort === null && workingOnVlan(estate, 'pc-lab-03', '20'),
    verifyText: 'The unauthorised device is off the network and the classroom PC has a school address.',
  },
]

/** A scenario by id, or undefined for a bad route. */
export function incidentById(id: string): Incident | undefined {
  return INCIDENTS.find((incident) => incident.id === id)
}

/** The incident whose scenario names this device as its subject, if any. */
export function incidentForDevice(deviceId: string): Incident | undefined {
  return INCIDENTS.find((incident) => incident.subjectId === deviceId)
}

export const INCIDENT_IDS: readonly string[] = INCIDENTS.map((incident) => incident.id)
