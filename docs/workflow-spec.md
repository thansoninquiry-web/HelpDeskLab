# ServiceDesk Simulator — observed workflow specification

Companion to [website-audit.md](website-audit.md). Every rule below is tagged:

- **[O]** observed directly in the public demo.
- **[D]** documented by the vendor in the public help centre or course.
- **[I]** inferred from wording; needs confirmation before we rely on it.

Nothing here is derived from the application bundle, an account, or private
data. The purpose is to describe behaviour precisely enough to design an
independent implementation, not to clone the UI or copy content.

---

## 1. Actors and surfaces

| Actor | Surface | Notes |
| --- | --- | --- |
| Player / trainee | Authenticated SPA | One person, one queue, one progress record |
| Caller | Simulated voice call | AI-played employee; may be a social-engineering attempt [D] |
| Requester | Ticket metadata | Fictional employee drawn from the company directory |
| Security Team | Escalation target | The only escalation destination; no team picker [D] |
| Teacher / co-admin | Classroom dashboard | Sees class aggregates, not account access [D] |
| Support | Email + in-app feedback | Out of scope |

Public surfaces (marketing, course, help, blog) are read-only and separate from
the app shell.

---

## 2. Core entities

| Entity | Key fields (observed or documented) | Lifecycle |
| --- | --- | --- |
| Ticket | id (`INC-nnnn`), subject, description, requester, department, priority (Critical/High/Medium/Low), category, difficulty, base points, status, assignee, resolution notes (≤600 chars), created/closed timestamps | available → in progress → resolved → closed / escalated |
| Ticket category | Network, Hardware, Software, Access, Security, Email [D] | Used by Training Focus and analytics |
| Session / attempt | start, end, outcome, score, actions | One per ticket attempt |
| Directory user | display name, username, email, title, employee ID, phone, department, manager, last login, expiry, groups, licences, devices, MFA, mailbox | Mutated by Directory actions |
| Device | hostname, type, IP, location, uptime, status, action capability | online / offline / rebooting / error / degraded [D] |
| Server | name, role, location, CPU%, memory%, status | healthy / degraded / down [D] |
| Asset | tag/serial, holder, device type, status | in stock / assigned / in transit / returned |
| Mailbox | status (capacity), mailbox enabled flag, archive, retention, rules | Per user |
| Quarantine item | sender, subject, reason, state | held / released |
| Shipment | recipient address, equipment, speed, return label, delivery state | created → arriving → delivered |
| Voicemail | caller, department, extension, duration, listened flag | new → listened → ticketed / archived |
| Interview session | interviewer, mode (voice/typed), transcript, score, sub-scores | in progress → graded |
| Certificate | level, lifetime tickets required, verification link | earned / unearned |
| Progress record | points, tier, streak, badges, per-category stats | Persistent |

---

## 3. Ticket lifecycle

### 3.1 States

```
                 assign                      fix satisfied
  [available] ─────────────▶ [in progress] ─────────────────▶ [resolved]
   (Unassigned)                 (You)                          (banner)
       │                          │                               │
       │                          │ close while unresolved        │ close
       │                          ▼                               ▼
       │                    [closed, penalised] ◀────────── [closed, paid]
       │
       └──────────── escalate ──────────▶ [escalated] (terminal)
```

Observed in the demo [O]:
- `Open` with `Unassigned`; assigning set status `In Progress` and assignee
  `You`, with an `UNASSIGN` control.
- Applying the correct fix in Server Room flipped the ticket to `Resolved` and
  showed "Solution Complete — Review the solution, then close the ticket."
- Closing removed it from the incident list and kept the awarded points.

Documented [D]:
- A resolved ticket shows a banner and a close action.
- Closing opens a dialog with optional resolution notes (600-character cap).
- The primary button label communicates the consequence before commitment:
  `Close Ticket` (resolved), `Close & Claim Points` (fix landed, state not yet
  updated), `Close Anyway` (unresolved, will cost points).
- Closing is irreversible.

### 3.2 Transition table

