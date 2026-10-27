import { Link, useParams } from 'react-router'
import { CommandConsole } from '../../../ui/components/CommandConsole'
import { muted, type ConsoleResponse } from '../../shared/console'
import { INCIDENTS } from '../data/incidents'
import { deviceById, TOPOLOGY } from '../data/topology'
import { baselineEstate } from '../logic/estate'
import { equipmentRead, runTool } from '../logic/tools'
import { NetlabNav } from './NetlabNav'
import styles from './netlab.module.css'
import type { Incident, NetDevice } from '../types'

const HEALTHY = baselineEstate()

const KIND_LABELS: Record<NetDevice['kind'], string> = {
  modem: 'ISP modem',
  firewall: 'Edge firewall',
  router: 'Core router',
  switch: 'Managed switch',
  ap: 'Access point',
  client: 'Client',
  server: 'Server',
}

function involves(incident: Incident, device: NetDevice): boolean {
  if (incident.subjectId === device.id) {
    return true
  }
  const fault = incident.fault
  if ('deviceId' in fault && fault.deviceId === device.id) {
    return true
  }
  if ('port' in fault && device.port === fault.port) {
    return true
  }
  if (
    device.kind === 'switch' &&
    ['trunk-vlan', 'dhcp-exhausted', 'duplex', 'rogue-dhcp'].includes(fault.kind)
  ) {
    return true
  }
  return device.kind === 'router' && ['dhcp-exhausted', 'isp-outage', 'firewall-wan-down'].includes(fault.kind)
}

/**
 * One device's record.
 *
 * The switch and the router get their own read-only shell, a client gets the
 * Windows tools, and the equipment gets the vendor status page it would really
 * have. Nothing on this page changes the estate: a change belongs to an
 * incident, where it is logged and scored.
 */
