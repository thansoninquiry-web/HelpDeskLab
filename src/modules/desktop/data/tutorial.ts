import type { Tutorial } from '../../shared/TutorialPage'

/**
 * The desktop bench's tutorial.
 *
 * The example is a flat CMOS cell because it is the case where the machine,
 * the read and the change are all visible at once. The rules it teaches — test
 * the part the symptom points at, back up before a risky change, verify after —
 * are the same on every case.
 */
export const DESKTOP_TUTORIAL: Tutorial = {
  surface: 'Desktop support',
  title: 'Work a machine, not a parts catalogue',
  lede: 'A bench, a machine and the software on it. Each case is one fault on one machine, and the score reads what you did in what order: the symptom, the test that settles it, the change, and the note the next technician inherits.',
  minutes: 10,
  before: [
    'Everything is simulated. The parts, the Windows installs and the QuickBooks company files are code on this bench; no real machine is touched.',
    'A change is scored as a change whether or not it was right, so the order matters: read first, then replace.',
    'The checklist is part of the score, not advice at the bottom of the page. Verify the user, back up, document, follow up.',
  ],
  steps: [
    {
      title: 'Start from the symptom, not the part list',
      action:
        'Open the case list and read the symptom and the caller’s report. Decide which group you are in: a machine that will not start, a Windows that starts badly, or an application that misbehaves.',
      why: 'The group decides the first tool. A dead machine has no Event Viewer to read; a crashing Word document has nothing to do with the power supply. Naming the group first stops the parts list from becoming a shopping list.',
      link: { to: '/desktop', label: 'Open the case queue' },
    },
    {
      title: 'Test the part the symptom points at',
      action:
        'On a hardware case, watch the POST and note the beep pattern, then select the part on the internals diagram and test it. On a laptop, the same diagram carries the battery, charger, panel and keyboard.',
      why: 'A POST that stops or beeps is the machine telling you which subsystem failed. The test then confirms the part instead of assuming it — and each test is a recorded read, which is what the diagnosis marks are for.',
      link: { to: '/desktop/bench', label: 'Read the machine part by part' },
    },
    {
      title: 'Read the software with the machine running',
      action:
        'For a Windows or application case, open Task Manager, Device Manager, Event Viewer, Disk Management, msconfig or the app’s own logs. Note the error code and what changed just before it started.',
      why: 'Event Viewer and Device Manager answer “what changed” with an id and a timestamp. A Code 10 on the touch device after a driver update is a different job from a machine that never booted, and the read is what tells them apart.',
      link: { to: '/desktop/tools', label: 'Open the tool reference' },
    },
    {
      title: 'Back the data up before the change that can lose it',
      action:
        'If the next step replaces a drive, wipes a disk, rebuilds a profile or repairs a company file, tick the backup first — before the change, not after it. Then verify the user and the machine.',
      why: 'The backup is the one step that cannot be done after the mistake. A data-risk change made before the backup is a critical finding: the attempt cannot pass however healthy the machine ends up, which is exactly how it works at a real desk.',
    },
    {
      title: 'Make one change and verify the machine',
      action:
        'Apply the change from the action bar or the part panel, then read the machine again: the POST, the drive health, the device status, the app. Do not move on until the symptom is actually gone.',
      why: 'The bench derives the machine from the changes you made, so a fix that looks applied and a machine that works are the same fact here. If the read still fails, the fault was elsewhere — and the earlier test is what proves it.',
    },
    {
      title: 'Close with the note and the follow-up',
      action:
        'Tick document and write what was found, what was changed and what the user should watch for. Tick the follow-up, then check the score and read the category breakdown.',
      why: 'A fix without a note is a fix the next shift has to rediscover. The debrief shows which part of the work earned the marks — diagnosis, documentation, resolution or safety — so the next case can be chosen to practice the weak one.',
      link: { to: '/desktop/cases/cmos-clock-reset', label: 'Try the flat CMOS cell' },
    },
  ],
  scoring: [
    {
      label: '25 · Diagnosis',
      detail:
        'The reads that isolate the fault, taken before the first change, plus 5 for looking before touching.',
    },
    {
      label: '20 · Documentation',
      detail:
        'Verify the user, back up in time, write a useful note, and book the follow-up.',
    },
    {
      label: '40 · Resolution',
      detail:
        'The reference changes in order (half credit out of order), and 10 for a machine that actually works.',
    },
    {
      label: '15 · Safety',
      detail:
        'No change the case did not call for. A destructive change, or data put at risk before the backup, fails the attempt.',
    },
  ],
  mistakes: [
    'Replacing the power supply on a beep code. The beep pattern names memory or graphics, not power.',
    'Reimaging a machine for one driver. It is a much larger change than the fault needs.',
    'Backing up after the drive swap, which is not a backup at all.',
    'Reading nothing before the first change, then getting lucky — the sequence item still fails.',
    'Skipping Legacy mode because the machine is old. Windows 7 and XP cases are worked, not dismissed.',
  ],
  practice: {
    to: '/desktop/cases/cmos-clock-reset',
    label: 'Open the CMOS case',
    note: 'A machine that loses its clock is one part, one test and one change — the smallest complete run of the six steps, with a note to write at the end.',
  },
  home: { to: '/desktop', label: 'Back to the case queue' },
}
