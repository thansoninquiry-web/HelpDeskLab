import {
  FAILED_RUN_VARIANT,
  HELD_SHELF_VARIANT,
} from '../generator/families/deployment'
import type { ScenarioId } from '../tickets/types'

/**
 * The lesson that opens each playable module.
 *
 * A lesson is deliberately small: the idea in a couple of paragraphs, one worked
 * example the learner can repeat in the simulator, and the tickets the module is
 * judged on. It is reference material, not a walkthrough of a specific variant —
 * the simulator generates a different ticket every time, so the example shows
 * the shape of the work and the reason behind each step.
 *
 * Content lives here rather than in the page so a lesson can be read, compared
 * and tested without a browser, and so a planned module can gain one by being
 * added to the catalog.
 */

export interface LessonStep {
  /** What the desk does, in one line — a command or a control. */
  action: string
  /** Why that step, and what it proves to the next reader. */
  note: string
}

export interface LessonExample {
  title: string
  /** The situation the example starts from. */
  scenario: string
  steps: readonly LessonStep[]
  /** What a good close looks like, and what it is worth on the rubric. */
  result: string
}

/** Where the lesson sends the learner next. Routes stay in the interface. */
export type LessonPractice =
  | {
      kind: 'tickets'
      /**
       * Families listed as ways in. The Practice entry point starts the first
       * one, so it is the family the lesson means a learner to meet first.
       */
      families: readonly ScenarioId[]
      /**
       * Pins the variant the Practice entry point starts. Only set where a
       * random draw could miss the module's requirement — a held shelf for
       * Asset Management, a failed run for Computer Deployment — or the entry
       * point would open a ticket that cannot exercise it.
       */
      variantId?: string
      /**
       * Asks the Practice entry point for a ticket that arrived as a message.
       * The arrival is drawn from the seed, so the ticket is still generated
       * from a seed the queue stores and rebuilds the same way.
       */
      arrival?: 'voicemail'
    }
  | {
      kind: 'intune'
      /**
       * The console ticket the button opens. The queue deep-links to it, so the
       * module starts on the decision it teaches rather than on the list.
       */
      templateId: string
    }
  | {
      kind: 'azure'
      /** The Azure console ticket the Practice button opens. */
      templateId: string
    }
  | { kind: 'targets' }

/**
 * One step of a lesson's checklist: what the learner does, and the evidence
 * that step is meant to leave in the attempt's log. The evidence is the point —
 * a step that leaves nothing behind is a step the rubric cannot see.
 */
export interface LessonFlowStep {
  /** What the desk does, in one line — a control or the command it runs. */
  action: string
  /** What the log should show once that step is done. */
  evidence: string
}

/**
 * The order to work a family in, written as a checklist rather than a story.
 * Optional because not every lesson needs one; it is guidance, not a scored
 * requirement list, and the page says so.
 */
export interface LessonFlow {
  title: string
  intro: string
  steps: readonly LessonFlowStep[]
  /** What has to be in the log before the ticket can be closed. */
  finish: string
}

export interface ModuleLesson {
  /** 1–3 short paragraphs: what the work is and what it costs to get wrong. */
  concept: readonly string[]
  example: LessonExample
  /** A connect-to-close checklist, for a module whose order does the work. */
  flow?: LessonFlow
  practice: LessonPractice
}

function step(action: string, note: string): LessonStep {
  return { action, note }
}