| From | Trigger | To | Side effects |
| --- | --- | --- | --- |
| available | Assign to me | in progress | Enters My Queue; confirmation "Ticket added to your queue"; free daily limit checked here [D] |
| in progress | Unassign | available | Leaves My Queue [D] |
| in progress | Correct world state reached | resolved | Banner; no points yet |
| resolved | Close Ticket | closed | Points paid; moves to Past Tickets; model answer unlocked |
| resolved | Close & Claim Points | closed | Same, when the UI has not caught up [D] |
| in progress / available | Close Anyway | closed (penalised) | Cost deducted; irreversible |
| available / in progress | Escalate | escalated | Terminal; points settled at escalation; optional "pending work" warning [D] |

### 3.3 Points and penalties [D]

| Rule | Value |
| --- | --- |
| Base points | Varies per ticket (demo awarded 25 for a High ticket) [O/D] |
| Difficulty multiplier | Easy ×0.8, Medium ×1.0, Hard ×1.5, All/Auto ×1.0 |
| Close resolved | Full (multiplied) value |
| Close unresolved | Half the ticket value, rounded **up**, minimum 5 points |
| Reset password/MFA before identity verification | −10 points |
| Hints | No penalty |
| Escalating a routine ticket | Loses points; amount not published |
| Escalation | Points settled at escalation, not at close |

Accuracy, streaks, badges and certificates are separate from the points economy
(certificates count lifetime tickets resolved, not points).

---

## 4. Queue composition

- Default difficulty is **Auto**, keyed to lifetime tickets resolved [D]:

  | Resolved | Pool |
  | --- | --- |
  | 0–9 | Easy only |
  | 10–24 | Easy + Medium |
  | 25–49 | Medium + Hard |
  | 50+ | All |

- Choosing a fixed difficulty disables the ramp; Auto restores it.
- **Training Focus** (paid tiers) includes/excludes six categories and also
  filters AI calls, not just the queue [D].
- Free plan: 5 completions/day and 1 outbound call/day; incoming calls and
  voicemail are unavailable [D].
- Missing/declined calls become voicemail on paid tiers; self-started calls never
  do [D].

---

## 5. Tool workflows

Each tool is a console over shared world state: an action mutates the world, the
world change can satisfy a ticket's completion condition, and the ticket layer
observes that. The UI surfaces confirmation in place (toast or inline text)
rather than a global notification.

### 5.1 Directory

**Purpose:** account administration. Entry: Tools → Infrastructure → Directory.

1. Search users, select a person. Record opens on Profile with tabs:
   Profile, Groups, Licenses, Devices, Authentication. [D]
2. Read identity fields (username, display name, email, department, title,
   phone, manager). `Devices` exposes computer name and recovery key; the
   hostname is the input to Remote Desktop. [D]
3. **Verify identity first** for password/MFA work: send a code to the phone on
   the account, ask the caller to read it back. Only the latest code is valid;
   a resend invalidates the previous one. Skipping costs 10 points; ringing back
   instead, while a code could have reached the caller, costs 5. [D]
4. Perform the action: Reset Password (generates a temporary password), Unlock
   / Lock Account, Enable / Disable Account, Reset MFA, Delete User (only for
   accounts the player created). [D/O]
5. Confirm: inline "Account unlocked."; password dialog shows the temporary
   password, warns when the account is still locked, and offers to send it via
   chat. [O]
6. Groups and licences are separate tabs with add/remove and confirmations. New
   User creates an account from the main list. [D]

**Failure modes:** reset before verification (−10); MFA reset on an unenrolled
user returns an informational message; a caller who cannot read back a code that
went to the account holder has not been identified, however well they know the
account, so the desk refuses and reports instead of resetting; another
technician's delegated account cannot join a machine. [D]

### 5.2 Remote Desktop

**Purpose:** work on a user's machine. Entry: Tools → Infrastructure.

1. Pick machine by hostname (from Directory if unknown). Unreachable hosts are
   reported and are usually the ticket, not a retry case. [D] More than one
   session may be open at once: connecting to an open machine brings it to the
   front, the session bar lists every open desktop, and switching is recorded as
   `use-remote-session` so the next command acts on the machine in view. Ending
   the desktop in view returns to another open session, or to the list. [D]
