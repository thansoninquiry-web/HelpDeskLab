import { findCommand } from './commands'
import { normalizeHostname } from './network'
import { parseCommandLine } from './parser'
import type { Device, Site, World } from './types'

/**
 * The Server Room map is built from evidence, never from the world.
 *
 * Every link starts unknown. A link becomes proved or failed only when the
 * action log holds a command that actually tested it — a `ping` with a reply, a
 * `nslookup` that resolved, an `ipconfig /all` that showed a live adapter. That
 * keeps the map honest: it cannot show reachability the learner has not
 * established, and the same log is what the rubric and the debrief read.
 */

export type Reachability = 'unknown' | 'proved' | 'failed'

export interface TopologyCheck {
  id: string
  label: string
  /** The command that would prove this link. */
  command: string
  state: Reachability
  /** The line from the log that settled the state, if any. */
  evidence: string | null
  atMs: number | null
  /** The console entry and action that run this check in the pane. */
  entryId: string
  actionId: string
}

export type TopologyGroupKind = 'origin' | 'site' | 'servers'

export interface TopologyGroup {
  id: string
  kind: TopologyGroupKind
  title: string
  subtitle: string
  checks: TopologyCheck[]
}

export interface TopologyView {
  originHostname: string
  originSiteName: string
  groups: TopologyGroup[]
  proved: number
  failed: number
  total: number
}

/** One recorded command, already reduced to the text the domain can read. */
export interface TopologyCommand {
  command: string
  lines: readonly { text: string }[]
  atMs: number
}

/** The name a DNS check resolves: the file server when the zone has one. */
export function probeName(world: World): string {
  const preferred = `fileserver.${world.domain}`
  const record = world.network.dnsRecords.find((candidate) => candidate.name === preferred)
  return record?.name ?? world.network.dnsRecords[0]?.name ?? `intranet.${world.domain}`
}

/**
 * The name a lookup is run with. The short form is what a learner types and what
 * every reference path uses; the resolver appends the domain itself, so the map
 * and the console both offer the lookup the reference expects.
 */
export function probeQueryName(world: World): string {
  const name = probeName(world)
  return name.split('.')[0] ?? name
}

function textOf(command: TopologyCommand): string {
  return command.lines.map((line) => line.text).join('\n')
}

function classifyPing(command: TopologyCommand): Reachability {
  const text = textOf(command)
  if (/^Reply from /m.test(text)) {
    return 'proved'
  }
  if (/Request timed out|100% loss|could not find host/i.test(text)) {
    return 'failed'
  }
  return 'unknown'
}

function classifyLookup(command: TopologyCommand): Reachability {
  const text = textOf(command)
  if (/^Name:\s+/m.test(text)) {
    return 'proved'
  }
  if (/^\*\*\*/m.test(text) || /timed out|can't find/i.test(text)) {
    return 'failed'
  }
  return 'unknown'
}

function classifyAdapter(command: TopologyCommand): Reachability {
  const text = textOf(command)
  if (/Media disconnected/i.test(text)) {
    return 'failed'
  }
  if (/IPv4 Address|Autoconfiguration IPv4/i.test(text)) {
    return 'proved'
  }
  return 'unknown'
}

function evidenceLine(command: TopologyCommand, pattern: RegExp): string | null {
  return command.lines.find((line) => pattern.test(line.text))?.text.trim() ?? null
}

