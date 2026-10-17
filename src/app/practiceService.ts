import { ensureWorldState } from '../domain/environment/fixtures'
import { applyCommand } from '../domain/environment/reducer'
import type { World } from '../domain/environment/types'
import {
  CLOSURE_CODES,
  generateTicket,
  publicTicketJson,
  randomSeed,
} from '../domain/generator'
import type { GeneratedTicket, PublicTicket, ReferenceStep, Severity, TicketCategory } from '../domain/generator'
import type { ScoreHistoryEntry, ScenarioStats } from '../domain/progress/types'
import { evaluateSession } from '../domain/scoring/evaluator'
import type {
  CategoryScore,
  EvaluationResult,
  Rubric,
  RubricCategory,
  RubricItemResult,
  SessionDecision,
} from '../domain/scoring/types'
import type { JsonObject, JsonValue } from '../domain/shared/json'
import type { ActionKind, Session, Ticket } from '../domain/tickets/types'
import type { TicketStatus } from '../domain/tickets/types'
import type { Persistence } from '../persistence/database'
import { getLocalDatabase } from './persistenceService'

const QUEUE_TARGET = 5
const QUEUE_SCAN = 60
const DAY_MS = 24 * 60 * 60 * 1000
const LEITNER_INTERVAL_DAYS = [1, 2, 4, 8, 16]

/* ------------------------------------------------------------------ views */

export interface TicketView {
  id: string
  scenarioId: string
  variantId: string
  scenarioTitle: string
  variantLabel: string
  difficulty: 1 | 2 | 3
  severity: Severity
  category: TicketCategory
  status: TicketStatus
  subject: string
  body: string
  requester: PublicTicket['requester']
  device: PublicTicket['device']
  symptoms: string[]
  reportedAt: number
}

export interface ConsoleLine {
  text: string
  tone: 'default' | 'error' | 'success' | 'muted'
}

export type WorkspaceEntry =
  | { kind: 'command'; text: string; atMs: number; ok: boolean; lines: ConsoleLine[] }
  | { kind: 'ask'; label: string; question: string; answer: string; atMs: number }
  | { kind: 'verify'; summary: string; atMs: number }
  | { kind: 'note'; noteKind: NoteKind; text: string; atMs: number }

export interface WorkspaceView {
  sessionId: string
  ticket: TicketView
  entries: WorkspaceEntry[]
  simulatedClock: number
  minutesElapsed: number
  hasVerifiedCaller: boolean
  troubleshootingNotes: string[]
  customerNotes: string[]
  commandsRun: number
}

export interface DebriefView {
  sessionId: string
  ticket: TicketView
  decision: SessionDecision
  total: number
  passed: boolean
  band: 'fail' | 'pass' | 'strong'
  xp: number
  criticalFailures: string[]
  feedback: string[]
  items: RubricItemResult[]
  categoryScores: Record<RubricCategory, CategoryScore>
  reference: ReferenceStepView[]
  endedAt: number
}

export interface ReferenceStepView {
  label: string
  detail?: string
}

export interface ProgressRow {
  scenarioId: string
  scenarioTitle: string
  attempts: number
  passes: number
  bestScore: number
  lastPlayedAt: number | null
  leitnerBox: number
  dueAt: number | null
}

export interface WeakTopic {
  scenarioId: string
  scenarioTitle: string
  attempts: number
  averageScore: number
  passRate: number
  weakestCategory: {
    category: RubricCategory
    label: string
    earned: number
    possible: number
    percent: number
  } | null
  recommendation: string
}

export interface ProgressView {
  attempts: number
  passes: number
  bestScore: number
  averageBest: number
  rows: ProgressRow[]
  weakTopics: WeakTopic[]
}

export type NoteKind = 'troubleshooting' | 'customer' | 'resolution'

export type CategoryScoreKeys = RubricCategory

export interface CallerPrompt {
  intent: string
  label: string
}

/* --------------------------------------------------------------- runtime */

interface ActiveAttempt {
  ticket: Ticket
  session: Session
  world: World
  generated: GeneratedTicket
}

let activeAttempt: ActiveAttempt | null = null

function requireActive(): ActiveAttempt {
  if (!activeAttempt) {
    throw new Error('No attempt is open. Start a ticket from the queue first.')
  }
  return activeAttempt
}

