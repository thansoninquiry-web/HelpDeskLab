import type { SchoolScenario } from '../types'
import { twoStep } from './dialog'

/**
 * Moves, tags, loans and the cart.
 *
 * The asset work is where a school desk spends its summer: machines that move
 * rooms, tags that stop matching the spreadsheet, and a loaner that has to come
 * back. Each scenario keeps the record and the room in step.
 */
export const ASSET_SCENARIOS: readonly SchoolScenario[] = [
  {
    id: 'move-classroom',
    title: 'Setting up a classroom of twelve PCs',
    area: 'assets',
    difficulty: 3,
    symptom: 'Twelve machines are moving from Room 9 into the new Year 6 room by Monday.',
    report:
      '“The room is ready apart from the computers. They are stacked in the corridor. I need them working for the first lesson on Monday.”',
    subject: 'Room 12 · twelve PCs',
    caller: { name: 'Daniel Whitfield', role: 'Year 6 teacher', language: 'en' },
    bell: { at: 420, label: 'Monday, first lesson at 15:00' },
    window: 120,
    reads: [
      {
        id: 'switch-port',
        finding:
          '12 ports are patched in the new room; 4 are still disabled from the old room’s configuration and 2 negotiate at 100 Mb.',
        decisive: true,
      },
      {
        id: 'inventory-record',
        finding:
          '12 machines are still assigned to Room 9, four with tags that read “R9-xx” and two with no tag at all.',
        decisive: true,
      },
      {
        id: 'image-report',
        finding:
          'Ten machines run the current image; two are three versions behind and one failed its last verification.',
        decisive: true,
      },
    ],
    changes: ['image-and-stage', 'tag-asset', 'record-inventory', 'order-new-lab', 'wipe-lab'],
    expected: ['image-and-stage', 'tag-asset', 'record-inventory'],
    dialog: twoStep(
      {
        prompt: '“Can we just plug them in and sort the labels next week?”',
        best: '“We can plug them in today, but the tags and the room record need doing before they go live — otherwise we lose track of them.”',
        jargon: '“Asset reconciliation has to precede the cutover.”',
        brusque: '“That’s how machines get lost.”',
      },
      {
        prompt: '“How long will twelve take?”',
        best: '“I’ll stage them in batches of four, test each batch on its drop, and have the room ready by Friday afternoon.”',
        jargon: '“Four chassis per wave, with a verification pass per wave.”',
        brusque: '“A while.”',
      },
    ),
    hints: [
      'A move is three jobs: the machine, the room’s network, and the record. Read all three before you start.',
      'Four ports are disabled, two machines are behind on the image, and every machine is still assigned to Room 9.',
      'Image and stage the machines, tag them, and move the record to Room 12. Ordering new machines is not a move.',
    ],
    explanation: [
      'A classroom move fails at the edges: a port nobody enabled, a machine nobody reimaged, a spreadsheet nobody updated. The three reads are the three edges.',
      'Do the work in batches and prove each batch on its own drop. That is how a room of twelve is finished by Friday instead of half-working on Monday.',
    ],
    verifyText: 'All twelve machines are imaged, tagged, on live ports, and recorded in Room 12.',
  },
  {
    id: 'asset-tagging',
    title: 'The asset register does not match the school',
    area: 'assets',
    difficulty: 2,
    symptom: 'Sixty-three machines have no tag and seven tags are duplicated.',
    report:
      '“The audit is next month and the spreadsheet is a mess. Some of the labels have fallen off, and two machines have the same number.”',
    subject: 'Whole estate · asset register',
    caller: { name: 'Priya Raman', role: 'Front office administrator', language: 'en' },
    bell: { at: 450, label: 'The audit is at 15:30' },
    window: 120,
    reads: [
      {
        id: 'inventory-record',
        finding:
          '63 machines have no tag, 7 tags appear twice, and 11 records point at rooms that no longer hold a machine.',
        decisive: true,
      },
      {
        id: 'image-report',
        finding:
          'The imaging agent knows 71 machines by name; the register lists 84. The difference is machines retired but never removed.',
        decisive: true,
      },
      {
        id: 'room-schedule',
        finding: 'The lab is free after 15:00, so the physical check can follow the register work.',
      },
    ],
    changes: ['tag-asset', 'record-inventory', 'order-new-lab', 'wipe-lab'],
    expected: ['tag-asset', 'record-inventory'],
    dialog: twoStep(
      {
        prompt: '“Can I just delete the duplicate rows and be done?”',
        best: '“Deleting the rows hides the machines. I’ll tag the unlabelled ones, then reconcile each duplicate against the room it is in.”',
        jargon: '“We need a physical reconciliation before the register can be authoritative.”',
        brusque: '“That would make the audit worse.”',
      },
      {
        prompt: '“Do you need to touch every machine?”',
        best: '“Every machine without a tag, yes. The rest I can reconcile from the room lists and spot-check.”',
        jargon: '“A sampled verification for tagged assets, a full pass for untagged.”',
        brusque: '“That’s the job.”',
      },
    ),
    hints: [
      'The register is wrong in more than one way. Read it and count the kinds of error.',
      'Sixty-three untagged, seven duplicated, eleven pointing at rooms that no longer hold the machine.',
      'Tag the unlabelled machines and reconcile the register; do not delete rows to make the numbers look right.',
    ],
    explanation: [
      'An asset register is only useful if it matches the building. Duplicated tags are worse than missing ones, because they make two machines look like one.',
      'Tagging and reconciliation fix the cause. Deleting rows fixes the spreadsheet and loses the machine.',
    ],
    verifyText: 'Every machine has one unique tag and the register matches the rooms.',
  },
  {
    id: 'loaner-checkout',
    title: 'A loaner laptop for a pupil',
    area: 'assets',
    difficulty: 1,
    symptom: 'A parent asks for a loan laptop while the pupil is in class.',
    report:
      '“Soy la madre de Amina, en 5.º. Su portátil está en el taller. ¿Puedo llevarme uno de préstamo?”',
    subject: 'Front office · loaner shelf',
    caller: { name: 'Rosa Delgado', role: 'Parent volunteer', language: 'es' },
    bell: { at: 25, label: 'Period 1 starts at 08:25' },
    window: 20,
    reads: [
      {
        id: 'inventory-record',
        finding:
          'Loaner L-14 is ready on the shelf with a charger. The pupil named Amina Okafor is in Year 5 and has no open loan.',
        decisive: true,
      },
      {
        id: 'loan-record',
        finding:
          'The loan register has no entry for Amina. The last loan to her was returned in September, with its charger.',
        decisive: true,
      },
      {
        id: 'room-schedule',
        finding: 'Year 5 is in Room 12 until 09:10; the parent is at the counter now.',
      },
    ],
    changes: ['check-out-loaner', 'hand-over-charger', 'book-return', 'give-admin-rights'],
    expected: ['check-out-loaner', 'hand-over-charger', 'book-return'],
    dialog: twoStep(
      {
        prompt: '“¿Necesita algo más? Tengo prisa.”',
        gloss: '“Do you need anything else? I’m in a hurry.”',
        best: '“Solo un minuto: apunto el portátil, el cargador y la fecha de devolución a nombre de Amina.”',
        bestGloss:
          '“Just a minute: I’ll record the laptop, the charger and the return date under Amina’s name.”',
        jargon: '“I need to create the loan record against the pupil account.”',
        brusque: '“You can’t just take it.”',
      },
      {
        prompt: '“¿Cuándo tengo que devolverlo?”',
        gloss: '“When do I have to bring it back?”',
        best: '“El viernes, cuando el suyo esté reparado. Se lo apunto en el resguardo y aviso a la tutora.”',
        bestGloss:
          '“Friday, when hers is repaired. I’ll put it on the receipt and tell her teacher.”',
        jargon: '“The loan term defaults to the repair turnaround.”',
        brusque: '“Whenever it’s fixed.”',
      },
    ),
    hints: [
      'A loan is a machine leaving the building. Read the shelf and the loan record before you hand anything over.',
      'L-14 is ready with a charger, and Amina has no open loan. The parent is not the pupil, so the record goes in the pupil’s name.',
      'Book it out, hand over the charger, and agree the return date. Never give admin rights as a favour.',
    ],
    explanation: [
      'The counter is where assets disappear. The record — pupil, machine, charger, date — is what makes the loan recoverable, and the parent at the desk is not the borrower of record.',
      'All three steps matter: a machine without its charger comes back dead, and a loan without a return date never comes back at all.',
    ],
    verifyText: 'The loan is recorded to the pupil with its charger and a return date, and the shelf agrees.',
  },
  {
    id: 'loaner-return',
    title: 'A loaner comes back with a cracked screen',
    area: 'assets',
    difficulty: 2,
    symptom: 'A returned loaner has a cracked panel and no charger in the bag.',
    report:
      '“I’m returning this one. The screen cracked when it was in the bag — I don’t know how. The charger is at home.”',
    subject: 'Front office · loaner L-14',
    caller: { name: 'Rosa Delgado', role: 'Parent volunteer', language: 'es' },
    bell: { at: 70, label: 'The next lesson starts at 09:10' },
    window: 25,
    reads: [
      {
        id: 'screen-condition',
        finding:
          'A crack runs from the hinge to the lower third of the panel; the backlight shows through it. The lid does not close square.',
        decisive: true,
      },
      {
        id: 'loan-record',
        finding:
          'L-14 is on loan to Amina Okafor, due today, with charger C-14. The charger is not in the bag.',
        decisive: true,
      },
      {
        id: 'charger-test',
        finding: 'The machine charges from a bench charger; the port is fine. It is the charger that is missing.',
      },
    ],
    changes: ['check-in-loaner', 'record-inventory', 'book-return', 'order-new-lab'],
    expected: ['check-in-loaner', 'record-inventory'],
    dialog: twoStep(
      {
        prompt: '“¿Tengo que pagar la pantalla? No fue culpa mía.”',
        gloss: '“Do I have to pay for the screen? It wasn’t my fault.”',
        best: '“No puedo decidir eso. Apunto el daño y el cargador que falta, y la oficina le dirá qué pasa después.”',
        bestGloss:
          '“I can’t decide that. I’ll record the damage and the missing charger, and the office will tell you what happens next.”',
        jargon: '“The damage assessment goes through the charging policy.”',
        brusque: '“That’s not up to me.”',
      },
      {
        prompt: '“¿Y el cargador? Lo traigo mañana.”',
        gloss: '“And the charger? I’ll bring it tomorrow.”',
        best: '“De acuerdo. Lo apunto como pendiente y le pongo fecha de mañana.”',
        bestGloss: '“That’s fine. I’ll mark it outstanding and put tomorrow’s date on it.”',
        jargon: '“It will be flagged as an incomplete return.”',
        brusque: '“Bring it or we charge you.”',
      },
    ),
    hints: [
      'An intake is evidence first. Look at the machine and read the loan before you decide anything.',
      'The panel is cracked, the charger is missing, and the loan is due today to a named pupil.',
      'Book it back in, record the damage and the missing charger, and put it into repair. You do not decide charges at the counter.',
    ],
    explanation: [
      'A return is the mirror of a loan: the record has to close, and the machine’s state has to change to repair or shelf. Deciding who pays is not the technician’s call.',
      'The missing charger is part of the return. Recording it is what stops it becoming a mystery later, and the bench charger proves the laptop’s port is fine.',
    ],
    verifyText: 'The loan is closed, the damage and missing charger are recorded, and the machine is in repair.',
  },
  {
    id: 'cart-charge',
    title: 'The laptop cart is not charging',
    area: 'assets',
    difficulty: 2,
    symptom: 'Every laptop on the cart is flat in the morning, and the cart’s supply reads zero.',
    report:
      '“We plug it in every night. This morning all sixteen are dead, and the light on the cart is off.”',
    subject: 'Laptop cart · charge controller',
    caller: { name: 'Elena Vargas', role: 'Year 3 teacher', language: 'es' },
    bell: { at: 30, label: 'Period 1 starts at 08:30' },
    window: 20,
    reads: [
      {
        id: 'cart-status',
        finding:
          'All 16 bays report 4%. The supply reads 0 V. The timer is set to “off” and the wall socket is switched off.',
        decisive: true,
      },
      {
        id: 'charger-test',
        finding: 'A bench charger brings one laptop up normally. The laptops and their ports are fine.',
        decisive: true,
      },
      {
        id: 'room-schedule',
        finding: 'Year 3 needs the cart at 09:30 and again after lunch.',
      },
    ],
    changes: ['charge-cart', 'replace-cart-psu', 'order-new-lab', 'wipe-lab'],
    expected: ['charge-cart', 'replace-cart-psu'],
    dialog: twoStep(
      {
        prompt: '“¿Se han roto los portátiles? Todos están muertos.”',
        gloss: '“Are the laptops broken? They’re all dead.”',
        best: '“No, los portátiles están bien. El carro no tiene corriente: la toma está apagada y el temporizador en «off». Voy a revisarlo.”',
        bestGloss:
          '“No, the laptops are fine. The cart has no power: the socket is switched off and the timer is set to off. I’ll check it.”',
        jargon: '“The charge bus has no supply rail.”',
        brusque: '“You didn’t plug it in.”',
      },
      {
        prompt: '“¿Estarán cargados para las 09:30?”',
        gloss: '“Will they be charged by 09:30?”',
        best: '“No todos. Le doy los ocho que cargan más rápido y el resto para después de comer.”',
        bestGloss:
          '“Not all of them. I’ll give you the eight that charge fastest now and the rest after lunch.”',
        jargon: '“Partial charge will be available in the first window.”',
        brusque: '“They’ll be as charged as they are.”',
      },
    ),
    walkUp: {
      id: 'projector-during-cart',
      who: 'A teaching assistant, in the corridor',
      ask: '“Room 2’s projector won’t come on and the class is waiting. Can you come now?”',
      options: [
        {
          id: 'help-now',
          label: 'Leave the cart and go to Room 2 now',
          detail: 'The class starts, and the cart is still flat for Year 3 at 09:30.',
          minutes: 12,
        },
        {
          id: 'finish-cart',
          label: 'Finish the cart, then go to Room 2 with a spare projector',
          detail: 'Twenty minutes, both rooms sorted, and Year 3 gets its laptops.',
          minutes: 6,
          best: true,
        },
        {
          id: 'decline',
          label: 'Tell them to log it and carry on',
          detail: 'No time lost, and Room 2 has no lesson.',
          minutes: 0,
        },
      ],
      note:
        'Two rooms, one technician. The cart is one plug from working and it feeds a lesson at 09:30; Room 2 needs a spare, not a diagnosis at the door. Doing the two-minute job first and arriving with the spare solves both.',
    },
    hints: [
      'All sixteen are equally flat. That points at the cart, not sixteen batteries. Read the controller.',
      'The supply reads 0 V, the socket is off and the timer is set to off.',
      'Restore power and reset the timer, then replace the failed supply. Ordering a new lab is not a diagnosis.',
    ],
    explanation: [
      'When every laptop on a cart is flat, the common factor is the cart. The controller read tells you whether it is the socket, the timer or the supply.',
      'The supply is dead as well as the socket being off, so both have to be dealt with. The laptops themselves are proved fine on a bench charger.',
    ],
    verifyText: 'Every bay on the cart is charging and the timer is set for the overnight window.',
  },
]
