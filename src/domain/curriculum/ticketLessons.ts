import { CURRICULUM } from './modules'

/**
 * Which course module teaches a console ticket.
 *
 * A console is a working surface, not a course: someone who lives in `/intune`
 * never sees the lesson written for the ticket they just opened. The module
 * already names its tickets (`intuneTemplates`, `azureTemplates`) so the console
 * can point back at the lesson without either side holding a second list.
 *
 * The mapping is total by design — `tests/domain/curriculum/ticketLessons.test.ts`
 * fails if a console ticket has no module — so a `null` here is only possible for
 * an id that is not a ticket.
 */

export type ConsoleKind = 'intune' | 'azure'

export interface TicketLesson {
  moduleId: string
  /** Course number, for the "module 19" the link reads as. */
  number: number
  title: string
  /** The module's lesson page, which carries the worked example and the flow. */
  href: string
}

export function lessonForConsoleTicket(
  kind: ConsoleKind,
  templateId: string,
): TicketLesson | null {
  const module = CURRICULUM.find((entry) =>
    kind === 'intune'
      ? entry.intuneTemplates?.includes(templateId)
      : entry.azureTemplates?.includes(templateId),
  )
  if (!module) return null
  return {
    moduleId: module.id,
    number: module.number,
    title: module.title,
    href: `/modules/${module.id}`,
  }
}

/** Every ticket id a console's modules name, for the coverage check. */
export function consoleTicketIds(kind: ConsoleKind): string[] {
  const ids = new Set<string>()
  for (const module of CURRICULUM) {
    const templates = kind === 'intune' ? module.intuneTemplates : module.azureTemplates
    for (const template of templates ?? []) ids.add(template)
  }
  return [...ids]
}
