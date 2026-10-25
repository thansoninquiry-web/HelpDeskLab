import { applyResourceAction, type ResourceActionOutcome, type ResourceActionRequest } from './logic/actions'
import { diagnose } from './logic/diagnostics'
import type { AzureStore } from './persistence/store'
import { findAzureTemplate, isAzureTicketComplete } from './tickets/registry'
import { scoreAzureAttempt, type AzureScore } from './tickets/scoring'
import type { AzureEvent, AzureState, ResourceAction } from './types'

export interface ActResult {
  state: AzureState
  outcome: ResourceActionOutcome
}

export interface ScoreResult {
  state: AzureState
  score: AzureScore
}

/**
 * The module's use cases, written against the store rather than against a page.
 *
 * Every method returns the whole estate after the change, because every screen
 * in a console is a view of the same estate and a stale copy in one tab is how
 * two people disagree about what a resource says.
 */
export class AzureService {
  private readonly store: AzureStore
  private readonly clock: () => number

  constructor(store: AzureStore, clock: () => number = () => Date.now()) {
    this.store = store
    this.clock = clock
  }

  async load(): Promise<AzureState> {
    return this.store.ensureSeeded()
  }

  async act(request: Omit<ResourceActionRequest, 'now'>): Promise<ActResult> {
    const state = await this.load()
    const outcome = applyResourceAction(state, { ...request, now: this.clock() })
    if (outcome.status !== 'refused') {
      await this.store.saveState(outcome.state)
    }
    await this.store.appendEvent(outcome.event)
    return { state: outcome.state, outcome }
  }

  /** Everything done to a resource since an attempt started, oldest first. */
  private eventsSince(
    state: AzureState,
    resourceId: string,
    startedAt: number,
  ): AzureEvent[] {
    return state.events.filter(
      (event) =>
        event.resourceId === resourceId &&
        event.at >= startedAt &&
        event.outcome !== 'refused',
    )
  }

  /**
   * Whether the record was read before the first change. A read after the change
   * is still a read, but it is not diagnostic work: the decision had been made.
   */
  private readBeforeFix(events: readonly AzureEvent[]): boolean {
    const firstFix = events.findIndex((event) => event.action !== 'review')
    const before = firstFix < 0 ? events : events.slice(0, firstFix)
    return before.some((event) => event.action === 'review')
  }

  /**
   * Reads the record without changing anything. The console has no read action
   * to run, so this is the step that records having looked: it writes an event
   * and hands back the sentence the learner would have seen, which is what the
   * diagnosis category is scored from.
   */
  async review(resourceId: string): Promise<{ state: AzureState; summary: string }> {
    const state = await this.load()
    const resource = state.resources.find((entry) => entry.id === resourceId)
    if (!resource) {
      throw new Error(`Unknown resource: ${resourceId}`)
    }

    const summary = diagnose(resource, state)
    const event: AzureEvent = {
      id: Math.max(0, ...state.events.map((entry) => entry.id)) + 1,
      resourceId: resource.id,
      action: 'review',
      at: this.clock(),
      outcome: 'applied',
      summary,
      notes: [],
    }
    await this.store.appendEvent(event)
    return { state: await this.load(), summary }
  }

  /**
   * Scores an attempt and records it. The attempt id is derived from the ticket
   * and its start, so re-checking the same attempt corrects the row instead of
   * writing a second one.
   */
  async score(templateId: string, startedAt: number): Promise<ScoreResult> {
    const template = findAzureTemplate(templateId)
    if (!template) {
      throw new Error(`Unknown Azure ticket: ${templateId}`)
    }
    const state = await this.load()
    const resource = state.resources.find((entry) => entry.id === template.resourceId)
    if (!resource) {
      throw new Error(`The ticket's resource is not in the estate: ${template.resourceId}`)
    }

    const events = this.eventsSince(state, resource.id, startedAt)
    const score = scoreAzureAttempt(template, {
      resource,
      state,
      actions: events
        .filter((event) => event.action !== 'review')
        .map((event) => event.action as ResourceAction),
      reviewedBeforeFix: this.readBeforeFix(events),
    })
    const finishedAt = this.clock()
    await this.store.saveAttempt({
      id: `${templateId}:${startedAt}`,
      templateId,
      resourceId: resource.id,
      startedAt,
      finishedAt,
      score: score.total,
      scoreJson: JSON.stringify(score),
    })
    return { state, score }
  }

  async attempts(): Promise<Awaited<ReturnType<AzureStore['attempts']>>> {
    return this.store.attempts()
  }

  /** Puts the estate back to a fresh install: a rehearsal needs its start state. */
  async reset(): Promise<AzureState> {
    return this.store.reset()
  }

  /** The registry's completion check, exposed for the queue's own list. */
  isComplete(templateId: string, state: AzureState): boolean {
    return isAzureTicketComplete(templateId, state)
  }
}

export type { AzureScore }
