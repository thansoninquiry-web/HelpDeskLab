import type { AcademyArea, SchoolScenario } from '../types'
import { ASSET_SCENARIOS } from './assets'
import { CLASSROOM_SCENARIOS } from './classroom'
import { LAB_SCENARIOS } from './lab'
import { NETWORK_SCENARIOS } from './network'
import { OFFICE_SCENARIOS } from './office'

/**
 * Every scenario the Larkspur desk offers, in the order the queue shows them.
 *
 * Grouped by where the work is rather than by difficulty, because that is how a
 * school day arrives: classroom first bell, then the lab, then the office.
 */
export const SCENARIOS: readonly SchoolScenario[] = [
  ...CLASSROOM_SCENARIOS,
  ...LAB_SCENARIOS,
  ...OFFICE_SCENARIOS,
  ...NETWORK_SCENARIOS,
  ...ASSET_SCENARIOS,
]

export const SCENARIO_BY_ID: Readonly<Record<string, SchoolScenario>> = Object.fromEntries(
  SCENARIOS.map((scenario) => [scenario.id, scenario]),
)

export function scenarioById(id: string): SchoolScenario | undefined {
  return SCENARIO_BY_ID[id]
}

export const AREA_ORDER: readonly AcademyArea[] = [
  'classroom',
  'lab',
  'office',
  'network',
  'assets',
]

export const AREA_LABELS: Readonly<Record<AcademyArea, { label: string; note: string }>> = {
  classroom: {
    label: 'Classrooms and projectors',
    note: 'The first bell is the deadline: a room that is not ready is a lesson lost.',
  },
  lab: {
    label: 'Computer lab',
    note: 'One image, 28 machines, two printers and a testing day.',
  },
  office: {
    label: 'Front office and staff',
    note: 'The public counter: printing, scanning, the filter and the payroll folder.',
  },
  network: {
    label: 'Network and Wi-Fi',
    note: 'One access point per corridor, one scope per building, and the switch port nobody meant to disable.',
  },
  assets: {
    label: 'Assets, moves and loaners',
    note: 'Machines that move rooms, tags that stop matching, and loans that have to come back.',
  },
}

export function scenariosIn(area: AcademyArea): readonly SchoolScenario[] {
  return SCENARIOS.filter((scenario) => scenario.area === area)
}

/** The caller scenarios where the caller opens in Spanish. */
export function spanishFirstScenarios(): readonly SchoolScenario[] {
  return SCENARIOS.filter((scenario) => scenario.caller.language === 'es')
}
