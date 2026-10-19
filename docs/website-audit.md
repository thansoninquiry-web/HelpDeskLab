# ServiceDesk Simulator — public website audit

Status: investigation only. No implementation has started.
Date: 2026-10-17
Target: `https://servicedesk-simulator.com/` (site footer reports v2.7, © 2026)
Reference tool: `https://github.com/morluto/rea`

This document records only what is publicly observable without an account. It is
written to separate three things: what was **seen**, what the site **documents
about itself**, and what remains **unknown**. Nothing below should be read as an
implementation claim about the product.

---

## 1. Tooling readiness (checked first)

| Prerequisite | State |
| --- | --- |
| REA MCP tools exposed to this agent | **Not available.** No REA tool namespace exists in this session. |
| `rea` CLI on `PATH` | **Not installed** (`rea: command not found`). |
| `rea-agents` globally installed | **No.** `npm ls -g --depth=0` is empty. |
| Node.js | v24.22.0 — satisfies REA's stated requirement (24.x ≥ 24.11). |
| npm | 11.19.1 — present. |
| Chrome-family browser | Google Chrome and Microsoft Edge are both installed. |
| `agent-browser` CLI (synced account skill) | **Not installed**, although its `SKILL.md` is present. |

Because REA is not registered, no REA evidence snapshots (structural analysis,
network observations, requested screenshots) could be produced. The site was
inspected with the **built-in Chromium browser** through its CDP-backed
navigation, accessibility snapshot and read-only DOM/text probes. That browser
is configured and working; the missing piece is REA itself, not a browser.

To reproduce this audit with REA instead, the exact prerequisite is:

1. `npx rea-agents setup` (or manual MCP registration) for this client.
2. Restart the agent so the REA MCP server is loaded.
3. Re-run the same public URLs; REA's website analysis adds page structure,
   script inventory and network observations on top of what is recorded here.

That setup was **not performed**: it changes agent configuration and was not
authorized. Account-scoped skills also document `agent-browser` as available,
but the CLI is absent, so it was not used.

Constraints observed throughout: no login, no account creation, no attempt to
reach `/admin` (disallowed by `robots.txt`), no authentication or anti-bot
bypass, no cookies/tokens captured, no personal data recorded. The public demo
uses fictional staff names; those are referenced only where they identify a
demo fixture, never as people.

---

## 2. What the site is

A commercial browser-based training simulator for first-line IT support. The
marketing claim is "the flight simulator for helpdesk" and the proposition is
practising a ticket queue, calls, and the consoles of a small Windows/Microsoft
365 estate before working a real desk.

Publicly visible product claims (marketing copy, not independently verified):

- "Trusted by 61,000+ players", players in 60 countries.
- Used in classrooms and businesses; teacher plan with class dashboard.
- Nine certificates earned by lifetime resolved-ticket counts.
- Sixteen free written course modules; 59 help-centre articles.
- Free tier plus Pro at $20/month, and a teacher/business plan.

The product itself is an authenticated single-page application. The public site
is a marketing shell plus one genuinely interactive demo, a static course, a
blog and a help centre.

---

## 3. Page inventory

Routes were collected from the rendered navigation, `sitemap.xml`,
`course/sitemap-0.xml` and `robots.txt`, then opened individually. Rendering
mode is noted because it affects what can be audited statically.

| Route | Rendering | Public content | Access |
| --- | --- | --- | --- |
| `/` | SPA | Hero, embedded "try it yourself" demo, feature grid, course teaser, certificate ladder, pricing teaser, footer | Open |
| `/pricing` | SPA | Free/Pro/Teacher comparison matrix | Open |
| `/teachers` | SPA | Classroom/business pitch, how it works, quote request, `#business` section | Open |
| `/mission` | SPA | Founder story and product rationale | Open |
| `/testimonials` | SPA | Embedded review wall; body text is mostly a container | Open |
| `/security` | SPA | Hosting, storage, auth and data-handling statement | Open |
| `/login`, `/login?student` | SPA | Email/password form, "Remember me", Google sign-in, sign-up link | Open (no credentials used) |
| `/course` | Static (Astro) | Course index, 16 modules | Open |
| `/course/<slug>` | Static | 16 module pages, paginated lesson content | Open |
| `/blog` | Static (Astro) | Guide index with categories and read times | Open |
| `/blog/*` | Static | Individual guides | Open (index only sampled) |
| `/help` | SPA | Help centre index: 11 sections, 59 articles | Open |
| `/help/articles/<slug>` | Prerendered | Individual how-to articles | Open |
| `/dashboard` | SPA | **Not public**: anonymous request renders the marketing landing page | Gated |
| `/admin` | — | Disallowed in `robots.txt`; not requested | Restricted |

