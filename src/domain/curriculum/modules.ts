import { SCENARIO_FAMILIES } from '../generator'
import type { ScenarioId } from '../tickets/types'

/**
 * The course the app is organised around: twenty-two modules, sixteen on the
 * service desk, three in the device console and three in the Azure console. Each
 * has its own scope and exit criteria. Copy, scope and targets are our own;
 * nothing here is borrowed from the reference product.
 */

export type ModuleStatus = 'playable' | 'planned'

/** Every counter the curriculum can read. Values are filled in by the service. */
export const MODULE_MEASURES = {
  scoredAttempts: 0,
  passedAttempts: 0,
  familiesPlayed: 0,
  familiesPassed: 0,
  perfectSafety: 0,
  perfectDiagnosis: 0,
  perfectDocumentation: 0,
  passwordPasses: 0,
  accountPerfectDiagnosis: 0,
  accountPerfectSafety: 0,
  networkAddressPasses: 0,
  networkPerfectDiagnosis: 0,
  troubleshootingNotes: 0,
  customerNotes: 0,
  resolutionNotes: 0,
  callerQuestions: 0,
  callerIntents: 0,
  askedBeforeTouching: 0,
  /** Attempts that arrived as a message on the desk's voicemail. */
  voicemailPasses: 0,
  voicemailCallbacks: 0,
  voicemailNotes: 0,
  verifiedBeforeTouching: 0,
  callerVerifications: 0,
  refusedRequests: 0,
  remoteSessionsOpened: 0,
  remoteReadBeforeChange: 0,
  remoteWorkDocumented: 0,
  mailboxReads: 0,
  mailMessageTraces: 0,
  mailboxPasses: 0,
  quarantineReleases: 0,
  sendersBlocked: 0,
  mailSecurityPasses: 0,
  deploymentQueueReads: 0,
  deploymentReads: 0,
  deploymentRuns: 0,
  deploymentPasses: 0,
  deploymentHoldPasses: 0,
  shelfReads: 0,
  machinesIssued: 0,
  shelfHolds: 0,
  shipmentReads: 0,
  shipmentsDispatched: 0,
  shipmentsDelivered: 0,
  shipmentsRebooked: 0,
  handedOff: 0,
  listingsSaved: 0,
  listingsWithSkills: 0,
  demandedFamiliesPassed: 0,
  /** Device work done in the Intune console, which never opens a ticket session. */
  intuneTicketsResolved: 0,
  intunePasses: 0,
  /** Intune attempts that read the record before the first fix. */
  intuneReadBeforeFix: 0,
  /** Intune attempts that took every diagnostic mark. */
  intunePerfectDiagnosis: 0,
  /** Intune attempts that destroyed nothing the ticket did not ask for. */
  intunePerfectSafety: 0,
  /** One template each, named for the decision it teaches. */
  intuneComplianceFixes: 0,
  intuneVerdictRefreshed: 0,
  intuneAppInstallFixes: 0,
  intuneAppSetsInstalled: 0,
  intuneLeaverRetires: 0,
  intuneWipePasses: 0,
  intuneStaleCleared: 0,
  intuneOwnershipPasses: 0,
  /** Distinct lifecycle decisions passed, for the module's capstone. */
  intuneLifecycleDecisions: 0,
  /** Subscription work done in the Azure console, which never opens a session. */
  azureTicketsResolved: 0,
  azurePasses: 0,
  azureReadBeforeFix: 0,
  azurePerfectDiagnosis: 0,
  azurePerfectSafety: 0,
  /** One template each, named for the decision it teaches. */
  azureVmsStarted: 0,
  azureVmsDeallocated: 0,
  azureSitesScaled: 0,
  azureHttpsOpened: 0,
  azureRdpClosed: 0,
  azureNetworkPasses: 0,
  azurePublicBlobClosed: 0,
  azureSoftDeleteEnabled: 0,
  azureTlsEnforced: 0,
  azureRoleCorrected: 0,
  /** Distinct security decisions passed, for the module's capstone. */
  azureSecurityDecisions: 0,
} as const

