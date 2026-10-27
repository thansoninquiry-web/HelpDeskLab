import type { Caller } from '../types'

/**
 * Larkspur Academy, as the desk sees it.
 *
 * A small K-12 school: a front office, a staff room, twelve classrooms with a
 * projector or a panel in each, one computer lab, a rolling laptop cart, and the
 * people who call. Every name and room here is invented for the pack; nothing is
 * drawn from a real school.
 */

export interface SchoolRoom {
  id: string
  name: string
  floor: string
  use: string
  kit: readonly string[]
}

export const SCHOOL: {
  name: string
  kind: string
  students: number
  staff: number
  about: string
} = {
  name: 'Larkspur Academy',
  kind: 'K–12 school · 2 sites, one campus of record',
  students: 410,
  staff: 46,
  about:
    'A small school with one IT technician on site. Classes start on the bell, the front office is the public face of the school, and the laptop cart is booked out to whichever year needs it.',
}

export const ROOMS: readonly SchoolRoom[] = [
  {
    id: 'room-3',
    name: 'Room 3 · Year 2',
    floor: 'Ground floor',
    use: 'Classroom',
    kit: ['Projector (HDMI)', 'Teacher laptop', 'Interactive panel'],
  },
  {
    id: 'room-7',
    name: 'Room 7 · Science',
    floor: 'First floor',
    use: 'Classroom',
    kit: ['Projector (VGA + HDMI)', 'Teacher laptop', 'Ceiling speakers'],
  },
  {
    id: 'room-12',
    name: 'Room 12 · Year 6',
    floor: 'First floor',
    use: 'Classroom',
    kit: ['Interactive panel', 'Teacher laptop', '4 pupil PCs'],
  },
  {
    id: 'lab-a',
    name: 'Lab A',
    floor: 'Ground floor',
    use: 'Computer lab',
    kit: ['28 PCs', '2 shared printers', '1 access point', 'Whiteboard'],
  },
  {
    id: 'office',
    name: 'Front office',
    floor: 'Ground floor',
    use: 'Administration',
    kit: ['3 PCs', 'Multifunction printer', 'Visitor sign-in tablet'],
  },
  {
    id: 'staff-room',
    name: 'Staff room',
    floor: 'Ground floor',
    use: 'Staff',
    kit: ['2 PCs', 'Shared printer', 'Access point'],
  },
  {
    id: 'cart',
    name: 'Laptop cart · 16 machines',
    floor: 'Roaming',
    use: 'Rolling cart',
    kit: ['16 laptops', '16 chargers', 'Charge controller'],
  },
]

export interface SchoolPerson extends Caller {
  room: string
  note: string
}

export const PEOPLE: readonly SchoolPerson[] = [
  {
    name: 'Marisol Ortega',
    role: 'Year 4 teacher',
    language: 'es',
    room: 'Room 9',
    note: 'Spanish-first; happy to use English for the ticket, but explains a fault faster in Spanish.',
  },
  {
    name: 'Daniel Whitfield',
    role: 'Year 6 teacher',
    language: 'en',
    room: 'Room 12',
    note: 'Knows the panel well; will have tried the obvious cable things before calling.',
  },
  {
    name: 'Priya Raman',
    role: 'Front office administrator',
    language: 'en',
    room: 'Front office',
    note: 'Runs the phones, the visitor log and the school\'s printing; the busiest caller on the desk.',
  },
  {
    name: 'Tom Barrow',
    role: 'Site manager',
    language: 'en',
    room: 'Site office',
    note: 'Owns the ladders, the power and the door codes. Escalate safety to him, not around him.',
  },
  {
    name: 'Aisha Bello',
    role: 'Science teacher',
    language: 'en',
    room: 'Room 7',
    note: 'Runs practicals, so a room that is not ready is a lesson lost.',
  },
  {
    name: 'Rosa Delgado',
    role: 'Parent volunteer',
    language: 'es',
    room: 'Front office',
    note: 'Collects a loaner for a pupil; not the pupil, so verify who she is before handing it over.',
  },
]

/** The org profile's headline numbers, shown on the desk page. */
export function schoolStats(): readonly { label: string; value: string }[] {
  return [
    { label: 'Pupils', value: String(SCHOOL.students) },
    { label: 'Staff', value: String(SCHOOL.staff) },
    { label: 'Rooms on the estate', value: String(ROOMS.length) },
    { label: 'Classrooms', value: String(ROOMS.filter((room) => room.use === 'Classroom').length) },
    { label: 'Lab machines', value: '28' },
    { label: 'Laptops on the cart', value: '16' },
    { label: 'Technicians on site', value: '1' },
  ]
}