`robots.txt` allows general crawlers and AI assistants, disallows only `/admin`,
and points at three sitemaps. `sitemap.xml` lists the seven marketing routes;
course and blog publish their own sitemap indexes.

External destinations linked from the site: Trustpilot reviews, LinkedIn,
Discord, Instagram, TikTok, X. These were not audited.

### Navigation structure

- **Site header**: wordmark, language selector (`ENGLISH`), theme toggle
  (`Dark`), `Log In`.
- **Landing hero**: `Get started`, `Sign up with Google`, `Watch the product
  demo`.
- **Footer columns**: Product (Pricing, Testimonials, Blog); For teams &
  classrooms (Overview, Request an official quote, For business); Resources
  (Course, Help Center, Mission, Contact us, Leave a review); Legal (Security,
  Privacy Policy, Terms of Service, Disclaimer, Refund Policy); social links.
- **Course sub-site header**: `Modules`, `Blog`, `Open the app →`.
- **Help centre header**: `All articles`, `Course`, `Guides`, `Open the app →`.
- The authenticated app uses a **top bar only** (no sidebar): Tools menu,
  Voice Call, Voicemails, Mock Interview on the left; Company Chat, Assignments,
  Leaderboard, stats, avatar on the right. This is documented in the help
  centre, not directly observed.

---

## 4. The public interactive demo

This is the only part of the product that can be operated without an account.
It is embedded on the landing page under "TRY IT YOURSELF — 3 real tickets.
Solve them using the tools below." It is a reduced simulator, not the full app.

### 4.1 Shell

- Four tool tabs: `TICKET QUEUE`, `DIRECTORY`, `REMOTE DESKTOP`, `SERVER ROOM`.
- A point counter appears once a ticket is completed (observed `25 pts`).
- Ticket list header: `INCIDENTS`, with an open count (started at `3 OPEN`).
- A close control on the ticket preview panel.

### 4.2 Ticket detail (observed)

Opened `INC-7201 "WiFi down - Cafeteria"`:

| Element | Observed value |
| --- | --- |
| Identifier | `INC-7201` |
| Priority badge | `HIGH` |
| Status | `Open` → `In Progress` after assignment |
| Title | `WIFI DOWN - CAFETERIA` |
| Assignee row | `Unassigned` + `ASSIGN TO ME` → `You` + `UNASSIGN` |
| Description | Several users in the cafeteria have no wireless; lobby WiFi still works |
| Requester | Name + department |
| Hint control | `I DON'T KNOW` opens a numbered "Hint How To Resolve" panel |
| Hint content | Three steps naming the exact tool, tab, device and action |

The second ticket (`INC-7202 "Password reset - Emily Chen"`) showed the same
layout with a different hint chain: Directory → Authentication → unlock and
reset. The third ticket ("Wrong time zone on workstation") was listed but not
opened in detail.

### 4.3 State transitions observed in the demo

1. **Assign** — `Open` becomes `In Progress`, assignee becomes `You`, the
   control becomes `UNASSIGN`.
2. **Fix in a tool** — rebooting the cafeteria access point in Server Room
   changed the device from `ERROR` to `ONLINE`, raised the node count from
   `10/12` to `11/12`, awarded `25 pts`, and moved the ticket to `Resolved`
   automatically with a "Solution Complete — Review the solution, then close the
   ticket." banner.
3. **Close** — `CLOSE TICKET` removed `INC-7201` from the incident list
   (`3 OPEN` → `2 OPEN`) and kept the points.

The demo therefore demonstrates a four-state ticket model: unassigned → assigned
→ resolved → closed. Whether the full product always detects "resolved"
automatically or also relies on explicit completion steps is **not** established
here; the help centre describes a "Solution complete" banner appearing when the
work is done, and a close dialog with different button labels for resolved,
not-yet-settled and unresolved tickets.

### 4.4 Directory demo

- List headed `ALL USERS (6)` with display name and username.
- Selecting a user opens a record with a left rail:
  `PROFILE`, `GROUPS`, `LICENSES`, `DEVICES`, `AUTHENTICATION`, `MAILBOX`.
- **Profile** showed display name, username, title, employee ID, email, phone,
  department, manager, last login, account expiry, and a `CHANGE NAME & EMAIL`
  action.
