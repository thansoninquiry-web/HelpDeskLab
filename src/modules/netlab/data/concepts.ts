/**
 * The five concept cards behind the lab, and the quiz under each.
 *
 * They are written for this product, in the order a first-shift technician
 * needs them: what the pieces are, how to talk about layers, how an address is
 * divided, who hands out names and numbers, and what the circuit on the wall
 * actually is. Nothing here is copied from a course or a vendor.
 */

export interface ConceptChoice {
  id: string
  text: string
}

export interface ConceptQuestion {
  id: string
  prompt: string
  choices: readonly ConceptChoice[]
  /** The choice id that is correct. */
  answer: string
  /** Why that answer holds, and what the other options get wrong. */
  explanation: string
}

export interface ConceptSection {
  heading: string
  body: string
  points?: readonly string[]
}

export interface ConceptCard {
  id: string
  title: string
  lede: string
  sections: readonly ConceptSection[]
  takeaway: string
  questions: readonly ConceptQuestion[]
}

export const CONCEPTS: readonly ConceptCard[] = [
  {
    id: 'lan-wan-wlan',
    title: 'LAN, WAN and WLAN',
    lede: 'The three words that describe who owns the wire, and how far it goes.',
    sections: [
      {
        heading: 'A LAN is one building’s own network',
        body:
          'The local area network is everything the school controls: the switch, the cabling, the access points and the addresses on them. It is usually one subnet per group of machines, joined by a router. A fault in the LAN is yours to fix.',
        points: [
          'Ashfield’s staff VLAN and student VLAN are both LANs.',
          'The switch port and the patch lead are LAN layers.',
          'A LAN address is usually private: 10.x, 172.16–31.x or 192.168.x.',
        ],
      },
      {
        heading: 'A WAN is the path between sites',
        body:
          'The wide area network is the link that leaves the building: the fibre circuit, the provider’s equipment and the hops beyond it. A WAN fault is usually confirmed and escalated rather than repaired, because the equipment at the far end is not yours.',
      },
      {
        heading: 'A WLAN is a LAN carried by radio',
        body:
          'Wireless is not a different network; it is the same VLAN reached through an access point. That is why a Wi-Fi problem can be a radio problem (coverage, interference) or a wired one (the AP’s switch port, its VLAN), and why reading the AP’s own status comes before changing client settings.',
      },
    ],
    takeaway:
      'Ask which of the three is failing before touching anything: one room’s cable, one VLAN’s path, or the circuit out of the building.',
    questions: [
      {
        id: 'lan-scope',
        prompt: 'A single classroom’s PCs cannot reach the school’s file server, but the office can. Which area is failing?',
        choices: [
          { id: 'lan', text: 'The LAN — one of its VLANs or switch paths' },
          { id: 'wan', text: 'The WAN — the provider circuit' },
          { id: 'wlan', text: 'The WLAN — the school’s wireless controller' },
        ],
        answer: 'lan',
        explanation:
          'The file server and the classroom are both inside the school. The office working proves the circuit and the servers are fine, so the fault is inside the LAN — here, the student VLAN’s path.',
      },
      {
        id: 'wifi-vlan',
        prompt: 'Two access points carry the same SSID but land clients on different VLANs. What does a client get?',
        choices: [
          { id: 'same', text: 'The same address range on both, because the SSID is the same' },
          { id: 'different', text: 'Different address ranges, because each AP bridges to its own VLAN' },
          { id: 'none', text: 'No address at all until the SSIDs are renamed' },
        ],
        answer: 'different',
        explanation:
          'An SSID is a name for a radio, not a subnet. Each AP bridges its clients onto the VLAN configured on its own switch port, so the address a client gets follows the AP, not the SSID.',
      },
      {
        id: 'wan-own',
        prompt: 'The modem has lost sync and no device on site can reach the internet. Who owns the fix?',
        choices: [
          { id: 'isp', text: 'The provider — the fault is upstream of the building' },
          { id: 'local', text: 'You do — reboot the core switch until it clears' },
          { id: 'dns', text: 'You do — restart DNS on the domain controller' },
        ],
        answer: 'isp',
        explanation:
          'Sync is the modem’s agreement with the provider’s equipment. Without it, nothing inside the building can restore the link; the correct action is to confirm the loss and raise it.',
      },
    ],
  },
  {
    id: 'osi',
    title: 'The layers, and why order matters',
    lede: 'A working method more than a memorised diagram: prove the bottom before blaming the top.',
    sections: [
      {
        heading: 'Seven layers, four you will use',
        body:
          'The OSI model is a way of saying what kind of thing has failed. In a school network the useful split is: the cable and radio (1), the switch port, VLAN and MAC (2), the IP address, subnet and gateway (3), the port and the service behind it (4–7).',
        points: [
          'Layer 1 — cable, socket, switch port, radio signal, sync.',
          'Layer 2 — VLAN membership, trunk allowed lists, MAC table.',
          'Layer 3 — IP address, subnet mask, default gateway, routing.',
          'Layer 4–7 — TCP ports, DNS, DHCP, HTTP.',
        ],
      },
      {
        heading: 'Bottom-up is not superstition',
        body:
          'Every layer above depends on the one below, so a failed layer 3 test cannot tell you whether layer 2 is broken. Reading the link first turns “the internet is down” into “this port has no carrier” in one step, and rules out a dozen theories at once.',
      },
      {
        heading: 'The exception: start where the symptom is sharpest',
        body:
          'When the symptom already points at one service — names fail but numbers work — a DNS probe is the crisp first read. The discipline is not “always start at layer 1”; it is “never test above a layer you have not established, and never change anything before the first read”.',
      },
    ],
    takeaway:
      'Name the layer before you name the fix. A change made above an unproven layer is a guess with a log entry.',
    questions: [
      {
        id: 'layer-order',
        prompt: 'A PC shows “Media disconnected”. Which layer is proven bad, and what do you not need to test yet?',
        choices: [
          { id: 'one', text: 'Layer 1 — DNS and DHCP are not worth testing yet' },
          { id: 'three', text: 'Layer 3 — the address must be wrong' },
          { id: 'seven', text: 'Layer 7 — the browser is at fault' },
        ],
        answer: 'one',
        explanation:
          'Media disconnected is the adapter reporting no carrier: a physical or switch-port fault. Until the link exists, an address or a name lookup cannot succeed, so testing them tells you nothing.',
      },
      {
        id: 'vlan-layer',
        prompt: 'A port is in VLAN 20 but should be in VLAN 10. Which layer is that?',
        choices: [
          { id: 'two', text: 'Layer 2 — VLAN membership' },
          { id: 'three', text: 'Layer 3 — the default gateway' },
          { id: 'four', text: 'Layer 4 — the TCP port' },
        ],
        answer: 'two',
        explanation:
          'A VLAN is a layer 2 broadcast domain. The wrong VLAN shows up as an address from the wrong subnet at layer 3, but the thing to change is the port’s membership.',
      },
      {
        id: 'no-change-first',
        prompt: 'Why is a change made before the first diagnostic read worth fewer marks than a change made after it?',
        choices: [
          { id: 'evidence', text: 'The log cannot show what the change was based on' },
          { id: 'speed', text: 'Because it takes longer' },
          { id: 'permission', text: 'Because changes always need a manager’s approval' },
        ],
        answer: 'evidence',
        explanation:
          'Scoring reads the action log, not just the end state. A fix that lands before any read proves the ticket was guessed, even if the guess happened to be right.',
      },
    ],
  },
  {
    id: 'subnetting',
    title: 'Subnetting: /24 and /25',
    lede: 'Enough to read an address, spot a wrong subnet and explain why the gateway must match.',
    sections: [
      {
        heading: 'The mask is the boundary',
        body:
          'An IPv4 address is 32 bits. The /n says how many of them are the network. A /24 keeps the first three octets and gives the last one to hosts; a /25 splits that last octet in half.',
        points: [
          '/24 → 255.255.255.0 → 256 addresses, 254 usable (network and broadcast excluded).',
          '/25 → 255.255.255.128 → 128 addresses, 126 usable.',
          'Two /25s make one /24: .0–.127 and .128–.255.',
          'The gateway must be an address inside the host’s own subnet.',
        ],
      },
      {
        heading: 'Reading Ashfield’s two VLANs',
        body:
          'Staff is 10.10.10.0/24 with gateway 10.10.10.1 and a pool from .100 to .180. Student is 10.10.20.0/24 with gateway 10.10.20.1 and the same pool shape in its own range. A machine holding 10.10.20.104 is on the student VLAN whatever port it is plugged into — and that is often the fastest way to spot a patching mistake.',
      },
      {
        heading: 'Why a /25 matters on a small site',
        body:
          'A school with ninety devices on a VLAN can outgrow a /25 quickly: 126 usable addresses looks generous until phones, printers and visitors are counted. Splitting a /24 into two /25s is also how a room is separated without a new VLAN — but both halves then need their own gateway, which is the part people forget.',
      },
    ],
    takeaway:
      'An address, a mask and a gateway are one decision. If any two disagree, the machine cannot leave its own subnet.',
    questions: [
      {
        id: 'usable-25',
        prompt: 'How many usable host addresses does a /25 provide?',
        choices: [
          { id: '126', text: '126' },
          { id: '128', text: '128' },
          { id: '254', text: '254' },
        ],
        answer: '126',
        explanation:
          'A /25 has 128 addresses. The first (network) and last (broadcast) cannot be assigned, leaving 126 for hosts.',
      },
      {
        id: 'gateway-match',
        prompt: 'A PC is 10.10.10.105/24 and its gateway is 10.10.10.254. What happens?',
        choices: [
          { id: 'drop', text: 'Off-subnet traffic is dropped: nothing answers at .254' },
          { id: 'route', text: 'It routes normally, because .254 is in the same /24' },
          { id: 'dns', text: 'Only DNS fails; local shares still work' },
        ],
        answer: 'drop',
        explanation:
          'The address is on the staff subnet but no router owns 10.10.10.254. The PC sends everything off-subnet to an address that never replies, so local traffic works and remote traffic does not.',
      },
      {
        id: 'wrong-subnet',
        prompt: 'A staff PC holds 10.10.20.104. What is the first thing to check?',
        choices: [
          { id: 'vlan', text: 'Which VLAN the switch port is in' },
          { id: 'dns', text: 'Whether DNS is running' },
          { id: 'cable', text: 'Whether the patch lead is Cat 6' },
        ],
        answer: 'vlan',
        explanation:
          'The address comes from the student pool, so the port is carrying the student VLAN. The VLAN/mac table names the port and its membership, which is the evidence the change hangs on.',
      },
    ],
  },
  {
    id: 'dhcp-dns-nat',
    title: 'DHCP, DNS and NAT',
    lede: 'Three services that make a working link feel like a working network.',
    sections: [
      {
        heading: 'DHCP hands out the address',
        body:
          'The client asks, the server offers, the client requests, the server acknowledges. The lease carries the address, mask, gateway and DNS servers. When no server answers, Windows falls back to a 169.254 address — APIPA — which means “I have a link but nobody gave me a number”.',
        points: [
          'A full scope looks exactly like a broken one from the client side.',
          'A second DHCP server on the wire is a rogue: the address it hands out is outside your ranges.',
          'Moving a machine between VLANs needs a renewal, not only a port change.',
        ],
      },
      {
        heading: 'DNS turns names into addresses',
        body:
          'The resolver asks its configured server; the server answers from its zone or forwards the query. Names failing while numbers work isolates the fault to the resolver, and a single server with a stopped service takes the whole site’s names down at once.',
      },
      {
        heading: 'NAT lets private addresses leave',
        body:
          'The router rewrites the private source address to the public one and remembers the conversation, so replies come back to the right machine. That is why an internal address cannot be reached from outside, and why “the internet works but nothing local does” is not a NAT problem.',
      },
    ],
    takeaway:
      'Link, address, name, route: each is a separate service, and each fails with its own signature.',
    questions: [
      {
        id: 'apipa',
        prompt: 'A PC holds 169.254.31.8. What does that tell you?',
        choices: [
          { id: 'nolease', text: 'The link is up but DHCP did not answer' },
          { id: 'nocarrier', text: 'The cable is unplugged' },
          { id: 'dns', text: 'DNS is misconfigured' },
        ],
        answer: 'nolease',
        explanation:
          '169.254 is the address Windows gives itself when no DHCP server answers. The adapter can still report media connected, so the next read is the pool rather than the cable.',
      },
      {
        id: 'names-numbers',
        prompt: 'Names fail everywhere but pinging 1.1.1.1 works. Which service is the suspect?',
        choices: [
          { id: 'dns', text: 'DNS' },
          { id: 'dhcp', text: 'DHCP' },
          { id: 'nat', text: 'NAT' },
        ],
        answer: 'dns',
        explanation:
          'A working ping to a public address proves the link, the address, the gateway and NAT. Only the step that turns a name into that address is failing.',
      },
      {
        id: 'rogue',
        prompt: 'Classroom PCs hold 192.168.0.x addresses. Which is the correct first move?',
        choices: [
          { id: 'find', text: 'Find and disable the second DHCP server on the segment' },
          { id: 'renew', text: 'Renew every PC’s lease' },
          { id: 'scope', text: 'Extend the school’s DHCP scope' },
        ],
        answer: 'find',
        explanation:
          'Renewing hands the PCs back to the same rogue server. The addresses are outside the school’s ranges, which is the signature of a second DHCP server; the fix is to remove it, then renew.',
      },
    ],
  },
  {
    id: 'wan-links',
    title: 'Circuit types and their speeds',
    lede: 'What the line on the wall is, what it can carry, and when each one is the right choice.',
    sections: [
      {
        heading: 'The five the exam and the job both ask about',
        body:
          'These are the named circuit types a service desk is expected to recognise. Speeds are the classic figures, not the marketing peak of whatever is installed today.',
        points: [
          'T1 — 1.544 Mb/s symmetric over copper, 24 channels. Legacy leased line; still found in old sites and as a backup.',
          'DSL — asymmetric over a phone line, typically 10–80 Mb/s down and 1–20 Mb/s up depending on distance from the cabinet. Cheap, distance-limited.',
          'Cable — shared coaxial/DOCSIS, typically 100–1000 Mb/s down and 10–50 Mb/s up. Homes and small offices; contention at busy times.',
          'Metro Ethernet — 10 Mb/s to 10 Gb/s symmetric over fibre, business-grade with an SLA. Schools, campuses and site-to-site links.',
          'OC-3 — 155.52 Mb/s over SONET/SDH fibre, carrier backbone and legacy WAN. Rarely sold to a school today.',
        ],
      },
      {
        heading: 'Symmetric or not, and why the difference bites',
        body:
          'A site that mostly downloads is fine on aDSL or cable. A school that backs up to the cloud, runs video calls out and hosts a portal needs upload too, which is why a 500/100 fibre circuit and a 500/20 cable circuit feel completely different in practice.',
      },
      {
        heading: 'Fibre is a medium, not a service',
        body:
          'FTTP is fibre to the premises; Metro Ethernet is a service that usually runs over fibre. Asking “is it fibre?” tells you the medium; asking “what is the circuit, and what does the SLA promise?” tells you what to expect at 9am on a Monday.',
      },
    ],
    takeaway:
      'Name the circuit, its speed and its symmetry. That is what turns “the internet is slow” into a measurement.',
    questions: [
      {
        id: 't1-speed',
        prompt: 'What is the line rate of a T1?',
        choices: [
          { id: '1544', text: '1.544 Mb/s symmetric' },
          { id: '155', text: '155.52 Mb/s' },
          { id: '100', text: '100 Mb/s per direction' },
        ],
        answer: '1544',
        explanation:
          'A T1 carries 24 DS0 channels of 64 kb/s, which comes to 1.544 Mb/s in both directions. 155.52 Mb/s is an OC-3.',
      },
      {
        id: 'metro-use',
        prompt: 'Which circuit best fits a school needing 1 Gb/s in both directions with a service guarantee?',
        choices: [
          { id: 'metro', text: 'Metro Ethernet' },
          { id: 'dsl', text: 'DSL' },
          { id: 'cable', text: 'Cable broadband' },
        ],
        answer: 'metro',
        explanation:
          'Metro Ethernet is symmetric, fibre-based and sold with an SLA. DSL and cable are asymmetric and contended, which shows up exactly when a whole class signs in at once.',
      },
      {
        id: 'asymmetry',
        prompt: 'A site has 500/20 broadband. Which activity suffers first?',
        choices: [
          { id: 'upload', text: 'Cloud backup and video calls from the site' },
          { id: 'download', text: 'Streaming a video' },
          { id: 'dns', text: 'Local name resolution' },
        ],
        answer: 'upload',
        explanation:
          'The 500 is the download figure; only 20 Mb/s leaves the site. Backups and outbound video fill that direction first, while downloads still look fine.',
      },
    ],
  },
]

export function conceptById(id: string): ConceptCard | undefined {
  return CONCEPTS.find((concept) => concept.id === id)
}

export const CONCEPT_IDS: readonly string[] = CONCEPTS.map((concept) => concept.id)

export const TOTAL_QUESTIONS: number = CONCEPTS.reduce(
  (total, concept) => total + concept.questions.length,
  0,
)
