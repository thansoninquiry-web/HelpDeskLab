import type { SchoolScenario } from '../types'
import { twoStep } from './dialog'

/**
 * The cabling and radio calls. A school network is small: one access point per
 * corridor, one scope per building, and a switch port that someone disabled
 * during the holidays.
 */
export const NETWORK_SCENARIOS: readonly SchoolScenario[] = [
  {
    id: 'ap-down-year-3',
    title: 'The Year 3 corridor has no Wi-Fi',
    area: 'network',
    difficulty: 2,
    symptom: 'Three classrooms lose Wi-Fi together; the access point is offline.',
    report:
      '“The tablets in Rooms 2, 3 and 4 all say no internet. The rooms next door are fine. It started after the power cut.”',
    subject: 'Year 3 corridor · AP-3F-2',
    caller: { name: 'Elena Vargas', role: 'Year 3 teacher', language: 'es' },
    bell: { at: 65, label: 'Period 1 starts at 09:05' },
    window: 30,
    reads: [
      {
        id: 'ap-status',
        finding:
          'AP-3F-2 is offline. Its switch port Gi2/0/7 is err-disabled: “power denied — PoE budget exceeded”. The other two access points on the switch are online.',
        decisive: true,
      },
      {
        id: 'wifi-clients',
        finding: 'The tablets are trying AP-2F-1 through the floor and failing association; no clients on AP-3F-2.',
        decisive: true,
      },
      {
        id: 'switch-port',
        finding: 'Port Gi2/0/7 is down and err-disabled; the cable itself tests clean.',
      },
    ],
    changes: ['enable-poe-port', 'reboot-ap', 'replace-ap', 'replace-projector'],
    expected: ['enable-poe-port', 'reboot-ap'],
    dialog: twoStep(
      {
        prompt: '“¿Es la instalación? Ayer hubo un corte de luz.”',
        gloss: '“Is it the wiring? There was a power cut yesterday.”',
        best: '“No es el cable. El puerto del conmutador cortó la alimentación del punto de acceso. Lo voy a reactivar.”',
        bestGloss:
          '“It isn’t the cable. The switch port cut the power to the access point. I’ll bring it back up.”',
        jargon: '“The PoE budget tripped, so the port is err-disabled.”',
        brusque: '“The power cut broke it.”',
      },
      {
        prompt: '“¿Cuándo van a tener internet las tabletas?”',
        gloss: '“When will the tablets have internet?”',
        best: '“En unos minutos, cuando el punto de acceso vuelva a conectarse. Le aviso en cuanto esté.”',
        bestGloss:
          '“In a few minutes, once the access point rejoins. I’ll let you know as soon as it’s up.”',
        jargon: '“After the AP re-adopts on the controller.”',
        brusque: '“When it comes back.”',
      },
    ),
    hints: [
      'Three rooms lost Wi-Fi together, so the fault is the shared access point, not the tablets.',
      'The port is err-disabled because the PoE budget was exceeded — the cable is fine.',
      'Bring the port back up and reboot the access point, then watch it rejoin the controller.',
    ],
    explanation: [
      'Access points fail in groups. Reading the port and the controller together tells you whether the school lost the radio or the power to it.',
      'The power cut left the switch’s PoE budget mis-counted, so the port denied power. Re-enabling the port restores the power; the reboot makes the access point rejoin cleanly.',
    ],
    verifyText: 'AP-3F-2 is online and the Year 3 tablets are associated again.',
  },
  {
    id: 'weak-wifi-lab',
    title: 'The back of Lab A has weak Wi-Fi',
    area: 'network',
    difficulty: 2,
    symptom: 'Laptops at the back wall drop off while the front of the lab is fine.',
    report:
      '“The front row is fine. The back three rows keep losing the connection, and it is worse when the door is shut.”',
    subject: 'Lab A · coverage',
    caller: { name: 'Daniel Whitfield', role: 'Year 6 teacher', language: 'en' },
    bell: { at: 165, label: 'Period 3 starts at 10:45' },
    window: 40,
    reads: [
      {
        id: 'rssi-survey',
        finding:
          '−43 dBm at the teacher desk, −58 dBm mid-room, −72 dBm at the back wall. The signal drops sharply once the fire door is closed.',
        decisive: true,
      },
      {
        id: 'ap-status',
        finding:
          'AP-LAB-1 is online and healthy, mounted above the door in the corridor, pointing away from the room.',
        decisive: true,
      },
      {
        id: 'wifi-clients',
        finding: 'Only 22 clients associated; airtime 41%. This is not a capacity problem.',
      },
    ],
    changes: ['move-ap', 'reboot-ap', 'add-lab-ap', 'enable-5ghz', 'replace-projector'],
    expected: ['move-ap'],
    dialog: twoStep(
      {
        prompt: '“Can we just get a bigger access point?”',
        best: '“The unit is fine — it is mounted outside the room. Moving it inside should fix the back wall.”',
        jargon: '“The EIRP is adequate; the mounting position is wrong.”',
        brusque: '“A bigger one won’t fix a wall.”',
      },
      {
        prompt: '“Will you need to take the ceiling apart?”',
        best: '“The ceiling tile lifts and the cable run is already there. I’ll do it after this lesson and test the back row.”',
        jargon: '“It’s a re-site on the existing drop, no new cabling.”',
        brusque: '“I’ll try not to make a mess.”',
      },
    ),
    hints: [
      'The front of the room is strong and the back is weak. That is a coverage shape, so survey the room.',
      'The signal falls when the fire door closes, and the access point is mounted in the corridor pointing away.',
      'Re-site the access point into the room. More capacity would not help a signal that is being blocked by a wall.',
    ],
    explanation: [
      'Weak Wi-Fi at the far end of a room is a placement problem until the survey says otherwise. The survey read shows the drop at the door.',
      'Moving the access point inside the room fixes the geometry without new hardware. Adding a second unit is more work for the same wall, and a reboot changes nothing.',
    ],
    verifyText: 'The back row of Lab A holds at least −62 dBm with the door closed.',
  },
  {
    id: 'dhcp-exhausted-cart',
    title: 'The laptop cart cannot get addresses',
    area: 'network',
    difficulty: 2,
    symptom: 'Eight cart laptops come up with a self-assigned address; the scope is full.',
    report:
      '“We rolled the cart into Room 8 and half of them say no internet. The other half are fine. It worked yesterday.”',
    subject: 'Laptop cart · DHCP',
    caller: { name: 'Elena Vargas', role: 'Year 3 teacher', language: 'es' },
    bell: { at: 50, label: 'Period 1 starts at 08:50' },
    window: 30,
    reads: [
      {
        id: 'dhcp-scope',
        finding:
          'Scope 10.20.30.0/24: 244 of 250 addresses in use, 3 leases left, lease time 8 days. The cart is not reserved.',
        decisive: true,
      },
      {
        id: 'cart-status',
        finding: 'All 16 laptops are powered and connected; 8 have a 169.254 address.',
        decisive: true,
      },
      {
        id: 'wifi-clients',
        finding: 'The cart is on Wi-Fi, associated normally. The association is not the problem.',
      },
    ],
    changes: ['widen-dhcp-scope', 'reserve-address', 'set-static-ip', 'reboot-ap'],
    expected: ['widen-dhcp-scope', 'reserve-address'],
    dialog: twoStep(
      {
        prompt: '“¿Puedo ponerles una dirección fija a mano? Es más rápido.”',
        gloss: '“Can I set a fixed address by hand? It’s quicker.”',
        best: '“Mejor no: si las fijo a mano, chocarán con otras. Voy a ampliar el rango y reservar las del carro.”',
        bestGloss:
          '“Better not: hand-set addresses will collide later. I’ll widen the range and reserve the cart’s own addresses.”',
        jargon: '“Manual addressing creates an IP conflict surface; I’ll extend the scope.”',
        brusque: '“No, that’s how you break the network.”',
      },
      {
        prompt: '“¿Estarán listas para la clase?”',
        gloss: '“Will they be ready for the lesson?”',
        best: '“Sí. Amplío el rango ahora y las ocho se conectan en un par de minutos. Le digo cuáles usar.”',
        bestGloss:
          '“Yes. I’ll widen the range now and the eight will connect in a couple of minutes. I’ll tell you which ones to use.”',
        jargon: '“Once the scope is extended, the clients will renew on their next request.”',
        brusque: '“Give it a minute.”',
      },
    ),
    hints: [
      'Half the cart has addresses and half does not. Read the scope before you touch a laptop.',
      'The scope has three leases left and the cart has no reservation of its own.',
      'Widen the scope for today, then reserve the cart’s addresses so this does not recur. Static addresses by hand would collide.',
    ],
    explanation: [
      'A scope at 244 of 250 with devices falling back to 169.254 is exhaustion, not a Wi-Fi fault. The lease time makes it worse: an eight-day lease holds an address long after the laptop has left.',
      'Widening the range gets the lesson running; a reservation per cart bay stops the same eight laptops racing the staff room for the last addresses next week.',
    ],
    verifyText: 'All 16 cart laptops have a leased address in the cart’s own range.',
  },
  {
    id: 'vlan-wrong-office',
    title: 'One office PC is on the student network',
    area: 'network',
    difficulty: 3,
    symptom: 'An office PC can reach the internet but not the school’s file server.',
    report:
      '“It is online, but it cannot see the S: drive or the printers. The other two office PCs are fine.”',
    subject: 'Front office · PC 3 · switch port',
    caller: { name: 'Priya Raman', role: 'Front office administrator', language: 'en' },
    bell: { at: 35, label: 'The office opens at 08:35' },
    window: 20,
    reads: [
      {
        id: 'switch-port',
        finding:
          'Gi1/0/22 is up at 1 Gb but in VLAN 30 (students). The other office ports are VLAN 10 (staff). Changed during the holiday patching.',
        decisive: true,
      },
      {
        id: 'dhcp-scope',
        finding: 'The PC holds 10.30.0.57, a student-range address. The staff range is 10.10.0.0/24.',
        decisive: true,
      },
      {
        id: 'drive-mapping',
        finding: 'The logon script ran, but the server refused the session from a student subnet.',
      },
    ],
    changes: ['correct-vlan', 'set-static-ip', 'move-student-vlan', 'reimage-machine'],
    expected: ['correct-vlan'],
    dialog: twoStep(
      {
        prompt: '“Can you just give it a staff address by hand so I can work?”',
        best: '“A hand-set address would still sit on the student network. I’ll move the port back to the staff VLAN.”',
        jargon: '“The port is in the wrong broadcast domain; I’ll change the access VLAN.”',
        brusque: '“That won’t work.”',
      },
      {
        prompt: '“How did it end up there?”',
        best: '“It was changed during the holiday patching. I’ll check the rest of the office ports while I’m in the cabinet.”',
        jargon: '“A patching-window configuration drift.”',
        brusque: '“Someone patched it wrong.”',
      },
    ),
    walkUp: {
      id: 'parent-at-counter',
      who: 'A parent at the office counter',
      ask: '“I’m here to collect a loan laptop for my daughter. Can I just take it?”',
      options: [
        {
          id: 'verify-and-log',
          label: 'Check the loan record and book it out to the named pupil',
          detail: 'Three minutes; the right machine goes to the right child, on the record.',
          minutes: 3,
          best: true,
        },
        {
          id: 'hand-over',
          label: 'Hand over a charged loaner and sort the paperwork later',
          detail: 'Quick, and the machine is gone with no record of who has it.',
          minutes: 1,
        },
        {
          id: 'refuse',
          label: 'Tell the parent the desk is too busy',
          detail: 'No time lost, and the child goes without a machine.',
          minutes: 0,
        },
      ],
      note:
        'A loan is a data-bearing device leaving the building. The record is what makes it recoverable, and the named pupil is who it is booked to. Handing one over to get rid of the queue is the shortcut that loses the asset.',
    },
    hints: [
      'The PC is online but cannot see school resources. That is a network-segment symptom, not a broken machine.',
      'The port is in VLAN 30 (students) while the other office ports are VLAN 10 (staff), and the address is from the student range.',
      'Move the port back to the staff VLAN and let it lease a staff address.',
    ],
    explanation: [
      '“Online but no file server” means the machine is on the wrong network. The switch port and the leased address agree about which one.',
      'Correcting the port fixes the segment and the address in one step. Pinning a staff address on a student port leaves the machine routed from the wrong place, and it will collide.',
    ],
    verifyText: 'PC 3 holds a staff address, maps S:, and prints to the office printer.',
  },
]