- **Authentication** showed actions `RESET PASSWORD`, `UNLOCK ACCOUNT` (flips to
  `LOCK ACCOUNT` after use), `RESET MFA`, `DISABLE ACCOUNT`; MFA status;
  password-expired flag; and an `Identity Verification` block with
  `SEND VERIFICATION CODE`.
- `UNLOCK ACCOUNT` produced an in-place confirmation: `Account unlocked.`
- `RESET PASSWORD` opened a modal with a generated temporary password, an
  explicit note that the account is still locked so the password will not work
  until unlocked, advice to share it securely, and a
  `Send to Emily Chen via chat` action.

The demo deliberately contains the identity-verification affordance but does not
appear to enforce it; the help centre says the full product penalises resets
performed before verification.

### 4.5 Remote Desktop demo

- Launcher lists hostnames with the assigned user and a `CONNECT` button
  (for example `SD1066 · Emily Chen`).
- Connecting shows a simulated desktop with a session header
  (`hostname · user`, `DISCONNECT`), a taskbar clock tied to the real date, and
  desktop icons: File Explorer, VPN Client, System Update, Settings, Web
  Browser, Mail, Chat, Trash.
- `SETTINGS` opens an in-desktop Settings app with sections `SYSTEM`,
  `DISPLAY`, `NETWORK`, `DEVICES`, `SECURITY`, `TIME & LANGUAGE`, `LANGUAGE`,
  `APPS`, `STORAGE`, and an `About` page listing device name, a fictional CPU
  string, RAM and 64-bit OS.
- The help centre documents a three-stage connect (pick machine, domain sign-in,
  wait) and insists on disconnecting from inside the session. The demo exposed
  the desktop quickly; the intermediate sign-in screen was not captured.

### 4.6 Server Room demo

- Header: `10/12 nodes up`.
- Tabs: `OVERVIEW`, `TOPOLOGY`, `DEVICES`, `SERVERS`; an `ISP` tile.
- Overview tiles: ISP (Metro, `online`, 11 ms latency), network load `45%` with
  an `All clear` state, devices (`7`, `6 ONLINE / 1 DOWN`), servers (`5`,
  `4 HEALTHY`).
- Device table columns: `DEVICE`, `IP ADDRESS`, `LOCATION`, `UPTIME`,
  `STATUS`, `ACTION`. Rows included core router, three floor switches, main
  firewall, lobby AP and cafeteria AP, each with location and status.
- The faulty cafeteria AP showed `ERROR`, `0 days` uptime, and an inline
  `REBOOT` action. The ISP row is documentation-only in the full product (no
  action menu; a `check isp status` command instead).
- Server cards listed domain controllers, file server, mail server and print
  server with CPU and memory percentages.

---

## 5. Course ("The Support Toolkit")

- 16 modules, all free to read, no account required.
- Each module page has a short framing, then **Part One** about the real-world
  product the console imitates (in the sampled Directory module: eight
  sub-sections with a 12-page pager), then a **Part Two** describing the
  simulator's own panel, then a **Practice** section.
- Module durations range from 20 to 45 minutes.
- Module slugs map almost one-to-one onto the tools: ticket queue, knowledge
  base, team chat, voicemails, phone, directory, remote desktop, server room,
  mail admin, mail security, assets, deployment, PC shelf, ship manager,
  interview, plus an orientation module.
- Content is original educational prose about Active Directory, imaging,
  message trace, etc. It is copyrighted; only its structure was recorded here.

## 6. Help centre

- 59 articles in 11 sections: Getting started; Working tickets; The tools;
  Calls, voicemail and chat; Progress and certificates; Plans, limits and
  billing; Your account; Classrooms; For teachers; Troubleshooting; Getting help.
- Articles are short, task-shaped, and unusually explicit about state and
  failure modes (exact banners, penalty values, empty states, gating rules).
- They are the best public source for the product's state machine and are the
  backbone of [workflow-spec.md](workflow-spec.md).

## 7. Plans and limits (published)

| | Free | Pro | Teacher module |
| --- | --- | --- | --- |
| Price | $0 forever | $20/month | Quote-based |
| Ticket completions | 5/day | Unlimited | Unlimited |
| Voice calls | 1/day | Unlimited | Unlimited |
| AI mock interviews | — | Included | Included |
| Voicemails / team chat calls | — | Included | Included |
| Past tickets, analytics, leaderboard, desktop tools | Included | Included | Included |
| Classroom features (roster, assignments, grading, CSV export, dashboard) | — | — | Included |

