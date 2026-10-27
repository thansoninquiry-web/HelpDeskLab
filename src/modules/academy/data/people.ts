/**
 * A school's invented staff list, extended for the caller scenarios.
 *
 * Kept with the school so the desk page and the scenarios name the same people.
 */
import type { SchoolPerson } from './school'

export const MORE_PEOPLE: readonly SchoolPerson[] = [
  {
    name: 'Elena Vargas',
    role: 'Year 3 teacher',
    language: 'es',
    room: 'Room 3',
    note: 'Spanish-first. Uses the projector every lesson and knows which input the laptop uses.',
  },
  {
    name: 'Carmen Ruiz',
    role: 'Office administrator',
    language: 'es',
    room: 'Front office',
    note: 'Spanish-first. Runs the counter on her own from 08:00, so a printer down is a queue at the door.',
  },
]
