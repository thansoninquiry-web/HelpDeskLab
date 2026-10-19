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
            hints: ['ipconfig /all lists the DNS servers this device is actually using.', 'Look at the adapter’s DNS servers, not the site scope: this is a per-device misconfiguration.', 'The output should list 10.20.4.53 as the DNS server; note it against the site’s 10.20.4.10 and 10.20.4.11.'],
          }),
          makeItem({
            id: 'reproduce-dns',
            label: 'Reproduced the failure with nslookup',
            why: 'A name lookup turns “nothing loads” into a specific, testable failure.',
            category: 'diagnosis',
            weight: 15,
            checks: [ran('nslookup')],
            hints: ['Run nslookup for an internal name to turn “nothing loads” into a specific failure.', 'A lookup that times out while ping by address works points at DNS, not connectivity.', 'Run nslookup fileserver; a timeout or “server failed” is the failure this ticket is about.'],
          }),
          makeItem({
            id: 'prove-path',
            label: 'Proved the network path with ping',
            why: 'A working ping proves the link is fine and isolates the fault to name resolution.',
            category: 'diagnosis',
            weight: 10,
            checks: [ran('ping')],
            hints: ['Ping the file server by IP address to prove the link is healthy.', 'If the address answers and the name does not, the network path is fine.', 'Ping 10.20.4.10; a reply proves the path, so DNS is the only broken layer.'],
          }),
          makeItem({
            id: 'fix-dns',
            label: 'Pointed the adapter at a working DNS server',
            why: 'Restoring the site-provided DNS servers fixes every name lookup at once.',
            category: 'resolution',
            weight: 25,
            critical: true,
            checks: [effect('dns_changed', device.hostname)],
            hints: ['The adapter is static; put the site’s own DNS servers back on it.', 'set-dns <primary> <secondary> changes the adapter, then ipconfig /flushdns clears the stale entry.', 'Run set-dns 10.20.4.10 10.20.4.11 and then ipconfig /flushdns before testing again.'],
          }),
          makeItem({
            id: 'verify-fix',
            label: 'Confirmed name resolution after the change',
            why: 'A settings change is not a fix until a lookup succeeds.',
            category: 'diagnosis',
            weight: 15,
            checks: [ordered(effect('dns_changed', device.hostname), ran('nslookup'))],
            hints: ['Repeat the lookup after the change instead of trusting the setting.', 'nslookup should resolve the file server name now.', 'The post-change nslookup fileserver must return an address, not a timeout.'],
          }),
          makeItem({
            id: 'note-troubleshooting',
            label: 'Documented the diagnosis and change',
            why: 'Record the bad server and the replacement so the next ticket can be answered in seconds.',
            category: 'documentation',
            weight: 10,
            checks: [note('troubleshooting', 20)],
            hints: ['Record the bad server you found and the servers you restored.', 'Name the host and both DNS values so the next ticket starts from the evidence.', 'Example: “LT-4471 had static DNS 10.20.4.53; restored 10.20.4.10/11 and flushed the cache.”'],
          }),
          makeItem({
            id: 'note-customer',
            label: 'Told the user the next step',
            why: 'The user needs to know whether to retry now or reconnect later.',
            category: 'documentation',
            weight: 5,
            checks: [note('customer', 15)],
            hints: ['Give the user a plain next step they can act on.', 'Tell them to reopen the failing app and retry the site.', 'Say name resolution is fixed and the app should be reopened before retrying.'],
          }),
          makeItem({
            id: 'decision',
            label: 'Resolved the ticket',
            why: 'A single-device DNS misconfiguration is a service desk fix.',
            category: 'resolution',
            weight: 10,
            critical: true,
            checks: [decision('resolved', ['resolved-remote'])],
            hints: ['One device with a bad static entry is a service desk fix.', 'Close it as resolved remotely; do not escalate a single-adapter change.', 'Choose “Resolved remotely”; this ticket never needs a tier handoff.'],
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
          {
            type: 'command',
            input: 'nslookup fileserver',
            label: 'Check name resolution again with the new servers',
          },
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
            hints: ['ipconfig /all shows whether the address is a real site address or a 169.254 self-assigned one.', 'A 169.254 address with no gateway means the device never completed DHCP.', 'The address is 169.254.x.x with no gateway and no DNS servers — that is the whole diagnosis.'],
            why: 'The 169.254 address is the signature of a failed DHCP negotiation.',
            category: 'diagnosis',
            weight: 10,
            checks: [ran('ipconfig', '/all')],
          }),
          makeItem({
            id: 'prove-dns',
            label: 'Tested name resolution',
            hints: ['nslookup fails immediately when the adapter has no DNS servers, which confirms the lease is the fault.', 'A failed lookup plus an APIPA address confirms the device has no usable lease.', 'nslookup fileserver should fail with “no server” or a timeout, confirming the empty DNS list.'],
            why: 'With no DNS servers configured, a lookup fails immediately and confirms the scope of the fault.',
            category: 'diagnosis',
            weight: 10,
            checks: [ran('nslookup')],
          }),
          makeItem({
            id: 'renew',
            label: 'Renewed the DHCP lease',
            hints: ['ipconfig /renew asks the site DHCP server for a fresh address, mask, gateway, and DNS set.', 'Renew while the device is on the site network; an off-site renewal only returns another APIPA address.', 'Run ipconfig /renew, then ipconfig /all to confirm a site address and gateway came back.'],
            why: 'Renewing asks the site DHCP server for a valid address, mask, gateway, and DNS set.',
            category: 'resolution',
            weight: 35,
            critical: true,
            checks: [effect('lease_renewed', device.hostname)],
          }),
          makeItem({
            id: 'verify-fix',
            label: 'Confirmed resolution after the renewal',
            hints: ['Look the name up again after renewing: a new address is only useful if names resolve.', 'ipconfig /all should show a site address and gateway, and nslookup should succeed.', 'The final nslookup must succeed; if it still fails, the lease did not carry DNS servers.'],
            why: 'A new lease is only useful if name resolution works again.',
            category: 'diagnosis',
            weight: 15,
            checks: [ordered(effect('lease_renewed', device.hostname), ran('nslookup'))],
          }),
          makeItem({
            id: 'note-troubleshooting',
            label: 'Recorded the address and the renewal',
            hints: ['Record the old address, the new address, and which DHCP server issued it.', 'A note with both addresses explains the outage without re-running anything.', 'Example: “APIPA 169.254.x.x, renewed against 10.20.4.12, now on a 10.20.12.x address with DNS.”'],
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
            hints: ['Tell the user the device is back on the site network.', 'Ask them to retry the app and save their work first.', 'The user only needs to know the laptop is online and the app can be retried.'],
          }),
          makeItem({
            id: 'decision',
            label: 'Resolved the ticket',
            why: 'A lease renewal is a first-line fix and needs no escalation.',
            category: 'resolution',
            weight: 10,
            critical: true,
            checks: [decision('resolved', ['resolved-remote'])],
            hints: ['A lease renewal is first-line work.', 'Resolve it remotely; no escalation is needed for an expired lease.', 'Close as resolved remotely; a lease renewal is never a Tier 2 matter.'],
          }),
        ])
      },
      reference(context) {
        return [
          { type: 'command', input: 'ipconfig /all' },
          { type: 'command', input: 'nslookup fileserver' },
          { type: 'command', input: 'ipconfig /renew' },
          {
            type: 'command',
            input: 'nslookup fileserver',
            label: 'Check name resolution again now the lease is fresh',
          },
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