export const MODULE_LESSONS: Readonly<Record<string, ModuleLesson>> = {
  'first-shift': {
    concept: [
      'A ticket is not the work; it is the record of the work. The learner who fixes the machine quietly and closes the ticket without a trace has left the next person with nothing. Everything scored in this lab comes back to that: what did you find, how did you verify it, and what does the record show.',
      'Even the smallest close has three parts. Establish who you are talking to, look before you change, and write the outcome so a stranger could pick it up. The simulator counts each of those separately, so a perfect fix with no verification still loses points.',
    ],
    example: {
      title: 'A lockout, closed cleanly',
      scenario:
        'Marcus cannot sign in after a password change. The ticket names him, the machine, and the caller’s phone line.',
      steps: [
        step(
          'Send the verification code and have the caller read it back',
          'Identity is settled before anything changes. A code on file beats a name on a ticket.',
        ),
        step(
          'Run `get-account mchen`',
          'The directory answers with status and password expiry. Both are evidence; neither is what the ticket says.',
        ),
        step(
          'Run `unlock-account mchen`',
          'One change, scoped to the account the evidence named — not to whoever called.',
        ),
        step(
          'Leave a troubleshooting note, a customer note, and close with a resolution note',
          'The first explains what you saw, the second tells Marcus what happens now, the third hands the ticket on.',
        ),
      ],
      result:
        'Diagnosis, safety, and documentation all count. The unlock alone is worth the least of the three.',
    },
    practice: { kind: 'tickets', families: ['PWD-01'] },
  },

  'ticket-queue': {
    concept: [
      'A queue is a decision about order, not a list. Severity is what the ticket costs the business while it waits; impact is how many people it costs it to. A critical account lockout for one person and a whole-floor outage both read as urgent, and the outage is the one that has to move first.',
      'Order also decides when to stop. A ticket you cannot fix is not a failure — sitting on it is. Hand it on with the evidence you gathered and the queue moves; that close is scored as a handover, not as a miss.',
    ],
    example: {
      title: 'Knowing which ticket is yours',
      scenario:
        'The queue holds a single-user lockout and a site-wide name-resolution failure at the same site.',
      steps: [
        step(
          'Read both tickets before starting either',
          'The outage touches everyone at the site, so it jumps ahead of a single person’s lockout.',
        ),
        step(
          'Work the outage hop by hop: local address, then gateway, then name resolution',
          'Each check narrows the fault to one link. Escalating without it just moves the delay.',
        ),
        step(
          'When the fault sits beyond the desk, close as an escalation with the evidence attached',
          'A handover with proof is a finished ticket. A handover without it comes straight back.',
        ),
      ],
      result:
        'Three passing tickets in two different families, plus one handover, is the whole module.',
    },
    practice: { kind: 'tickets', families: ['NET-01', 'DHCP-01'] },
  },

  documentation: {
    concept: [
      'Notes are read by three different people: your replacement at 18:00, the requester who is not technical, and whoever audits the change later. One note cannot serve all three, which is why the lab asks for a troubleshooting note and a customer note separately.',
      'Write what you observed before what you concluded. “Spooler service stopped at 09:12, restart cleared four jobs” survives a change of opinion; “printer was broken, fixed” does not.',
    ],
    example: {
      title: 'A print queue, written down',
      scenario:
        'Amara’s jobs sit at “printing” and never leave the queue. The printer itself is online and reachable.',
      steps: [
        step(
          'Run the queue check before touching the spooler',
          'It separates a stuck job from a stopped service, which are different fixes.',
        ),
        step(
          'Restart the spooler and re-read the queue',
          'The second read is the proof the fix worked, and the sentence the next reader needs.',
        ),
        step(
          'Write the troubleshooting note with times, commands, and what changed',
          'Facts the next shift can verify, in the order they happened.',
        ),
        step(
          'Write the customer note in plain language',
          'Amara needs to know her jobs are moving again and what to do if they stop.',
        ),
      ],
      result:
        'Three troubleshooting notes, two customer updates, and one resolution note finish the module.',
    },
    practice: { kind: 'tickets', families: ['PRN-01'] },
  },

  'company-chat': {
    concept: [
      'Chat is a narrowing tool. Each question should remove a possibility you could otherwise only guess at, and one question at a time is usually faster than a paragraph of them — the caller answers the first and forgets the rest.',
      'Ask before you touch. A question costs a minute; a reset that lands on the wrong account costs the shift. The lab scores the ordering separately from the content, so an attempt that starts with a command cannot recover that point.',
    ],
    example: {
      title: 'Narrowing a sign-in failure',
      scenario:
        'Amara is blocked from Microsoft 365 after signing in on hotel Wi-Fi. Nobody has said which error she saw.',
      steps: [
        step(
          'Ask what the sign-in screen said, word for word',
          '“Blocked” and “wrong password” send the desk to different commands.',
        ),
        step(
          'Ask whether any other account worked from the same network',
          'It separates the account from the network without touching either.',
        ),
        step(
          'Only then run the check the answer points at',
          'The command confirms a cause instead of hunting for one.',
        ),
      ],
      result:
        'Four different question types, one attempt that opens with a question, and ten questions in total.',
    },
    practice: { kind: 'tickets', families: ['M365-01'] },
  },

  'voicemails': {
    concept: [
      'A message on the desk’s machine is a report with nobody on the other end of it. The words are the same words a caller would have said, but the voice that could answer a follow-up question has gone back to their meeting, so every gap in the recording is a gap the ticket has to carry.',
      'That leaves three habits. Ring the person back on the line the message leaves — the mobile on file, or the desk line when the handset is dead — because a callback is the quickest way to check a detail or to find that the voice was not who it claimed. Work the ticket from the machine’s evidence rather than from the recording, which is a claim, not a diagnosis. And write the message into the ticket before the audio is cleared, because a recording nobody can play is not a record.',
      'Some messages can wait and some cannot. The rule is not the tone of the recording but what is blocked: a whole team unable to print at nine in the morning is a callback now, while one person’s dock that clicks is a ticket for later. Say which one you decided in the note, so the next shift knows it was a decision and not an oversight.',
    ],
    example: {
      title: 'A lockout left at eight in the morning',
      scenario:
        'The queue holds a voicemail left at 08:10: Marcus cannot sign in, and his handset is out of action. The recording ends with a desk extension.',
      steps: [
        step(
          'Read the card, then ring the line the message leaves',
          'The callback is recorded against the attempt, and the desk line is the only line that reaches him today.',
        ),
        step(
          'Run `get-account mchen`',
          'The directory says locked or disabled. A message cannot tell the difference, and the fix is not the same one.',
        ),
        step(
          'Unlock only if the output shows a lock',
          'The change follows the evidence. A disabled account stays disabled until the reason is known.',
        ),
        step(
          'Write the message into the ticket, then close it',
          'What was asked for, what you found, and when you rang back — in a note a later shift can read.',
        ),
      ],
      result:
        'One closure on a ticket that arrived as a voicemail, one callback on file, and one note. The attempt still has to pass to complete the module.',
    },
    practice: { kind: 'tickets', families: ['PWD-01', 'M365-01', 'PRN-01'], arrival: 'voicemail' },
  },

  'the-phone': {
    concept: [
      'The voice on the line is not evidence of identity. On file there is a contact method and a live code; the desk uses them before account work, every time, including when the caller sounds like they are in a hurry.',
      'Some requests are not the caller’s to make — a password read back down the phone, an unlock for a colleague, a change to an account that is not theirs. Refusing is recorded and scored as the correct close, not as a failed ticket.',
    ],
    example: {
      title: 'A pressured reset, handled',
      scenario:
        'The caller wants their password reset in the next two minutes and offers their employee number as proof.',
      steps: [
        step(
          'Send the verification code to the number on file',
          'The employee number is on the ticket; only the code proves the person holding it.',
        ),
        step(
          'Reset the password only after the read-back succeeds',
          'The order is the point. A reset before verification is a safety miss even when the caller is genuine.',
        ),
        step(
          'Refuse to read the password back down the line',
          'The lab scores the refusal. Offer the approved channel instead of a workaround.',
        ),
      ],
      result:
        'One verification, one attempt that verifies before its first change, and one recorded refusal.',
    },
    practice: { kind: 'tickets', families: ['PWD-01'] },
  },

  directory: {
    concept: [
      'The Directory console lists people, not state. It shows the department, the site, the manager, and the machines assigned to someone — the facts an HR export would hold. The list can be filtered by live account state — locked, password expired, disabled — so you can find who matches a symptom, but the record itself prints none of it and the audited lookup is still the evidence.',
      'That separation is what makes the console useful. The filter is a finder, not a diagnosis: every action it offers runs the same audited command the terminal runs, so the evidence lands in the ticket log either way and the learner can browse accounts without losing the habit of asking the directory for the answer. Each record also keeps the desk’s recent history with that account — the last commands and closed tickets that named it — so you can see the desk has been here before without reading every old attempt.',
    ],
    example: {
      title: 'Reading an account before changing it',
      scenario:
        'A ticket says Marcus is locked out. The directory record shows his department, site, and laptop, and nothing about his account.',
      steps: [
        step(
          'Run `get-account mchen` from the record',
          'This is the first real fact: locked, active, or disabled, and when the password last changed.',
        ),
        step(
          'Unlock only what the output showed',
          'A disabled account is not a lockout, and an unlock will not restore it.',
        ),
        step(
          'Run `get-account mchen` again',
          'The second read is the evidence that the change took, and the line the debrief expects.',
        ),
      ],
      result:
        'A password or sign-in ticket closed with full diagnosis marks and no safety misses completes the module.',
    },
    practice: { kind: 'tickets', families: ['PWD-01', 'M365-01', 'FS-01'] },
  },

  'remote-desktop': {
    concept: [
      'A remote session puts you on someone else’s machine, which is exactly why the lab insists you read it before you change it. The session itself is recorded, and the commands you run inside it are the same audited pipeline the side terminal uses.',
      'Read first means something harmless: the hostname, the adapter, a `get-` check, a directory listing. Any one of them before the first change is enough to show the desk knew what it was looking at.',
    ],
    example: {
      title: 'A session that leaves a trail',
      scenario:
        'A user’s laptop has no network after a desk move. The ticket names the machine but not the adapter state.',
      steps: [
        step(
          'Open a session on the machine the ticket names',
          'One session, one machine, recorded against the attempt.',
        ),
        step(
          'Run `ipconfig /all` inside the session',
          'Address, gateway, and DNS come back from the machine itself rather than from the ticket.',
        ),
        step(
          'Make the change the output supports',
          'The evidence picks the fix; guessing at a desk move does not.',
        ),
        step(
          'Write the note after the work, in the same attempt',
          'The session proves access; the note is what the next person reads.',
        ),
      ],
      result:
        'One session opened, one read before the first change, and one note written after the work.',
    },
    flow: {
      title: 'Work it in order',
      intro:
        'Each step is meant to leave one thing in the log. Check them off as you go — the checks are for this visit and are not scored; the log is. Open a Remote Desktop ticket before you start.',
      steps: [
        {
          action:
            'Connect to the machine the ticket names, from the console or with `connect-remote <hostname>`',
          evidence:
            'A session opened on that machine, recorded against this attempt.',
        },
        {
          action:
            'Read the machine first: `ipconfig /all`, `hostname`, `systeminfo`, or the console’s machine record',
          evidence:
            'A read-only command filed under that desktop, before anything on it changes.',
        },
        {
          action: 'Make the single change the output supports',
          evidence:
            'A change effect on the machine — the flush, renewal, or setting the read pointed at.',
        },
        {
          action: 'Read again to show the machine after the change',
          evidence:
            'A second read under the same desktop, so the fix is visible rather than only claimed.',
        },
        {
          action: 'Write the troubleshooting note while the session is still open',
          evidence:
            'A note after the remote work; it is the write-up this module looks for.',
        },
        {
          action:
            'End the session with `end-remote-session <hostname>`, then close with a resolution note',
          evidence:
            'The session closed on that machine, and the handoff note that says what changed.',
        },
      ],
      finish:
        'Before you close: the log should show a session, a read before the first change on that machine, the change, and a note written after it — then the session ended and the ticket closed with the resolution note.',
    },
    practice: { kind: 'tickets', families: ['NET-01', 'DHCP-01'] },
  },

  'server-room': {
    concept: [
      'An outage is worked hop by hop, not guessed at whole. Local address, gateway, name resolution, then the service — each check either clears a link or narrows the fault to it, and the map lights a link only once the log holds the check that proved it.',
      'The blast radius decides who fixes it. A scope that is wrong for the site, or a server that is down beyond the desk’s reach, is a handover with evidence, and the module counts that close.',
    ],
    example: {
      title: 'A site that cannot resolve names',
      scenario:
        'Everyone at one site fails by name while addresses still work. One machine is confirmed working elsewhere.',
      steps: [
        step(
          'Read the site’s scope and the gateway it hands out',
          'A wrong gateway or resolver explains the whole site with one fact.',
        ),
        step(
          'Check the resolver the scope advertises',
          'Addresses working means the path exists; names failing points at the resolver.',
        ),
        step(
          'Escalate with the scope output attached when the fix is above the desk',
          'The evidence is what lets the next team act without starting again.',
        ),
      ],
      result:
        'One network or address pass, full diagnosis marks on it, and one recorded handover.',
    },
    practice: { kind: 'tickets', families: ['DHCP-01', 'NET-01'] },
  },

  'mail-admin': {
    concept: [
      'Mail Admin is a tenant-wide mailbox inventory with a transport trace attached. The mailbox record answers what is set on the account — quota, forwarding, holds — while the trace answers what the tenant did with one message: accepted, filtered, deferred, delivered, or held.',
      'Those are different questions, and mixing them up is the usual mistake. A mailbox with room and no hold does not prove a message arrived, and an empty inbox does not prove the sender never wrote. The trace is the only record that settles it.',
    ],
    example: {
      title: 'A supplier invoice the user cannot find',
      scenario:
        'Amara says a freight invoice never arrived. The mailbox has room, nothing is forwarded, and the supplier insists the message was sent.',
      steps: [
        step(
          'Read the mailbox record with `get-mailbox asingh`',
          'Quota and hold are the two mailbox-side reasons delivery would stop, and this read rules both of them out.',
        ),
        step(
          'Find the message id in the recent messages under the record',
          'The ids the tenant already associates with this address are the ones a trace can accept, so nothing has to be guessed.',
        ),
        step(
          'Run `trace-message` on that id',
          'The state line and the events show whether the transport delivered it here or stopped somewhere earlier.',
        ),
        step(
          'Tell the user where it is, without changing anything',
          'Nothing on the tenant is broken, so the close is user guidance: search the inbox on each device the user reads mail on.',
        ),
      ],
      result:
        'A pass on MAIL-01 with the trace in the note is the whole module; the mailbox read and the trace are also counted on their own.',
    },
    practice: { kind: 'tickets', families: ['MAIL-01'] },
  },

  'mail-security': {
    concept: [
      'Quarantine is a queue of decisions, not a queue of releases. Every row already carries the filter’s verdict; the desk’s job is to check that verdict against the trace, then either release expected mail or leave an attack where it is.',
      'The two failure modes do not cost the same. Releasing an impersonation hands it straight to the mailbox it targeted; leaving a genuine supplier note held costs a delay. When the evidence is a finance display name over an outside domain, the decision is not close: leave it held and block the sending address.',
    ],
    example: {
      title: 'A payment message that must stay held',
      scenario:
        'The requester wants a payment confirmation released before a deadline. The filter held it as an impersonation, and the sending domain is not the payment provider’s.',
      steps: [
        step(
          'Open Mail Security and read the held message',
          'The verdict, the sender, and the target mailbox are on the record before any decision is made.',
        ),
        step(
          'Run `trace-message msg-4001`',
          'The trace turns the verdict into evidence: the display name says finance, the domain says somewhere else.',
        ),
        step(
          'Leave it held and do not run `release-quarantine`',
          'A release delivers the message, and the urgency in the ticket is part of the attack rather than a reason to hurry.',
        ),
        step(
          'Run `block-sender accounts@larkspur-payment-support.example`',
          'The block stops the next message from that address, and the held message moves to blocked instead of waiting for review.',
        ),
        step(
          'Tell the requester how to verify the invoice',
          'The user needs a safe next step — call the supplier on the number already on file — not a warning to look for the message again.',
        ),
      ],
      result:
        'One traced held message, one deliberate block with no release, and a pass on MAILSEC-01 complete the module; the carrier-note variant is the other direction and releases expected mail without a block.',
    },
    practice: { kind: 'tickets', families: ['MAILSEC-01'] },
  },

  'asset-management': {
    concept: [
      'The register answers who holds a machine and where it is. It does not answer whether the machine can leave: that is the shelf record, where a hold, a missing image, or waiting parts sit beside the run booked against the tag. Two records, read together, decide the handover.',
      'A hold is a decision someone else already made. A machine quarantined for damage cannot be issued, and a finished imaging run would not change that — it would only make a held machine look ready. The desk’s close is a handover with the shelf evidence attached, not a forced sequence.',
    ],
    example: {
      title: 'The handover laptop that cannot be imaged',
      scenario:
        'A new starter’s laptop is booked for imaging, but the shelf note says it is held for a cracked lid and the damage case is still open.',
      steps: [
        step(
          'Read the deployment queue with `get-deployment-queue`',
          'The booked run is there, with its state and what the last attempt left behind.',
        ),
        step(
          'Read the machine with `get-deployment SHELF-LT-0204`',
          'The shelf state and note are the facts behind the hold; the run cannot clear them.',
        ),
        step(
          'Leave the sequence alone and hand it to Field Services',
          'Imaging a quarantined machine would mark it ready while the damage case is still open.',
        ),
        step(
          'Write the note with the tag, the hold, and what the next team has to do',
          'The handover is the close: the evidence is what lets Field Services act without starting over.',
        ),
      ],
      result:
        'One queue read, one machine record, and a pass on the held-machine ticket complete the module. The failed-run variant belongs to Computer Deployment.',
    },
    practice: {
      kind: 'tickets',
      families: ['DEP-01'],
      // The module is judged on respecting the hold, so the entry point draws
      // the held-shelf variant rather than leaving it to the queue's coin flip.
      variantId: HELD_SHELF_VARIANT,
    },
  },

  'computer-deployment': {
    concept: [
      'A deployment record is a sequence, the step it reached, the attempts behind it, and the shelf state of the machine it is building. Reading it turns “it failed” into a decision: a driver step that failed twice may rerun cleanly, while a hold means no run should start at all.',
      'A completed sequence is not a finished handover. The run marks the shelf ready, but the machine still has to be named and the work written into the ticket, and the run has to be read again — the re-read is the proof the shelf changed, not the button press.',
    ],
    example: {
      title: 'A failed imaging run, finished',
      scenario:
        'A handover desktop has failed its imaging run twice on a driver step and is still needs-image on the shelf.',
      steps: [
        step(
          'Read the run with `get-deployment SHELF-DT-0302`',
          'The failed step, the attempt count, and the shelf state say whether a rerun is the fix.',
        ),
        step(
          'Run the sequence with `start-deployment SHELF-DT-0302`',
          'One run against the tag the ticket names completes the image and marks the shelf ready.',
        ),
        step(
          'Read the record again',
          'Complete and ready are the proof the machine can be issued; a pressed button is not.',
        ),
        step(
          'Write the failure and the new run into the note',
          'The next person needs the step that failed and the attempt that cleared it.',
        ),
      ],
      result:
        'One failed run read, one sequence finished, and a DEP-01 pass complete the module. The held-machine variant is the other decision, and it counts for Asset Management.',
    },
    practice: {
      kind: 'tickets',
      families: ['DEP-01'],
      // The module needs a run that can actually finish, and the held-machine
      // variant deliberately has none.
      variantId: FAILED_RUN_VARIANT,
    },
  },

  'pc-shelf': {
    concept: [
      'The shelf is a queue of machines waiting to be handed over, not a pile of spares. Each one carries an asset tag, a state, how long it has waited, and a note: ready to go out, waiting for an image, waiting on parts, or held. A count of the bay tells you whether a ticket can be closed today or has to wait for hardware.',
      'Booking a machine out is the handover itself. Only a ready machine leaves; a held machine stays held until the fault case closes, because issuing it would hide the damage behind a working login. Once booked, the tag is on the asset register under that account and the shelf record is gone.',
    ],
    example: {
      title: 'A new starter’s laptop, off the shelf',
      scenario:
        'A new starter needs a laptop today. The warehouse bay holds two machines: one is ready, and the other is waiting on a replacement dock.',
      steps: [
        step(
          'Read the bay with `get-shelf warehouse`',
          'The count by state and the note on each tag say which machine can go out today and which cannot.',
        ),
        step(
          'Book the ready machine to the account on the ticket with `book-shelf-machine`',
          'The account has to exist and already hold no machine, so the handover lands on the right person.',
        ),
        step(
          'Hold anything faulty with `hold-shelf-machine`',
          'A reason on the shelf record stops the next person issuing a machine that has not been repaired.',
        ),
        step(
          'Record the tag, the holder, and the shelf state in the ticket note',
          'The register shows the machine exists; the note shows who decided it could leave and why.',
        ),
      ],
      result:
        'One bay read, one booking, and one hold complete the module. The DEP-01 tickets are the queue where a shelf decision has to be written up.',
    },
    practice: { kind: 'tickets', families: ['DEP-01'] },
  },

  'ship-manager': {
    concept: [
      'The shipping desk tracks movement, not wishes. A shipment is preparing until a carrier collects it, in transit while it is out, and delivered only when it reaches the other site. A delayed collection never left, so it is not delivered; it is a date to rebook.',
      'Each step writes the carrier’s own words onto the record: collected at a time, delivered to a site, rebooked for a date. The board sorts by what needs attention first — late movements, then what still has to leave — so reading it top to bottom is already a plan.',
    ],
    example: {
      title: 'A return that missed its collection',
      scenario:
        'A damaged laptop is going back to the depot, but the carrier has missed two collections and the shipment now shows as delayed.',
      steps: [
        step(
          'Read the board with `get-shipments`',
          'Delayed movements come first, so the one that needs a decision is at the top, not buried by date.',
        ),
        step(
          'Read the movement with `get-shipment LSP-8830`',
          'The route, the carrier, the tag, and the last event say whether the equipment ever left.',
        ),
        step(
          'Rebook the collection with `rebook-shipment LSP-8830 2`',
          'A delay is fixed with a new date. Marking it delivered would close a movement that never happened.',
        ),
        step(
          'Dispatch it once the carrier collects, then deliver it at the other site',
          'The tracking events are the evidence: collected, then delivered, each with a time and a site.',
        ),
      ],
      result:
        'A board read, a rebooked collection, and a dispatch and delivery on file complete the module; printing a label first is fine, because a label moves nothing.',
    },
    practice: { kind: 'tickets', families: ['DEP-01'] },
  },

  'mock-interview': {
    concept: [
      'A saved listing is a list of things an employer will ask you to prove. The Job targets page extracts the skills it recognises, matches them to the families the simulator generates, and tells you which of those families you have actually passed.',
      'That turns preparation into evidence. “I have closed three network tickets and can walk you through a wrong DNS server” is a different answer from “I know networking”, and the lab can tell you which one you can honestly give.',
    ],
    example: {
      title: 'From listing to an answer you can defend',
      scenario:
        'A Tier 1 advert asks for Active Directory, DNS troubleshooting, and Microsoft 365 administration.',
      steps: [
        step(
          'Paste the requirements section into Job targets',
          'It stays on this machine. Only company, title, URL, and extracted skills leave in a share-safe export.',
        ),
        step(
          'Read the matched families and your coverage',
          'The listing names three areas; the coverage tells you which ones your history can already support.',
        ),
        step(
          'Pass a family the advert actually asks for',
          'Coverage counts only once the family behind the skill has a passing attempt.',
        ),
        step(
          'Open the interview template for that family',
          'The questions there are the ones the advert implies, with the evidence you would cite.',
        ),
      ],
      result:
        'One saved listing with recognised skills, and one passing attempt in a family the advert demands.',
    },
    practice: { kind: 'targets' },
  },

  'intune-compliance': {
    concept: [
      'Compliance in a device console is a verdict the service reaches about a machine, not something the machine reports about itself. A device can be switched on, online and in someone’s hands and still show as non-compliant, because the only thing being judged is whether the rules the policy set are met on the last check-in.',
      'That makes two failures look alike from a ticket and completely different from the console. A device that has stopped reporting has no fresh facts at all, while a device that is reporting but was never re-judged is holding a verdict the service no longer stands behind. The reason list on the record tells you which one you have; the action bar behaves differently depending on the answer.',
      'Read the record before you touch it. The dashboard’s red row says a rule failed; the device page says which rule, when it last checked in, and what the service thinks of it now. Everything scored in this console starts from that read, because a sync sent without knowing the failing rule is a guess that happens to be cheap.',
    ],
    example: {
      title: 'A laptop that failed its encryption rule',
      scenario:
        'A user opens a ticket saying their laptop is red in the company portal. The machine is on, connected and in the office, and the message mentions disk encryption.',
      steps: [
        step(
          'Open the ticket and read the device record',
          'The reason list names the rule that failed. That one fact decides whether this is a policy the console can apply or a machine that has to be rebuilt.',
        ),
        step(
          'Send a sync from the action bar',
          'A sync applies the policy the device is behind on and asks the service to judge it again, which is the whole fix when the rule is encryption.',
        ),
        step(
          'Check the verdict on the device page, not just the toast',
          'The estate is the evidence. A completed action that left the device non-compliant is not a fixed ticket.',
        ),
        step(
          'Check my work, then read the score by category',
          'The read before the fix is diagnosis; the sync and the new verdict are resolution. Reading afterwards does not earn the first one.',
        ),
      ],
      result:
        'One read before the first action, the failing rule addressed, and a device that is compliant when the estate is checked again is a clean 100.',
    },
    flow: {
      title: 'Work it in order',
      intro:
        'The console is a state machine, so the order is the evidence. Check these off as you go: the boxes are for this visit and are not scored, while the read and the actions behind them are.',
      steps: [
        {
          action: 'Open the Intune ticket the module starts on',
          evidence: 'The ticket names one device, its owner, and the state the request starts from.',
        },
        {
          action: 'Press Read the device record before any action',
          evidence: 'A read event on the device timeline, before the first fix.',
        },
        {
          action: 'Name the failing rule and take the smallest action that addresses it',
          evidence: 'An applied action whose confirmation names the rule it set right.',
        },
        {
          action: 'Re-read the device page, then press Check my work',
          evidence: 'The verdict changed on the estate, and the score shows diagnosis and resolution both paid.',
        },
      ],
      finish:
        'Before you close: the record was read first, the action matches the rule that failed, and the device page — not the toast — shows a current verdict.',
    },
    practice: { kind: 'intune', templateId: 'tpl-bitlocker-off' },
  },

  'intune-apps': {
    concept: [
      'An app in this console has two lives. On the catalogue page it is an assignment to a user or device group; on the device it is an install with a status that either got there or did not. A ticket that says “it will not install” is about the second one, so the device’s own app list is the first thing to read.',
      'The two halves of deployment fail differently. An assignment that was never made is answered by assigning the required set, while a failed install that is already assigned is answered by asking the device to try again. Sending a second sync at a failure changes nothing: nothing had queued the install to be collected.',
      'The required set is the group’s, not yours. Assignment is what makes a device useful rather than what makes one app appear, and a handover that stops at the portal leaves the VPN client — and often the ticket — open. Read the device, read the group, and let those two decide what “installed” means.',
    ],
    example: {
      title: 'A new phone with nothing on it',
      scenario:
        'A starter’s phone arrives from the reseller with no company apps. The ticket asks for the portal and the usual suite before the person starts taking calls.',
      steps: [
        step(
          'Read the device record and its app list',
          'An empty list on a healthy, enrolled device is a missing assignment, not a broken install.',
        ),
        step(
          'Assign the required set to the device',
          'The group decides which apps are required; picking the portal by hand leaves the rest of the suite behind.',
        ),
        step(
          'Sync so the phone collects its queue',
          'Assigning only writes the intent. The check-in is what turns intent into installs on the device.',
        ),
        step(
          'Check my work and read the install list',
          'The ticket closes when every required app shows installed, not when the assignment looks right.',
        ),
      ],
      result:
        'Assigning and syncing in that order, with the group’s full set, is the reference path; doing neither or only one leaves installs pending.',
    },
    practice: { kind: 'intune', templateId: 'tpl-new-hire-apps' },
  },

  'intune-lifecycle': {
    concept: [
      'Three tickets in this console ask for something that cannot be undone, and the differences between them are the course. Retiring takes company data and assignments off a device its owner keeps. Wiping resets the device itself. Clearing a stale enrolment removes a record of a machine that stopped talking, so the hardware can be enrolled again.',
      'Choose by who holds the hardware and what the company needs back from it. A leaver still has their phone, so a retire removes the work data and leaves the personal photos. A lost phone is in nobody’s hands, so a wipe is the only action that protects the mail on it. A laptop silent for six weeks is still in the office and still being used, which makes the record — not the machine — the thing that is broken.',
      'Ownership is the quiet case. A machine registered to the wrong person produces alerts for someone who never used it and assignments for someone who cannot see them, and the fix is a record change. Destroying a working laptop to correct a bookkeeping error costs the safety mark and the machine at once, which is the mistake the scorer is built to price.',
    ],
    example: {
      title: 'A leaver’s phone that is still enrolled',
      scenario:
        'Someone finished on Friday and their account is disabled, but their phone is still managed with the portal on it. HR wants it off the estate this week.',
      steps: [
        step(
          'Read the device record and confirm the owner',
          'The phone is in the person’s hands, so the data has to leave without the hardware being destroyed.',
        ),
        step(
          'Retire the device rather than wipe it',
          'A retire removes company data and assignments and can be reversed; a wipe takes the owner’s own photos with it.',
        ),
        step(
          'Re-read the device and check the assignments are gone',
          'The estate is the proof: a retired device should no longer be collecting policy or apps.',
        ),
        step(
          'Check my work and read the explanation',
          'The debrief names the decision and what the other destructive action would have cost.',
        ),
      ],
      result:
        'A retire on a leaver is worth the full safety mark; the same ticket closed with a wipe is the mistake the module is built to catch.',
    },
    practice: { kind: 'intune', templateId: 'tpl-leaver-retire' },
  },

  'azure-compute': {
    concept: [
      'A cloud machine has more than two states, and the difference between them is money. A machine that is running bills for compute. A machine that has been shut down inside the guest is still allocated, so it still bills. A machine that has been deallocated has released the compute and keeps only its disks. The console shows one column, and reading it properly is most of the work.',
      'That makes two tickets look opposite and be the same question. A machine nobody can reach is often deallocated rather than broken, and starting it is a whole fix. A machine that costs too much is often running when its own tag says it should be off, and deallocating it is a whole fix. Neither one is repaired by deleting and rebuilding, which is slower, loses whatever was only on that disk, and turns a two-minute change into an outage.',
      'The same reading applies to a plan rather than a machine. An App Service on a free plan has a daily CPU quota; when the quota runs out the site is throttled, not broken, so the application log stays clean while the gateway times out in front of it. The record says which plan it is on, and no amount of restarting changes a quota.',
    ],
    example: {
      title: 'A finance box that is switched off rather than broken',
      scenario:
        'The finance reporting machine has been unreachable since the weekend, month-end is tomorrow, and the console still lists it. Nobody deleted anything.',
      steps: [
        step(
          'Open the machine and read the record before acting',
          'The power state and the schedule tag are the two facts that decide the fix. A deallocated machine is a switch, not a repair.',
        ),
        step(
          'Start the machine rather than rebuilding it',
          'Starting keeps the disks, the network settings and the machine name. A delete-and-rebuild takes the local state with it and takes longer.',
        ),
        step(
          'Re-read the record and confirm the power state changed',
          'The estate is the evidence. A confirmation toast is not the machine running.',
        ),
        step(
          'Check my work and read the category split',
          'The read before the change is diagnosis; the start and the new state are resolution. A read afterwards does not earn the first one.',
        ),
      ],
      result:
        'One read before the change, the machine running, and nothing deleted is a clean 100 on both the diagnosis and the safety mark.',
    },
    flow: {
      title: 'Work it in order',
      intro:
        'The console is a state machine, so the order is the evidence. Check these off as you go: the boxes are for this visit and are not scored, while the read and the actions behind them are.',
      steps: [
        {
          action: 'Open the Azure ticket the module starts on',
          evidence: 'The ticket names one resource, its group, and the state the request starts from.',
        },
        {
          action: 'Press Read the resource record before any action',
          evidence: 'A read event on the resource timeline, before the first change.',
        },
        {
          action: 'Name the setting behind the symptom and take the smallest action that changes it',
          evidence: 'An applied action whose confirmation names what it did to this resource.',
        },
        {
          action: 'Re-read the resource page, then press Check my work',
          evidence: 'The findings changed on the estate, and the score shows diagnosis and resolution both paid.',
        },
      ],
      finish:
        'Before you close: the record was read first, the action matches the setting that was wrong, and the resource page — not the toast — shows the new state.',
    },
    practice: { kind: 'azure', templateId: 'tpl-vm-stopped' },
  },

  'azure-network': {
    concept: [
      'A network security group is a list of rules read from the lowest priority number down, and it ends in an implicit deny. That last part is the one people forget: a port with no allow rule is closed even though nothing on the list mentions it. A site that suddenly stops answering on 443 after a group was tidied is usually a missing rule, not a new deny.',
      'The opposite fault looks similar on a ticket and is worse in practice: a rule that allows a management port from the internet. RDP and SSH are the two that matter, because a password is the only thing between a stranger and an administrator session. The people who need them already have a way in — here, the VPN — so the rule is a leftover with a standing invitation attached.',
      'Both fixes are small and both are local to the group. Add only the rule that is missing; remove only the rule that is wrong. Replacing the group with a permissive one, or adding a broad allow to be safe, closes the ticket and creates the next one, and the safety mark is there to notice.',
    ],
    example: {
      title: 'HTTPS dropped by a group that was tightened',
      scenario:
        'The portal loads over plain HTTP and times out on HTTPS. The app is healthy, the certificate is fine, and the only change was to the security group in front of it.',
      steps: [
        step(
          'Read the group’s inbound rules, lowest priority first',
          'The list says what is allowed. The absence of a 443 rule says why HTTPS is dropped, because the default deny takes whatever is not listed.',
        ),
        step(
          'Add an allow rule for 443 from the internet and leave the rest alone',
          'One rule restores the path. Widening the existing 80 rule, or adding an allow-any, would also make the site load and would reopen what the group was tightened to close.',
        ),
        step(
          'Re-read the rules and confirm 443 is allowed and 80 is unchanged',
          'The group is the evidence, and the second read is what proves the change was narrow.',
        ),
      ],
      result:
        'Adding the one missing rule, with the read before it, passes the ticket without losing the safety mark.',
    },
    practice: { kind: 'azure', templateId: 'tpl-nsg-blocks-https' },
  },

  'azure-access': {
    concept: [
      'Exposure in a subscription is mostly settings that look reasonable on their own. Public blob access makes a container reachable without a signed request. Soft delete off means a bad job overwrites the only copy. A minimum TLS version of 1.0 keeps an obsolete protocol negotiable. None of them produce an error, which is why each one becomes a ticket rather than an outage.',
      'Each also has a fix that is smaller than it first looks, and a tempting fix that is larger. Turning public access off closes anonymous reads without rotating a key or deleting the account. Turning soft delete on protects the next write, not the file already lost, and saying so is part of closing the ticket honestly. Raising TLS refuses old clients rather than quietly downgrading them, so it is the one change worth checking against the client list first.',
      'Access is the same shape at a different layer. A role is granted over a scope, and Contributor can deploy while Owner can also grant access and delete anything. A contractor who needs to deploy does not need Owner, and removing their access entirely would stop the work the ticket says must continue. Shrinking the role is the answer that keeps both facts true.',
    ],
    example: {
      title: 'A contractor with more access than the job',
      scenario:
        'An access review finds a contractor holding Owner on the production resource group. They deploy the portal every week and their engagement runs another month.',
      steps: [
        step(
          'Read a resource in the group and see the role that is wider than the job',
          'The finding names the principal and the scope. Owner can grant access and delete the group; neither is part of deploying.',
        ),
        step(
          'Change the assignment to Contributor on the same scope',
          'Contributor keeps the deployments working and takes away the two powers the ticket objects to. The scope does not change.',
        ),
        step(
          'Re-read the access page and confirm the role, not just the toast',
          'The assignment list is the evidence. A refusal in the confirmation is not a changed role.',
        ),
        step(
          'Check my work and read the explanation',
          'The debrief names why removing access was the wrong read of the same ticket.',
        ),
      ],
      result:
        'Shrinking the role rather than deleting it keeps the work and clears the review, which is the whole decision.',
    },
    practice: { kind: 'azure', templateId: 'tpl-rbac-owner' },
  },
}

export function lessonFor(moduleId: string): ModuleLesson | null {
  return MODULE_LESSONS[moduleId] ?? null
}