export type ModuleMeasure = keyof typeof MODULE_MEASURES

export type ModuleEvidence = Record<ModuleMeasure, number>

export function emptyEvidence(): ModuleEvidence {
  return { ...MODULE_MEASURES }
}

export interface ModuleRequirement {
  id: string
  /** What the learner has to demonstrate, in plain language. */
  label: string
  /** Longer explanation shown when the module is opened. */
  detail: string
  measure: ModuleMeasure
  target: number
}

export interface CurriculumModule {
  id: string
  /** Position in the course, 1-based. */
  number: number
  title: string
  summary: string
  /**
   * Scenario families whose attempts count toward this module. Empty when the
   * module is judged on behaviour alone (interview practice) or is not built.
   */
  scope: readonly ScenarioId[]
  /**
   * Intune templates whose attempts earn XP for this module. The console is a
   * separate simulator with its own tickets, so they are named here rather than
   * in `scope`, which is the service-desk generator's families.
   */
  intuneTemplates?: readonly string[]
  /**
   * Azure templates whose attempts earn XP for this module, on the same terms as
   * the device console: a separate simulator with its own tickets, named here
   * rather than in `scope`.
   */
  azureTemplates?: readonly string[]
  status: ModuleStatus
  requirements: readonly ModuleRequirement[]
  /** Only set while a module has no lessons. */
  note?: string
}

export interface RequirementProgress extends ModuleRequirement {
  current: number
  met: boolean
}

export interface ModuleProgress {
  met: number
  total: number
  /** 0–100, rounded down so a full bar always means every requirement is met. */
  percent: number
  complete: boolean
  requirements: readonly RequirementProgress[]
}

/** Modules judged on the work rather than one family count every family the app plays. */
const ALL_FAMILIES: readonly ScenarioId[] = SCENARIO_FAMILIES.map((family) => family.id)

function requirement(
  id: string,
  label: string,
  detail: string,
  measure: ModuleMeasure,
  target: number,
): ModuleRequirement {
  return { id, label, detail, measure, target }
}

/*
 * Every module in the course is built. `status: 'planned'` stays in the model
 * for a module that has to be listed before it can be practiced — a gap in the
 * course is better shown than hidden — but nothing in the catalog uses it.
 */