export function NetlabDevicePage() {
  const { deviceId = '' } = useParams()
  const device = deviceById(deviceId)

  if (!device) {
    return (
      <div className={styles.page}>
        <header>
          <h1>Unknown device</h1>
          <p className={styles.empty}>
            There is no device <span className={styles.mono}>{deviceId}</span> in this
            school.
          </p>
        </header>
        <NetlabNav />
        <Link className={styles.link} to="/networking">
          Back to the topology
        </Link>
      </div>
    )
  }

  const client = HEALTHY.clients[device.id]
  const read = equipmentRead(HEALTHY, device.id)
  const incidents = INCIDENTS.filter((incident) => involves(incident, device)).slice(0, 5)
  const shell = device.kind === 'switch' || device.kind === 'router'
  const tools = device.kind === 'client'

  const run = (input: string): ConsoleResponse => {
    const outcome = runTool({ estate: HEALTHY, deviceId: device.id }, input)
    return { lines: outcome.lines, cleared: outcome.cleared }
  }

  return (
    <div className={styles.page}>
      <header>
        <p className={styles.count}>
          {KIND_LABELS[device.kind]} · {device.model} · {device.area}
        </p>
        <h1>{device.name}</h1>
        <p className={styles.lead}>{device.role}</p>
      </header>

      <NetlabNav />

      <section className={styles.section} aria-labelledby="record-heading">
        <div className={styles.sectionHeading}>
          <h2 id="record-heading">The record</h2>
          <Link className={styles.link} to="/networking">
            Back to the topology
          </Link>
        </div>
        <dl className={styles.metaList}>
          <div className={styles.metaItem}>
            <dt>Address</dt>
            <dd>
              {client && client.link === 'down'
                ? 'no link'
                : (device.address ?? client?.address ?? '—')}
            </dd>
          </div>
          <div className={styles.metaItem}>
            <dt>VLAN</dt>
            <dd>
              {device.vlanId
                ? `${device.vlanId} · ${TOPOLOGY.vlans.find((vlan) => vlan.id === device.vlanId)?.name ?? ''}`
                : device.kind === 'modem' || device.kind === 'firewall'
                  ? 'WAN and LAN'
                  : 'trunked'}
            </dd>
          </div>
          <div className={styles.metaItem}>
            <dt>Switch port</dt>
            <dd>{device.port ?? '—'}</dd>
          </div>
          <div className={styles.metaItem}>
            <dt>MAC</dt>
            <dd>{device.mac}</dd>
          </div>
          <div className={styles.metaItem}>
            <dt>Uplink</dt>
            <dd>{device.uplink ? (deviceById(device.uplink)?.name ?? device.uplink) : '—'}</dd>
          </div>
          <div className={styles.metaItem}>
            <dt>Wireless</dt>
            <dd>
              {device.wireless
                ? `${device.wireless.apId} · ${device.ssid ?? ''}`
                : shell || device.kind === 'server' || device.kind === 'modem' || device.kind === 'firewall'
                  ? '—'
                  : 'wired'}
            </dd>
          </div>
        </dl>
      </section>

      {client && device.kind === 'client' ? (
        <section className={styles.section} aria-labelledby="adapter-heading">
          <div className={styles.sectionHeading}>
            <h2 id="adapter-heading">The adapter</h2>
            <span className={styles.count}>{client.media}</span>
          </div>
          <dl className={styles.metaList}>
            <div className={styles.metaItem}>
              <dt>Address</dt>
              <dd>{client.address}/24</dd>
            </div>
            <div className={styles.metaItem}>
              <dt>Gateway</dt>
              <dd>{client.gateway ?? 'none'}</dd>
            </div>
            <div className={styles.metaItem}>
              <dt>DNS</dt>
              <dd>{client.dns.join(', ')}</dd>
            </div>
            <div className={styles.metaItem}>
              <dt>Lease</dt>
              <dd>
                {client.dhcp ? `DHCP · ${client.lease}` : 'static'}
                {client.rogueLease ? ' · rogue DHCP' : ''}
              </dd>
            </div>
            <div className={styles.metaItem}>
              <dt>Link</dt>
              <dd>
                {client.link} · {client.speedMbps} Mb/s {client.duplex}
              </dd>
            </div>
            <div className={styles.metaItem}>
              <dt>Radio</dt>
              <dd>{client.ssid ? `${client.ssid} · ${client.signal}` : 'wired'}</dd>
            </div>
          </dl>
        </section>
      ) : null}

      {read && !shell && !tools ? (
        <section className={styles.section} aria-labelledby="status-heading">
          <div className={styles.sectionHeading}>
            <h2 id="status-heading">{read.label}</h2>
            <span className={styles.count}>healthy estate</span>
          </div>
          <pre className={styles.readOut}>{read.lines.map((line) => line.text).join('\n')}</pre>
        </section>
      ) : null}

      {shell || tools ? (
        <section className={styles.section} aria-labelledby="console-heading">
          <div className={styles.sectionHeading}>
            <h2 id="console-heading">{shell ? 'Device CLI' : 'Windows tools'}</h2>
            <span className={styles.count}>read-only · nothing here is scored</span>
          </div>
          <CommandConsole
            title={device.name}
            subtitle={
              shell ? `${device.name} · read-only IOS shell` : `${device.name} · simulated Windows tools`
            }
            prompt={device.kind === 'switch' ? 'sw-core#' : device.kind === 'router' ? 'rtr-core#' : 'C:\\Users\\lab>'}
            intro={[
              muted(
                shell
                  ? 'Read-only shell. Configuration is refused; changes belong to an incident, where they are logged.'
                  : 'Every command reads the simulated machine. Type help for the list.',
              ),
            ]}
            suggestions={
              device.kind === 'switch'
                ? ['show interfaces status', 'show interfaces trunk', 'show vlan', 'show mac address-table']
                : device.kind === 'router'
                  ? ['show ip interface brief', 'show ip dhcp pool', 'show ip route']
                  : ['ipconfig /all', 'ping 10.10.10.1', 'nslookup srv-files', 'tracert 1.1.1.1']
            }
            run={run}
          />
        </section>
      ) : null}

      {incidents.length > 0 ? (
        <section className={styles.section} aria-labelledby="incidents-heading">
          <div className={styles.sectionHeading}>
            <h2 id="incidents-heading">Incidents that touch this device</h2>
            <span className={styles.count}>{incidents.length} of {INCIDENTS.length}</span>
          </div>
          <ul className={styles.incidentList}>
            {incidents.map((incident) => (
              <li key={incident.id} className={styles.incidentRow}>
                <span className={styles.incidentBody}>
                  <Link
                    className={styles.incidentTitle}
                    to={`/networking/incidents/${incident.id}`}
                  >
                    {incident.title}
                  </Link>
                  <span className={styles.incidentSymptom}>{incident.symptom}</span>
                </span>
                <span className={styles.incidentMeta}>
                  <span className={styles.badge} data-tone="quiet">
                    difficulty {incident.difficulty}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}
