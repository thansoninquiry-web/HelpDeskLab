# Feature Inventory v2: Service Desk Simulator (observed from screen recordings)

**Purpose:** Reference for HelpDeskLab planning. Use it as inspiration for the general problem domain only.

**Rules for using this document:**
- Do NOT copy their text, branding, images, lesson content, or layout.
- Design original features, original copy, and independently implemented behavior.
- Anything marked **Unknown** was not observed. Do not guess; ask me or leave it out.

**Source and limits:** Four screen recordings of a signed-in Pro-tier session (about 30 minutes total), plus a course outline screenshot supplied by me. Frames were sampled roughly every 30 seconds and audio was not reviewed, so coverage is partial.

---

## 1. Main navigation (Observed)

Top navigation: **Modules, Tools, Voice Call, Voicemails, Mock Interview.**
Header: points total, rank tier (e.g., "Silver"), Pro badge, icons for chat, learning, and achievements.

## 2. Course structure (Observed + course outline)

One course, "The Support Toolkit": **16 modules, about 8 hours 50 minutes.** Each module has a page counter and time estimate (e.g., Module 1 is 11 pages, ~30 min), a progress bar, Back/Next paging, and a "Practice" task that sends the learner into the matching tool.

### Module list, in order

| # | Module | Evidence in recordings |
|---|--------|------------------------|
| 1 | Your First Shift | Observed in detail: a ticket is the record of the work, the incident queue, escalation as a handover (functional vs hierarchical; good vs bad escalation note) |
| 2 | The Ticket Queue | Observed: four severity levels (Critical/High/Medium/Low, color-coded), response and resolution clocks, pause, breach, ordering by priority |
| 3 | Documentation | Observed (content matches): why a desk writes everything down, creating a ticket from a report, reading the record before acting |
| 4 | Company Chat | Observed: simulated chat with the requester; ask one good question, then wait; the three-question scope check |
| 5 | Voicemails | Nav item seen; module content not confirmed |
| 6 | The Phone | Observed (content matches): taking name, number and problem, hold and transfer rules, handing a call to the next person |
| 7 | Directory (Active Directory) | Observed: groups, licenses and devices; password reset produces a temporary password sent through chat; admin consoles have no undo |
| 8 | Remote Desktop | Observed: connect, read before you touch; sign in with the user's credential prompt |
| 9 | Server Room | Observed: working an outage step by step; scope, blast radius, verify with the user, write it up; ping ladder (loopback, gateway, public IP) |
| 10 | Mail Admin | Observed: message trace, delivery status (delivered, failed, quarantined, pending), mailbox rules; what each console maps to in real tools |
| 11 | Mail Security | Observed (content matches): filtering console with quarantine review; release or leave decisions on suspicious mail |
| 12 | Asset Management | Observed: warranty, leases, licensing; register an asset and check it out to a person |
| 13 | Computer Deployment | Observed: imaging, task sequence, hand-build walkthrough |
| 14 | PC Shelf | Observed (content matches): stockroom with categorized inventory piles |
| 15 | Ship Manager | Observed: ship and return equipment, prepaid return labels, tracking states |
| 16 | Mock Interview | Observed: Pro-gated; three interviewer personas; companion lesson on what each first-line question tests |

Rows marked "content matches" were mapped from lesson content I saw, not from a visible module title.

## 3. Ticket queue and ticket record (Observed, partially)

- Queue titled "Incidents" with an open count; each row shows title, requester, and severity tag.
- Example themes: WiFi dropping, dead workstation for a support agent, internet down, VPN, mobile email, printer, account change.
- A ticket card shows title, severity, status, assignment, and timestamps; resolution and escalation are separate actions with notes.
- **Unknown:** full status transitions and every field on the ticket detail view.

## 4. Tools (Observed as the practice targets of the modules)

Remote Desktop, Directory console, Mail Admin console, Mail Security console, Asset register, Company Chat, phone/voicemail practice.

- **Unknown:** how scoring works inside each tool, and how simulated faults are modeled.

## 5. Progression and feedback (Observed, partially)

- Points and a named rank tier in the header.
- **Unknown:** how points are earned, rank thresholds, achievements, per-ticket feedback format.

---

## Implications for HelpDeskLab (ideas, not requirements)

Candidate features, roughly by value versus effort. Each must be designed originally:

1. **Tool consoles in the simulator:** a directory/password-reset tool, a mail trace tool, a remote session. These plug into the existing simulated environment.
2. **Chat with the requester** that supports follow-up questions, not only scripted caller replies.
3. **Escalation-note rubric item:** reward notes that state what was reported, what was checked, and what the next team should do.
4. **Short original lessons paired with practice tickets.**
5. **Points and rank** driven by the existing scoring engine.
6. **Mock interview mode** with original personas.
7. **Phone and voicemail practice**, as a later release.

## Differentiator to protect

HelpDeskLab's stateful simulated machine (real underlying faults, discoverable evidence, scored diagnostic reasoning) was not observed in the reference product. Keep investing there.

## Open questions

- Which of items 1 to 7 fit the roadmap after the current milestone?
- What is the smallest version of lessons or progression that adds value without a big content-writing burden?