function toJson(value: unknown): JsonObject {
  return JSON.parse(JSON.stringify(value)) as JsonObject
}

function asWorld(value: JsonObject): World {
  return ensureWorldState(value as unknown as World)
}

function isRecord(value: unknown): value is Record<string, JsonValue> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readString(value: JsonValue | undefined, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function parsePublicTicket(content: JsonObject): PublicTicket {
  if (!isRecord(content) || typeof content.subject !== 'string') {
    throw new Error('Ticket content is missing or corrupt.')
  }
  return content as unknown as PublicTicket
}

function toTicketView(ticket: Ticket): TicketView {
  const content = parsePublicTicket(ticket.publicContent)
  return {
    id: ticket.id,
    scenarioId: ticket.scenarioId,
    variantId: ticket.variantId,
    scenarioTitle: content.scenarioTitle ?? ticket.scenarioId,
    variantLabel: content.variantLabel ?? ticket.variantId,
    difficulty: ticket.difficulty,
    severity: content.severity ?? 'medium',
    category: content.category ?? 'identity',
    status: ticket.status,
    subject: content.subject,
    body: content.body ?? '',
    requester: content.requester,
    device: content.device,
    symptoms: Array.isArray(content.reportedSymptoms) ? content.reportedSymptoms : [],
    reportedAt: content.createdAt ?? ticket.createdAt,
  }
}

function rebuildTicket(ticket: Ticket): GeneratedTicket {
  return generateTicket(ticket.seed, { familyId: ticket.scenarioId })
}

async function database(): Promise<Persistence> {
  return getLocalDatabase()
}

/* ------------------------------------------------------------------ queue */

export async function loadQueue(): Promise<TicketView[]> {
  const db = await database()
  let recent = await db.tickets.listRecent(QUEUE_SCAN)
  const open = recent.filter((ticket) => ticket.status !== 'completed')

  if (open.length < QUEUE_TARGET) {
    await createTickets(QUEUE_TARGET - open.length, recent)
    recent = await db.tickets.listRecent(QUEUE_SCAN)
  }

  return sortQueue(recent.map(toTicketView))
}

function sortQueue(tickets: TicketView[]): TicketView[] {
  const rank: Record<TicketStatus, number> = { available: 0, in_progress: 1, completed: 2 }
  return [...tickets].sort((left, right) => {
    if (rank[left.status] !== rank[right.status]) {
      return rank[left.status] - rank[right.status]
    }
    return right.reportedAt - left.reportedAt
  })
}

export async function createTickets(
  count: number,
  existing?: readonly Ticket[],
  familyId?: string,
): Promise<TicketView[]> {
  const db = await database()
  const known = existing ?? (await db.tickets.listRecent(QUEUE_SCAN))
  const avoidSignatures = known.map((ticket) => ticket.signature)
  const created: TicketView[] = []

  for (let index = 0; index < count; index += 1) {
    const seed = randomSeed()
    const generated = generateTicket(seed, familyId ? { avoidSignatures, familyId } : { avoidSignatures })
    avoidSignatures.push(generated.signature)

    const ticket: Ticket = {
      id: crypto.randomUUID(),
      scenarioId: generated.scenarioId,
      variantId: generated.variantId,
      difficulty: generated.difficulty,
      seed: generated.seed,
      signature: generated.signature,
      publicContent: publicTicketJson(generated.public),
      createdAt: Date.now(),
      status: 'available',
    }

    await db.tickets.create(ticket)
    created.push(toTicketView(ticket))
  }

  return created
}

/* -------------------------------------------------------------- sessions */

export async function startAttempt(ticketId: string): Promise<WorkspaceView> {
  const db = await database()
  const ticket = await db.tickets.findById(ticketId)
  if (!ticket) {
    throw new Error('That ticket no longer exists.')
  }

  const running = await db.sessions.findActive()
  if (running) {
    if (running.ticketId === ticketId) {
      return openSession(running.id)
    }
    await db.sessions.finish(running.id, {
      endedAt: Date.now(),
      resolution: 'abandoned',
      outcome: 'abandoned',
    })
  }

  const generated = rebuildTicket(ticket)
  const session: Session = {
    id: crypto.randomUUID(),
    ticketId: ticket.id,
    startedAt: Date.now(),
    endedAt: null,
    world: toJson(generated.world),
    resolution: null,
    outcome: null,
  }

  await db.sessions.create(session)
  await db.tickets.updateStatus(ticket.id, 'in_progress')
  activeAttempt = { ticket, session, world: generated.world, generated }

  return getWorkspace()
}

export async function openSession(sessionId: string): Promise<WorkspaceView> {
  const db = await database()
  const session = await db.sessions.findById(sessionId)
  if (!session) {
    throw new Error('That session could not be found.')
  }
  if (session.endedAt !== null) {
    throw new Error('That session is already closed. Open its debrief instead.')
  }

  const ticket = await db.tickets.findById(session.ticketId)
  if (!ticket) {
    throw new Error('The ticket behind this session no longer exists.')
  }

  const generated = rebuildTicket(ticket)
  activeAttempt = { ticket, session, world: asWorld(session.world), generated }

  return getWorkspace()
}

export async function findActiveSessionId(): Promise<string | null> {
  const db = await database()
  const session = await db.sessions.findActive()
  return session?.id ?? null
}

/* ------------------------------------------------------------- workspace */

export async function getWorkspace(): Promise<WorkspaceView> {
  const attempt = requireActive()
  const db = await database()
  const actions = await db.actions.listBySession(attempt.session.id)
  const entries: WorkspaceEntry[] = []
  const troubleshootingNotes: string[] = []
  const customerNotes: string[] = []
  let hasVerifiedCaller = false
  let commandsRun = 0

  for (const action of actions) {
    const input = action.input
    const output = action.output

    if (action.kind === 'command') {
      commandsRun += 1
      entries.push({
        kind: 'command',
        text: readString(input.command),
        atMs: action.atMs,
        ok: output.ok === true,
        lines: readLines(output.lines),
      })
      continue
    }

    if (action.kind === 'ask-user') {
      entries.push({
        kind: 'ask',
        label: readString(input.label, 'Question'),
        question: readString(output.question),
        answer: readString(output.answer),
        atMs: action.atMs,
      })
      continue
    }

    if (action.kind === 'verify-caller') {
      hasVerifiedCaller = true
      entries.push({
        kind: 'verify',
        summary: readString(output.summary),
        atMs: action.atMs,
      })
      continue
    }

    if (action.kind === 'note') {
      const noteKind = readString(input.noteKind) as NoteKind
      const text = readString(input.text)
      if (noteKind === 'troubleshooting') {
        troubleshootingNotes.push(text)
      } else if (noteKind === 'customer') {
        customerNotes.push(text)
      }
      entries.push({ kind: 'note', noteKind, text, atMs: action.atMs })
    }
  }

  return {
    sessionId: attempt.session.id,
    ticket: toTicketView(attempt.ticket),
    entries,
    simulatedClock: attempt.world.clock,
    minutesElapsed: Math.round((attempt.world.clock - attempt.generated.world.clock) / 60_000),
    hasVerifiedCaller,
    troubleshootingNotes,
    customerNotes,
    commandsRun,
  }
}

function readLines(value: JsonValue | undefined): ConsoleLine[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value.flatMap((entry) => {
    if (!isRecord(entry)) {
      return []
    }
    const text = readString(entry.text)
    const tone = readString(entry.kind, 'default')
    const allowed = tone === 'error' || tone === 'success' || tone === 'muted' ? tone : 'default'
    return text ? [{ text, tone: allowed as ConsoleLine['tone'] }] : []
  })
}

export async function submitCommand(input: string): Promise<WorkspaceView> {
  const attempt = requireActive()
  const db = await database()
  const result = applyCommand(attempt.world, input)

  attempt.world = result.world
  await db.actions.append({
    sessionId: attempt.session.id,
    atMs: result.world.clock,
    kind: 'command',
    input: { command: input },
    output: toJson({ lines: result.lines, effects: result.effects, ok: result.ok }),
  })
  await db.sessions.saveWorld(attempt.session.id, toJson(attempt.world))

  return getWorkspace()
}

const CALLER_PROMPTS: readonly CallerPrompt[] = [
  { intent: 'what-error', label: 'What does the message say?' },
  { intent: 'when-start', label: 'When did this start?' },
  { intent: 'what-changed', label: 'What changed since it last worked?' },
  { intent: 'other-users', label: 'Is anyone else affected?' },
  { intent: 'already-tried', label: 'What have you already tried?' },
]

export function callerPrompts(): readonly CallerPrompt[] {
  return CALLER_PROMPTS
}

type CallerIntent = (typeof CALLER_PROMPTS)[number]['intent']

/** Variant-specific replies override the category defaults below. */
const VARIANT_ANSWERS: Record<string, Partial<Record<CallerIntent, string>>> = {
  'account-lockout': {
    'what-error': 'It says my account has been locked out and to contact an administrator.',
  },
  'expired-password': {
    'what-error': 'It says my password has expired and the change password option just fails.',
  },
  'disabled-account': {
    'what-error': 'It says my account is disabled and I should contact my administrator.',
  },
  'bad-static-dns': {
    'what-error': 'The browser says the site cannot be reached. Some apps still work though.',
    'when-start': 'Since I restarted my laptop about an hour ago.',
    'what-changed':
      'Nothing I did on purpose. Someone from IT set a fixed address on it last week.',
  },
  'stale-dhcp-lease': {
    'what-error': 'It says no internet. There is a warning triangle on the network icon.',
    'when-start': 'This morning, after the laptop sat in my bag all weekend.',
  },
  'scope-wrong-dns': {
    'what-error': 'It says the site cannot be reached. Some apps still work though.',
    'when-start': 'Since first thing this morning, and it is not just me.',
    'what-changed':
      'Nothing on my side. The laptop picks up its settings automatically when it starts.',
    'other-users':
      'Two people near me have the same problem, so it is not just my machine.',
  },
  'scope-exhausted': {
    'what-error': 'It says no internet, with a warning on the network icon.',
    'when-start': 'When I picked up the spare laptop this morning.',
    'what-changed': 'Nothing. This laptop was in the pool over the weekend.',
    'other-users': 'The loaner next to mine could not connect either.',
  },
  'mfa-method-lost': {
    'what-error':
      'It asks me to approve on my phone, but that phone is gone. Then it says no method is available.',
    'when-start': 'Since I swapped phones on Saturday.',
    'what-changed': 'I replaced my handset. Nothing else changed.',
    'other-users': 'No, everyone else is signing in fine.',
  },
  'smart-lockout': {
    'what-error':
      'It says my account has been locked to protect me. It never showed an error about the password.',
    'when-start': 'Last night, after I used the hotel Wi-Fi.',
    'what-changed': 'I am travelling this week; that is the only difference.',
    'other-users': 'No, my colleague on the same trip is fine.',
  },
  'missing-group-membership': {
    'what-error': 'It lets me open the folder but every file is read-only when I try to save.',
    'when-start': 'Since this morning. I could save last week.',
    'what-changed': 'I moved teams last month, but nothing changed this week.',
    'other-users': 'My colleague in the same team can still edit the files.',
  },
  'explicit-deny': {
    'what-error': 'It says access is denied and will not open the folder at all.',
    'when-start': 'Since yesterday. It worked last month.',
    'what-changed': 'Nothing on my side. My manager says I am still in the team.',
    'other-users': 'My colleagues can still open it.',
  },
  'spooler-stopped': {
    'what-error': 'Nothing happens at all. The job disappears from the list after a while.',
    'what-changed': 'Nothing. I have not installed anything or changed settings.',
  },
  'job-stuck-offline': {
    'what-error':
      'It says the printer is offline and one job has been stuck at printing since the morning.',
    'what-changed': 'I cancelled a big invoice job this morning and it never disappeared.',
  },
}

function callerAnswer(intent: string, ticket: TicketView): { question: string; answer: string } | null {
  const prompt = CALLER_PROMPTS.find((entry) => entry.intent === intent)
  if (!prompt) {
    return null
  }

  const answers: Record<string, string> = {
    'what-error': 'It is not showing a clear message, sorry.',
    'when-start': 'This morning. It was all fine yesterday.',
    'what-changed': 'Nothing that I know of. I have not changed anything.',
    'other-users':
      ticket.category === 'printer'
        ? 'My colleague cannot print to that printer either, so it is not just my laptop.'
        : ticket.category === 'network'
          ? 'No, the person next to me is working fine.'
          : 'No, it is only me. Everyone else seems to be working.',
    'already-tried':
      ticket.category === 'printer'
        ? 'I turned the printer off and on again and resent the job.'
        : ticket.category === 'network'
          ? 'I restarted the laptop once and unplugged the network cable.'
          : 'I tried signing in a few times and restarted the laptop.',
  }

  const variantAnswer = VARIANT_ANSWERS[ticket.variantId]?.[intent as CallerIntent]

  return {
    question: prompt.label,
    answer: variantAnswer ?? answers[intent] ?? 'I am not sure, sorry.',
  }
}

export async function askCaller(intent: string): Promise<WorkspaceView> {
  const attempt = requireActive()
  const db = await database()
  const view = toTicketView(attempt.ticket)
  const reply = callerAnswer(intent, view)
  if (!reply) {
    throw new Error(`Unknown question: ${intent}`)
  }

  await db.actions.append({
    sessionId: attempt.session.id,
    atMs: attempt.world.clock,
    kind: 'ask-user',
    input: { intent, label: reply.question },
    output: { question: reply.question, answer: reply.answer },
  })

  return getWorkspace()
}

export interface CallerVerification {
  method: 'employee-id' | 'callback' | 'manager'
  summary: string
}

export async function verifyCaller(method: CallerVerification['method']): Promise<WorkspaceView> {
  const attempt = requireActive()
  const db = await database()
  const view = toTicketView(attempt.ticket)

  const summaries: Record<CallerVerification['method'], string> = {
    'employee-id': `Employee ID ${view.requester.employeeId} matched the directory record for ${view.requester.name}.`,
    callback: `Called back the number on file and reached ${view.requester.name} directly.`,
    manager: `Confirmed the request with the listed manager for ${view.requester.department}.`,
  }

  await db.actions.append({
    sessionId: attempt.session.id,
    atMs: attempt.world.clock,
    kind: 'verify-caller',
    input: { method },
    output: { summary: summaries[method] },
  })

  return getWorkspace()
}

export async function addNote(noteKind: NoteKind, text: string): Promise<WorkspaceView> {
  const attempt = requireActive()
  const trimmed = text.trim()
  if (trimmed.length < 10) {
    throw new Error('A note needs at least 10 characters to be useful.')
  }

  const db = await database()
  await db.actions.append({
    sessionId: attempt.session.id,
    atMs: attempt.world.clock,
    kind: 'note',
    input: { noteKind, text: trimmed },
    output: { saved: true },
  })

  return getWorkspace()
}

/* --------------------------------------------------------------- scoring */

export function closureOptions(): typeof CLOSURE_CODES {
  return CLOSURE_CODES
}

export interface ResolveInput {
  code: string
  note: string
}

export async function resolveAttempt(input: ResolveInput): Promise<DebriefView> {
  const attempt = requireActive()
  const db = await database()
  const closure = CLOSURE_CODES.find((entry) => entry.code === input.code)
  if (!closure) {
    throw new Error('Choose a closure code before resolving the ticket.')
  }

  const note = input.note.trim()
  if (note.length > 0) {
    await db.actions.append({
      sessionId: attempt.session.id,
      atMs: attempt.world.clock,
      kind: 'note',
      input: { noteKind: 'resolution', text: note },
      output: { saved: true },
    })
  }

  const storedActions = await db.actions.listBySession(attempt.session.id)
  const decision: SessionDecision = {
    outcome: closure.outcome,
    code: closure.code,
    note,
  }

  const result = evaluateSession({
    rubric: attempt.generated.rubric,
    actions: storedActions.map((action) => ({
      kind: action.kind as ActionKind,
      input: action.input,
      output: action.output,
    })),
    world: attempt.world,
    decision,
    difficulty: attempt.ticket.difficulty,
  })

  const endedAt = Date.now()
  await db.sessions.finish(attempt.session.id, {
    endedAt,
    resolution: closure.code,
    outcome: 'resolved',
  })
  await db.scores.save({
    sessionId: attempt.session.id,
    total: result.total,
    passed: result.passed,
    band: result.band,
    rubric: toJson(result),
    computedAt: endedAt,
  })
  await db.tickets.updateStatus(attempt.ticket.id, 'completed')
  await updateProgress(attempt.ticket.scenarioId, result, endedAt)

  const debrief = buildDebrief(attempt, result, decision, endedAt)
  activeAttempt = null
  return debrief
}

function buildDebrief(
  attempt: ActiveAttempt,
  result: EvaluationResult,
  decision: SessionDecision,
  endedAt: number,
): DebriefView {
  return {
    sessionId: attempt.session.id,
    ticket: toTicketView(attempt.ticket),
    decision,
    total: result.total,
    passed: result.passed,
    band: result.band,
    xp: result.xp,
    criticalFailures: result.criticalFailures,
    feedback: result.feedback,
    items: result.items,
    categoryScores: result.categoryScores,
    reference: attempt.generated.reference.map(describeReference),
    endedAt,
  }
}

function describeReference(step: ReferenceStep): ReferenceStepView {
  switch (step.type) {
    case 'command':
      return { label: 'Run a command', detail: step.input }
    case 'verify-caller':
      return { label: 'Verify the caller', detail: 'Confirm identity before changing the account.' }
    case 'ask-user':
      return { label: 'Ask the caller', detail: step.intent }
    case 'note':
      return {
        label: `Write a ${step.noteKind} note`,
        detail: step.text,
      }
  }
}

async function updateProgress(
  scenarioId: string,
  result: EvaluationResult,
  now: number,
): Promise<void> {
  const db = await database()
  const existing = await db.progress.get(scenarioId)
  const next = nextStats(existing, scenarioId, result, now)
  await db.progress.upsert(next)
}

function nextStats(
  existing: ScenarioStats | null,
  scenarioId: string,
  result: EvaluationResult,
  now: number,
): ScenarioStats {
  const attempts = (existing?.attempts ?? 0) + 1
  const passes = (existing?.passes ?? 0) + (result.passed ? 1 : 0)
  const bestScore = Math.max(existing?.bestScore ?? 0, result.total)
  const box = result.passed
    ? Math.min(5, (existing?.leitnerBox ?? 1) + 1)
    : 1
  const interval = LEITNER_INTERVAL_DAYS[box - 1] ?? 1

  return {
    scenarioId,
    attempts,
    passes,
    bestScore,
    lastPlayedAt: now,
    leitnerBox: box as ScenarioStats['leitnerBox'],
    dueAt: now + interval * DAY_MS,
  }
}

/* ------------------------------------------------------------- debriefs */

export async function loadDebrief(sessionId: string): Promise<DebriefView | null> {
  const db = await database()
  const session = await db.sessions.findById(sessionId)
  if (!session) {
    return null
  }
  const score = await db.scores.findBySession(sessionId)
  if (!score) {
    return null
  }

  const ticket = await db.tickets.findById(session.ticketId)
  if (!ticket) {
    return null
  }

  const generated = rebuildTicket(ticket)
  const stored = score.rubric as unknown as EvaluationResult
  const closure = CLOSURE_CODES.find((entry) => entry.code === session.resolution)
  const decision: SessionDecision = {
    outcome: closure?.outcome ?? 'resolved',
    code: session.resolution ?? 'resolved-remote',
    note: '',
  }

  return {
    sessionId,
    ticket: toTicketView(ticket),
    decision,
    total: score.total,
    passed: score.passed,
    band: score.band,
    xp: stored.xp ?? 0,
    criticalFailures: stored.criticalFailures ?? [],
    feedback: stored.feedback ?? [],
    items: stored.items ?? [],
    categoryScores:
      stored.categoryScores ??
      ({
        diagnosis: { earned: 0, possible: 0 },
        documentation: { earned: 0, possible: 0 },
        resolution: { earned: 0, possible: 0 },
        safety: { earned: 0, possible: 0 },
      } satisfies Record<RubricCategory, CategoryScore>),
    reference: generated.reference.map(describeReference),
    endedAt: session.endedAt ?? score.computedAt,
  }
}

/* -------------------------------------------------------------- progress */

const CATEGORY_LABELS: Record<RubricCategory, string> = {
  diagnosis: 'diagnosis and evidence',
  documentation: 'notes and handoff',
  resolution: 'the fix and closure decision',
  safety: 'safety checks',
}

const WEAK_TOPIC_THRESHOLD = 90
const MAX_WEAK_TOPICS = 2

/**
 * Families are ranked by average score, then by pass rate, so the suggestion is
 * driven by what was actually scored rather than by how often it was tried.
 */
export function computeWeakTopics(history: readonly ScoreHistoryEntry[]): WeakTopic[] {
  const byScenario = new Map<string, ScoreHistoryEntry[]>()
  for (const entry of history) {
    const existing = byScenario.get(entry.scenarioId)
    if (existing) {
      existing.push(entry)
    } else {
      byScenario.set(entry.scenarioId, [entry])
    }
  }

  const topics: WeakTopic[] = []

  for (const [scenarioId, entries] of byScenario) {
    const attempts = entries.length
    const averageScore = Math.round(
      entries.reduce((total, entry) => total + entry.total, 0) / attempts,
    )
    const passRate = Math.round(
      (entries.filter((entry) => entry.passed).length / attempts) * 100,
    )

    const totals: Record<RubricCategory, { earned: number; possible: number }> = {
      diagnosis: { earned: 0, possible: 0 },
      documentation: { earned: 0, possible: 0 },
      resolution: { earned: 0, possible: 0 },
      safety: { earned: 0, possible: 0 },
    }

    for (const entry of entries) {
      if (!entry.categoryScores) {
        continue
      }
      for (const category of Object.keys(totals) as RubricCategory[]) {
        totals[category].earned += entry.categoryScores[category].earned
        totals[category].possible += entry.categoryScores[category].possible
      }
    }

    let weakestCategory: WeakTopic['weakestCategory'] = null
    for (const category of Object.keys(totals) as RubricCategory[]) {
      const score = totals[category]
      if (score.possible === 0) {
        continue
      }
      const percent = Math.round((score.earned / score.possible) * 100)
      if (!weakestCategory || percent < weakestCategory.percent) {
        weakestCategory = {
          category,
          label: CATEGORY_LABELS[category],
          earned: score.earned,
          possible: score.possible,
          percent,
        }
      }
    }

    const recommendation =
      weakestCategory && weakestCategory.percent < 100
        ? `You lose the most marks on ${weakestCategory.label}. Practise a ${scenarioId} ticket and work on that before retrying.`
        : `Your average is ${averageScore}. Retry a ${scenarioId} ticket to keep the pattern fresh.`

    topics.push({
      scenarioId,
      scenarioTitle: titleFor(scenarioId),
      attempts,
      averageScore,
      passRate,
      weakestCategory,
      recommendation,
    })
  }

  return topics
    .filter((topic) => topic.averageScore < WEAK_TOPIC_THRESHOLD)
    .sort(
      (left, right) =>
        left.averageScore - right.averageScore ||
        left.passRate - right.passRate ||
        right.attempts - left.attempts,
    )
    .slice(0, MAX_WEAK_TOPICS)
}

export async function loadProgress(): Promise<ProgressView> {
  const db = await database()
  const [stats, history] = await Promise.all([db.progress.list(), db.scores.listHistory()])
  const rows: ProgressRow[] = stats.map((entry) => ({
    scenarioId: entry.scenarioId,
    scenarioTitle: titleFor(entry.scenarioId),
    attempts: entry.attempts,
    passes: entry.passes,
    bestScore: entry.bestScore,
    lastPlayedAt: entry.lastPlayedAt,
    leitnerBox: entry.leitnerBox,
    dueAt: entry.dueAt,
  }))

  const attempts = rows.reduce((total, row) => total + row.attempts, 0)
  const passes = rows.reduce((total, row) => total + row.passes, 0)
  const bestScore = rows.reduce((best, row) => Math.max(best, row.bestScore), 0)
  const averageBest =
    rows.length === 0
      ? 0
      : Math.round(rows.reduce((total, row) => total + row.bestScore, 0) / rows.length)

  return {
    attempts,
    passes,
    bestScore,
    averageBest,
    rows,
    weakTopics: computeWeakTopics(history),
  }
}

const SCENARIO_TITLES: Record<string, string> = {
  'PWD-01': 'Password and account access',
  'NET-01': 'Network and name resolution',
  'DHCP-01': 'DHCP scopes and addresses',
  'M365-01': 'Microsoft 365 sign-in',
  'FS-01': 'Shared drives and permissions',
  'PRN-01': 'Printing and the spooler',
}

function titleFor(scenarioId: string): string {
  return SCENARIO_TITLES[scenarioId] ?? scenarioId
}

/* ------------------------------------------------------------------ misc */

export function formatSimClock(clock: number): string {
  return new Date(clock).toISOString().slice(11, 16)
}

export function rubricSummary(rubric: Rubric): { items: number; totalWeight: number } {
  return {
    items: rubric.items.length,
    totalWeight: rubric.items.reduce((total, item) => total + item.weight, 0),
  }
}
