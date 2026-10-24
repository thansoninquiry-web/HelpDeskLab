# Decision-Binding Audit

**Purpose:** one inventory of every decision the simulator writes down whose whole
point is to constrain what may happen next — a refusal, a stopped service, a
machine on hold, a session that is not open — with the mechanism that enforces it
and a verdict on whether that mechanism is the right one.

**Why it exists:** the recurring bug shape in this codebase is *one decision, two
implementations*. The spooler was checked on the remote clear and not on the local
one; a shelf state was described one way on the bay and another in the refusal
that quoted it. This document is the list a new rule is added to, and the place a
reviewer checks that a decision binds in every surface that can reach it.

**Kept honest:** `src/domain/environment/refusals.ts` holds the reasons a command
can refuse, and `tests/domain/environment/refusalInventory.test.ts` reads the
command layer to prove every hand-written refusal matches one of them and that
each one is a row in the table below. A decision-shaped check that appears only
inside a command fails the suite.

**Audited:** after `request-refused`, `spooler-stopped` and `stock-not-available`
were unified behind [src/domain/environment/policy.ts](../../src/domain/environment/policy.ts),
and after `no-live-session` moved off the remote helper onto the registry's
`needsRemoteSession` flag.

---

## 1. The three layers a constraint can live in

| Layer | What it is | Where | Example |
| --- | --- | --- | --- |
| **World policy** | Reads a record and stops a command, for every surface that can run it | `policy.ts`, asked once per command by the reducer | a refused request stops account work |
| **Command-local precondition** | A check that has to answer in the command's own order, or whose message needs the command's arguments | the command or a helper beside it | `book-shelf-machine` resolves its tag before it judges the machine |
| **Attempt layer** | A rule about the sitting, not about the simulated world | `src/app/*` | hints and rewind are withheld in an exam attempt |

A new rule belongs in layer 1 whenever it reads a record, stops a command, and
would be true from the terminal, from a console button, or from the Remote
Desktop. Layers 2 and 3 are where a rule goes when it genuinely cannot: each of
the entries below that sits outside layer 1 says why, and says what would have to
change for it to move.

---

## 2. Inventory

| # | Id | Decision | Written down as | What it stops | Enforced by | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `request-refused` | The desk refused the request | `world.refusal`, and `changesAccount: true` on 6 commands | every account-changing command, on every surface | reducer → `refusedRequest` | unified |
| 2 | `spooler-stopped` | The spooler is stopped | `device.spoolerStatus === 'stopped'`, `needsSpooler: true` on `get-printqueue`, `clear-printqueue`, `remote-clear-printqueue` | reading and clearing a queue on that machine | reducer → `stoppedSpooler`, target device from the registry's `targetDevice` | unified |
| 3 | `stock-not-available` | The machine is not issuable | `stock[].state` | the shelf handover **and** the imaging run | `stockPolicy(item, intent)`, called by `book-shelf-machine` and `start-deployment` | unified |
| 4 | `no-live-session` | No live support session | `world.remoteSessions[].state !== 'active'`, `needsRemoteSession: true` on the 9 desktop actions (`remote-check-updates` … `remote-restart-spooler`, `use-remote-session`) | every action that reaches into a desktop, on every surface | reducer → `unopenedSession`, target device from the registry's `targetDevice` | unified (§3.1) |
| 5 | `read-needs-no-session` | Reading a machine needs no session, and neither does a restart | — (the rule is the *absence* of a check) | nothing | `findDevice()` used directly by `get-sessions`, `get-remote-machine` and `reboot-remote`, and by `connect-remote` / `end-remote-session`, which are the session itself | deliberate (§3.7) |
| 6 | `caller-not-verified` | The caller was never verified | — | **nothing** for credential work | nothing | deliberate (§3.2) |
| 7 | `shipment-state` | Shipment state | `shipments[].state` | re-delivering, re-booking, dispatching out of order | per-command preconditions in `commands/shipping.ts` | local, one site each |
| 8 | `machine-on-a-truck` | The machine is on a truck | an outbound shipment naming the tag | booking it out from the shelf | local, after the stock read | local, order is the point (§3.3) |
| 9 | `requester-holds-a-machine` | The requester already holds a machine | `assets[]` holder | a second handover to the same account | local in `book-shelf-machine` | local |
| 10 | `mail-not-in-quarantine` | The message is not held in quarantine | `mail[].state` | `release-quarantine` on a message the filter kept, dropped or delivered | local in `commands/mail.ts` | local |
| 11 | `account-administration-mandate` | Account administration is not the desk's mandate | — (no record; a mandate, not world state) | `net user /add`, `net user /delete` | `directoryMandateDenial()` in `commands/workstation.ts` | one wording, module-local (§3.4) |
| 12 | `deployment-finished` | The imaging run is already finished or busy | `deployments[].state` | re-running it: answered as *nothing left to do*, not as a refusal | local in `start-deployment` | deliberate (§3.5) |
| 13 | `exam-sitting` | The attempt is an exam sitting | the attempt row | hints, reopen, rewind | `src/app/*` (`solveRewards`, `rewinds`, `rewriteAssessment`) | attempt layer (§3.6) |
| 14 | `caller-denied` | The caller was denied | the attempt row | nothing; the pressure engine goes quiet | `src/app/practiceService.ts` | attempt layer |
| 15 | `restart-without-session` | There was no support session, but the machine still needs a restart | `device.pendingReboot` | nothing — the reboot is allowed from the machine's entry | local in `reboot-remote`, matching the console action | deliberate (§3.7) |
| 16 | `remote-target-kind` | The desktop action's target is not a user machine in a session | `devices[].kind`, `devices[].assignedUserId`, the desk's own machine, `stock[].state` | a desktop action on a server, on the machine the console runs on, on a shelf machine, or a second session at the machine already in front | local in `commands/remote.ts`, once per entry point | local, needs the argument that named the machine (§3.8) |
| 17 | `account-disabled` | The account is disabled | `users[].state` | unlocking it, resetting its password, clearing its MFA | local in `commands/identity.ts` and `commands/m365.ts`, once per command | local, one site each (§3.8) |
| 18 | `link-or-adapter-state` | The adapter's link or addressing stops the command | `devices[].linkUp`, `devices[].ipMode` | reading a lease on a static adapter, renewing one on a dead link | local in `commands/network.ts` and `commands/remote.ts` | local (§3.8) |
| 19 | `dhcp-live-lease` | The DHCP lease is live | `dhcpScopes[].leases[].state` | clearing a lease that a working device is using | local in `commands/dhcp.ts` | local (§3.8) |
| 20 | `scope-exhausted` | The scope has no free address | `dhcpScopes[].leases` | `ipconfig /renew` on an exhausted scope | local in `commands/network.ts` | local (§3.8) |
| 21 | `default-printer-missing` | No default printer is set | `devices[].defaultPrinterId` | a queue command that names no printer | local in `commands/printer.ts` | local (§3.8) |