2. Sign in with the technician's domain account. [D]
3. Wait for the session; a connecting screen holds until ready. [D]
4. Use the desktop (settings, drivers, terminal, event log, task manager).
   Icons observed: File Explorer, VPN Client, System Update, Settings, Web
   Browser, Mail, Chat, Trash. [O]
5. Disconnect from inside the session; the app hides the Dashboard back control
   while connected to force that habit. [D]

**State:** session presence; closing a split pane does not end the session. [D]

### 5.3 Server Room

**Purpose:** distinguish upstream outage from local equipment fault, then act.
Entry: Tools → Infrastructure. Tabs: Overview, Topology, Devices, Servers. [D/O]

1. Read Overview tiles: ISP, network load, device counts, server health. [O]
2. Run `check isp status`. Outcomes: [D]
   - ISP down → publish an announcement with the ETA in the company group chat;
     no device to reboot.
   - ISP up, local fault → reboot/power the affected device.
   - ISP up, intermittent blip → confirm recovery with affected users in chat;
     nothing to reboot (deliberate trap).
   - No outage → badge "No current outages".
3. Devices table: device, IP, location, uptime, status, action. Actions adapt:
   power on for offline, reboot/shut down otherwise; device unavailable while
   rebooting; ISP row has no action menu. [D]
4. Servers table: server, role, location, CPU, memory, status, action. Roles
   include Domain Controller, File Server, Mail Server, Print Server. [D]

**Observed:** rebooting a `ERROR` AP → `ONLINE`, node count rose, ticket
resolved, +25 points. [O]

### 5.4 Documentation (in-world knowledge base)

**Purpose:** policies, procedures, credentials. Entry: Tools → Knowledge.

- Ten categories: Environment Overview; Email & Mail Server; Password &
  Security; Network & Connectivity; Server Documentation; Standard Procedures
  (SOPs); Software & Licensing; Hardware & Assets; Contacts & Escalation;
  Credentials & Access. [D]
- Search or browse; open article in a pane.
- Unlike other tools, it **preserves** the open article and search between
  visits. [D]
- Holds deployment SOPs and the credentials needed mid-build, plus the
  role-to-device-profile reference used by deployment and asset checkout. [D]

### 5.5 Asset Management

**Purpose:** hardware register. Entry: Tools → Management.

- Views: By users, By assets, Site; global search on asset/tag/serial. [D]
- Assign flows: `Check out kit` (new hire bundle: laptop, monitor, keyboard,
  mouse, headset), `Check out replacement`, or `Assign Computer`. [D]
- A kit requires a built laptop; otherwise it points to Computer Deployment. [D]
- `Return device` requires a return label; `Check in` returns an asset to stock.
  [D]
- Register a finished build: choose the pending build, set device type and
  status, `Register asset`; the name comes from the build. [D]

### 5.6 Computer Deployment

**Purpose:** build a machine. Entry: Tools → Infrastructure.

- Three methods, two playable: Server Imaging (PXE + task sequence) and Manual
  Domain Enrollment; Cloud Provisioning is visibly locked and its tickets are
  withheld. [D]
- A Hints toggle precedes the build; the recommended path is hints off plus the
  SOP. Each method offers a downloadable SOP PDF (for example SOP-OSD-014,
  SOP-MDJ-021). [D]
- Build steps are numbered in SOP section 6; first-time setup differs from a
  home install. [D]
- Two distinct credentials: the technician's domain account (join rights are
  delegated per technician) and a separate deployment account. [D]
- Completion puts the unit on the **PC Shelf**; the build can be paused and
  resumed (landing-page claim). [D]

### 5.7 PC Shelf

Staging area, not an action surface: lists finished builds ready to ship, with a
count link to Ship Manager. Empty state points back to Computer Deployment. [D]

### 5.8 Ship Manager

**Purpose:** send hardware. Entry: Tools → Management.

Inputs: recipient name, street, city, state, postal code; equipment; shipping
speed; optional return label. [D]

- Equipment options: HDMI, DisplayPort and USB-C cables, laptop charger, desktop
  power cable, computer, monitor. On onboarding tickets the list collapses to a
  single "Full onboarding kit". [D]
- Shipping a computer requires selecting a shelf unit; without one the panel
  links to Computer Deployment. [D]
