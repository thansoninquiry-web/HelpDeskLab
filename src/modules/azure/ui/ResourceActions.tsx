import { useState } from 'react'
import {
  ACTIONS_BY_KIND,
  isDestructive,
  PRINCIPALS,
  type AzureResource,
  type AzureState,
  type ResourceAction,
  type RoleName,
} from '../types'
import { ACTION_LABELS } from './labels'
import { resourceGroupName } from '../logic/diagnostics'
import type { ActOptions } from './useAzure'
import styles from './azure.module.css'

const OPEN_PORTS = [443, 80, 22, 3389] as const
const ROLES: readonly RoleName[] = ['Contributor', 'Reader', 'Owner']

function consequence(
  resource: AzureResource,
  action: ResourceAction,
  state: AzureState,
  port: number,
  principalLabel: string,
  role: RoleName,
): string {
  const group = resourceGroupName(state, resource.resourceGroupId)
  switch (action) {
    case 'start':
      return `Start ${resource.name}. The machine runs again, compute billing resumes, and the disks it already has come back with it.`
    case 'deallocate':
      return `Deallocate ${resource.name}. Compute billing stops and the disks are kept, so the machine can be started again with its data. The guest is not left running.`
    case 'restart':
      return `Restart ${resource.name}. The guest reboots and stays allocated throughout; this does not change what it costs.`
    case 'open-port':
      return `Add an inbound allow rule to ${resource.name} for TCP ${port} from the internet. The default deny stops applying to that port.`
    case 'close-port':
      return `Remove the inbound allow rule for TCP ${port} on ${resource.name}. The default deny applies again, and whoever relied on that port loses access.`
    case 'restrict-public-access':
      return `Turn off public blob access on ${resource.name}. Anonymous reads stop immediately; anything that relied on an unsigned URL has to be given a signed one.`
    case 'enable-soft-delete':
      return `Turn on soft delete on ${resource.name}, keeping deleted or overwritten blobs for 30 days. Blobs deleted before now are not covered.`
    case 'require-tls':
      return `Raise the minimum TLS version on ${resource.name} to 1.2. Clients that can only speak 1.0 or 1.1 are refused rather than downgraded.`
    case 'scale-up':
      return `Move ${resource.name} to the Standard plan. The daily CPU quota goes away and the monthly bill goes up.`
    case 'assign-role':
      return `Give ${principalLabel} the ${role} role on ${group}. A role applies to everything in the group, not only to this resource.`
    case 'delete-vm':
      return `Delete ${resource.name} and its disks. This cannot be undone, and it is not how a cost ticket is closed.`
    case 'delete-resource-group':
      return `Delete ${group} and every resource in it, including their rules and role assignments. Nothing in that group can be recovered.`
  }
}

interface ResourceActionsProps {
  resource: AzureResource
  state: AzureState
  busy: boolean
  onRun: (
    action: ResourceAction,
    options?: ActOptions,
  ) => Promise<{ summary: string; status: 'applied' | 'refused' | 'failed' } | null>
}

/**
 * The action bar. Every action confirms first, and the confirmation says what
 * will happen to *this* resource rather than a generic warning.
 */
export function ResourceActions({ resource, state, busy, onRun }: ResourceActionsProps) {
  const [pending, setPending] = useState<ResourceAction | null>(null)
  const [port, setPort] = useState<number>(443)
  const [role, setRole] = useState<RoleName>('Contributor')
  const [principal, setPrincipal] = useState<string>('usr-contractor')
  const [result, setResult] = useState<string | null>(null)

  const actions = ACTIONS_BY_KIND[resource.properties.kind]
  const group = resourceGroupName(state, resource.resourceGroupId)
  const chosenPrincipal =
    PRINCIPALS.find((entry) => entry.id === principal)?.label ?? 'the chosen principal'
  // In priority order, which is the order the group reads them: the first rule
  // is the first thing the group allows, and so the first choice offered here.
  const openPorts = state.nsgRules
    .filter(
      (rule) =>
        rule.nsgId === resource.id &&
        rule.direction === 'inbound' &&
        rule.access === 'allow' &&
        rule.port !== null,
    )
    .slice()
    .sort((left, right) => left.priority - right.priority)
    .map((rule) => rule.port as number)
    .filter((port, index, all) => all.indexOf(port) === index)

  const confirm = async () => {
    if (!pending) {
      return
    }
    const options: ActOptions | undefined =
      pending === 'open-port' || pending === 'close-port'
        ? { port }
        : pending === 'assign-role'
          ? { principal, role }
          : undefined
    const outcome = await onRun(pending, options)
    setPending(null)
    setResult(outcome ? outcome.summary : null)
  }

  return (
    <section className={styles.actionBar} aria-label="Resource actions">
      <div className={styles.actionButtons}>
        {actions.map((action) => (
          <button
            key={action}
            type="button"
            className={isDestructive(action) ? `${styles.button} ${styles.danger}` : styles.button}
            disabled={busy}
            onClick={() => {
              setPending(action)
              setPort(action === 'close-port' ? (openPorts[0] ?? 443) : 443)
              setRole('Contributor')
              setPrincipal('usr-contractor')
              setResult(null)
            }}
          >
            {action === 'delete-resource-group' ? `Delete ${group}` : ACTION_LABELS[action]}
          </button>
        ))}
      </div>

      {pending ? (
        <div
          className={styles.dialog}
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="azure-confirm-title"
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              setPending(null)
            }
          }}
        >
          <h3 id="azure-confirm-title" className={styles.dialogTitle}>
            {ACTION_LABELS[pending]} on {resource.name}?
          </h3>
          <p className={styles.dialogBody}>
            {consequence(resource, pending, state, port, chosenPrincipal, role)}
          </p>

          {pending === 'open-port' ? (
            <label className={styles.field}>
              <span>Port to open</span>
              <select value={port} onChange={(event) => setPort(Number(event.target.value))}>
                {OPEN_PORTS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {pending === 'close-port' ? (
            <label className={styles.field}>
              <span>Port to close</span>
              <select value={port} onChange={(event) => setPort(Number(event.target.value))}>
                {openPorts.length === 0 ? <option value={443}>no inbound ports are open</option> : null}
                {openPorts.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {pending === 'assign-role' ? (
            <>
              <label className={styles.field}>
                <span>Principal</span>
                <select value={principal} onChange={(event) => setPrincipal(event.target.value)}>
                  {PRINCIPALS.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.field}>
                <span>Role on {group}</span>
                <select
                  value={role}
                  onChange={(event) => setRole(event.target.value as RoleName)}
                >
                  {ROLES.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
            </>
          ) : null}

          <div className={styles.dialogButtons}>
            <button
              type="button"
              className={isDestructive(pending) ? `${styles.button} ${styles.danger}` : styles.button}
              onClick={() => void confirm()}
              disabled={busy}
            >
              Confirm
            </button>
            <button type="button" className={styles.buttonQuiet} onClick={() => setPending(null)}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      <p className={styles.note} role="status" aria-live="polite">
        {result ?? ''}
      </p>
    </section>
  )
}