The help centre adds that the free daily completion limit is enforced at the
moment a ticket is assigned, and that free accounts receive no incoming calls
and no voicemail.

## 8. Published technical facts (from `/security`)

These are the vendor's own statements, not independent verification:

- Google Cloud via Firebase: Firestore for accounts, classrooms, tickets and
  progress; Cloud Storage for uploads; Firebase Hosting for the site; server
  functions in `us-central1`.
- Firebase Authentication handles credentials; the vendor states it never sees
  passwords. Google sign-in supported.
- TLS in transit; Google-managed keys at rest.
- Teacher visibility is limited to their own class; teachers cannot sign in as
  students or read chat conversations; students cannot see each other's email.
- Email verification is enforced server-side before joining a class.

No public API, SDK, plugin surface or export format is documented.

## 9. What is *not* observable without an account

- The real ticket generator: corpus size, variant structure, difficulty
  assignment, duplicate avoidance, category mix.
- The scoring engine: rubric items, weights, partial credit, how "resolved" is
  detected per ticket type.
- Hint economy beyond "hints are free": whether hints affect accuracy metrics.
- The AI voice-call and interview behaviour, latency, and evaluation quality.
- Classroom dashboard, assignments, roster import, CSV export.
- Certificate verification pages and their public URLs.
- Analytics calculations and leaderboard scope (global/class/friends).
- Admin surface (explicitly off-limits).
- Mobile layouts, keyboard navigation, screen-reader support, offline behaviour.
- Performance characteristics and data volumes.

## 10. Unresolved questions for manual investigation

1. Does a ticket ever reach "resolved" without the user closing it, and which
   ticket types require a confirmation step (chat) before that happens?
2. What are the base point values per priority/category, and are penalties ever
   applied more than once to the same ticket?
3. How does the full app present a wrong action — blocking, warning, or silent
   state change plus penalty?
4. How are hints revealed: one step per click, with a "next hint" control, or
   all at once? The demo showed the full chain immediately.
5. How does Training Focus interact with the Auto difficulty ramp and with
   incoming calls?
6. What exactly does the "Report a broken ticket" flow capture and change?
7. What do certificate verification links expose publicly, and can they be
   revoked?
8. Are resolution notes moderated or shareable, and are they included in any
   export?
9. Does the classroom dashboard see per-ticket actions or only aggregates?
10. Which parts of the console are shared components (same table/dialog
    patterns) versus bespoke screens?

## 11. Evidence index

| # | Observation | Source |
| --- | --- | --- |
| E1 | Marketing routes, footer, demo tabs and 3 tickets | `/` rendered in Chromium |
| E2 | Ticket INC-7201 fields, assign, hint chain | `/` demo, ticket preview |
| E3 | Cafeteria AP reboot → ONLINE, 25 pts, ticket Resolved → Closed | `/` demo, Server Room + Ticket Queue |
| E4 | Directory 6 users, 6 tabs, profile fields, auth actions, unlock toast | `/` demo, Directory |
| E5 | Password-reset modal and "send via chat" | `/` demo, Directory → Authentication |
| E6 | Remote desktop icons and Settings/About window | `/` demo, Remote Desktop |
| E7 | Server Room tabs, tiles, device and server tables | `/` demo, Server Room |
| E8 | Course index, 16 slugs, module structure and pager | `/course`, `/course/the-directory-console` |
| E9 | 59 help articles and 11 sections | `/help` DOM link inventory |
| E10 | Ticket lifecycle, penalties, hints, escalation, queue ramp | Help articles (see workflow spec citations) |
| E11 | Plan matrix and limits | `/pricing` |
| E12 | Hosting/auth/storage statements | `/security` |
| E13 | `/dashboard` is not public | Direct request rendered landing page |
| E14 | Crawl rules and sitemaps | `/robots.txt`, `/sitemap.xml`, `/course/sitemap-0.xml` |

## 12. Originality guardrails for our build

- Do not reuse the name, wordmark, visual identity, illustrations, screenshots,
  course prose, help articles, ticket text, interviewer personas, certificate
  names or tier names.
- Do not mirror the console layouts pixel-for-pixel. Reimplement the *workflow*
  (claim → diagnose → act → confirm → close) with our own information
  architecture and copy.
- The workflows themselves (password reset, message trace, PXE imaging) are
  industry-standard IT procedures and are not proprietary; the expression,
  content and presentation are.
- No scraped content, no copied assets, no attempt to obtain the app bundle or
  bypass auth.
