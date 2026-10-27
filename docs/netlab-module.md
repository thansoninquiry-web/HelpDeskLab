# Networking lab (M10)

A small school network you can break and fix, in the browser, with no hardware
and no cloud account. Ashfield Primary School is fictional in every particular:
the addresses come from the documentation ranges, every MAC shares a made-up
prefix, and the ISP on the wall is invented.

The module lives in `src/modules/netlab/` and is reached at `/networking`.

## The estate

`data/topology.ts` describes one site:

| Device | Role |
| --- | --- |
| `modem-1` | Brookline Fibre FTTP 500/100 circuit, public address on the WAN side |
| `fw-edge` | Edge firewall, NAT, one blocked destination |
| `rtr-core` | Router-on-a-stick: both VLAN gateways, DHCP pools, upstream route |
| `sw-core` | 24-port managed switch, access ports, trunk to the router, MAC table |
| `ap-staff`, `ap-student` | Wireless access points, one per VLAN |
| Clients | Staff desktops and laptops, the computer-room and classroom banks |

Two VLANs, one of each kind the lab teaches: **10 Staff** (`10.10.10.0/24`) and
**20 Student** (`10.10.20.0/24`). Each has a gateway, a DHCP pool and a stated
purpose, so an address in the wrong subnet is a fact the learner can look up.

Every device is clickable. A device page shows what that box actually knows —
addresses, ports, the MAC table, the pool, the radio — and opens a simulated
admin page or a CLI for the devices that have one.

## Incidents

Fifteen scenarios in `data/incidents.ts`, one fault each:

1. No internet on one PC
2. A whole classroom offline
3. Bad cable or dead switch port
4. DHCP scope exhausted
5. Duplicate address (IP conflict)
6. Client on the wrong VLAN
7. Access point down
8. Weak Wi-Fi coverage in a corner
9. DNS failure
10. Firewall blocking a site
11. Wrong gateway
12. Duplex/speed mismatch
13. ISP outage
14. An internal fault that looks like an ISP outage
15. A second look at the same symptoms with a different cause

Each scenario states the caller's report, the checks that would isolate it, the
fix, and the traps — the plausible change that makes the symptom move rather
than go away. The fix list is closed (`LAB_FIXES`), so a fix is a value the
module recognises rather than free text.

Pairs 13/14 and the last scenario exist on purpose: the lab's point is that the
same "the internet is down" report can be the circuit, the firewall, or a
switch, and only evidence tells them apart.

## Concepts and quiz

`data/concepts.ts` holds five cards, written for this product:

- LAN vs WAN vs WLAN
- OSI basics, and which layer a symptom belongs to
- Subnetting basics — `/24` and `/25`, what a mask does to a host range
- DHCP, DNS and NAT, and which one answers which question
- ISP connection types: T1, DSL, cable, Metro Ethernet, OC3, with typical speeds
  and the case each one actually fits

Each card ends in a short quiz (16 questions in total). A wrong answer shows the
explanation, and a card counts as read only when the learner opens it.

## Tools

Simulated, in `logic/tools.ts`, over the estate above:

```
ping <host>            tracert <host>        ipconfig /all
nslookup <name>        arp -a                netstat
```

Plus a router and switch CLI:

```
show ip interface brief    show vlan    show mac address-table
show running-config        show interface <name>
```

Nothing is executed. Each command reads the scenario's current state, so the
same `ping` gives a different answer once the port is moved — which is how the
learner knows the change landed.

## Scoring

Attempts use the app's rubric categories with the lab's own weighting
(`logic/scoring.ts`), scored out of 100:

- **10** diagnostic reasoning — reading before changing
- **55** resolution — the right fix, not a neighbouring one
- **20** end state — the caller's report is actually gone
- **15** safety — nothing destructive, nothing outward-facing

Every change is recorded. Random changes cost: a change made before the fault
was isolated is penalised, and the first working fix ordered after evidence
scores higher than the same fix found by trial. Attempts join the app's XP,
scenario stats and weak-topic ranking, so a network family that keeps falling
short shows up on Progress like any other.

Quiz answers and read cards are stored but carry no XP: reading a card is not
resolving a ticket.

## Storage

Three tables from one migration (schema v18), in `persistence/store.ts`:

- `netlab_attempts` — the attempt, its changes, its checks and its score
- `netlab_quiz` — one row per answered question
- `netlab_concept_reads` — which cards were opened

The network itself is code, not data: a scenario's estate is derived from its
fault, so there is nothing to migrate when a device or a port is added.

## Boundaries

- `ui → app → domain`, `app → persistence`, as everywhere else. The module
  imports the app only through `src/app/netlabService.ts` and
  `src/app/netlabProgress.ts`.
- No network, no telemetry, no real addresses. The simulator never leaves the
  page.
- The lab does not replace the ticket queue: its scenarios are its own, and it
  adds one entry to the header nav (`/networking`) with its own tabs.
