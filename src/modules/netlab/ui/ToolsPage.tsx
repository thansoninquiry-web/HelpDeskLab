import { useState } from 'react'
import { CommandConsole } from '../../../ui/components/CommandConsole'
import { muted, type ConsoleResponse } from '../../shared/console'
import { TOPOLOGY, deviceById } from '../data/topology'
import { baselineEstate } from '../logic/estate'
import { runTool } from '../logic/tools'
import { NetlabNav } from './NetlabNav'
import styles from './netlab.module.css'

const HEALTHY = baselineEstate()

const TOOL_DEVICES = TOPOLOGY.devices.filter(
  (device) => device.kind === 'client' || device.kind === 'switch' || device.kind === 'router',
)

/**
 * The tool box on its own.
 *
 * Same resolver as the incident workspace, pointed at the healthy estate and
 * scoring nothing: a place to try a command and read the output without an
 * attempt around it. The workspace is where a read becomes evidence.
 */
export function NetlabToolsPage() {
  const [deviceId, setDeviceId] = useState('pc-staff-01')
  const active = deviceById(deviceId)
  const shell = active?.kind === 'switch' || active?.kind === 'router'

  const run = (input: string): ConsoleResponse => {
    const outcome = runTool({ estate: HEALTHY, deviceId }, input)
    return { lines: outcome.lines, cleared: outcome.cleared }
  }

  return (
    <div className={styles.page}>
      <header>
        <p className={styles.count}>
          {TOOL_DEVICES.length} devices · simulated tools · nothing here is scored
        </p>
        <h1>Tools</h1>
        <p className={styles.lead}>
          The Windows tools a desk actually uses, and the read-only shell on the switch and
          router. Pick a device, try a command, and read what the healthy network says back.
          Inside an incident, the same commands become the evidence the attempt is scored on.
        </p>
      </header>

      <NetlabNav />

      <section className={styles.section} aria-labelledby="toolbox-heading">
        <div className={styles.sectionHeading}>
          <h2 id="toolbox-heading">A console without an incident</h2>
          <span className={styles.count}>{shell ? 'device CLI' : 'Windows tools'}</span>
        </div>

        <label className={styles.field}>
          <span>Run against</span>
          <select value={deviceId} onChange={(event) => setDeviceId(event.target.value)}>
            {TOOL_DEVICES.map((device) => (
              <option key={device.id} value={device.id}>
                {device.name}
                {device.vlanId ? ` · VLAN ${device.vlanId}` : ''}
              </option>
            ))}
          </select>
        </label>

        <CommandConsole
          key={deviceId}
          title={active?.name ?? 'Lab tools'}
          subtitle={
            shell
              ? `${active?.name ?? 'Device'} · read-only IOS shell`
              : `${active?.name ?? 'Client'} · simulated Windows tools`
          }
          prompt={
            active?.kind === 'switch'
              ? 'sw-core#'
              : active?.kind === 'router'
                ? 'rtr-core#'
                : 'C:\\Users\\lab>'
          }
          intro={[
            muted(
              shell
                ? 'Read-only shell. Configuration is refused; changes belong to an incident.'
                : 'Every command reads the simulated machine. Type help for the list.',
            ),
          ]}
          suggestions={
            active?.kind === 'switch'
              ? ['show interfaces status', 'show interfaces trunk', 'show vlan', 'show mac address-table']
              : active?.kind === 'router'
                ? ['show ip interface brief', 'show ip dhcp pool', 'show ip route']
                : ['ipconfig /all', 'ping 10.10.10.1', 'nslookup srv-files', 'tracert 1.1.1.1']
          }
          run={run}
        />
      </section>

      <section className={styles.section} aria-labelledby="commands-heading">
        <div className={styles.sectionHeading}>
          <h2 id="commands-heading">What the shells answer</h2>
        </div>
        <div className={styles.vlanGrid}>
          <article className={styles.vlanCard}>
            <h3 className={styles.vlanTitle}>Windows tools</h3>
            <p className={styles.vlanMeta}>
              ipconfig /all · ping · tracert · nslookup · arp -a · netstat -an ·{' '}
              test-netconnection · netsh wlan show interfaces
            </p>
          </article>
          <article className={styles.vlanCard}>
            <h3 className={styles.vlanTitle}>Switch</h3>
            <p className={styles.vlanMeta}>
              show ip interface brief · show interfaces status · show interfaces trunk ·
              show vlan · show mac address-table
            </p>
          </article>
          <article className={styles.vlanCard}>
            <h3 className={styles.vlanTitle}>Router</h3>
            <p className={styles.vlanMeta}>
              show ip interface brief · show ip route · show ip dhcp pool · show ip dhcp
              binding · ping
            </p>
          </article>
        </div>
      </section>
    </div>
  )
}
