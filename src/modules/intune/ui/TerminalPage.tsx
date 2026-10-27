import { CommandConsole } from '../../../ui/components/CommandConsole'
import {
  blank,
  failure,
  muted,
  outcomeLine,
  type ConsoleResponse,
} from '../../../modules/shared/console'
import { runIntuneCommand } from '../logic/commands'
import { IntuneNav } from './IntuneNav'
import { useIntune } from './useIntune'
import styles from './intune.module.css'

/**
 * The console as a shell.
 *
 * The device pages are how the estate is browsed; this is how it is queried. It
 * is the same estate and the same actions — an action typed here goes through
 * the service and lands in the device's activity log exactly as the action bar
 * would — so working from the terminal is rehearsing the job, not skipping it.
 */
export function IntuneTerminalPage() {
  const { state, error, busy, act, review } = useIntune()

  const respond = async (input: string): Promise<ConsoleResponse> => {
    if (!state) {
      return { lines: [failure('The estate is still opening. Try again in a moment.')] }
    }

    const plan = runIntuneCommand(state, input)

    if (plan.kind === 'print') {
      return plan.response
    }

    if (plan.kind === 'read') {
      const summary = await review(plan.deviceId)
      return {
        lines: [
          ...plan.record,
          blank(),
          summary
            ? muted(`${summary} Read recorded against this attempt.`)
            : failure('The record could not be read.'),
        ],
      }
    }

    const outcome = await act(
      plan.deviceId,
      plan.action,
      plan.userId ? { userId: plan.userId } : undefined,
    )
    return {
      lines: outcome
        ? [outcomeLine(outcome.summary, outcome.status)]
        : [failure(error ?? 'The action could not be applied.')],
    }
  }

  return (
    <div className={styles.page}>
      <header>
        <p className={styles.count}>Simulated console · commands change the local estate</p>
        <h1>Terminal</h1>
        <p className={styles.note}>
          The same estate as the pages, driven the way an administrator drives it: typed
          commands over the devices, their policies and their apps. Reads print what the
          console knows; the safe device actions run for real. Retire and Wipe are
          deliberately absent — they stay on the device page, which states the consequence
          before it runs.
        </p>
      </header>

      <IntuneNav />

      {error ? (
        <p className={styles.empty} role="alert">
          {error}
        </p>
      ) : null}

      <CommandConsole
        title="Intune shell"
        subtitle="PowerShell cmdlets against the simulated estate"
        prompt="PS>"
        intro={[
          muted('Intune shell — the simulated estate, typed rather than clicked.'),
          muted('Type help for every command. Nothing destructive can be run from here.'),
        ]}
        suggestions={[
          'Get-Devices',
          'Get-Device LT-2207',
          'Get-Compliance LT-2207',
          'Get-Policies',
          'Sync-Device LT-2207',
        ]}
        busy={busy || !state}
        run={respond}
      />

      <p className={styles.note}>
        A command is the same step as the button beside it: an action typed here is written
        to the device&apos;s activity log, and <code>Get-Device</code> counts as reading the
        record, so the diagnostic step is credited either way.
      </p>
    </div>
  )
}
