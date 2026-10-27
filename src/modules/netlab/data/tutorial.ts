import type { Tutorial } from '../../shared/TutorialPage'

/**
 * The networking lab's tutorial.
 *
 * It walks one incident — a single PC with no link after the desks moved — from
 * the report to the socket, because that is the shape every other incident takes:
 * find the scope, prove the layer, change one thing, close on the evidence.
 */
export const NETLAB_TUTORIAL: Tutorial = {
  surface: 'Networking lab',
  title: 'Work an incident from the report down to the wire',
  lede: 'A school network, one fault at a time. The lab scores how you got there as well as where you ended up, so the order of the work is the lesson: find the edge of the fault, prove the layer, then change one thing.',
  minutes: 9,
  before: [
    'Everything here is simulated. The topology, the addresses and the school are code; nothing reaches a real network.',
    'The lab scores reads as well as changes. A correct fix reached by guessing still loses the diagnosis marks.',
    'There is no timer. Work the incident at reading pace; the pressure is in the debrief, not the clock.',
  ],
  steps: [
    {
      title: 'Read the report and put a boundary around the fault',
      action:
        'Open the incident and read the caller’s words. Note whether the report names one machine, one room or the whole site, and what changed recently — a move, a power cut, an update.',
      why: 'The report is the cheapest evidence you will get. “Everyone else is fine” already rules out the router, the circuit and the server; “the whole room” points the other way. Write the boundary down before you touch anything.',
      link: { to: '/networking/incidents', label: 'Read the fifteen incident reports' },
    },
    {
      title: 'Find the affected device on the map',
      action:
        'Open the topology and follow the path from the affected machine back towards the ISP: PC, wall port, access switch, core switch, router, firewall, modem. Note which links are up and which device is closest to the fault.',
      why: 'The map is the estate as it stands, not a drawing. A red link narrows the fault to everything below it; an access point down takes its whole corridor with it.',
      link: { to: '/networking', label: 'Open the topology' },
    },
    {
      title: 'Read the machine before you read the network',
      action:
        'On the affected PC, run `ipconfig /all` and read the adapter: media state, address, gateway and DNS. Then `ping` the gateway, and a name, to see how far traffic gets.',
      why: 'A media-disconnected adapter is a cable fault; an address with no gateway is a DHCP or VLAN fault; a working address that cannot resolve is DNS. One read at the right layer rules out a dozen theories.',
      link: { to: '/networking/tools', label: 'Open the tool reference' },
    },
    {
      title: 'Read the shared equipment to see the blast radius',
      action:
        'On the switch, run `show ip int brief`, `show vlan` and `show mac address-table`. On a larger fault, read the router or the WAN status as well.',
      why: 'A port that is down, in the wrong VLAN, or erroring tells you whether the machine, the port or the segment is at fault. Reading a second device is the only thing that proves the fault is contained — the scorer calls it scope, and it is worth five points on its own.',
    },
    {
      title: 'Change one thing, then look again',
      action:
        'Make the smallest change the evidence calls for — reseat or replace the lead, correct the VLAN, renew the lease. Then re-read the same link or adapter to confirm it changed.',
      why: 'One change at a time is what makes the next read meaningful. The lab prices changes it did not ask for, and a riskier one — restarting the core switch for a single PC — costs ten points and drops the floor while you wait.',
      link: { to: '/networking/incidents/one-pc-no-internet', label: 'Try a one-PC link fault' },
    },
    {
      title: 'Close on the evidence, not on hope',
      action:
        'Check the incident and read the debrief: which reads matched the reference path, whether the first look was at or below the fault’s layer, what the changes cost, and whether the estate actually works.',
      why: 'The debrief is the part that transfers to the job: it names the layer you missed rather than only the command. Read it once before you retry, then work a different category.',
      link: { to: '/networking/concepts', label: 'Read the concept cards' },
    },
  ],
  scoring: [
    {
      label: '15 · Evidence',
      detail: 'The reads the reference path uses, taken before the first change.',
    },
    {
      label: '15 · Layer and order',
      detail: 'The first read reached the fault’s layer, and the changes went in the reference order.',
    },
    {
      label: '5 · Scope',
      detail: 'A second device or a shared table was read, so the blast radius is known rather than assumed.',
    },
    {
      label: '35 · The fix',
      detail: 'The expected changes, in order, with half credit for a right change made out of order.',
    },
    {
      label: '20 · The network works',
      detail: 'The estate itself verifies: link up, right VLAN, address, reachable gateway.',
    },
    {
      label: '10 · Safety',
      detail: 'No change the incident did not call for; a switch restart for one PC is charged heavily.',
    },
  ],
  mistakes: [
    'Pinging an internet address first. It tells you the internet is down, not which of six things broke.',
    'Changing DNS because a name failed, when the adapter never had a link.',
    'Restarting the core switch to fix one machine, and taking the floor down with it.',
    'Reading only the affected PC. Without a second device or the switch table, “one PC” is an assumption.',
    'Reading the fix options before the evidence. The action list is the last panel on the page for a reason.',
  ],
  practice: {
    to: '/networking/incidents/one-pc-no-internet',
    label: 'Open the one-PC incident',
    note: 'Start with a single machine and a recent move. It is the incident the six steps above describe, and a good first score here is anything that proves the layer before the fix.',
  },
  home: { to: '/networking', label: 'Back to the topology' },
}
