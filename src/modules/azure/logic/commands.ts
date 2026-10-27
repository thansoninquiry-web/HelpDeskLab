import {
  blank,
  column,
  failure,
  line,
  muted,
  type ConsoleLine,
  type ConsoleResponse,
} from '../../shared/console'
import {
  findingsFor,
  exposureOf,
  formatMoney,
  monthlyCost,
  resourceGroupName,
  resourceKindLabel,
} from './diagnostics'
import {
  PRINCIPALS,
  type AzureResource,
  type AzureState,
  type ResourceAction,
  type RoleName,
} from '../types'

/**
 * The Azure shell.
 *
 * The console is a CLI the way Azure's is a CLI: one `az` verb per thing done to
 * a resource, flags for the values the command needs, and a list command for
 * every group. Two rules keep it honest against the rest of the console:
 *
 * - A command never writes. It reads, or it asks the page to run exactly one
 *   action through the service, so the activity log and the score are the ones
 *   the action bar would have produced.
 * - Nothing destructive is reachable. Deleting a machine or a resource group is
 *   still done from the resource page, which spells out what goes with it.
 */

export interface AzureActionPlan {
  kind: 'act'
  resourceId: string
  action: ResourceAction
  port?: number
  principal?: string
  role?: RoleName
}

/**
 * A resource was read. `az resource show` is the same step as the page's read
 * button — the one the diagnosis category is scored from — so it records the
 * read as well as printing the record.
 */
export interface AzureReadPlan {
  kind: 'read'
  resourceId: string
  record: readonly ConsoleLine[]
}

export interface AzurePrintPlan {
  kind: 'print'
  response: ConsoleResponse
}

export type AzurePlan = AzureActionPlan | AzureReadPlan | AzurePrintPlan

const HELP: readonly (readonly [string, string])[] = [
  ['az resource list', 'every resource, its group, state and monthly cost'],
  ['az resource show --name <name>', 'one resource: settings, exposure and findings'],
  ['az network nsg rule list --nsg <nsg>', 'the rules on a network security group'],
  ['az role assignment list', 'who holds which role, and over what'],
  ['az vm start --name <vm>', 'start a machine and resume compute billing'],
  ['az vm deallocate --name <vm>', 'stop billing and keep the disks'],
  ['az vm restart --name <vm>', 'reboot the guest, and keep it allocated'],
  ['az storage account update --name <sa> --allow-blob-public-access false', 'close anonymous reads'],
  ['az storage account update --name <sa> --min-tls-version TLS1_2', 'refuse TLS 1.0 and 1.1'],
  [
    'az storage blob service-properties update --name <sa> --delete-retention-days 30',
    'keep deleted blobs for 30 days',
  ],
  ['az webapp update --name <app> --sku Standard', 'move an app to the Standard plan'],
  ['az network nsg rule create --nsg <nsg> --port <port>', 'allow an inbound port'],
  ['az network nsg rule delete --nsg <nsg> --port <port>', 'remove that allow rule'],
  ['az role assignment create --name <res> --assignee <id> --role <role>', 'grant a role'],
  ['clear', 'empty the scrollback'],
]

// Wide enough for the longest label the record prints; `column` truncates rather
// than pushing the value across, and a clipped label reads as a bug.
const LABEL = 22

function field(label: string, value: string): ConsoleLine[] {
  return [muted(column(label, LABEL) + value)]
}

function print(lines: readonly ConsoleLine[]): AzurePrintPlan {
  return { kind: 'print', response: { lines } }
}

interface Parsed {
  positional: string[]
  flags: Map<string, string>
}

/**
 * Splits a line into words and `--flag value` pairs, so a command can be written
 * with flags in any order, the way the real CLI takes them.
 */
function parse(tokens: readonly string[]): Parsed {
  const positional: string[] = []
  const flags = new Map<string, string>()

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index] ?? ''
    if (!token.startsWith('--')) {
      positional.push(token)
      continue
    }

    const body = token.slice(2)
    const equals = body.indexOf('=')
    if (equals >= 0) {
      flags.set(body.slice(0, equals).toLowerCase(), body.slice(equals + 1))
      continue
    }

    const next = tokens[index + 1]
    if (next !== undefined && !next.startsWith('--')) {
      flags.set(body.toLowerCase(), next)
      index += 1
    } else {
      flags.set(body.toLowerCase(), '')
    }
  }

  return { positional, flags }
}