---

## 3. The entries that are deliberately not world rules

### 3.1 The remote session gate — a registry flag, like the spooler

The nine commands that reach into a desktop — the eight `remote-*` changes and
`use-remote-session` — carry `needsRemoteSession: true` and a `targetDevice` on
the registry. The reducer resolves the name once and hands the same device to
`unopenedSession()` and to the command, so the session the rule reads is the
session for the machine the command will change. One sentence covers the gate:
**what needs a desktop needs a session.**

It used to be `activeTarget()`, a helper each desktop action called. That gave one
rule with one wording for eight commands, but `use-remote-session` said the same
thing in its own words ("No remote session is open on …"), and the machine the
command then changed was resolved a second time. Both are gone: there is one
message, and one resolution.

The rule answers **before** the command's own argument checks, because that is
where a world rule sits — the spooler rule already did. A learner who types extra
words after a hostname therefore gets the session answer rather than the usage
line; it is listed in §5 as the order to revisit if it ever reads as wrong.

Two cases are deliberately left to the command, because the machine's own kind is
what the learner needs and neither is a session they were ever offered: a server is
answered "managed from the server room" by the command that resolved the name, and
the rule declines to speak. `connect-remote` stays outside the gate — it is how a
session is opened — and so does `reboot-remote` (§3.7).

### 3.2 Verification does not bind — on purpose

[workflow-spec.md §7](../workflow-spec.md) states the invariant: identity
verification precedes credential changes, and violations are **penalised, not
blocked**. A rule that refused a password reset until `verify-caller` had run
would contradict the scoring model, which is where the learner is taught. This
entry is in the inventory so that a later session does not "fix" it.

### 3.3 Order is the reason these stay local

`book-shelf-machine` answers in one order: no tag on the shelf → the machine's own
state → it is booked out on a shipment → the account already holds a machine. The
first two now come from `stockPolicy`; the last two read *other* records whose
message depends on the arguments, so they remain in the handler, after the policy
call, with a comment stating the order. A rule that needs the arguments is layer 2
by definition — the point is that it is still written once and tested.

### 3.4 A mandate, not world state

`net user /add` and `net user /delete` are refused because the simulation models
the service desk, not the identity administration team. It reads no record, so it
would be an empty rule in `policy.ts`; it is written once per module instead. If a
second module ever needs the same boundary, it moves to a shared `mandate.ts`.

