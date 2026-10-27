import { CommandConsole } from '../../../ui/components/CommandConsole'
import {
  blank,
  failure,
  muted,
  outcomeLine,
  type ConsoleResponse,
} from '../../../modules/shared/console'
import { runAzureCommand } from '../logic/commands'
import { AzureNav } from './AzureNav'
import { useAzure } from './useAzure'
import styles from './azure.module.css'

/**
 * The subscription as a shell.
 *
 * Microsoft's own tooling for this estate is the CLI, so the console offers one:
 * the same resources, the same findings, and the same safe actions as the pages,
 * written as commands. An action typed here goes through the service, so it lands
 * in the activity log and the ticket score exactly as its button would.
 */
export function AzureTerminalPage() {
  const { state, error, busy, act, review } = useAzure()

  const respond = async (input: string): Promise<ConsoleResponse> => {
    if (!state) {
      return { lines: [failure('The subscription is still opening. Try again in a moment.')] }
    }

    const plan = runAzureCommand(state, input)

    if (plan.kind === 'print') {
      return plan.response
    }

    if (plan.kind === 'read') {
      const summary = await review(plan.resourceId)
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

    const outcome = await act(plan.resourceId, plan.action, {
      port: plan.port,
      principal: plan.principal,
      role: plan.role,
    })
    return {
      lines: outcome
        ? [outcomeLine(outcome.summary, outcome.status)]
        : [failure(error ?? 'The action could not be applied.')],
    }
  }

  return (
    <div className={styles.page}>
      <header>
        <p className={styles.count}>Simulated console · commands change the local subscription</p>
        <h1>Terminal</h1>
        <p className={styles.note}>
          The subscription the pages show, driven the way it is driven in the job:{' '}
          <code>az</code> commands over machines, storage, rules and access. Reads print the
          record and its
          findings; the safe actions run for real. Deleting a machine or a group is
          deliberately absent — that stays on the resource page, which says what goes with
          it.
        </p>
      </header>

      <AzureNav />

      {error ? (
        <p className={styles.empty} role="alert">
          {error}
        </p>
      ) : null}

      <CommandConsole
        title="Azure shell"
        subtitle="az commands against the simulated subscription"
        prompt="az>"
        intro={[
          muted('Azure shell — the simulated subscription, typed rather than clicked.'),
          muted('Type help for every command. Nothing destructive can be run from here.'),
        ]}
        suggestions={[
          'az resource list',
          'az resource show --name vm-app-01',
          'az network nsg rule list --nsg nsg-web-prod',
          'az role assignment list',
          'az vm deallocate --name vm-app-01',
        ]}
        busy={busy || !state}
        run={respond}
      />

      <p className={styles.note}>
        Reading is a step the attempt keeps: <code>az resource show</code> prints the record
        and its findings, and records the read the diagnosis category is scored from — the
        same thing the Read button does.
      </p>
    </div>
  )
}
