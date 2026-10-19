import type { ScenarioStats } from '../../src/domain/progress/types'
import type { JobTarget } from '../../src/domain/targets/types'
import type { Score } from '../../src/domain/scoring/types'
import type {
  NewSessionAction,
  Session,
  Ticket,
} from '../../src/domain/tickets/types'

export function makeTicket(overrides: Partial<Ticket> = {}): Ticket {
  return {
    id: 'ticket-1',
    scenarioId: 'NET-01',
    variantId: 'bad-static-dns',
    difficulty: 1,
    seed: 42,
    signature: 'sig-0001',
    publicContent: { subject: 'No internet at the desk', requester: 'Dana Whitfield' },
    createdAt: 1_760_000_000_000,
    status: 'available',
    ...overrides,
  }
}

export function makeSession(ticketId = 'ticket-1', overrides: Partial<Session> = {}): Session {
  return {
    id: 'session-1',
    ticketId,
    startedAt: 1_760_000_100_000,
    endedAt: null,
    world: { clock: 1_760_000_100_000, currentDeviceId: 'lt-4471' },
    hintPolicy: { perHint: 5, cap: 15, budget: 0 },
    closureDraft: null,
    examMode: false,
    resolution: null,
    outcome: null,
    ...overrides,
  }
}

export function makeAction(
  sessionId = 'session-1',
  overrides: Partial<NewSessionAction> = {},
): NewSessionAction {
  return {
    sessionId,
    atMs: 1_760_000_160_000,
    kind: 'command',
    input: { command: 'ipconfig /all' },
    output: { lines: [{ text: 'Windows IP Configuration' }] },
    ...overrides,
  }
}

export function makeScore(sessionId = 'session-1', overrides: Partial<Score> = {}): Score {
  return {
    sessionId,
    total: 88,
    passed: true,
    band: 'pass',
    rubric: { items: [{ id: 'verify-caller', passed: true }] },
    computedAt: 1_760_000_400_000,
    ...overrides,
  }
}

export function makeJobTarget(overrides: Partial<JobTarget> = {}): JobTarget {
  return {
    id: 'target-1',
    company: 'Northwind Support',
    title: 'Tier 1 Service Desk Analyst',
    url: 'https://example.com/jobs/1',
    appliedOn: '2026-10-01',
    status: 'applied',
    rawDescription:
      'Reset passwords, troubleshoot DNS and DHCP, and document every step in the ticketing system.',
    createdAt: 1_760_000_000_000,
    updatedAt: 1_760_000_000_000,
    ...overrides,
  }
}

export function makeStats(
  scenarioId = 'NET-01',
  overrides: Partial<ScenarioStats> = {},
): ScenarioStats {
  return {
    scenarioId,
    attempts: 1,
    passes: 1,
    bestScore: 88,
    lastPlayedAt: 1_760_000_400_000,
    leitnerBox: 2,
    dueAt: 1_760_086_800_000,
    ...overrides,
  }
}
