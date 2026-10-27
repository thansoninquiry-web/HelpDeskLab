import type { Tutorial } from '../../shared/TutorialPage'

/**
 * The school desk's tutorial.
 *
 * The example is a projector with no signal because it contains every part of
 * the pack in miniature: a bell, a caller, a read that settles the fault, a
 * small change and a note the teacher can use.
 */
export const ACADEMY_TUTORIAL: Tutorial = {
  surface: 'Education IT',
  title: 'Run a school visit before the bell',
  lede: 'One technician, twenty-five scenarios and a bell. A school desk is judged on a different axis from a service desk: the room has to work when the class walks in, and the teacher has to understand what happened.',
  minutes: 11,
  before: [
    'Larkspur Academy is invented. Every pupil, teacher, room, address and machine in the pack is fictional; no real school data is stored.',
    'The clock is part of the score. Every read and change costs minutes, and the visit writes the minute it happened, so a page left open overnight scores the same as one finished in a sitting.',
    'The caller conversation and the onsite checklist are scored too. There is no way to reach 100 by only fixing the machine.',
  ],
  steps: [
    {
      title: 'Read the bell before the room',
      action:
        'Open a scenario and look at the clock. Note how long the visit has, which period it is, and choose **Standard visit** or **Time pressure** before the first action. The mode is fixed once you start.',
      why: 'The bell decides what “good enough” means. Standard gives reads 2 minutes and changes 3 with a 10-minute grace; time pressure gives 3 and 5 with no grace and loses urgency twice as fast. Choosing it deliberately is the first decision of the visit.',
      link: { to: '/academy', label: 'Open the desk' },
    },
    {
      title: 'Read the room before you change it',
      action:
        'Work through the reads on the left: the projector status, the cable and input, the account record, the imaging report, the switch port — whichever the scenario offers. Read until one of them explains the symptom.',
      why: 'The decisive reads are the diagnosis marks, and a change made before any of them fails the read-before-touch gate outright. On a projector that is the status page and the cable; on a lockout it is the account state — locked and expired are two different facts.',
      link: { to: '/academy/cases/projector-no-signal', label: 'Try the projector case' },
    },
    {
      title: 'Talk to the caller like a person',
      action:
        'Answer both steps of the conversation. Choose the plain reply — name what you are about to do, ask the one question that narrows it, and be honest about what happens next. For a Spanish-first caller, use the gloss or the phrasebook if you need it.',
      why: 'Technician’s language and a brush-off are both scored down. The caller is standing next to the fault with a class arriving; a plain answer is what lets them decide whether to wait or move the lesson. Eight callers in the pack open in Spanish.',
      link: { to: '/academy/phrases', label: 'Open the Spanish phrasebook' },
    },
    {
      title: 'Answer the door if someone knocks',
      action:
        'On five scenarios a walk-up arrives after two actions. Choose help now, hand off, or decline — and read the minutes each one costs.',
      why: 'A walk-up is triage, not a second ticket. The reference answer solves both rooms: a charged spare for the pupil, Lab B for the exam, a logged exception for the video request. Ignoring the door loses the triage marks and leaves someone standing there.',
    },
    {
      title: 'Make the change the room needs',
      action:
        'Apply the changes the evidence calls for, in the order that makes each one hold — reseat then select the input, roll the image back then reimage the stragglers. Leave the tempting shortcuts alone.',
      why: 'The action list also offers the mistakes on purpose: disabling the web filter, sharing an admin password, putting a staff machine on the student VLAN, giving a teacher local admin. Any of those fails the attempt however the room ends up.',
    },
    {
      title: 'Pack, check, note, follow up',
      action:
        'Tick the kit and the safety check, write the visit note, and book the follow-up. The note has to name the room, the fault, the change and what the teacher should watch for.',
      why: 'The onsite checklist is 12 points of the score and the note is read for content, not length. A teacher who knows what to watch for calls you before the next lesson is lost; a note that says “fixed projector” tells nobody anything.',
      link: { to: '/academy/onsite', label: 'Read the onsite checklist' },
    },
    {
      title: 'Close before the bell, and read the debrief',
      action:
        'Check the visit. Read the four category scores, the urgency line and the deductions, then retry with the weakest category in mind.',
      why: 'Finishing inside the bell is worth 10 points, and the debrief names the minutes you lost and why. The categories — diagnosis, communication and notes, resolution, safety — join the app’s progress, so the next visit can be chosen to practice the weak one.',
    },
  ],
  scoring: [
    {
      label: '20 · Diagnosis',
      detail: '14 for the decisive reads taken before the first change, 6 for reading before touching.',
    },
    {
      label: '20 · Communication and notes',
      detail: '10 for the caller conversation, 6 for the visit note, 4 for the follow-up.',
    },
    {
      label: '48 · Resolution',
      detail:
        '28 for the reference changes in order, 10 for the room actually working, 10 for finishing before the bell.',
    },
    {
      label: '12 · Safety',
      detail:
        '2 for the kit, 2 for the safety check, 4 for the walk-up, 4 for making no unneeded change.',
    },
  ],
  mistakes: [
    'Disabling the web filter to unblock one site. Recategorise it, or scope a testing exception.',
    'Sharing an admin password, or making a teacher a local admin, to save a trip.',
    'Setting a static address because DHCP is exhausted. Widen the range and reserve the cart.',
    'Replacing the projector when the cable is half out and the input is wrong.',
    'Answering the caller in jargon, then wondering where the communication marks went.',
    'Leaving the walk-up at the door while finishing the ticket in front of you.',
  ],
  practice: {
    to: '/academy/cases/projector-no-signal',
    label: 'Open the projector visit',
    note: 'A Spanish-first caller, a bell in thirty minutes and a fault two reads can settle. It is the shortest complete visit in the pack.',
  },
  home: { to: '/academy', label: 'Back to the desk' },
}
