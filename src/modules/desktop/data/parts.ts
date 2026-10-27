import type { BenchPart, PartId } from '../types'

/**
 * The bench machine, part by part.
 *
 * One desktop and one laptop, because the faults that matter differ by shape: a
 * desktop has a power supply and a CMOS battery on the board, a laptop has a
 * battery, a charger and a panel. Every part names the test that tells a learner
 * whether it is good, so the diagram and the console cannot disagree about what
 * "test the PSU" means.
 */
export const PARTS: readonly BenchPart[] = [
  {
    id: 'psu',
    name: 'Power supply',
    area: 'case',
    role: 'Turns mains into the 3.3 V, 5 V and 12 V rails the board and drives need.',
    test: 'psu',
    failure: 'No fans, no lights, no POST — and the board never gets a standby rail.',
  },
  {
    id: 'motherboard',
    name: 'Motherboard',
    area: 'case',
    role: 'Carries the CPU, memory, slots and the connections to everything else.',
    test: 'post',
    failure: 'Nothing at all, or a POST that stops before it names a device.',
  },
  {
    id: 'cpu',
    name: 'Processor',
    area: 'case',
    role: 'Runs the machine; the cooler on top of it is what keeps it running.',
    test: 'temp',
    failure: 'POST stops early, or the machine throttles and shuts down under load.',
  },
  {
    id: 'ram-1',
    name: 'Memory, slot 1',
    area: 'case',
    role: 'The first module: working memory for everything the machine runs.',
    test: 'memtest',
    failure: 'Blue screens, failed memory tests, or a POST that beeps instead of starting.',
  },
  {
    id: 'ram-2',
    name: 'Memory, slot 2',
    area: 'case',
    role: 'The second module: the pair runs in dual channel when both are seated.',
    test: 'memtest',
    failure: 'Half the memory missing from the report, or a beep code at power-on.',
  },
  {
    id: 'gpu',
    name: 'Graphics card',
    area: 'case',
    role: 'Draws the display; the monitor cable is plugged into it, not the board.',
    test: 'display',
    failure: 'No picture on a machine that otherwise starts, or artefacts on screen.',
  },
  {
    id: 'cooler',
    name: 'Cooler and fans',
    area: 'case',
    role: 'Moves heat off the processor and out of the case.',
    test: 'temp',
    failure: 'Loud fans, a hot case, and shutdowns after a few minutes of work.',
  },
  {
    id: 'cmos',
    name: 'CMOS battery',
    area: 'case',
    role: 'Keeps the clock and the firmware settings alive when the machine is off.',
    test: 'cmos',
    failure: 'Clock resets, the date is years out, and the machine asks for Setup at boot.',
  },
  {
    id: 'storage',
    name: 'Drive',
    area: 'case',
    role: 'Holds Windows, the programs and the user data on the machine.',
    test: 'smart',
    failure: 'Slow boots, SMART warnings, clicks, or a drive that disappears.',
  },
  {
    id: 'battery',
    name: 'Laptop battery',
    area: 'laptop',
    role: 'Runs the laptop when the charger is not connected.',
    test: 'battery',
    failure: 'The machine dies the moment it is unplugged, or the pack swells.',
  },
  {
    id: 'charger',
    name: 'Charger',
    area: 'laptop',
    role: 'Feeds the laptop and charges the battery through the barrel or USB-C port.',
    test: 'charger',
    failure: 'No charging light, no charge, and the machine only runs on a charged pack.',
  },
  {
    id: 'screen',
    name: 'Panel',
    area: 'laptop',
    role: 'The display and the ribbon cable that carries the picture to it.',
    test: 'display',
    failure: 'Cracks, lines, or a picture that changes when the lid is moved.',
  },
  {
    id: 'keyboard',
    name: 'Keyboard',
    area: 'laptop',
    role: 'The built-in keyboard, on the same ribbon as the trackpad.',
    test: 'keyboard',
    failure: 'Keys that do not register, or a whole row that types nothing.',
  },
]

export const PART_BY_ID: Readonly<Record<PartId, BenchPart>> = Object.fromEntries(
  PARTS.map((part) => [part.id, part]),
) as Record<PartId, BenchPart>

export function partById(id: string): BenchPart | undefined {
  return (PART_BY_ID as Record<string, BenchPart | undefined>)[id]
}

/** The desktop's parts, in the order the diagram lays them out. */
export const DESKTOP_PARTS: readonly PartId[] = [
  'psu',
  'motherboard',
  'cpu',
  'ram-1',
  'ram-2',
  'gpu',
  'cooler',
  'cmos',
  'storage',
]

/** The laptop's parts: the ones a desk can actually get at. */
export const LAPTOP_PARTS: readonly PartId[] = [
  'battery',
  'charger',
  'screen',
  'keyboard',
  'ram-1',
  'ram-2',
  'storage',
  'cooler',
]
