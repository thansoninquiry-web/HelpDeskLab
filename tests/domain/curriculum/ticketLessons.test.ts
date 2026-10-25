// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { CURRICULUM } from '../../../src/domain/curriculum/modules'
import {
  consoleTicketIds,
  lessonForConsoleTicket,
} from '../../../src/domain/curriculum/ticketLessons'
import { INTUNE_TICKET_TEMPLATES } from '../../../src/modules/intune/tickets/templates'
import { AZURE_TICKET_TEMPLATES } from '../../../src/modules/azure/tickets/templates'

/**
 * The two lists — the console's ticket templates and the course modules that
 * name them — are written in different folders and can drift silently. These
 * checks are the seam: every console ticket has a lesson, every template a
 * module names still exists, and no ticket is claimed by two modules.
 */
describe('console tickets and their lessons', () => {
  it('gives every Intune ticket exactly one module', () => {
    for (const template of INTUNE_TICKET_TEMPLATES) {
      const lesson = lessonForConsoleTicket('intune', template.id)
      expect(lesson, `no module teaches ${template.id}`).not.toBeNull()
      expect(lesson?.href).toBe(`/modules/${lesson?.moduleId}`)
      expect(lesson?.number).toBeGreaterThan(0)
    }
  })

  it('gives every Azure ticket exactly one module', () => {
    for (const template of AZURE_TICKET_TEMPLATES) {
      const lesson = lessonForConsoleTicket('azure', template.id)
      expect(lesson, `no module teaches ${template.id}`).not.toBeNull()
      expect(lesson?.href).toBe(`/modules/${lesson?.moduleId}`)
    }
  })

  it('names no template the console does not have', () => {
    const intune = new Set(INTUNE_TICKET_TEMPLATES.map((template) => template.id))
    const azure = new Set(AZURE_TICKET_TEMPLATES.map((template) => template.id))

    for (const module of CURRICULUM) {
      for (const template of module.intuneTemplates ?? []) {
        expect(intune.has(template), `${module.id} names unknown Intune ticket ${template}`).toBe(
          true,
        )
      }
      for (const template of module.azureTemplates ?? []) {
        expect(azure.has(template), `${module.id} names unknown Azure ticket ${template}`).toBe(true)
      }
    }
  })

  it('keeps the ticket lists in step with the modules', () => {
    const intune = consoleTicketIds('intune').sort()
    const azure = consoleTicketIds('azure').sort()
    expect(intune).toEqual(INTUNE_TICKET_TEMPLATES.map((template) => template.id).sort())
    expect(azure).toEqual(AZURE_TICKET_TEMPLATES.map((template) => template.id).sort())
  })

  it('returns nothing for an id that is not a ticket', () => {
    expect(lessonForConsoleTicket('intune', 'tpl-not-a-ticket')).toBeNull()
    expect(lessonForConsoleTicket('azure', 'tpl-bitlocker-off')).toBeNull()
  })
})