function findResource(state: AzureState, name: string): AzureResource | null {
  const wanted = name.toLowerCase()
  return state.resources.find((resource) => resource.name.toLowerCase() === wanted) ?? null
}

function settings(resource: AzureResource): ConsoleLine[] {
  const properties = resource.properties
  switch (properties.kind) {
    case 'vm':
      return [
        ...field('Size', properties.size),
        ...field('Power', properties.power),
        ...field('Operating system', properties.os),
        ...field('Schedule', properties.schedule),
      ]
    case 'storage':
      return [
        ...field('Public blob access', properties.publicBlobAccess ? 'enabled' : 'disabled'),
        ...field(
          'Soft delete',
          properties.softDeleteDays === 0 ? 'off' : `${properties.softDeleteDays} days`,
        ),
        ...field('Minimum TLS', properties.tlsMin),
        ...field('Replication', properties.replication),
      ]
    case 'nsg':
      return [...field('Attached to', properties.attachedTo)]
    case 'webapp':
      return [
        ...field('Plan', properties.planSku),
        ...field('Runtime', properties.runtime),
        ...field('HTTPS only', properties.httpsOnly ? 'yes' : 'no'),
      ]
  }
}

function record(state: AzureState, resource: AzureResource): ConsoleLine[] {
  const findings = findingsFor(resource, state)
  return [
    ...field('Name', resource.name),
    ...field('Kind', resourceKindLabel(resource.properties.kind)),
    ...field('Resource group', resourceGroupName(state, resource.resourceGroupId)),
    ...field('Region', resource.region),
    ...(resource.deleted ? [failure('This resource has been deleted.')] : []),
    ...settings(resource),
    ...field('Exposure', exposureOf(findings)),
    ...field('Monthly cost', formatMoney(monthlyCost(resource))),
    blank(),
    line('Findings'),
    ...(findings.length === 0
      ? [muted('  · nothing the console checks is wrong here')]
      : findings.map((finding) => muted(`  · [${finding.severity}] ${finding.text}`))),
  ]
}

/** The resource a command names, whichever flag Azure spells it with. */
function needName(flags: Map<string, string>): string {
  return (flags.get('name') ?? flags.get('nsg') ?? '').trim()
}

/** Reads the port flag, or reports why the value cannot be used. */
function portFlag(flags: Map<string, string>): number | null {
  const raw = (flags.get('port') ?? '').trim()
  if (!/^\d{1,5}$/.test(raw)) {
    return null
  }
  const port = Number(raw)
  return port >= 1 && port <= 65_535 ? port : null
}

/**
 * Resolves one typed line against the subscription.
 *
 * `now` is accepted so the resolver has the same signature as Intune's, and so a
 * future command that prints an age can be tested against a fixed clock.
 */
