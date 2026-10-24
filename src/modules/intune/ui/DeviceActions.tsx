import { useState } from 'react'
import {
  DEVICE_ACTIONS,
  isDestructive,
  type DeviceAction,
  type IntuneDevice,
  type IntuneUser,
} from '../types'
import styles from './intune.module.css'

const LABELS: Record<DeviceAction, string> = {
  sync: 'Sync',
  restart: 'Restart',
  'assign-apps': 'Assign apps',
  'reassign-user': 'Change primary user',
  'remove-group': 'Remove from group',
  retire: 'Retire',
  wipe: 'Wipe',
}

function consequence(device: IntuneDevice, action: DeviceAction, user?: string): string {
  switch (action) {
    case 'sync':
      return `Send a sync to ${device.name}. It checks in, applies any policy settings it is missing, collects pending installs, and is re-judged against its policies.`
    case 'restart':
      return `Restart ${device.name}. Failed app installs are queued for another attempt.`
    case 'assign-apps':
      return `Assign the apps ${device.name}'s group requires. They arrive the next time the device checks in.`
    case 'reassign-user':
      return user
        ? `Make ${user} the primary user of ${device.name}. Ownership and alerts move with it; nothing changes on the hardware.`
        : 'Choose the account that should own this device.'
    case 'remove-group':
      return `Remove ${device.name} from its group. The app assignments that came from the group go with it and the device loses its policy target.`
    case 'retire':
      return `Retire ${device.name}: company data and app assignments are removed, and the device stays with its owner. It can be re-enrolled later.`
    case 'wipe':
      return `Wipe ${device.name}: a factory reset that destroys every file on the device, personal ones included. It cannot be undone.`
  }
}

interface DeviceActionsProps {
  device: IntuneDevice
  users: readonly IntuneUser[]
  busy: boolean
  onRun: (
    action: DeviceAction,
    options?: { userId?: string },
  ) => Promise<{ summary: string; status: 'applied' | 'refused' | 'failed' } | null>
}

/**
 * The action bar. Every action confirms first, because a console where one click
 * wipes a phone is a console nobody should use — and the confirmation says what
 * will happen to *this* device rather than a generic warning.
 */
export function DeviceActions({ device, users, busy, onRun }: DeviceActionsProps) {
  const [pending, setPending] = useState<DeviceAction | null>(null)
  const [userId, setUserId] = useState<string>('')
  const [result, setResult] = useState<string | null>(null)

  const managed = device.lifecycle === 'managed'
  const chosenUser = users.find((user) => user.id === userId)

  const confirm = async () => {
    if (!pending) {
      return
    }
    const outcome = await onRun(
      pending,
      pending === 'reassign-user' && userId ? { userId } : undefined,
    )
    setPending(null)
    setResult(outcome ? outcome.summary : null)
  }

  return (
    <section className={styles.actionBar} aria-label="Device actions">
      <div className={styles.actionButtons}>
        {DEVICE_ACTIONS.map((action) => (
          <button
            key={action}
            type="button"
            className={isDestructive(action) ? `${styles.button} ${styles.danger}` : styles.button}
            disabled={!managed || busy}
            onClick={() => {
              setPending(action)
              setUserId('')
              setResult(null)
            }}
          >
            {LABELS[action]}
          </button>
        ))}
      </div>

      {!managed ? (
        <p className={styles.note}>
          This device is {device.lifecycle}. A retired or wiped device receives no actions.
        </p>
      ) : null}

      {pending ? (
        <div
          className={styles.dialog}
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="intune-confirm-title"
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              setPending(null)
            }
          }}
        >
          <h3 id="intune-confirm-title" className={styles.dialogTitle}>
            {LABELS[pending]} {device.name}?
          </h3>
          <p className={styles.dialogBody}>{consequence(device, pending, chosenUser?.displayName)}</p>

          {pending === 'reassign-user' ? (
            <label className={styles.field}>
              <span>New primary user</span>
              <select value={userId} onChange={(event) => setUserId(event.target.value)}>
                <option value="">Choose an account</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id} disabled={user.status === 'disabled'}>
                    {user.displayName}
                    {user.status === 'disabled' ? ' (disabled)' : ''}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <div className={styles.dialogButtons}>
            <button
              type="button"
              className={styles.button}
              onClick={confirm}
              disabled={busy || (pending === 'reassign-user' && userId === '')}
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
