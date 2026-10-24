import type { IntuneState } from '../types'
import { INTUNE_TICKET_TEMPLATES, type IntuneTicketTemplate } from './templates'

/**
 * The whole surface this module asks the rest of the app to know about.
 *
 * `registerIntuneTicketTemplates` hands the eight tickets to whatever sink is
 * passed in — today the module's own queue page, tomorrow the app's ticket
 * generator — and `isIntuneTicketComplete` answers the one question a ticket
 * system needs: has the work been done? Keeping it to these two functions is what
 * makes the module extractable: nothing else in the app imports `templates.ts`,
 * and no Intune id appears in the ticket generator.
 */
export interface IntuneTicketSink {
  offer(template: IntuneTicketTemplate): void
}

export function registerIntuneTicketTemplates(sink: IntuneTicketSink): readonly IntuneTicketTemplate[] {
  for (const template of INTUNE_TICKET_TEMPLATES) {
    sink.offer(template)
  }
  return INTUNE_TICKET_TEMPLATES
}

export function findIntuneTemplate(templateId: string): IntuneTicketTemplate | undefined {
  return INTUNE_TICKET_TEMPLATES.find((template) => template.id === templateId)
}

/**
 * Whether the ticket's work is finished, read from the estate rather than from a
 * flag the learner set. A ticket with no device in the estate yet cannot be done.
 */
export function isIntuneTicketComplete(templateId: string, state: IntuneState): boolean {
  const template = findIntuneTemplate(templateId)
  if (!template) {
    return false
  }
  const device = state.devices.find((entry) => entry.id === template.deviceId)
  return device ? template.verify(device, state) : false
}

export type { IntuneTicketTemplate }