export function runAzureCommand(
  state: AzureState,
  input: string,
  now = Date.now(),
): AzurePlan {
  void now
  const tokens = input.trim().split(/\s+/).filter((token) => token.length > 0)
  const { positional, flags } = parse(tokens)
  const words = positional.map((word) => word.toLowerCase())

  if (words.length === 0 || words[0] === 'help') {
    return print([
      line('The Azure shell reads the subscription and runs the safe resource actions.'),
      ...HELP.map(([usage, detail]) => muted(`  ${column(usage, 62)}${detail}`)),
      muted('  Deleting a machine or a group is not here: it runs from the resource page,'),
      muted('  which states what goes with it. Type clear to empty the scrollback.'),
    ])
  }

  if (words[0] === 'clear' || words[0] === 'cls') {
    return { kind: 'print', response: { lines: [], cleared: true } }
  }

  if (words[0] !== 'az') {
    return print([
      failure(`Unrecognised command: ${positional[0]}`),
      muted('Every command starts with `az`. Type help for the list.'),
    ])
  }

  const group = words[1] ?? ''
  const command = words[2] ?? ''

  if (group === 'resource' && command === 'list') {
    if (state.resources.length === 0) {
      return print([muted('The subscription holds no resource.')])
    }

    return print([
      muted(
        column('Name', 20) +
          column('Kind', 24) +
          column('Group', 20) +
          column('State', 12) +
          'Cost',
      ),
      ...state.resources.map((resource) =>
        line(
          column(resource.name, 20) +
            column(resourceKindLabel(resource.properties.kind), 24) +
            column(resourceGroupName(state, resource.resourceGroupId), 20) +
            column(
              resource.deleted
                ? 'deleted'
                : resource.properties.kind === 'vm'
                  ? resource.properties.power
                  : 'present',
              12,
            ) +
            formatMoney(monthlyCost(resource)),
        ),
      ),
      muted(`${state.resources.length} resources.`),
    ])
  }

  if (group === 'role' && command === 'assignment' && words[3] === 'list') {
    if (state.roles.length === 0) {
      return print([muted('No role is assigned.')])
    }

    return print([
      muted(column('Principal', 26) + column('Role', 14) + 'Scope'),
      ...state.roles.map((assignment) =>
        line(
          column(assignment.principalLabel, 26) +
            column(assignment.role, 14) +
            (assignment.scope === 'subscription'
              ? 'subscription'
              : resourceGroupName(state, assignment.scope)),
        ),
      ),
    ])
  }

  if (group === 'network' && command === 'nsg' && words[3] === 'rule' && words[4] === 'list') {
    const name = needName(flags)
    if (!name) {
      return print([failure('Rule list needs a group: --nsg <name>.')])
    }

    const nsg = findResource(state, name)
    if (!nsg || nsg.properties.kind !== 'nsg') {
      return print([failure(`No network security group named “${name}”.`)])
    }

    const rules = state.nsgRules
      .filter((rule) => rule.nsgId === nsg.id)
      .slice()
      .sort((left, right) => left.priority - right.priority)

    return print([
      line(`${nsg.name} (${nsg.properties.attachedTo})`),
      muted(
        column('Priority', 10) +
          column('Name', 24) +
          column('Direction', 12) +
          column('Access', 9) +
          column('Port', 8) +
          'Source',
      ),
      ...rules.map((rule) =>
        muted(
          column(String(rule.priority), 10) +
            column(rule.name, 24) +
            column(rule.direction, 12) +
            column(rule.access, 9) +
            column(rule.port === null ? 'Any' : String(rule.port), 8) +
            rule.source,
        ),
      ),
    ])
  }

  if (group === 'resource' && command === 'show') {
    const name = needName(flags)
    if (!name) {
      return print([failure('Show needs a name: --name <resource>.')])
    }

    const resource = findResource(state, name)
    if (!resource) {
      return print([
        failure(`No resource named “${name}”.`),
        muted('`az resource list` names every one.'),
      ])
    }

    return { kind: 'read', resourceId: resource.id, record: record(state, resource) }
  }

  if (group === 'vm' && (command === 'start' || command === 'deallocate' || command === 'restart')) {
    const name = needName(flags)
    const resource = name ? findResource(state, name) : null
    if (!name || !resource) {
      return print([failure(name ? `No resource named “${name}”.` : 'This command needs --name <vm>.')])
    }

    return {
      kind: 'act',
      resourceId: resource.id,
      action: command === 'start' ? 'start' : command === 'deallocate' ? 'deallocate' : 'restart',
    }
  }

  if (group === 'storage' && command === 'account' && words[3] === 'update') {
    const name = needName(flags)
    const resource = name ? findResource(state, name) : null
    if (!name || !resource) {
      return print([failure(name ? `No resource named “${name}”.` : 'This command needs --name <account>.')])
    }

    const publicAccess = (flags.get('allow-blob-public-access') ?? '').trim().toLowerCase()
    if (publicAccess === 'false') {
      return { kind: 'act', resourceId: resource.id, action: 'restrict-public-access' }
    }

    const tls = (flags.get('min-tls-version') ?? '').trim().toUpperCase()
    if (tls === 'TLS1_2' || tls === '1.2') {
      return { kind: 'act', resourceId: resource.id, action: 'require-tls' }
    }

    return print([
      failure('Nothing in that command changes the account.'),
      muted('The shell knows --allow-blob-public-access false and --min-tls-version TLS1_2.'),
    ])
  }

  if (group === 'storage' && command === 'blob' && words[3] === 'service-properties') {
    const name = needName(flags)
    const resource = name ? findResource(state, name) : null
    if (!name || !resource) {
      return print([failure(name ? `No resource named “${name}”.` : 'This command needs --name <account>.')])
    }

    const days = Number((flags.get('delete-retention-days') ?? '').trim())
    if (!Number.isInteger(days) || days <= 0) {
      return print([
        failure('Soft delete needs a retention: --delete-retention-days 30.'),
      ])
    }

    return { kind: 'act', resourceId: resource.id, action: 'enable-soft-delete' }
  }

  if (group === 'webapp' && command === 'update') {
    const name = needName(flags)
    const resource = name ? findResource(state, name) : null
    if (!name || !resource) {
      return print([failure(name ? `No resource named “${name}”.` : 'This command needs --name <app>.')])
    }

    const sku = (flags.get('sku') ?? '').trim().toLowerCase()
    if (sku !== 'standard') {
      return print([
        failure('That plan is not one the console offers here.'),
        muted('The shell moves an app to the Standard plan: --sku Standard.'),
      ])
    }

    return { kind: 'act', resourceId: resource.id, action: 'scale-up' }
  }

  if (group === 'network' && command === 'nsg' && words[3] === 'rule' && (words[4] === 'create' || words[4] === 'delete')) {
    const name = needName(flags)
    const resource = name ? findResource(state, name) : null
    if (!name || !resource) {
      return print([failure(name ? `No resource named “${name}”.` : 'This command needs --nsg <name>.')])
    }

    const port = portFlag(flags)
    if (port === null) {
      return print([failure('A rule needs a port: --port 443.')])
    }

    return {
      kind: 'act',
      resourceId: resource.id,
      action: words[4] === 'create' ? 'open-port' : 'close-port',
      port,
    }
  }

  if (group === 'role' && command === 'assignment' && words[3] === 'create') {
    const name = needName(flags)
    const resource = name ? findResource(state, name) : null
    if (!name || !resource) {
      return print([failure(name ? `No resource named “${name}”.` : 'This command needs --name <resource>.')])
    }

    const assignee = (flags.get('assignee') ?? '').trim().toLowerCase()
    const principal = PRINCIPALS.find(
      (entry) =>
        entry.id.toLowerCase() === assignee || entry.label.toLowerCase() === assignee,
    )
    if (!principal) {
      return print([
        failure(`No principal matches “${assignee || 'nothing'}”.`),
        ...PRINCIPALS.map((entry) => muted(`  ${column(entry.id, 20)}${entry.label}`)),
      ])
    }

    const wanted = (flags.get('role') ?? '').trim().toLowerCase()
    const role: RoleName | null =
      wanted === 'reader' ? 'Reader' : wanted === 'contributor' ? 'Contributor' : wanted === 'owner' ? 'Owner' : null
    if (!role) {
      return print([failure('A role is one of Reader, Contributor or Owner: --role Contributor.')])
    }

    return {
      kind: 'act',
      resourceId: resource.id,
      action: 'assign-role',
      principal: principal.id,
      role,
    }
  }

  if (group === 'vm' && command === 'delete') {
    return print([
      failure('Deleting a machine is not available in the shell: it takes the disks with it.'),
      muted('Open the resource page and use Delete, which says what goes with it.'),
    ])
  }

  if (group === 'group' && command === 'delete') {
    return print([
      failure('Deleting a resource group is not available in the shell: it takes everything in it.'),
      muted('Open the page of a resource in the group and use the group delete, which names what goes.'),
    ])
  }

  return print([
    failure(`Unrecognised command: ${positional.join(' ')}`),
    muted('Type help for the list.'),
  ])
}
