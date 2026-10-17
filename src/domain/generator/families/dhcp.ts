import { findScope, lastOctet } from '../../environment/dhcp'
import type { ScenarioFamily } from '../types'
import { absent, decision, effect, handoffNote, makeItem, makeRubric, note, ordered, ran } from '../rubric'

export const dhcpFamily: ScenarioFamily = {
  id: 'DHCP-01',
  title: 'DHCP scopes and addresses',
  category: 'network',
  variants: [
    {
      id: 'scope-wrong-dns',
      label: 'Scope hands out a dead DNS server',
      summary: 'The site scope option points every device at a DNS server that does not answer.',
      difficulty: 3,
      severity: 'high',
      subjects: [
        'Whole team at {site} cannot open anything by name',
        'Name resolution failing across {site} this morning',
      ],
      bodies: [
        'Nobody on my floor can reach the intranet or the file server since we came in this morning. The addresses still work if we type them, so the network itself seems fine. It is affecting several people, not just {hostname}. I am at {site}.',
        'Three of us at {site} cannot open any internal site by name. We all restarted at the same time. Someone said the laptop takes its settings from the server automatically, so maybe that is where to look. Please advise - {displayName}.',
      ],
      symptoms: [
        'Every device that renewed its address today loses name resolution',
        'Direct IP addresses still work from the affected devices',
        'Several users at the same site report the same failure',
      ],
      build(context) {
        const scope = findScope(context.world, context.site.id)
        if (!scope) {
          throw new Error('DHCP scenario requires a site scope')
        }
        scope.dnsServers = ['10.20.4.99']
        context.device.dnsServers = ['10.20.4.99']
        context.device.dhcpLease = {
          server: scope.server,
          obtainedAt: context.world.clock - 2 * 60 * 60 * 1000,
          expiresAt: context.world.clock + 6 * 60 * 60 * 1000,
        }
        return `scope-dns:${scope.name}:10.20.4.99`
      },
      rubric(context) {
        const site = context.site
        return makeRubric('DHCP-01', 'scope-wrong-dns', [
          makeItem({
            id: 'inspect-adapter',
            label: 'Read the adapter configuration',
            why: 'The DNS server in use, and the DHCP server that supplied it, are both on this output.',
            category: 'diagnosis',
            weight: 10,
            checks: [ran('ipconfig', '/all')],
            hint: 'ipconfig /all shows the DNS servers and which DHCP server issued the lease.',
          }),
          makeItem({
            id: 'reproduce-name-failure',
            label: 'Reproduced the failure with a lookup',
            why: 'A failed lookup separates a name resolution fault from a broken network path.',
            category: 'diagnosis',
            weight: 10,
            checks: [ran('nslookup')],
          }),
          makeItem({
            id: 'inspect-scope',
            label: `Inspected the ${site.name} scope options`,
            why: 'The scope option decides what every device at the site receives, so the fault is visible there.',
            category: 'diagnosis',
            weight: 20,
            checks: [ran('get-dhcp-scope')],
            hint: 'get-dhcp-scope <site> shows option 006, the DNS servers handed to clients.',
          }),
          makeItem({
            id: 'no-blind-dns-change',
            label: 'Did not patch the DNS setting on one device',
            why: 'Changing this laptop hides the scope fault while every other device at the site stays broken.',
            category: 'safety',
            weight: 10,
            checks: [absent(effect('dns_changed'))],
          }),
          makeItem({
            id: 'note-troubleshooting',
            label: 'Recorded the evidence from the scope',
            why: 'The network team needs the scope name, the bad option value, and the devices affected.',
            category: 'documentation',
            weight: 10,
            checks: [note('troubleshooting', 25)],
          }),
          makeItem({
            id: 'escalation-note',
            label: 'Wrote a handoff that the next team can act on',
            why: 'An escalation without the report, the evidence, and the requested next step comes straight back.',
            category: 'documentation',
            weight: 20,
            critical: true,
            checks: [handoffNote()],
            hint: 'Put it in the handoff note when you close the ticket: what the user reported, what you checked, and what the next team should do.',
          }),
          makeItem({
            id: 'decision',
            label: 'Escalated to Tier 2',
            why: 'Scope options are owned by the network team; the service desk cannot change them.',
            category: 'resolution',
            weight: 20,
            critical: true,
            checks: [decision('escalated', ['escalated-tier2'])],
          }),
        ])
      },
      reference(context) {
        const scope = findScope(context.world, context.site.id)
        return [
          { type: 'command', input: 'ipconfig /all' },
          { type: 'command', input: 'nslookup fileserver' },
          { type: 'command', input: `get-dhcp-scope ${context.site.id}` },
          {
            type: 'note',
            noteKind: 'troubleshooting',
            text: `Reported by several users at ${context.site.name}: names fail while direct addresses work. Checked ipconfig /all, which showed 10.20.4.99 as the DNS server, and get-dhcp-scope ${context.site.id}, which shows scope ${scope?.name ?? context.site.id} option 006 set to 10.20.4.99. The scope is the source; this device only inherited it.`,
          },
          {
            type: 'note',
            noteKind: 'resolution',
            text: 'Reported: several users at this site cannot resolve names since this morning. Checked: the adapter and the site DHCP scope both show 10.20.4.99 as option 006. Next: the network team should correct option 006 on the scope to the site DNS servers; devices will recover on their next lease renewal.',
          },
        ]
      },
      expectedOutcome: 'escalated',
      expectedCodes: ['escalated-tier2'],
    },
    {
      id: 'scope-exhausted',
      label: 'DHCP scope is exhausted',
      summary: 'Stale leases from loaner laptops have consumed every address in the site scope.',
      difficulty: 2,
      severity: 'medium',
      subjects: ['{hostname} cannot get an address - {site}', 'No network on the spare laptop at {site}'],
      bodies: [
        'The spare laptop will not connect this morning. The network icon shows a warning and nothing loads, not even by address. The machine next to it is fine. I am at {site} and need this one for the stock count.',
        'I picked up the loan laptop and it has no internet at all. It says no network access. A colleague tried hers and it worked until it dropped off an hour later. We are at {site} - {displayName}.',
      ],
      symptoms: [
        'The adapter holds a 169.254 self-assigned address',
        'The device never receives a lease, gateway, or DNS servers',
        'The site has recently returned a batch of loaner laptops',
      ],
      build(context) {
        const scope = findScope(context.world, context.site.id)
        if (!scope) {
          throw new Error('DHCP scenario requires a site scope')
        }

        const start = lastOctet(scope.startAddress) ?? 0
        const end = lastOctet(scope.endAddress) ?? 0
        const base = scope.startAddress.split('.').slice(0, 3).join('.')
        const used = new Set(scope.leases.map((lease) => lease.address))
        let loaner = 0

        for (let octet = start; octet <= end; octet += 1) {
          const address = `${base}.${octet}`
          if (used.has(address) || scope.exclusions.includes(address)) {
            continue
          }
          loaner += 1
          scope.leases.push({
            address,
            hostname: `LT-LOAN-${String(loaner).padStart(2, '0')}`,
            state: 'stale',
            expiresAt: context.world.clock - loaner * 2 * 60 * 60 * 1000,
          })
        }

        const octet = 10 + context.rng.int(0, 200)
        context.device.ipMode = 'dhcp'
        context.device.ipAddress = `169.254.${octet}.${context.rng.int(2, 250)}`
        context.device.subnetMask = '255.255.0.0'
        context.device.gateway = null
        context.device.dnsServers = []
        context.device.dhcpLease = null

        return `exhausted:${scope.name}:${scope.leases.length}`
      },
      rubric(context) {
        return makeRubric('DHCP-01', 'scope-exhausted', [
          makeItem({
            id: 'inspect-adapter',
            label: 'Read the adapter configuration',
            why: 'The 169.254 address means the device asked for a lease and got nothing back.',
            category: 'diagnosis',
            weight: 5,
            checks: [ran('ipconfig', '/all')],
          }),
          makeItem({
            id: 'inspect-scope',
            label: 'Checked the scope for free addresses',
            why: 'Renewing again cannot help while the scope has nothing left to give.',
            category: 'diagnosis',
            weight: 15,
            checks: [ran('get-dhcp-scope')],
            hint: 'get-dhcp-scope <site> reports how many addresses are available and lists stale leases.',
          }),
          makeItem({
            id: 'remove-stale',
            label: 'Cleared a stale lease',
            why: 'Only stale leases are safe to remove; an active lease belongs to a working device.',
            category: 'resolution',
            weight: 25,
            critical: true,
            checks: [effect('dhcp_lease_removed')],
          }),
          makeItem({
            id: 'renew',
            label: 'Renewed the lease after freeing an address',
            why: 'A free address only helps once this device asks for it.',
            category: 'resolution',
            weight: 20,
            critical: true,
            checks: [effect('lease_renewed', context.device.hostname)],
          }),
          makeItem({
            id: 'verify-fix',
            label: 'Confirmed name resolution after the renewal',
            why: 'A new address with no working DNS leaves the user just as stuck.',
            category: 'diagnosis',
            weight: 10,
            checks: [ordered(effect('lease_renewed', context.device.hostname), ran('nslookup'))],
          }),
          makeItem({
            id: 'note-troubleshooting',
            label: 'Documented the exhausted scope and what was cleared',
            why: 'The next person needs to know which leases were stale and how many addresses remain.',
            category: 'documentation',
            weight: 10,
            checks: [note('troubleshooting', 20)],
          }),
          makeItem({
            id: 'note-customer',
            label: 'Told the user they can work again',
            why: 'The user is waiting on this laptop to start a shift task.',
            category: 'documentation',
            weight: 5,
            checks: [note('customer', 15)],
          }),
          makeItem({
            id: 'decision',
            label: 'Resolved the ticket',
            why: 'Clearing stale leases and renewing is a first-line fix.',
            category: 'resolution',
            weight: 10,
            critical: true,
            checks: [decision('resolved', ['resolved-remote'])],
          }),
        ])
      },
      reference(context) {
        const scope = findScope(context.world, context.site.id)
        const stale = scope?.leases.find((lease) => lease.state === 'stale')
        const address = stale?.address ?? `${context.site.subnet.split('.').slice(0, 3).join('.')}.50`

        return [
          { type: 'command', input: 'ipconfig /all' },
          { type: 'command', input: `get-dhcp-scope ${context.site.id}` },
          { type: 'command', input: `remove-dhcp-lease ${context.site.id} ${address}` },
          { type: 'command', input: 'ipconfig /renew' },
          { type: 'command', input: 'nslookup fileserver' },
          {
            type: 'note',
            noteKind: 'troubleshooting',
            text: `Adapter held an APIPA address. Scope ${scope?.name ?? context.site.id} had no available addresses because loaner laptops still held stale leases; cleared ${address} and renewed, after which the device received a valid address and resolved names again.`,
          },
          {
            type: 'note',
            noteKind: 'customer',
            text: 'Your laptop has a working network address again. Save and reopen the application; the stock count page should load now.',
          },
        ]
      },
      expectedOutcome: 'resolved',
      expectedCodes: ['resolved-remote'],
    },
  ],
}
