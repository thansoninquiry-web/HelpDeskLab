import type { ScenarioFamily } from '../types'
import { decision, effect, makeItem, makeRubric, note, ordered, ran } from '../rubric'

export const networkFamily: ScenarioFamily = {
  id: 'NET-01',
  title: 'Network and name resolution',
  category: 'network',
  variants: [
    {
      id: 'bad-static-dns',
      label: 'Wrong DNS server',
      summary: 'A static DNS entry points at a server that does not answer.',
      difficulty: 2,
      severity: 'high',
      subjects: ['{firstName} cannot reach anything by name', 'DNS failures on {hostname} - {site}'],
      bodies: [
        'Since I restarted my laptop nothing loads. The browser says the site cannot be found, but Teams still shows messages so I know I have some connection. A colleague next to me is fine. I am on {hostname}.',
        'I cannot open any internal sites today. I can ping the file server when I use its address, but not by name. I did not change anything. {displayName}, {department}.',
      ],
      symptoms: [
        'Names fail to resolve while direct IP addresses still work',
        'Other users on the same site are unaffected',
        'The device was recently moved to a fixed IP configuration',
      ],
      build(context) {
        context.device.dnsServers = ['10.20.4.53']
        return 'dns:10.20.4.53'
      },
      rubric(context) {
        const device = context.device
        return makeRubric('NET-01', 'bad-static-dns', [
          makeItem({
            id: 'inspect-adapter',
            label: 'Inspected the adapter configuration',
            why: 'DNS servers are only visible in the adapter details, and the value here is the whole cause.',
            category: 'diagnosis',
            weight: 10,
            checks: [ran('ipconfig', '/all')],
            hint: 'ipconfig /all lists the DNS servers this device is actually using.',
          }),
          makeItem({
            id: 'reproduce-dns',
            label: 'Reproduced the failure with nslookup',
            why: 'A name lookup turns “nothing loads” into a specific, testable failure.',
            category: 'diagnosis',
            weight: 15,
            checks: [ran('nslookup')],
          }),
          makeItem({
            id: 'prove-path',
            label: 'Proved the network path with ping',
            why: 'A working ping proves the link is fine and isolates the fault to name resolution.',
            category: 'diagnosis',
            weight: 10,
            checks: [ran('ping')],
          }),
          makeItem({
            id: 'fix-dns',
            label: 'Pointed the adapter at a working DNS server',
            why: 'Restoring the site-provided DNS servers fixes every name lookup at once.',
            category: 'resolution',
            weight: 25,
            critical: true,
            checks: [effect('dns_changed', device.hostname)],
          }),
          makeItem({
            id: 'verify-fix',
            label: 'Confirmed name resolution after the change',
            why: 'A settings change is not a fix until a lookup succeeds.',
            category: 'diagnosis',
            weight: 15,
            checks: [ordered(effect('dns_changed', device.hostname), ran('nslookup'))],
          }),
          makeItem({
            id: 'note-troubleshooting',
            label: 'Documented the diagnosis and change',
            why: 'Record the bad server and the replacement so the next ticket can be answered in seconds.',
            category: 'documentation',
            weight: 10,
            checks: [note('troubleshooting', 20)],
          }),
          makeItem({
            id: 'note-customer',
            label: 'Told the user the next step',
            why: 'The user needs to know whether to retry now or reconnect later.',
            category: 'documentation',
            weight: 5,
            checks: [note('customer', 15)],
          }),
          makeItem({
            id: 'decision',
            label: 'Resolved the ticket',
            why: 'A single-device DNS misconfiguration is a service desk fix.',
            category: 'resolution',
            weight: 10,
            critical: true,
            checks: [decision('resolved', ['resolved-remote'])],
          }),
        ])
      },
      reference(context) {
        return [
          { type: 'command', input: 'ipconfig /all' },
          { type: 'command', input: 'nslookup fileserver' },
          { type: 'command', input: 'ping 10.20.4.10' },
          { type: 'command', input: 'set-dns 10.20.4.10 10.20.4.11' },
          { type: 'command', input: 'ipconfig /flushdns' },
          { type: 'command', input: 'nslookup fileserver' },
          {
            type: 'note',
            noteKind: 'troubleshooting',
            text: `${context.device.hostname} had a static DNS entry pointing at 10.20.4.53, which does not answer. Direct IP connectivity worked. Restored 10.20.4.10 and 10.20.4.11, flushed the resolver cache, and confirmed the file server resolves again.`,
          },
          {
            type: 'note',
            noteKind: 'customer',
            text: 'Your name resolution is working again. Close and reopen the application that was failing, then retry the site.',
          },
        ]
      },
      expectedOutcome: 'resolved',
      expectedCodes: ['resolved-remote'],
    },
    {
      id: 'stale-dhcp-lease',
      label: 'Expired DHCP lease',
      summary: 'The device kept a self-assigned address after the lease expired.',
      difficulty: 2,
      severity: 'medium',
      subjects: ['{hostname} has no network after the weekend', 'No gateway on {firstName} laptop'],
      bodies: [
        'I came in this morning and my laptop says “no internet”. It was in my bag all weekend, still powered on. I restarted it once and nothing changed. I am at {site} today, usually I am at HQ.',
        'Nothing on my laptop can reach the network. The tray icon shows a warning and every site times out. My phone is on the same Wi-Fi and works fine. {firstName}, {department}.',
      ],
      symptoms: [
        'The adapter holds a 169.254 address instead of a site address',
        'No default gateway is listed',
        'The device was left powered on while off the network',
      ],
      build(context) {
        const octet = 10 + context.rng.int(0, 200)
        context.device.ipMode = 'dhcp'
        context.device.ipAddress = `169.254.${octet}.${context.rng.int(2, 250)}`
        context.device.subnetMask = '255.255.0.0'
        context.device.gateway = null
        context.device.dnsServers = []
        context.device.dhcpLease = null
        return `apipa:${context.device.ipAddress}`
      },
      rubric(context) {
        const device = context.device
        return makeRubric('NET-01', 'stale-dhcp-lease', [
          makeItem({
            id: 'inspect-adapter',
            label: 'Read the adapter configuration',
            why: 'The 169.254 address is the signature of a failed DHCP negotiation.',
            category: 'diagnosis',
            weight: 10,
            checks: [ran('ipconfig', '/all')],
          }),
          makeItem({
            id: 'prove-dns',
            label: 'Tested name resolution',
            why: 'With no DNS servers configured, a lookup fails immediately and confirms the scope of the fault.',
            category: 'diagnosis',
            weight: 10,
            checks: [ran('nslookup')],
          }),
          makeItem({
            id: 'renew',
            label: 'Renewed the DHCP lease',
            why: 'Renewing asks the site DHCP server for a valid address, mask, gateway, and DNS set.',
            category: 'resolution',
            weight: 35,
            critical: true,
            checks: [effect('lease_renewed', device.hostname)],
          }),
          makeItem({
            id: 'verify-fix',
            label: 'Confirmed resolution after the renewal',
            why: 'A new lease is only useful if name resolution works again.',
            category: 'diagnosis',
            weight: 15,
            checks: [ordered(effect('lease_renewed', device.hostname), ran('nslookup'))],
          }),
          makeItem({
            id: 'note-troubleshooting',
            label: 'Recorded the address and the renewal',
            why: 'The old and new addresses explain the outage to anyone reading the ticket later.',
            category: 'documentation',
            weight: 10,
            checks: [note('troubleshooting', 20)],
          }),
          makeItem({
            id: 'note-customer',
            label: 'Wrote a customer note',
            why: 'Tell the user what to expect before they try again.',
            category: 'documentation',
            weight: 10,
            checks: [note('customer', 15)],
          }),
          makeItem({
            id: 'decision',
            label: 'Resolved the ticket',
            why: 'A lease renewal is a first-line fix and needs no escalation.',
            category: 'resolution',
            weight: 10,
            critical: true,
            checks: [decision('resolved', ['resolved-remote'])],
          }),
        ])
      },
      reference(context) {
        return [
          { type: 'command', input: 'ipconfig /all' },
          { type: 'command', input: 'nslookup fileserver' },
          { type: 'command', input: 'ipconfig /renew' },
          { type: 'command', input: 'nslookup fileserver' },
          {
            type: 'note',
            noteKind: 'troubleshooting',
            text: `Adapter held an APIPA address with no gateway or DNS after the lease expired. Renewed the lease against ${context.site.dhcpServer}; the device received a ${context.site.subnet} address and name resolution works again.`,
          },
          {
            type: 'note',
            noteKind: 'customer',
            text: 'Your laptop has a valid network address again. Save your work and retry the application; it should connect normally now.',
          },
        ]
      },
      expectedOutcome: 'resolved',
      expectedCodes: ['resolved-remote'],
    },
  ],
}
