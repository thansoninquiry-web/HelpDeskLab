/**
 * The Education IT pack's own vocabulary.
 *
 * Larkspur Academy is a school desk, not a ticket world: one caller, one room,
 * one bell. Like the consoles beside it the module is meant to be lifted out
 * whole, so nothing here is shared with `World`; it imports nothing from the app.
 */

/** How strict the clock is. The bell is the same; the buffer is not. */
export type AcademyMode = 'standard' | 'rush'

/** The five kinds of work the pack hands out. */
export type AcademyArea = 'classroom' | 'lab' | 'office' | 'network' | 'assets'

/** A read a technician can take, from the room or from the console. */
export type ReadId =
  | 'room-schedule'
  | 'projector-status'
  | 'hdmi-handshake'
  | 'lamp-hours'
  | 'account-status'
  | 'image-report'
  | 'lab-console'
  | 'device-manager'
  | 'audio-devices'
  | 'print-queue'
  | 'printer-config'
  | 'filter-log'
  | 'drive-mapping'
  | 'wifi-clients'
  | 'ap-status'
  | 'rssi-survey'
  | 'dhcp-scope'
  | 'switch-port'
  | 'cart-status'
  | 'inventory-record'
  | 'screen-condition'
  | 'charger-test'
  | 'disk-health'
  | 'login-timing'
  | 'loan-record'

/** A change the desk can make. Offered per scenario, never free. */
export type ChangeId =
  | 'reseat-hdmi'
  | 'replace-hdmi'
  | 'select-input'
  | 'power-cycle-projector'
  | 'clean-filter'
  | 'replace-lamp'
  | 'unlock-account'
  | 'reset-password'
  | 'reimage-machine'
  | 'rollback-image'
  | 'rebuild-profile'
  | 'reinstall-driver'
  | 'set-default-audio'
  | 'unmute-output'
  | 'clear-jam'
  | 'reload-paper'
  | 'restart-spooler'
  | 'set-default-printer'
  | 'clear-queue'
  | 'test-print'
  | 'fix-scan-settings'
  | 'recategorise-site'
  | 'pause-filter-for-testing'
  | 'remap-drive'
  | 'reboot-ap'
  | 'replace-ap'
  | 'enable-poe-port'
  | 'enable-switch-port'
  | 'enable-5ghz'
  | 'add-lab-ap'
  | 'move-ap'
  | 'set-static-ip'
  | 'correct-vlan'
  | 'widen-dhcp-scope'
  | 'reserve-address'
  | 'charge-cart'
  | 'replace-cart-psu'
  | 'swap-keyboard'
  | 'image-and-stage'
  | 'tag-asset'
  | 'record-inventory'
  | 'check-out-loaner'
  | 'check-in-loaner'
  | 'hand-over-charger'
  | 'book-return'
  // Plausible changes that do not fix these scenarios, or that take something
  // away. They are offered because a school desk offers them, and the scorer
  // charges for taking one.
  | 'replace-projector'
  | 'order-new-lab'
  | 'disable-filter'
  | 'share-admin-password'
  | 'move-student-vlan'
  | 'give-admin-rights'
  | 'wipe-lab'

/** The onsite checklist a visit carries, in the order a technician does it. */
export const VISIT_CHECKLIST = [
  {
    id: 'kit',
    label: 'Pack the kit and the spare parts',
    detail: 'Take the cable, the adapter and the spare the room is likely to need.',
  },
  {
    id: 'safety',
    label: 'Check the room before you lift or reach',
    detail: 'Power off what you touch, use the step stool, and lift with your legs.',
  },
  {
    id: 'document',
    label: 'Write the visit note',
    detail: 'The room, the fault, the change, and what the teacher should watch for.',
  },
  {
    id: 'follow-up',
    label: 'Book the follow-up with the teacher',
    detail: 'Say when the room will be checked again, or what the teacher should watch for.',
  },
] as const

export type ChecklistId = (typeof VISIT_CHECKLIST)[number]['id']

export interface Caller {
  name: string
  role: string
  /** The language the caller opens in. Spanish-first callers get a gloss. */
  language: 'en' | 'es'
}

