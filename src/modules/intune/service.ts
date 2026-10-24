import { applyDeviceAction, type DeviceActionOutcome, type DeviceActionRequest } from './logic/actions'
import type { IntuneStore } from './persistence/store'
import { findIntuneTemplate } from './tickets/registry'
import { scoreIntuneAttempt, type IntuneScore } from './tickets/scoring'
import { isIntuneTicketComplete } from './tickets/registry'
import type { DeviceAction, IntuneEvent, IntuneState } from './types'

export interface ActResult {
  state: IntuneState
  outcome: DeviceActionOutcome
}

export interface ScoreResult {
  state: IntuneState
  score: IntuneScore
}

/**
 * The module's use cases, written against the store rather than against a page.
 *
 * Every method returns the whole estate after the change, because every screen in
 * a console is a view of the same estate and a stale copy in one tab is how two
 * people disagree about what a device says.
 */
export class IntuneService {
  private readonly store: IntuneStore
  private readonly clock: () => number

  constructor(store: IntuneStore, clock: () => number = () => Date.now()) {
    this.store = store
    this.clock = clock
  }

  async load(): Promise<IntuneState> {
    return this.store.ensureSeeded(this.clock())
  }

  async act(
    request: Omit<DeviceActionRequest, 'now'>,
  ): Promise<ActResult> {
    const state = await this.load()
    const outcome = applyDeviceAction(state, { ...request, now: this.clock() })
    const device = outcome.state.devices.find((entry) => entry.id === request.deviceId)
    if (device && outcome.status !== 'refused') {
      await this.store.saveDevice(device)
    }
    await this.store.appendEvent(outcome.event)
    return { state: outcome.state, outcome }
  }

  /** Everything done to a device since an attempt started, oldest first. */
  private eventsSince(
    state: IntuneState,
    deviceId: string,
    startedAt: number,
  ): IntuneEvent[] {
    return state.events.filter(
      (event) =>
        event.deviceId === deviceId &&
        event.at >= startedAt &&
        event.outcome !== 'refused',
    )
  }

  /**
   * Whether the record was read before the first fix. A read after the change is
   * still a read, but it is not diagnostic work: the decision had been made.
   */
  private readBeforeFix(events: readonly IntuneEvent[]): boolean {
    const firstFix = events.findIndex((event) => event.action !== 'review')
    const before = firstFix < 0 ? events : events.slice(0, firstFix)
    return before.some((event) => event.action === 'review')
  }

  /**
   * Reads the record without changing anything. The console has no read action
   * to run, so this is the step that records having looked: it writes an event
   * and hands back the state the learner would have seen, which is what the
   * diagnosis category is scored from.
   */
  async review(deviceId: string): Promise<{ state: IntuneState; summary: string }> {
    const state = await this.load()
    const device = state.devices.find((entry) => entry.id === deviceId)
    if (!device) {
      throw new Error(`Unknown device: ${deviceId}`)
    }

    const summary =
      device.complianceReasons.length > 0
        ? `${device.name}: ${device.compliance} — ${device.complianceReasons.join('; ')}.`
        : `${device.name}: ${device.compliance} — every applicable rule passes.`
    const event: IntuneEvent = {
      id: Math.max(0, ...state.events.map((entry) => entry.id)) + 1,
      deviceId: device.id,
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
    const template = findIntuneTemplate(templateId)
    if (!template) {
      throw new Error(`Unknown Intune ticket: ${templateId}`)
    }
    const state = await this.load()
    const device = state.devices.find((entry) => entry.id === template.deviceId)
    if (!device) {
      throw new Error(`The ticket's device is not in the estate: ${template.deviceId}`)
    }

    const events = this.eventsSince(state, device.id, startedAt)
    const score = scoreIntuneAttempt(template, {
      device,
      state,
      actions: events
        .filter((event) => event.action !== 'review')
        .map((event) => event.action as DeviceAction),
      reviewedBeforeFix: this.readBeforeFix(events),
    })
    const finishedAt = this.clock()
    await this.store.saveAttempt({
      id: `${templateId}:${startedAt}`,
      templateId,
      deviceId: device.id,
      startedAt,
      finishedAt,
      score: score.total,
      scoreJson: JSON.stringify(score),
    })
    return { state, score }
  }

  async attempts(): Promise<Awaited<ReturnType<IntuneStore['attempts']>>> {
    return this.store.attempts()
  }

  /** Puts the estate back to a fresh install: a rehearsal needs its start state. */
  async reset(): Promise<IntuneState> {
    return this.store.reset(this.clock())
  }

  /** The registry's completion check, exposed for the queue's own list. */
  isComplete(templateId: string, state: IntuneState): boolean {
    return isIntuneTicketComplete(templateId, state)
  }
}

export type { IntuneScore }