/** A readable line for whichever state the command settled. */
function evidenceFor(kind: 'ping' | 'lookup' | 'adapter', command: TopologyCommand): string | null {
  if (kind === 'ping') {
    return (
      evidenceLine(command, /^Reply from /) ??
      evidenceLine(command, /Request timed out|100% loss|could not find host/i)
    )
  }
  if (kind === 'lookup') {
    return (
      evidenceLine(command, /^Name:\s+/) ??
      evidenceLine(command, /^\*\*\*|timed out|can't find/i)
    )
  }
  return (
    evidenceLine(command, /IPv4 Address|Autoconfiguration IPv4/i) ??
    evidenceLine(command, /Media disconnected/i)
  )
}

function matchesProbe(world: World, name: string): boolean {
  const probe = normalizeHostname(probeName(world))
  const normalized = normalizeHostname(name)
  return normalized === probe || normalizeHostname(`${name}.${world.domain}`) === probe
}

interface ParsedCheck {
  checkId: string
  kind: 'ping' | 'lookup' | 'adapter'
}

function checkFor(world: World, sites: readonly Site[], servers: readonly Device[]): (command: string) => ParsedCheck | null {
  return (command: string) => {
    const parsed = parseCommandLine(command)
    if (!parsed.ok) {
      return null
    }
    const definition = findCommand(parsed.command.name)
    if (!definition) {
      return null
    }
    const args = parsed.command.args

    if (definition.name === 'ipconfig' && args[0]?.toLowerCase() === '/all') {
      return { checkId: 'origin:adapter', kind: 'adapter' }
    }

    if (definition.name === 'nslookup' && args[0] && matchesProbe(world, args[0])) {
      return { checkId: 'origin:name', kind: 'lookup' }
    }

    if (definition.name === 'ping' && args[0]) {
      const target = args[0]
      const site = sites.find((candidate) => candidate.gateway === target)
      if (site) {
        return { checkId: `site:${site.id}:gateway`, kind: 'ping' }
      }
      const host = normalizeHostname(target)
      const server = servers.find(
        (candidate) =>
          normalizeHostname(candidate.hostname) === host || candidate.ipAddress === target,
      )
      if (server) {
        return { checkId: `server:${server.id}:host`, kind: 'ping' }
      }
    }

    return null
  }
}

export function buildTopology(
  world: World,
  commands: readonly TopologyCommand[],
): TopologyView {
  const origin = world.devices.find((device) => device.id === world.currentDeviceId) ?? null
  const originSite = origin
    ? (world.sites.find((site) => site.id === origin.siteId) ?? null)
    : null
  const sites = [...world.sites].sort((left, right) => left.name.localeCompare(right.name))
  const servers = world.devices
    .filter((device) => device.kind === 'server' && device.id !== origin?.id)
    .sort((left, right) => left.hostname.localeCompare(right.hostname))

  const adapterCheck: TopologyCheck = {
    id: 'origin:adapter',
    label: 'Adapter and lease',
    command: 'ipconfig /all',
    state: 'unknown',
    evidence: null,
    atMs: null,
    entryId: origin?.id ?? '',
    actionId: 'machine-adapter',
  }
  const nameCheck: TopologyCheck = {
    id: 'origin:name',
    label: 'Name resolution',
    command: `nslookup ${probeQueryName(world)}`,
    state: 'unknown',
    evidence: null,
    atMs: null,
    entryId: origin?.id ?? '',
    actionId: 'machine-resolve',
  }
  const gatewayChecks = new Map<string, TopologyCheck>(
    sites.map((site) => [
      `site:${site.id}:gateway`,
      {
        id: `site:${site.id}:gateway`,
        label: 'Gateway',
        command: `ping ${site.gateway}`,
        state: 'unknown',
        evidence: null,
        atMs: null,
        entryId: site.id,
        actionId: 'site-gateway',
      },
    ]),
  )
  const hostChecks = new Map<string, TopologyCheck>(
    servers.map((server) => [
      `server:${server.id}:host`,
      {
        id: `server:${server.id}:host`,
        label: server.hostname,
        command: `ping ${server.hostname}`,
        state: 'unknown',
        evidence: null,
        atMs: null,
        entryId: server.id,
        actionId: 'server-ping',
      },
    ]),
  )

  const all = [adapterCheck, nameCheck, ...gatewayChecks.values(), ...hostChecks.values()]
  const byId = new Map(all.map((check) => [check.id, check]))
  const resolveCheck = checkFor(world, sites, servers)

  for (const entry of commands) {
    const target = resolveCheck(entry.command)
    if (!target) {
      continue
    }
    const check = byId.get(target.checkId)
    if (!check) {
      continue
    }
    const state =
      target.kind === 'ping'
        ? classifyPing(entry)
        : target.kind === 'lookup'
          ? classifyLookup(entry)
          : classifyAdapter(entry)
    if (state === 'unknown') {
      continue
    }
    // The most recent check wins, so a retest can correct an earlier failure.
    check.state = state
    check.evidence = evidenceFor(target.kind, entry)
    check.atMs = entry.atMs
  }

  const groups: TopologyGroup[] = [
    {
      id: 'origin',
      kind: 'origin',
      title: 'This machine',
      subtitle: origin
        ? `${origin.hostname} · ${originSite?.name ?? origin.siteId}`
        : 'No machine attached',
      checks: [adapterCheck, nameCheck],
    },
    ...sites.map((site) => ({
      id: `site:${site.id}`,
      kind: 'site' as const,
      title: site.name,
      subtitle: `${site.subnet} · gateway ${site.gateway}`,
      checks: [gatewayChecks.get(`site:${site.id}:gateway`)].filter(
        (check): check is TopologyCheck => check !== undefined,
      ),
    })),
    {
      id: 'servers',
      kind: 'servers',
      title: 'Servers',
      subtitle: `${servers.length} host${servers.length === 1 ? '' : 's'}`,
      checks: servers
        .map((server) => hostChecks.get(`server:${server.id}:host`))
        .filter((check): check is TopologyCheck => check !== undefined),
    },
  ]

  return {
    originHostname: origin?.hostname ?? 'This machine',
    originSiteName: originSite?.name ?? '',
    groups,
    proved: all.filter((check) => check.state === 'proved').length,
    failed: all.filter((check) => check.state === 'failed').length,
    total: all.length,
  }
}