export interface ScenarioRead {
  id: ReadId
  /** What this read actually shows on this scenario's room or machine. */
  finding: string
  /** True for the reads that isolate the fault: the diagnosis is scored on these. */
  decisive?: boolean
}

export interface DialogOption {
  id: string
  /** What the technician says, in the caller's language. */
  say: string
  /** The English reading, shown when the learner asks for it. */
  gloss?: string
  tone: 'plain' | 'jargon' | 'brusque'
  /** The answer the reference path gives. */
  best?: boolean
}

export interface DialogNode {
  id: string
  prompt: string
  gloss?: string
  options: readonly DialogOption[]
}

export interface WalkUpOption {
  id: string
  label: string
  detail: string
  /** Minutes this answer takes off the bell. */
  minutes: number
  best?: boolean
}

export interface WalkUp {
  id: string
  who: string
  ask: string
  options: readonly WalkUpOption[]
  /** Why the right answer is right, in the debrief. */
  note: string
}

export interface SchoolScenario {
  id: string
  title: string
  area: AcademyArea
  difficulty: 1 | 2 | 3
  /** The one-line symptom the queue shows. */
  symptom: string
  /** What the caller is reported to have said, in their own words. */
  report: string
  /** The room, machine or cart the work is about. */
  subject: string
  caller: Caller
  /** The bell: minutes since 08:00, and how the desk says it. */
  bell: { at: number; label: string }
  /** How long the desk has before the bell, in minutes. */
  window: number
  reads: readonly ScenarioRead[]
  /** Every change this scenario offers, reference path first. */
  changes: readonly ChangeId[]
  /** The changes that resolve it, in order. */
  expected: readonly ChangeId[]
  dialog: readonly DialogNode[]
  walkUp?: WalkUp
  hints: readonly [string, string, string]
  explanation: readonly string[]
  /** What a resolved room looks like, in plain sentences. */
  verifyText: string
}

/* ------------------------------------------------------------- the attempt */

export interface ReadRecord {
  id: ReadId
  at: number
  minute: number
}

export interface ChangeRecord {
  id: ChangeId
  at: number
  minute: number
}

export interface DialogRecord {
  nodeId: string
  optionId: string
  at: number
  minute: number
}

export interface TriageRecord {
  walkUpId: string
  optionId: string
  at: number
  minute: number
}

export interface ChecklistRecord {
  id: ChecklistId
  at: number
  minute: number
  note?: string
}

export interface AttemptState {
  mode: AcademyMode
  reads: readonly ReadRecord[]
  changes: readonly ChangeRecord[]
  dialog: readonly DialogRecord[]
  triage: TriageRecord | null
  checklist: readonly ChecklistRecord[]
}

export const ACADEMY_MODES: readonly {
  id: AcademyMode
  label: string
  detail: string
}[] = [
  {
    id: 'standard',
    label: 'Standard visit',
    detail:
      'Reads cost 2 minutes and changes 3. The bell has a 10-minute grace, and urgency loses 2 points a minute after it.',
  },
  {
    id: 'rush',
    label: 'Time pressure',
    detail:
      'Testing day: reads cost 3 minutes and changes 5, the bell has no grace, and urgency loses 4 points a minute after it.',
  },
]

/** Minute cost of one action, per mode. The bell is what makes the mode matter. */
export const ACTION_MINUTES: Readonly<Record<AcademyMode, { read: number; change: number; dialog: number }>> = {
  standard: { read: 2, change: 3, dialog: 1 },
  rush: { read: 3, change: 5, dialog: 1 },
}

/** The grace after the bell, in minutes, before urgency starts to fall. */
export const BELL_GRACE: Readonly<Record<AcademyMode, number>> = {
  standard: 10,
  rush: 0,
}

/** Urgency points lost per minute past the bell and its grace. */
export const LATE_PENALTY_PER_MINUTE: Readonly<Record<AcademyMode, number>> = {
  standard: 2,
  rush: 4,
}

/** The point where the walk-up arrives: after this many recorded actions. */
export const WALK_UP_AFTER = 2