export const CURRICULUM: readonly CurriculumModule[] = [
  {
    id: 'first-shift',
    number: 1,
    title: 'Your First Shift',
    summary: 'What a ticket is for, and what a clean handover looks like.',
    scope: ALL_FAMILIES,
    status: 'playable',
    requirements: [
      requirement(
        'close-one',
        'Close one ticket with a passing score',
        'Any family counts. The queue does not care which ticket you start with.',
        'passedAttempts',
        1,
      ),
      requirement(
        'own-words',
        'Leave a troubleshooting note in your own words',
        'What you saw, what you tried, what changed. Written before the ticket closes.',
        'troubleshootingNotes',
        1,
      ),
      requirement(
        'tell-requester',
        'Tell the requester what happens next',
        'A customer note the person could actually read: the outcome and the next step.',
        'customerNotes',
        1,
      ),
    ],
  },
  {
    id: 'ticket-queue',
    number: 2,
    title: 'The Ticket Queue',
    summary: 'Order of work, what a breach means, and when to hand a ticket on.',
    scope: ALL_FAMILIES,
    status: 'playable',
    requirements: [
      requirement(
        'three-passes',
        'Close three tickets',
        'Three passing attempts, in any mix of families.',
        'passedAttempts',
        3,
      ),
      requirement(
        'two-families',
        'Pass tickets in two different families',
        'The queue is not one kind of problem. Work at least two of them.',
        'familiesPassed',
        2,
      ),
      requirement(
        'hand-off',
        'Hand one ticket to another team',
        'Close an attempt as an escalation or a refusal. The reason is recorded on the session.',
        'handedOff',
        1,
      ),
    ],
  },
  {
    id: 'documentation',
    number: 3,
    title: 'Documentation',
    summary: 'Writing the record so the next person can act on it.',
    scope: ALL_FAMILIES,
    status: 'playable',
    requirements: [
      requirement(
        'troubleshooting-notes',
        'Write three troubleshooting notes',
        'Short, factual, and about the evidence rather than the conclusion alone.',
        'troubleshootingNotes',
        3,
      ),
      requirement(
        'customer-notes',
        'Write two customer updates',
        'No jargon. A reader outside IT should follow the outcome.',
        'customerNotes',
        2,
      ),
      requirement(
        'resolution-note',
        'Close a ticket with a resolution note',
        'The fix, who did what, and anything the next shift should watch.',
        'resolutionNotes',
        1,
      ),
    ],
  },
  {
    id: 'company-chat',
    number: 4,
    title: 'Company Chat',
    summary: 'Asking one good question, then waiting for the answer.',
    scope: ALL_FAMILIES,
    status: 'playable',
    requirements: [
      requirement(
        'four-intents',
        'Ask four different kinds of question',
        'Chat is a narrowing tool. Each intent is a different thing you can ask the requester.',
        'callerIntents',
        4,
      ),
      requirement(
        'ask-first',
        'Ask something before you touch the machine',
        'One attempt where the first move is a question, not a command.',
        'askedBeforeTouching',
        1,
      ),
      requirement(
        'ten-questions',
        'Ask ten questions in total',
        'Across every attempt you have open. Hints do not count.',
        'callerQuestions',
        10,
      ),
    ],
  },  {
    id: 'voicemails',
    number: 5,
    title: 'Voicemails',
    summary: 'Callbacks, notes from a message, and deciding what can wait.',
    scope: ALL_FAMILIES,
    status: 'playable',
    requirements: [
      requirement(
        'voicemail-pass',
        'Close a ticket that arrived as a voicemail',
        'The recording is the report. Work the ticket it describes, and close it on the evidence rather than on what a caller told you aloud.',
        'voicemailPasses',
        1,
      ),
      requirement(
        'ring-back',
        'Ring the caller back from the message',
        'A callback placed on the attempt. The line on file, or the desk line when the handset is out of action, is the one to ring.',
        'voicemailCallbacks',
        1,
      ),
      requirement(
        'write-it-down',
        'Write the message into the ticket',
        'A note on the attempt that records what was asked for. The audio is gone once the message is deleted; the ticket is not.',
        'voicemailNotes',
        1,
      ),
    ],
  },
  {
    id: 'the-phone',
    number: 6,
    title: 'The Phone',
    summary: 'Verifying who you are talking to, holding, and transferring.',
    scope: ALL_FAMILIES,
    status: 'playable',
    requirements: [
      requirement(
        'verify-caller',
        'Verify the person before you act',
        'A successful verification on file. Reading a live code back beats trusting a name.',
        'callerVerifications',
        1,
      ),
      requirement(
        'verify-first',
        'Verify before your first change',
        'One attempt where identity is confirmed before any command runs.',
        'verifiedBeforeTouching',
        1,
      ),
      requirement(
        'refuse',
        'Refuse a request that is not the caller’s to make',
        'A refusal is recorded on the session. It scores better than a quiet workaround.',
        'refusedRequests',
        1,
      ),
    ],
  },
  {
    id: 'directory',
    number: 7,
    title: 'Directory (Active Directory)',
    summary: 'Accounts, groups, and changes that have no undo.',
    scope: ['PWD-01', 'M365-01', 'FS-01'],
    status: 'playable',
    requirements: [
      requirement(
        'pass-account',
        'Pass a password or sign-in ticket',
        'Either account family. The directory is where both end up.',
        'passwordPasses',
        1,
      ),
      requirement(
        'account-diagnosis',
        'Full marks on diagnosis in an account ticket',
        'Find the cause before you reset anything: lockout, expiry, or a bad cached credential.',
        'accountPerfectDiagnosis',
        1,
      ),
      requirement(
        'account-safety',
        'Clear an account ticket with no safety misses',
        'Every safety check intact: verification, scope, and a change the user can reverse.',
        'accountPerfectSafety',
        1,
      ),
    ],
  },
  {
    id: 'remote-desktop',
    number: 8,
    title: 'Remote Desktop',
    summary: 'Connecting to a user’s machine, and reading before touching.',
    scope: ALL_FAMILIES,
    status: 'playable',
    requirements: [
      requirement(
        'open-session',
        'Open a support session to a user’s machine',
        'Open a session to a machine no one else is on — from the Remote Desktop console, either terminal, or the Connect button in the machine record. All three are recorded the same way.',
        'remoteSessionsOpened',
        1,
      ),
      requirement(
        'read-first',
        'Read the machine before you change it',
        'One attempt where a read-only command — `hostname`, `ipconfig /all`, a `get-` check, a directory listing — ran on the machine you connected to before a command that changes it.',
        'remoteReadBeforeChange',
        1,
      ),
      requirement(
        'document-remote',
        'Record what you changed while you were on the machine',
        'A troubleshooting or resolution note in the same attempt, written after the work on the remote machine. The session is evidence; the note is the handover.',
        'remoteWorkDocumented',
        1,
      ),
    ],
  },
  {
    id: 'server-room',
    number: 9,
    title: 'Server Room',
    summary: 'Outages worked hop by hop, with the blast radius in view.',
    scope: ['NET-01', 'DHCP-01'],
    status: 'playable',
    requirements: [
      requirement(
        'pass-network',
        'Pass a network or address ticket',
        'Either family. Name resolution and scope problems both land here.',
        'networkAddressPasses',
        1,
      ),
      requirement(
        'network-diagnosis',
        'Full marks on diagnosis in a network ticket',
        'Walk the path: local address, gateway, resolver, then the service.',
        'networkPerfectDiagnosis',
        1,
      ),
      requirement(
        'scope-the-outage',
        'Hand off an outage that is not yours to fix',
        'One escalation on file. Knowing the boundary is part of the job.',
        'handedOff',
        1,
      ),
    ],
  },
  {
    id: 'mail-admin',
    number: 10,
    title: 'Mail Admin',
    summary: 'Tracing a message and reading its delivery state.',
    scope: ['MAIL-01'],
    status: 'playable',
    requirements: [
      requirement(
        'read-mailbox',
        'Read a mailbox record',
        'Open Mail Admin or run `get-mailbox` for the account the ticket names. Quota, forwarding, and holds live there; delivery does not.',
        'mailboxReads',
        1,
      ),
      requirement(
        'trace-message',
        'Trace a message through the tenant',
        'A trace is the transport’s own account of one message: sender, recipient, filter verdict, and each step it took. Run `trace-message` on an id the mailbox lists.',
        'mailMessageTraces',
        1,
      ),
      requirement(
        'pass-mail',
        'Pass a mail delivery ticket',
        'Close a MAIL-01 ticket with a passing score. The mailbox record and the trace are the evidence the close is judged on.',
        'mailboxPasses',
        1,
      ),
    ],
  },
  {
    id: 'mail-security',
    number: 11,
    title: 'Mail Security',
    summary: 'Reviewing quarantined mail: release, or leave it.',
    scope: ['MAILSEC-01'],
    status: 'playable',
    requirements: [
      requirement(
        'trace-held',
        'Trace a held message before deciding',
        'A hold is the filter’s verdict, not a fact. Trace the message from Mail Security and compare the sender with the domain and the reason the filter recorded.',
        'mailMessageTraces',
        1,
      ),
      requirement(
        'release-held',
        'Release a held message you can defend',
        'Release expected mail with `release-quarantine` or the Release button. The trace has to show why it was safe to deliver.',
        'quarantineReleases',
        1,
      ),
      requirement(
        'block-sender',
        'Leave a malicious message held and block its sender',
        'Do not release an impersonation. Run `block-sender` on the address the trace shows; the block also drops the mail that address is holding.',
        'sendersBlocked',
        1,
      ),
      requirement(
        'pass-security',
        'Pass a mail security ticket',
        'Close a MAILSEC-01 ticket with a passing score. Its two variants pull in opposite directions on purpose.',
        'mailSecurityPasses',
        1,
      ),
    ],
  },  {
    id: 'asset-management',
    number: 12,
    title: 'Asset Management',
    summary: 'Who holds a machine, what is on the shelf, and whether it can go out.',
    scope: ['DEP-01'],
    status: 'playable',
    requirements: [
      requirement(
        'read-deployment-queue',
        'Read the shelf and deployment queue',
        'The queue is the register of work booked against the shelves: which machine, which sequence, and what state the last run left it in. Run `get-deployment-queue` or open Computer Deployment.',
        'deploymentQueueReads',
        1,
      ),
      requirement(
        'read-asset-record',
        'Read the shelf record behind a machine',
        'Asset Management shows who holds the machine; `get-deployment <tag>` logs the shelf state and note behind its run, which is what an issue decision turns on.',
        'deploymentReads',
        1,
      ),
      requirement(
        'respect-shelf-hold',
        'Pass the ticket where a shelf hold stops the handover',
        'A machine quarantined for damage cannot be issued, and imaging it does not close the case. Read the hold and hand it to Field Services rather than running the sequence.',
        'deploymentHoldPasses',
        1,
      ),
      requirement(
        'resolve-intune-ticket',
        'Resolve a device ticket in the Intune console',
        'The console at /intune shows the estate a device ticket is about. A ticket counts when the estate agrees it is done: a sync that brings a device back into compliance, a retire for a leaver, a wipe for a lost phone.',
        'intuneTicketsResolved',
        1,
      ),
      requirement(
        'pass-intune-ticket',
        'Pass a scored Intune ticket',
        'Intune tickets are scored out of 100 on the steps taken and the state they leave the device in. Passing needs the right actions without destroying a machine the ticket did not ask for.',
        'intunePasses',
        1,
      ),
    ],
  },
  {
    id: 'computer-deployment',
    number: 13,
    title: 'Computer Deployment',
    summary: 'Imaging runs, the shelf record, and the decision to rerun.',
    scope: ['DEP-01'],
    status: 'playable',
    requirements: [
      requirement(
        'read-failed-run',
        'Read the failed run and its shelf record',
        'The sequence, the step it stopped on, the attempt count, and the shelf state are one record. Read it before rerunning anything; the step decides whether a rerun is the fix or the same failure again.',
        'deploymentReads',
        1,
      ),
      requirement(
        'finish-run',
        'Run a sequence to completion',
        '`start-deployment` runs the booked sequence for one asset tag and marks that machine ready on the shelf. A run that was refused changed nothing and does not count.',
        'deploymentRuns',
        1,
      ),
      requirement(
        'pass-deployment',
        'Pass an imaging ticket',
        'Close a DEP-01 ticket with a passing score. Its two variants pull in opposite directions: one finishes the failed run, the other leaves a held machine alone.',
        'deploymentPasses',
        1,
      ),
    ],
  },
  {
    id: 'pc-shelf',
    number: 14,
    title: 'PC Shelf',
    summary: 'Stockroom piles, counts, and categorised inventory.',
    scope: ['DEP-01'],
    status: 'playable',
    requirements: [
      requirement(
        'read-shelf',
        'Read a site’s shelf bay',
        '`get-shelf <site>` or the PC Shelf console lists every machine held at a site, its state, its days on the shelf, and the note behind it. Counting by state is where every handover starts.',
        'shelfReads',
        1,
      ),
      requirement(
        'book-ready-machine',
        'Issue a ready machine to its new holder',
        '`book-shelf-machine <assetTag> <samAccountName>` is the handover itself: only a machine in a ready state can leave, the account has to exist, and the machine appears on the asset register under that account afterwards.',
        'machinesIssued',
        1,
      ),
      requirement(
        'hold-broken-stock',
        'Hold a machine that must not be issued',
        '`hold-shelf-machine <assetTag> <reason>` puts a machine on the shelf’s hold list so a fast handover cannot walk past a fault. A held machine is never issued, and only whoever owns the fault clears the hold.',
        'shelfHolds',
        1,
      ),
    ],
  },
  {
    id: 'ship-manager',
    number: 15,
    title: 'Ship Manager',
    summary: 'Outbound equipment, return labels, and tracking states.',
    scope: ['DEP-01'],
    status: 'playable',
    requirements: [
      requirement(
        'read-board',
        'Read the shipping board',
        '`get-shipments` orders the desk by what needs attention: delayed collections first, then what still has to leave, then what is already out. `get-shipment <reference>` opens one movement’s route, carrier, and latest tracking event.',
        'shipmentReads',
        1,
      ),
      requirement(
        'dispatch-shipment',
        'Dispatch a collected shipment',
        '`dispatch-shipment <reference>` records the handover to the carrier. Only a shipment in preparing can be dispatched; a delayed collection never happened, so it has to be rebooked first.',
        'shipmentsDispatched',
        1,
      ),
      requirement(
        'deliver-shipment',
        'Record a shipment that arrived',
        '`deliver-shipment <reference>` closes the movement at the receiving site. A shipment that was never collected cannot be delivered, whatever the ticket asks for.',
        'shipmentsDelivered',
        1,
      ),
      requirement(
        'rebook-delayed',
        'Rebook a collection that was missed',
        '`rebook-shipment <reference> <days>` puts a delayed shipment back into preparing with a new due date, instead of pretending it was delivered. A delay is a date to fix, not a delivery.',
        'shipmentsRebooked',
        1,
      ),
    ],
  },
  {
    id: 'mock-interview',
    number: 16,
    title: 'Mock Interview',
    summary: 'Turning your saved job listings into answers you can defend.',
    scope: [],
    status: 'playable',
    requirements: [
      requirement(
        'save-listing',
        'Save a listing you are chasing',
        'Paste the requirements section on the Job targets page. It stays on this machine.',
        'listingsSaved',
        1,
      ),
      requirement(
        'match-skills',
        'Match a listing’s skills to your practice',
        'A saved listing that names at least one skill the simulator covers.',
        'listingsWithSkills',
        1,
      ),
      requirement(
        'cover-demand',
        'Pass a family an advert actually asks for',
        'Coverage only counts once the family behind the skill has a passing attempt.',
        'demandedFamiliesPassed',
        1,
      ),
    ],
  },
  {
    id: 'intune-compliance',
    number: 17,
    title: 'Intune: Device Compliance',
    summary: 'Why a device is judged non-compliant, and what makes the verdict current.',
    scope: [],
    intuneTemplates: ['tpl-bitlocker-off', 'tpl-policy-not-evaluated'],
    status: 'playable',
    requirements: [
      requirement(
        'read-record',
        'Read the device record before changing anything',
        'Compliance has one reason list, and it names the rule that failed. The console records the read, so diagnosis is scored from what you looked at before the first fix.',
        'intuneReadBeforeFix',
        1,
      ),
      requirement(
        'restore-compliance',
        'Bring a non-compliant laptop back into compliance',
        'A failed encryption rule is a setting the policy can apply. A sync applies it and re-evaluates the verdict on the same check-in, which is cheaper than escalating a device that is merely behind.',
        'intuneComplianceFixes',
        1,
      ),
      requirement(
        'refresh-verdict',
        'Get a device off “not evaluated”',
        'A device that is checking in but has no verdict has not gone quiet. The service needs to judge it again, and a sync is the step that asks.',
        'intuneVerdictRefreshed',
        1,
      ),
      requirement(
        'diagnose',
        'Take every diagnostic mark on a compliance ticket',
        'The read has to come before the fix, and the fix has to be the one the failing rule asks for. Reading afterwards is a note, not a diagnosis.',
        'intunePerfectDiagnosis',
        1,
      ),
    ],
  },
  {
    id: 'intune-apps',
    number: 18,
    title: 'Intune: App Deployment',
    summary: 'Assignments, failed installs, and the set a device needs to be useful.',
    scope: [],
    intuneTemplates: ['tpl-app-install-failed', 'tpl-new-hire-apps'],
    status: 'playable',
    requirements: [
      requirement(
        'fix-install',
        'Get a failed install onto a device',
        'A failed install keeps its verdict until something requeues it. Read the app list on the device, restart the machine so the install is queued again, then sync to collect it.',
        'intuneAppInstallFixes',
        1,
      ),
      requirement(
        'install-required-set',
        'Install every app a device group requires',
        'The required set comes from the group, not from the catalogue. A new phone with the portal but no VPN client is an incomplete handover, and the ticket stays open.',
        'intuneAppSetsInstalled',
        1,
      ),
      requirement(
        'no-collateral',
        'Ship an app fix without destroying a device',
        'Nothing on an app ticket justifies a wipe or a retire. The safety mark is lost as soon as one is tried, and the machine is gone whether the install worked or not.',
        'intunePerfectSafety',
        1,
      ),
    ],
  },
  {
    id: 'intune-lifecycle',
    number: 19,
    title: 'Intune: Device Lifecycle',
    summary: 'Retire, wipe, stale enrolments, and records that name the wrong owner.',
    scope: [],
    intuneTemplates: [
      'tpl-leaver-retire',
      'tpl-lost-phone-wipe',
      'tpl-stale-device',
      'tpl-wrong-owner',
    ],
    status: 'playable',
    requirements: [
      requirement(
        'retire-leaver',
        'Retire a device that has left the business',
        'Retiring removes company data and assignments from a device its owner still holds, and it can be reversed if they come back. Wiping their own photos is not the same decision.',
        'intuneLeaverRetires',
        1,
      ),
      requirement(
        'wipe-lost',
        'Wipe a phone that was reported lost',
        'A device nobody holds cannot be retired into usefulness. The wipe is the close, and it is the only destructive action that ticket calls for.',
        'intuneWipePasses',
        1,
      ),
      requirement(
        'clear-stale',
        'Clear an enrolment that stopped reporting',
        'A device silent for weeks cannot be commanded, so a sync only proves it. Retiring the record lets the machine be enrolled again without fighting a policy it never received.',
        'intuneStaleCleared',
        1,
      ),
      requirement(
        'fix-owner',
        'Put a device on the right person without touching it',
        'Ownership is a record, not a machine. Changing the primary user fixes the alerts and the assignments; wiping a working laptop to correct a bookkeeping error destroys the evidence of the mistake.',
        'intuneOwnershipPasses',
        1,
      ),
      requirement(
        'three-decisions',
        'Finish three different lifecycle decisions',
        'Retire, wipe and stale are three answers to three questions. Each one is passed on its own ticket, and the capstone asks for all three rather than one repeated.',
        'intuneLifecycleDecisions',
        3,
      ),
    ],
  },
  {
    id: 'azure-compute',
    number: 20,
    title: 'Azure: Compute and Cost',
    summary: 'Machines that are off for the wrong reason, and the ones that bill while idle.',
    scope: [],
    azureTemplates: ['tpl-vm-stopped', 'tpl-vm-idle-cost', 'tpl-app-throttled'],
    status: 'playable',
    requirements: [
      requirement(
        'read-record',
        'Read the resource record before changing anything',
        'A portal row says a machine is down or costly; the record says why. The console records the read, so diagnosis is scored from what you looked at before the first change.',
        'azureReadBeforeFix',
        1,
      ),
      requirement(
        'start-stopped',
        'Bring a deallocated machine back up',
        'A deallocated machine is not broken, and its disks are still there. Starting it is the whole fix; deleting and rebuilding is slower and takes the local state with it.',
        'azureVmsStarted',
        1,
      ),
      requirement(
        'stop-idle',
        'Stop paying for a machine nobody is using',
        'A shutdown inside the guest still bills, because the allocation is still held. Deallocating releases the compute and keeps the disks, so the machine survives the saving.',
        'azureVmsDeallocated',
        1,
      ),
      requirement(
        'right-size-a-site',
        'Get a throttled site off the free quota',
        'A clean application log beside a gateway timeout points at the plan, not the code. Moving to a paid plan removes the daily CPU quota; restarting only resets the symptoms.',
        'azureSitesScaled',
        1,
      ),
      requirement(
        'no-collateral',
        'Save money without deleting anything',
        'No cost ticket is closed by deleting a machine or a resource group. The safety mark is lost as soon as one is tried, and the data goes with it.',
        'azurePerfectSafety',
        1,
      ),
    ],
  },
  {
    id: 'azure-network',
    number: 21,
    title: 'Azure: Network Exposure',
    summary: 'The implicit deny, the port nobody meant to leave open, and the rule that closes it.',
    scope: [],
    azureTemplates: ['tpl-nsg-blocks-https', 'tpl-nsg-open-rdp'],
    status: 'playable',
    requirements: [
      requirement(
        'open-https',
        'Restore HTTPS the security group is dropping',
        'A network security group ends with an implicit deny, so a missing rule closes a port as surely as a deny does. Read the rules, find what is not there, and add only that.',
        'azureHttpsOpened',
        1,
      ),
      requirement(
        'close-rdp',
        'Close a management port that is open to the internet',
        'RDP from the internet is a standing invitation, and the VPN already covers the people who need it. Removing the rule puts the default deny back without touching the rest of the group.',
        'azureRdpClosed',
        1,
      ),
      requirement(
        'pass-both-network-tickets',
        'Pass both networking tickets',
        'One ticket is closed by adding a rule and the other by removing one. A learner who only ever adds rules, or only ever removes them, has not read the group.',
        'azureNetworkPasses',
        2,
      ),
    ],
  },
  {
    id: 'azure-access',
    number: 22,
    title: 'Azure: Storage and Access',
    summary: 'Anonymous blobs, retention, old protocols, and a role wider than the job.',
    scope: [],
    azureTemplates: [
      'tpl-storage-public',
      'tpl-storage-soft-delete',
      'tpl-storage-tls',
      'tpl-rbac-owner',
    ],
    status: 'playable',
    requirements: [
      requirement(
        'close-public-blobs',
        'Turn off anonymous blob access',
        'Public blob access is a switch on the account, and turning it off is the fix. Rotating keys closes nothing, because no key was used to read the blob.',
        'azurePublicBlobClosed',
        1,
      ),
      requirement(
        'enable-retention',
        'Make the next deleted blob recoverable',
        'Soft delete belongs to the account, not to the job that broke it. It protects the next write; the file already lost stays lost, and the note should say so.',
        'azureSoftDeleteEnabled',
        1,
      ),
      requirement(
        'raise-tls',
        'Refuse a protocol the scan calls obsolete',
        'The minimum TLS version is one setting, and raising it refuses old clients rather than negotiating down. Check the client list before making a change that can lock one out.',
        'azureTlsEnforced',
        1,
      ),
      requirement(
        'shrink-a-role',
        'Give a contractor the access the job needs, and no more',
        'Contributor can deploy and manage; Owner can also grant access and delete anything. The ticket keeps the work, so the role shrinks rather than disappearing.',
        'azureRoleCorrected',
        1,
      ),
      requirement(
        'three-decisions',
        'Finish three different exposure decisions',
        'Anonymous reads, retention, protocol and role are four answers to four questions. The capstone asks for three of them, each passed on its own ticket rather than one repeated.',
        'azureSecurityDecisions',
        3,
      ),
    ],
  },
]

export function moduleProgress(module: CurriculumModule, evidence: ModuleEvidence): ModuleProgress {
  const requirements: RequirementProgress[] = module.requirements.map((entry) => {
    const stored = evidence[entry.measure]
    const current = Number.isFinite(stored) ? Math.max(0, Math.floor(stored)) : 0
    return { ...entry, current, met: current >= entry.target }
  })
  const met = requirements.filter((entry) => entry.met).length
  const total = requirements.length

  return {
    met,
    total,
    percent: total === 0 ? 0 : Math.floor((met / total) * 100),
    complete: total > 0 && met === total,
    requirements,
  }
}

/** First playable module, in course order, that still has an unmet requirement. */
export function nextModule(
  modules: readonly CurriculumModule[],
  progressById: Readonly<Record<string, ModuleProgress>>,
): CurriculumModule | null {
  for (const module of modules) {
    if (module.status !== 'playable') {
      continue
    }
    const progress = progressById[module.id]
    if (!progress || !progress.complete) {
      return module
    }
  }
  return null
}
