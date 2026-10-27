import { Link } from 'react-router'
import { INCIDENTS } from '../data/incidents'
import { TOPOLOGY, deviceById } from '../data/topology'
import { baselineEstate } from '../logic/estate'
import { NetlabNav } from './NetlabNav'
import styles from './netlab.module.css'
import type { NetDevice, VlanId } from '../types'

const HEALTHY = baselineEstate()

const KIND_LABELS: Record<NetDevice['kind'], string> = {
  modem: 'ISP modem',
  firewall: 'Firewall',
  router: 'Router',
  switch: 'Switch',
  ap: 'Access point',
  client: 'Client',
  server: 'Server',
}

function deviceState(device: NetDevice): 'up' | 'down' | 'weak' {
  if (device.kind === 'client') {
    const client = HEALTHY.clients[device.id]
    if (client?.link === 'down') {
      return 'down'
    }
    return client?.signal === 'weak' ? 'weak' : 'up'
  }
  if (device.kind === 'ap') {
    const signal = HEALTHY.apSignal[device.id]
    return signal === 'weak' ? 'weak' : signal === 'down' ? 'down' : 'up'
  }
  if (device.kind === 'modem' || device.kind === 'firewall') {
    return HEALTHY.wan.wanUp ? 'up' : 'down'
  }
  return 'up'
}

function node(deviceId: string) {
  const device = deviceById(deviceId)
  if (!device) {
    return null
  }
  const state = deviceState(device)
  return (
    <Link className={styles.node} to={`/networking/devices/${device.id}`} data-state={state}>
      <span className={styles.nodeName}>
        <span className={styles.dot} data-state={state} aria-hidden="true" />
        {device.name}
      </span>
      <span className={styles.nodeKind}>{KIND_LABELS[device.kind]}</span>
      <span className={styles.nodeMeta}>
        {device.address ?? '—'}
        {device.vlanId ? ` · VLAN ${device.vlanId}` : ''}
      </span>
    </Link>
  )
}

function vlanDevices(vlanId: VlanId): readonly NetDevice[] {
  return TOPOLOGY.devices.filter(
    (device) =>
      device.vlanId === vlanId && (device.kind === 'client' || device.kind === 'ap' || device.kind === 'server'),
  )
}

/**
 * The school's network as one picture.
 *
 * Everything is a link because everything is a record somewhere: a switch port,
 * an AP's radio, a client's adapter. The page reads the healthy estate, so the
 * topology is a map of the site rather than a puzzle — the faults live in the
 * incidents, where they can be scored.
 */
export function NetlabTopologyPage() {
  return (
    <div className={styles.page}>
      <header>
        <p className={styles.count}>
          {TOPOLOGY.devices.length} devices · 2 VLANs · {INCIDENTS.length} incidents
        </p>
        <h1>Networking lab</h1>
        <p className={styles.lead}>
          {TOPOLOGY.site}: one fibre circuit, one firewall, one router, one managed switch
          and two VLANs. Click any device to read its record, or open an incident to work
          a fault the way the desk would.
        </p>
      </header>

      <NetlabNav />

      <section className={styles.section} aria-labelledby="path-heading">
        <div className={styles.sectionHeading}>
          <h2 id="path-heading">The path out of the building</h2>
          <span className={styles.count}>
            {TOPOLOGY.isp.name} · {TOPOLOGY.isp.circuit}
          </span>
        </div>
        <div className={styles.diagram}>
          <div className={styles.wanRow}>
            <div className={styles.node} data-kind="wan" data-state="up">
              <span className={styles.nodeName}>
                <span className={styles.dot} data-state="up" aria-hidden="true" />
                {TOPOLOGY.isp.name}
              </span>
              <span className={styles.nodeKind}>ISP circuit</span>
              <span className={styles.nodeMeta}>
                {TOPOLOGY.isp.circuit} · {TOPOLOGY.isp.publicAddress}
              </span>
            </div>
            <span className={styles.arrow} aria-hidden="true">
              →
            </span>
            {node('modem-1')}
          </div>
          <div className={styles.stage}>
            {node('fw-edge')}
            <span className={styles.arrow} aria-hidden="true">
              →
            </span>
            {node('rtr-core')}
            <span className={styles.arrow} aria-hidden="true">
              →
            </span>
            {node('sw-core')}
          </div>
          <div className={styles.stage}>
            {node('ap-staff')}
            {node('ap-student')}
            {node('srv-dc01')}
            {node('srv-files')}
          </div>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="vlan-heading">
        <div className={styles.sectionHeading}>
          <h2 id="vlan-heading">VLANs and what sits on them</h2>
          <span className={styles.count}>one subnet per VLAN, routed by rtr-core</span>
        </div>
        <div className={styles.vlanGrid}>
          {TOPOLOGY.vlans.map((vlan) => {
            const view = HEALTHY.vlans.find((entry) => entry.id === vlan.id)
            return (
              <article key={vlan.id} className={styles.vlanCard}>
                <h3 className={styles.vlanTitle}>
                  <span>
                    VLAN {vlan.id} · {vlan.name}
                  </span>
                  <span className={styles.count}>
                    {view ? `${view.free} free` : ''}
                  </span>
                </h3>
                <p className={styles.vlanMeta}>
                  {vlan.subnet} · gateway {vlan.gateway}
                  <br />
                  DHCP {vlan.dhcpStart}–{vlan.dhcpEnd} · DNS 10.10.10.10
                  <br />
                  {vlan.purpose}
                </p>
                <ul className={styles.clientList}>
                  {vlanDevices(vlan.id).map((device) => (
                    <li key={device.id}>
                      <Link
                        className={styles.clientLink}
                        to={`/networking/devices/${device.id}`}
                      >
                        <span
                          className={styles.dot}
                          data-state={deviceState(device)}
                          aria-hidden="true"
                        />
                        {device.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </article>
            )
          })}
        </div>
      </section>

      <section className={styles.section} aria-labelledby="start-heading">
        <div className={styles.sectionHeading}>
          <h2 id="start-heading">Start somewhere</h2>
          <Link className={styles.link} to="/networking/incidents">
            All {INCIDENTS.length} incidents
          </Link>
        </div>
        <ul className={styles.incidentList}>
          {INCIDENTS.slice(0, 3).map((incident) => (
            <li key={incident.id} className={styles.incidentRow}>
              <span className={styles.incidentBody}>
                <Link className={styles.incidentTitle} to={`/networking/incidents/${incident.id}`}>
                  {incident.title}
                </Link>
                <span className={styles.incidentSymptom}>{incident.symptom}</span>
              </span>
              <span className={styles.incidentMeta}>
                <span className={styles.badge} data-tone="quiet">
                  difficulty {incident.difficulty}
                </span>
                <span className={styles.badge} data-tone="quiet">
                  {incident.category}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