### 3.5 Not a refusal: the finished deployment

Re-running a task sequence that has already completed is answered with the muted
line "nothing left to do", not an error. It is not a decision binding a later
action — it is a command with nothing to do — and a refusal would make a legitimate
re-read of the run look like a mistake.

### 3.6 The attempt layer

Exam sitting, hint budget, reopen and rewind read the attempt row, not the
simulated world, and no command is stopped by them. They are listed here so that a
reader comparing "decisions that bind" against the codebase does not think they
were missed.

### 3.7 A restart is management, not a desktop action

`reboot-remote` clears a pending restart on a user machine and, unlike the other
change commands that name a user machine, it does not require an open session —
it resolves its target with `findDevice` and answers "no restart is pending" when
there is nothing to do. That is deliberate and it is consistent with the surface
that offers it: the Remote Desktop console lists *Restart the machine* on the
machine's own entry, beside *Connect remotely*, rather than inside the session
block. A restart is a management action on a machine the desk can name; the
commands that touch a desktop — the spooler, the printer default, a sign-out — are
inside the session and are gated. Reading the entries in §3.1 and this one together
is the whole rule: **what needs a desktop needs a session; what needs a machine does
not.**

### 3.8 The machine's own record, read by the command that was asked

Rows 16–21 are decisions in the same sense as the rest: a record written down
earlier — a machine's kind, an account's state, a lease, a default printer — stops
what the desk is trying to do, and the refusal names the record. They stay
command-local for one reason only: each needs the *argument* the learner typed to
know which record to read, and each has to answer after the command's own
resolution step ("no machine by that name" comes first, then "that machine is a
server"). They are not scattered: every one of them is matched to an inventory
entry in `src/domain/environment/refusals.ts`, and
`tests/domain/environment/refusalInventory.test.ts` fails when a command refuses
for a reason that is not listed there and in the table above. A second surface
that can reach one of these (a console button, the Remote Desktop) is the trigger
to move it into `policy.ts` instead.

---

## 4. Closed by this pass

| Was | Now |
| --- | --- |
| `clear-printqueue` on the desk's own machine cleared a stopped spooler's queue while `remote-clear-printqueue` refused | both refused by one rule; the spooler fault binds wherever the queue is cleared |
| Two hand-written spooler refusals, with different wording and different fix commands | `stoppedSpooler()` — one message, the fix command chosen by surface |
| The shelf state label map copied in the shelf commands, the asset record and the bay console | `STOCK_STATE_LABELS` in `stock.ts`, so a state cannot be described one way on screen and another in a refusal |
| The imaging run and the handover each deciding what "held" and "waiting on parts" mean | `stockPolicy(item, intent)` for both intents |
| The account-administration refusal written twice in one handler | `directoryMandateDenial()` |
| `no-live-session` enforced by `activeTarget()` in `commands/remote.ts`, with `use-remote-session` wording the same absence differently | one rule in `policy.ts`; `needsRemoteSession` names the nine desktop actions, so the answer is the same from the desktop terminal, a console button and the side terminal |
| Eight desktop actions resolving their target with `findDevice` while the registry's `targetDevice` named the target for one | the registry resolves the target once and the command reads that device, so a rule and the change it guards cannot disagree |

## 5. Left open, with the trigger to revisit

| Observation | Revisit when |
| --- | --- |
| A world rule is asked before the command's argument checks, so a desktop action with the wrong number of words can answer with the session rather than the usage line | a learner-facing complaint that a typo got a rule's answer instead of a usage line |
| Shipment transition rules are one precondition per command | a second surface (a console button) can reach a transition |
| `reboot-remote` is allowed without an open session, by design (§3.7) | a ticket ever reads as though a restart should have needed the desktop it was typed from |

## 6. Adding a rule

1. Does it read a record and stop a command? → `policy.ts`, with a `PolicyRuleId`.
2. Name the commands it stops through a flag on the registry, not by listing names
   in the rule.
3. If it needs the command's arguments or must answer in a particular order, return
   `PolicyRefusal` from an exported helper and call it from the command, in the
   documented position.
4. Test it in `tests/domain/environment/policy.test.ts` by **rule id**, and once
   through the surface that runs it.
5. Add the row to the inventory above, with its id in the table. If it is
   deliberately *not* a world rule, say so there instead.
6. Declare the wording in `src/domain/environment/refusals.ts` — every
   hand-written `failed(...)` in `commands/` has to match an entry there or a
   listed argument error, and
   `tests/domain/environment/refusalInventory.test.ts` fails when one does not.
   That test is what keeps this table honest: a refusal cannot appear in a
   command without a row here.