- Speeds: Standard 5–7 days, Express 2 days, Priority same day, Rush Priority
  instant; speed is cosmetic and defaults to instant. [D]
- Return label is required when the old item must come back. [D]

### 5.9 Mail Admin

Entry: Tools → Email. Tabs: Message Trace, Mailbox Admin, Inbox Rules. [D]

- **Trace**: mailbox, optional sender, window (24 h / 48 h / 7 days) → rows with
  date (UTC), sender, recipient, subject, status. Status distinguishes not sent,
  delivered elsewhere, rejected, filtered. [D]
- **Mailbox Admin**: capacity status (for example over quota), mailbox enabled
  flag, archive state, retention. Quota → enable archive, and advise emptying
  Deleted Items/Junk for immediate relief; disabled mailbox → enable mailbox. [D]
- **Inbox Rules**: condition + action (move / forward), enable/disable per rule. [D]

### 5.10 Mail Security

Entry: Tools → Email. Pick mailbox → Review. [D]

- Quarantine list: release a held message (with Undo).
- Blocked senders: remove a sender/domain (with Undo).
- Judgement rule: releasing real phishing is worse than a delay; suspected
  attacks become security tickets. [D]

### 5.11 Company Chat

- Panel sections: Pinned, Recent, Contacts, plus a company directory; search;
  quick replies. [D]
- Company-wide group chat exists and is the channel for outage announcements;
  some outage tickets only resolve after an announcement with an ETA. [D]
- Per-conversation actions: pin/unpin, delete, delete all (confirmed); start
  voice/video call (not counted against the daily call allowance). [D]
- Locked-out users cannot reply; alternatives are calling them or sending the
  temporary password to their manager. [D]

### 5.12 Voice calls, voicemail

- Call: live AI-played employee, speak or type; free tier 1/day; incoming calls
  only on paid tiers and suppressed by background tab, idle, or interview. [D]
- Some callers attempt social engineering; identity verification is the correct
  response. [D]
- Missed/declined incoming calls become voicemail (paid tiers). Voicemail shows
  caller, department, extension, arrival, duration, new badge; actions are
  `Create Ticket` or archive. No call-back button. [D]

### 5.13 Mock interview

- Three interviewer personas with different styles/levels; device check with
  optional mic/camera; speak or type; transcript; mute, captions, skip, leave.
- Report: overall score + communication, technical, process, rapport; manager
  note; what worked / what to improve.
- Too little input is not scored, and says so. [D]

---

## 6. Progress, certificates, analytics

- **Points → 11 tiers** (Rookie at 0 up to Eternal at 50,000). Tier shown under
  the username. [D]
- **Badges**: 17 one-off milestones across resolved count, calls, streaks,
  points, speed (<60 s) and accuracy (≥90% over ≥20 tickets). [D]
- **Streak**: consecutive active days; shown from day two; badges are kept after
  a break. [D]
- **Analytics**: score, accuracy, tickets resolved, call volume, tier progress,
  category breakdown, priority distribution, call activity. Empty state until
  tickets are closed. [D]
- **Certificates**: nine levels earned on lifetime tickets resolved (20 → 5,000),
  each with a shareable/verifiable link; free to earn. [D]

---

## 7. Invariants worth preserving in our implementation

1. A ticket cannot be resolved before it is assigned.
2. A player can hold only their own queue; unassigning returns the ticket.
3. Closing is terminal and irreversible.
4. Points are awarded once per ticket and cannot be re-earned.
5. Escalation is terminal and settles points immediately.
6. Identity verification precedes credential changes, and violations are
   penalised, not blocked.
7. Hints never reduce points; they may reduce a separate accuracy metric (not
   confirmed).
8. Daily limits are checked at assignment, not at close.
9. Tool state and ticket state are separate stores; a tool action can satisfy a
   ticket condition without the tool knowing about tickets.
10. Resolution notes are optional and capped.

## 8. Questions for the vendor-facing manual pass

See [website-audit.md §10](website-audit.md#10-unresolved-questions-for-manual-investigation).
The highest-value unknowns for our design are: how resolution conditions are
represented, whether penalties are additive, and how a "fix" is confirmed for
tickets that end in chat.
