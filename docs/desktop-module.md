# Desktop support and PC repair (M11)

A bench, a machine and the software on it. `src/modules/desktop/` is reached at
`/desktop`; every case is one fault, one machine, one attempt that is scored and
kept.

The school in the networking lab has a stock room; this is the desk that looks
after its machines. Nothing here names a real person, company or machine.

## The bench

Two shapes, because the faults differ by shape:

- **Desktop** — power supply, motherboard, processor, two memory slots, graphics
  card, cooler and fans, CMOS battery, drive.
- **Laptop** — battery, charger, panel, keyboard, plus the memory and drive a
  technician can still reach.

`data/parts.ts` gives every part its role, the test that settles whether it is
good, and what a failing one looks like. The bench page shows both diagrams as a
reference; a case shows the diagram for its own shape. Clicking a part selects
it; the panel then offers **Test** (a recorded read) and, when the case offers
it, **Replace** — the same changes the action bar lists.

## The 25 cases

Five groups, in the order the queue shows them:

| Group | Cases |
| --- | --- |
| Hardware bench (10) | no POST / dead PSU, beep code / unseated memory, failing memory, failing drive, overheating shutdown, flat CMOS battery, dead laptop battery, dead charger, cracked panel, dead keys |
| Windows 10 and 11 (4) | profile service failure, display driver regression after an update, slow boot from startup apps, new disk with no partition table |
| Legacy mode (3) | Windows 7 USB drivers after a clean install, XP-era program refusal (compatibility mode), a Windows 7 machine out of support with updates off |
| Application support (4) | Outlook profile corruption, Word crashing on one document (add-in), stuck print queue, shared printer install |
| QuickBooks (4) | company file damaged, multi-user hosting, licence expired, restore the backup |

Each case names the reads that isolate it, the changes the bar offers (including
the plausible wrong ones), the reference path, three hints and the explanation a
debrief shows. The verification for every case is a fact about the machine, in
one table in `data/cases.ts`; a test walks all 25 and proves each reference path
actually resolves it.

## The tools

Simulated, in `logic/tools.ts`, over the case's own machine:

```
taskmgr            devmgmt            eventvwr            diskmgmt
msconfig           safe mode          sfc /scannow        chkdsk
system restore     winver             compat
outlook /profiles  word /addins       print queue         print install
quickbooks /file   /multiuser         /license            /backup
post               beep               test <part>         memtest [ram-1|ram-2]
smart              temp               battery             charger
display            keyboard
```

Every read returns the check it recorded, and the case page's "Reads that
isolate it" buttons run the same commands — one table, so a shortcut and the
console cannot disagree. Changes are refused in the console: they go through the
action bar, so every change leaves a record.

## "Do the right thing"

Four steps, on every case:

1. **Verify the user and the machine.** 5 of the 20 documentation points.
2. **Back up the data first.** 7 points, and the step that can fail an attempt:
   any change in `DATA_RISK_FIXES` made before the backup tick makes the attempt
   unable to pass, however healthy the machine ends up. Cases where nothing can
   lose data score the step automatically and say so.
3. **Document it.** 4 points, and only for a note long enough to name the
   symptom, the evidence and the change.
4. **Book the follow-up.** 4 points.

## Scoring

Attempts are scored out of 100 in the app's four categories:

- **Diagnosis, 25** — 20 for the reads the reference path needs, taken before
  the first change, and 5 for looking before touching at all.
- **Documentation, 20** — the checklist above.
- **Resolution, 40** — 30 for the reference path in order, 10 for the machine
  actually working.
- **Safety, 15** — 5 per change the case did not call for, 10 for one that takes
  something away; either can fail the attempt.

A correct fix with no reads scores 55 at best: guessing the button is not the
job. Attempts join XP, scenario stats and weak topics through
`src/app/desktopProgress.ts`, so a bench case that keeps falling short appears
on Progress like any other family.

## Legacy mode

Windows 7 and XP appear as cases, not as a settings toggle, because that is how
they arrive: a stock-room machine with dead USB ports after a clean install, a
payroll program that exits on a newer Windows, a machine with updates off since
2019. The bench page states what each edition changes about the job — including
that Windows 7 has had no security updates since January 2020 and Windows 10 is
out of mainstream support.

## Storage

One table from one migration (schema v19), in `persistence/store.ts`:

- `desktop_attempts` — the attempt, its reads, its changes, its checklist and
  its score, as one ordered story in `state_json`.

The machine, the parts and the cases are code, so adding a case needs no
migration and nothing records a real user's data.

## Boundaries

- `ui → app → domain`, `app → persistence`. The module is reached through
  `src/app/desktopService.ts` and `src/app/desktopProgress.ts`; it imports the
  app only for the scoring thresholds.
- Nothing is executed. `sfc`, `chkdsk` and the rest are simulated reads over the
  case's estate, and the console cannot change the machine.
- The bench sits beside the other simulators; it replaces no part of the ticket
  queue and adds one entry to the header nav (`/desktop`) with its own tabs.
