import { DesktopNav } from './DesktopNav'
import styles from './desktop.module.css'

interface ToolCard {
  name: string
  command: string
  shows: string
  hides: string
}

interface ToolGroup {
  heading: string
  note: string
  tools: readonly ToolCard[]
}

const GROUPS: readonly ToolGroup[] = [
  {
    heading: 'What the machine is doing',
    note: 'The three a desk opens before anything is changed.',
    tools: [
      {
        name: 'Task Manager',
        command: 'taskmgr',
        shows: 'Processes by CPU and memory, and the Startup tab with each entry’s impact.',
        hides: 'Why an entry is there, and whether the user needs it. A high-impact startup app is a conversation, not a verdict.',
      },
      {
        name: 'Device Manager',
        command: 'devmgmt',
        shows: 'Every device and whether its driver is loaded, with the code when it is not.',
        hides: 'Which update changed it. That is the event log’s job, and the driver’s Previous Version button.',
      },
      {
        name: 'Event Viewer',
        command: 'eventvwr',
        shows: 'The error, its source and its id — the sentence the ticket should quote.',
        hides: 'The cause. An application error names the module that faulted, not the add-in that loaded it.',
      },
    ],
  },
  {
    heading: 'Disks and boot',
    note: 'Storage and the startup path.',
    tools: [
      {
        name: 'Disk Management',
        command: 'diskmgmt',
        shows: 'Every disk, its partition table and its letters — including a disk Windows can see but cannot mount.',
        hides: 'Whether the data on it is wanted. Initialising the wrong disk erases it.',
      },
      {
        name: 'System Configuration',
        command: 'msconfig',
        shows: 'The startup entries and the services beside them, and the Safe Mode options.',
        hides: 'What an entry belongs to. Disabling a security service to speed up a boot is how machines get compromised.',
      },
      {
        name: 'Safe Mode',
        command: 'safe mode',
        shows: 'Whether a fault is in a driver or startup entry, by loading without them.',
        hides: 'Nothing permanently: it is a diagnostic state, not a repair. The machine returns to the fault on the next normal boot.',
      },
    ],
  },
  {
    heading: 'Repair commands',
    note: 'The two commands that take time, and the one that undoes a change.',
    tools: [
      {
        name: 'System File Checker',
        command: 'sfc /scannow',
        shows: 'Corrupt system files it can repair from the component store.',
        hides: 'A damaged user profile. sfc repairs Windows, not the folder under C:\\Users.',
      },
      {
        name: 'Check Disk',
        command: 'chkdsk',
        shows: 'Filesystem errors and bad sectors it can mark out.',
        hides: 'A drive that is failing its own SMART report. A repair pass on a dying disk can finish it.',
      },
      {
        name: 'System Restore',
        command: 'system restore',
        shows: 'Restore points, and what a rollback would return the machine to.',
        hides: 'What else the rollback takes with it — every change since the point, not only the bad one.',
      },
    ],
  },
  {
    heading: 'Applications',
    note: 'The records behind the four application cases, and QuickBooks.',
    tools: [
      {
        name: 'Outlook profiles',
        command: 'outlook /profiles',
        shows: 'The mail profiles and their data files.',
        hides: 'The mailbox, which lives on the server and is not what broke.',
      },
      {
        name: 'Office add-ins',
        command: 'word /addins',
        shows: 'What loads with Word, and when it was installed.',
        hides: 'Which one crashed it — that is the faulting module in the application error.',
      },
      {
        name: 'Print queue',
        command: 'print queue',
        shows: 'Jobs stuck at Deleting, and that the printer still prints a test page.',
        hides: 'Why the spooler stalled; the PrintService event has the error.',
      },
      {
        name: 'QuickBooks records',
        command: 'quickbooks /file',
        shows: 'The company file log; `/multiuser`, `/license` and `/backup` read the other three.',
        hides: 'What the business has done since the last backup. A restore is a data-loss decision.',
      },
    ],
  },
]

/**
 * The tool palette, in the desk's words.
 *
 * Each card says what the tool shows and what it does not, because the second
 * half is where a learner gets caught: Event Viewer naming a faulting module is
 * not the same as naming the cause.
 */
export function DesktopToolsPage() {
  return (
    <div className={styles.page}>
      <header>
        <p className={styles.count}>Nine tools · two repair commands · four application records</p>
        <h1>Tools</h1>
        <p className={styles.lead}>
          What each simulated tool shows, and — the part that matters — what it cannot tell you.
          Every case has a console that runs them against its own machine.
        </p>
      </header>

      <DesktopNav />

      {GROUPS.map((group, index) => (
        <section key={group.heading} className={styles.section} aria-labelledby={`tools-group-${index}`}>
          <div className={styles.sectionHeading}>
            <h2 id={`tools-group-${index}`}>{group.heading}</h2>
            <span className={styles.count}>{group.tools.length} tools</span>
          </div>
          <p className={styles.note}>{group.note}</p>
          <ul className={styles.toolList}>
            {group.tools.map((tool) => (
              <li key={tool.name} className={styles.tool}>
                <span className={styles.toolName}>
                  {tool.name}
                  <code className={styles.code}>{tool.command}</code>
                </span>
                <span className={styles.toolShows}>
                  <strong>Shows:</strong> {tool.shows}
                </span>
                <span className={styles.toolHides}>
                  <strong>Cannot tell you:</strong> {tool.hides}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
