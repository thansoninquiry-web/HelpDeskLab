# The Azure console

A practice subscription at `/azure`. It is a self-contained simulator inside the
lab, on the same terms as the Intune console: its own model, its own seeded
estate, its own `azure_*` tables, its own routes, and two functions as the only
seam into the rest of the app. All data is fictional and local; nothing leaves
the browser.

It exists because service-desk practice covers the machine and the mailbox but
not the subscription those machines live in. A learner who can fix a laptop still
has to know why a machine bills all weekend, why HTTPS stopped after a security
group was tidied, and why a contractor with Owner is a finding rather than a
convenience.

## Routes

| Route | Page |
|-------|------|
| `/azure` | Inventory: every resource, its state, its exposure and its monthly cost |
| `/azure/resources/:resourceId` | One record: settings, findings, action bar and activity log |
| `/azure/network` | Network security groups and their rules |
| `/azure/access` | Role assignments and what each role can do |
| `/azure/course` | The three Azure lessons, with progress and a link into each |
| `/azure/tickets` | The nine practice tickets |
| `/azure/terminal` | The subscription as an `az` command line |

The course tab exists so the lessons are reachable from the console without
opening a ticket first; it is the reverse of the lesson link each ticket carries.
It keeps nothing of its own — the list is `loadCurriculum()` filtered on
`practice === 'azure'`, the same field the dashboard uses — so a fourth Azure
module appears here without this page changing.

## Data model

Six tables, created by migration 15 and prefixed `azure_` so a schema dump names
their owner.

| Table | Holds |
|-------|-------|
| `azure_resource_groups` | Four groups: name, region, owning team |
| `azure_resources` | Thirteen resources: name, group, region, kind, settings JSON, `deleted` |
| `azure_nsg_rules` | Inbound and outbound rules: priority, direction, access, protocol, port, source |
| `azure_role_assignments` | Principal, role (`Reader` / `Contributor` / `Owner`) and scope (a group id or `subscription`) |
| `azure_events` | The activity log: resource, action (including `review`), time, outcome, summary, notes |
| `azure_attempts` | One row per scored attempt: template, resource, start, finish, total, score JSON |

Resources are one shape with a discriminated `properties` object, so the store
needs one reader and the UI one switch:

| Kind | Settings |
|------|----------|
| `vm` | Size, power (`running` / `deallocated`), image, schedule tag |
| `storage` | Public blob access, soft-delete days, minimum TLS, replication |
| `nsg` | The resource it is attached to (rules live in their own table) |
| `webapp` | Plan SKU, runtime, HTTPS-only |

A deleted resource stays in the estate as a **tombstone** (`deleted = 1`): the
audit trail is the point, an attempt has to be scoreable after the resource it
acted on is gone, and no ticket can be resolved by deleting the thing the ticket
is about. The inventory, network and access pages hide tombstones; the store and
the scorer keep them.

Monthly cost is **derived**, not stored: a deallocated machine costs its disks
(£8), a running one costs its size, storage costs by replication, App Service by
plan. The inventory column, the ticket panel and the score's explanation all read
the same function, so they cannot drift.

## Findings and exposure

A portal row saying "exposed" is a prompt, not an answer. `findingsFor()` reads the
record and returns the reasons, worst first:

- **Virtual machine:** running while tagged `business-hours` (billed around the
  clock); deallocated (nothing serving).
- **Storage:** public blob access (high), soft delete off (medium), TLS 1.0 still
  accepted (medium).
- **Network group:** RDP or SSH allowed inbound from the internet (high); no rule
  allowing 443 at all, so the implicit deny drops HTTPS (medium).
- **App Service:** free plan (daily CPU quota), HTTPS-only off (high).
- **Any resource:** an `Owner` assignment over its resource group (high).

The worst finding sets the badge: high, medium or low. The read step
(`service.review`) writes an event with the same sentence the page shows, and
that read is what the diagnosis category is scored from.

## Actions

Actions are offered per kind by `ACTIONS_BY_KIND`; every one confirms first, and
the confirmation says what will happen to *this* record. Refusals are recorded
too, because a console that silently does nothing teaches nothing.

| Action | Effect | Notable refusal |
|--------|--------|-----------------|
| `start` | VM running, billing resumes | already running |
| `deallocate` | Compute released, disks kept | already deallocated |
| `restart` | Guest reboot, stays allocated | deallocated: start it first |
| `open-port` | Adds an inbound TCP allow rule from the internet | that port is already allowed |
| `close-port` | Removes the inbound allow rule covering the port | nothing allows that port |
| `restrict-public-access` | Anonymous blob reads off | already off |
| `enable-soft-delete` | 30-day retention | already on |
| `require-tls` | Minimum TLS 1.2 | already 1.2 |
| `scale-up` | Free plan to Standard | already paid |
| `assign-role` | Replaces a principal's role on the resource's group | role unchanged |
| `delete-vm` | Marks the machine and its disks deleted | not a VM |
| `delete-resource-group` | Deletes every resource in the group, its rules and its assignments | — |

