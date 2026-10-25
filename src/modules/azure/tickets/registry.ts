import type { AzureState } from '../types'
import { AZURE_TICKET_TEMPLATES, type AzureTicketTemplate } from './templates'

/**
 * The whole surface this module asks the rest of the app to know about.
 *
 * `registerAzureTicketTemplates` hands the tickets to whatever sink is passed
 * in — today the module's own queue page — and `isAzureTicketComplete` answers
 * the question a ticket system needs: has the work been done? Keeping it to
 * these functions is what makes the module extractable: nothing else in the app
 * imports `templates.ts`, and no Azure id appears in the ticket generator.
 */
export interface AzureTicketSink {
  offer(template: AzureTicketTemplate): void
}

export function registerAzureTicketTemplates(
  sink: AzureTicketSink,
): readonly AzureTicketTemplate[] {
  for (const template of AZURE_TICKET_TEMPLATES) {
    sink.offer(template)
  }
  return AZURE_TICKET_TEMPLATES
}

export function findAzureTemplate(templateId: string): AzureTicketTemplate | undefined {
  return AZURE_TICKET_TEMPLATES.find((template) => template.id === templateId)
}

/**
 * Whether the ticket's work is finished, read from the estate rather than from
 * a flag the learner set. A ticket whose resource has been deleted cannot be
 * done, which is itself a lesson.
 */
export function isAzureTicketComplete(templateId: string, state: AzureState): boolean {
  const template = findAzureTemplate(templateId)
  if (!template) {
    return false
  }
  const resource = state.resources.find((entry) => entry.id === template.resourceId)
  return resource && resource.deleted !== true ? template.verify(resource, state) : false
}

export type { AzureTicketTemplate }