`delete-vm` and `delete-resource-group` are the destructive pair: the UI marks
them, and the scorer charges 40 and 50 points respectively when a ticket did not
ask for them.

## Practice tickets

Nine templates, each naming one seeded resource and a state check. Any path that
reaches the state closes the ticket; the expected actions are the reference path,
not a key sequence.

| Ticket | Category | Reference action | Resolved when |
|--------|----------|------------------|---------------|
| Finance box is down after the weekend | compute | `start` | `vm-fin-01` is running |
| Development machine has been running since Friday | cost | `deallocate` | `vm-dev-04` is deallocated |
| Portal times out every lunchtime | compute | `scale-up` | `app-portal` is off the Free plan |
| Blob links work without signing in | security | `restrict-public-access` | anonymous reads are off |
| Backup was overwritten and cannot be restored | security | `enable-soft-delete` | retention is above zero |
| Security scan flags TLS 1.0 | security | `require-tls` | the account requires 1.2 |
| Contractor holds Owner on the production group | security | `assign-role` | the contractor holds Contributor |
| Portal is unreachable over HTTPS | network | `open-port` (443) | 443 is allowed from the internet |
| RDP is open to the internet | network | `close-port` (3389) | 3389 is not reachable from the internet |

Scoring uses the app's rubric split, out of 100: **10** for reading the record
before the first change, **55** for the expected actions in order (half credit out
of order), **20** for the state check passing, and **15** for not destroying a
resource the ticket did not ask for. The four categories are the app's own —
diagnosis, resolution, safety, and documentation, which carries no points because
the console records no notes — so an Azure attempt appears in weak topics, the
category breakdown, XP, rank, streaks and scenario stats beside ticket and Intune
attempts, tagged `azure` on Progress.

## Coursework

Three modules continue the numbered course after the Intune console. Each is
judged from the attempts' stored score JSON, not from opening the console.

| # | Module | Exit criteria |
|---|--------|---------------|
| 20 | *Azure: Compute and Cost* | Read a record before changing it · bring a deallocated machine up · deallocate an idle one · get a throttled site off the free quota · save money without deleting anything |
| 21 | *Azure: Network Exposure* | Restore HTTPS the group is dropping · close a management port open to the internet · pass both networking tickets |
| 22 | *Azure: Storage and Access* | Close anonymous blob reads · turn on retention · require TLS 1.2 · shrink an over-broad role · finish three different exposure decisions |

The capstone counts **distinct security templates** passed, not attempts: four
exposure tickets teach the decisions, and three of them is the module. A lesson's
*Practice this module* links to `/azure/tickets?template=…`, and the queue opens
with that ticket selected and a fresh attempt.

## Adding a ticket template

1. Seed the resource in `src/modules/azure/data/seed.ts` (and, if it needs new
   settings, extend the matching `properties` shape in `types.ts`).
2. Add an object to `AZURE_TICKET_TEMPLATES` in
   `src/modules/azure/tickets/templates.ts`: id, title, difficulty, category,
   resource id, subject, body, `expectedActions`, `verify(resource, state)`,
   resolution, explanation and three hints. `verify` reads the estate, never a
   flag the learner set.
3. If the ticket is the evidence behind a module requirement, add its id to
   `AZURE_TEMPLATE` in `src/domain/curriculum/evidence.ts`, map it onto a
   measure in `src/domain/curriculum/modules.ts`, and name it in the module's
   `azureTemplates` so its attempts earn XP.
4. Add the ticket to `tests/modules/azure/azure.test.ts` if the end state is not
   already covered by the per-template reference-path test, then run
   `npm run typecheck`, `npm run lint` and `npm test`.

## Extracting it

The module imports the app only for the scoring thresholds and types; the app
reaches it through `src/app/azureService.ts` (storage) and
`src/app/azureProgress.ts` (progress). Inside the folder, `tickets/registry.ts`
exports `registerAzureTicketTemplates`, `findAzureTemplate` and
`isAzureTicketComplete`, which is the whole ticket surface. Moving
`src/modules/azure/` and its migration out is a folder move plus those two app
files.

## Terminal

`/azure/terminal` drives the subscription the way the job does: `az` commands
over machines, storage, rules and access. A command prints, or it asks the page
to run one action through `AzureService.act` — the same call the resource page
makes — so the activity log and the ticket score cannot tell the two apart.

`az resource show` prints the record and its findings and records the read the
diagnosis category is scored from, exactly as the resource page's read button
does. Deleting a machine or a resource group is refused with a pointer to the
page that states what goes with it: the shell is not a quieter way to lose a
disk.

The resolver is `logic/commands.ts`. It parses flags in any order (`--name x` or
`--name=x`) and keeps the real CLI's spelling, so the commands are worth
learning rather than only worth clicking.
