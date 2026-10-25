import { allowsPort } from './diagnostics'
import { PRINCIPALS, type AzureEvent, type AzureResource, type AzureState, type ResourceAction, type RoleName } from '../types'

const ROLES: readonly RoleName[] = ['Reader', 'Contributor', 'Owner']

export interface ResourceActionRequest {
  resourceId: string
  action: ResourceAction
  /** Milliseconds; passed in so an attempt is reproducible in tests. */
  now: number
  /** The port an `open-port` / `close-port` asks for. */
  port?: number
  /** Who a role assignment is for. */
  principal?: string
  role?: RoleName
}

export interface ResourceActionOutcome {
  state: AzureState
  event: AzureEvent
  status: 'applied' | 'refused' | 'failed'
  summary: string
  notes: readonly string[]
}

function copyResource(resource: AzureResource): AzureResource {
  return { ...resource, properties: { ...resource.properties } }
}

function nextEventId(state: AzureState): number {
  return Math.max(0, ...state.events.map((event) => event.id)) + 1
}

function planLabel(port: number): string {
  return port === 443 ? 'HTTPS' : port === 80 ? 'HTTP' : port === 22 ? 'SSH' : port === 3389 ? 'RDP' : `port ${port}`
}

/**
 * Applies one action to one resource and returns the estate afterwards.
 *
 * Every branch writes a note that says what the platform actually did, because
 * the activity log is the record a learner reads back — and the only place the
 * console can show that a deallocation stopped billing while a delete took the
 * disks with it.
 */
export function applyResourceAction(
  state: AzureState,
  request: ResourceActionRequest,
): ResourceActionOutcome {
  const current = state.resources.find((resource) => resource.id === request.resourceId)
  if (!current) {
    throw new Error(`Unknown resource: ${request.resourceId}`)
  }

  const now = request.now
  const resource = copyResource(current)
  const notes: string[] = []
  const status: ResourceActionOutcome['status'] = 'applied'
  let summary = ''

  const refuse = (why: string): ResourceActionOutcome => {
    const event: AzureEvent = {
      id: nextEventId(state),
      resourceId: resource.id,
      action: request.action,
      at: now,
      outcome: 'refused',
      summary: why,
      notes: [],
    }
    return {
      state: { ...state, events: [...state.events, event] },
      event,
      status: 'refused',
      summary: why,
      notes: [],
    }
  }

  let nextState: AzureState = state

  if (current.deleted) {
    return refuse(`${current.name} has been deleted`)
  }

  switch (request.action) {
    case 'start': {
      if (resource.properties.kind !== 'vm') {
        return refuse(`${resource.name} is not a virtual machine`)
      }
      if (resource.properties.power === 'running') {
        return refuse(`${resource.name} is already running`)
      }
      resource.properties.power = 'running'
      notes.push('The machine is running again; compute billing has resumed.')
      notes.push('Disks and network settings were kept while it was deallocated.')
      summary = `${resource.name} started`
      break
    }

    case 'deallocate': {
      if (resource.properties.kind !== 'vm') {
        return refuse(`${resource.name} is not a virtual machine`)
      }
      if (resource.properties.power === 'deallocated') {
        return refuse(`${resource.name} is already deallocated`)
      }
      resource.properties.power = 'deallocated'
      notes.push('Compute billing has stopped; the disks are retained and still billed.')
      notes.push('This is a deallocation, not a shutdown: the guest is not left running.')
      summary = `${resource.name} deallocated`
      break
    }

    case 'restart': {
      if (resource.properties.kind !== 'vm') {
        return refuse(`${resource.name} is not a virtual machine`)
      }
      if (resource.properties.power !== 'running') {
        return refuse(`${resource.name} is deallocated; start it before restarting it`)
      }
      notes.push('The guest restarted; the machine stayed allocated throughout.')
      summary = `${resource.name} restarted`
      break
    }

    case 'open-port': {
      if (resource.properties.kind !== 'nsg') {
        return refuse(`${resource.name} is not a network security group`)
      }
      const port = request.port
      if (port === undefined || !Number.isInteger(port) || port < 1 || port > 65535) {
        return refuse('Choose a port between 1 and 65535')
      }
      if (allowsPort(state.nsgRules, resource.id, port)) {
        return refuse(`${resource.name} already allows ${planLabel(port)} inbound`)
      }
      const inbound = state.nsgRules.filter(
        (rule) => rule.nsgId === resource.id && rule.direction === 'inbound',
      )
      const priority = Math.max(100, ...inbound.map((rule) => rule.priority)) + 10
      nextState = {
        ...state,
        nsgRules: [
          ...state.nsgRules,
          {
            id: `rule-${resource.id}-${port}`,
            nsgId: resource.id,
            name: `Allow-${planLabel(port).replace(' ', '-')}`,
            priority,
            direction: 'inbound',
            access: 'allow',
            protocol: 'TCP',
            port,
            source: 'Internet',
          },
        ],
      }
      notes.push(`Inbound rule added: TCP ${port} from the internet, priority ${priority}.`)
      notes.push('The default deny no longer applies to that port.')
      summary = `${resource.name}: ${planLabel(port)} allowed inbound`
      break
    }

    case 'close-port': {
      if (resource.properties.kind !== 'nsg') {
        return refuse(`${resource.name} is not a network security group`)
      }
      const port = request.port
      if (port === undefined) {
        return refuse('Choose the port to close')
      }
      const matching = state.nsgRules.filter(
        (rule) =>
          rule.nsgId === resource.id &&
          rule.direction === 'inbound' &&
          rule.access === 'allow' &&
          (rule.port === null || rule.port === port),
      )
      if (matching.length === 0) {
        return refuse(`${resource.name} does not allow ${planLabel(port)} inbound`)
      }
      nextState = {
        ...state,
        nsgRules: state.nsgRules.filter((rule) => !matching.includes(rule)),
      }
      notes.push(
        `Removed ${matching.map((rule) => rule.name).join(', ')}: ${planLabel(port)} is no longer allowed inbound.`,
      )
      notes.push('The default deny applies again to that port.')
      summary = `${resource.name}: ${planLabel(port)} closed inbound`
      break
    }

    case 'restrict-public-access': {
      if (resource.properties.kind !== 'storage') {
        return refuse(`${resource.name} is not a storage account`)
      }
      if (!resource.properties.publicBlobAccess) {
        return refuse(`${resource.name} already refuses anonymous blob access`)
      }
      resource.properties.publicBlobAccess = false
      notes.push('Anonymous read access is off; every blob now needs a signed request.')
      notes.push('Links handed out before the change stop working, which is the point.')
      summary = `${resource.name}: public blob access turned off`
      break
    }

    case 'enable-soft-delete': {
      if (resource.properties.kind !== 'storage') {
        return refuse(`${resource.name} is not a storage account`)
      }
      if (resource.properties.softDeleteDays > 0) {
        return refuse(`${resource.name} already keeps deleted blobs for ${resource.properties.softDeleteDays} days`)
      }
      resource.properties.softDeleteDays = 30
      notes.push('Soft delete is on: deleted blobs are recoverable for 30 days.')
      notes.push('Blobs deleted before now are not covered by the change.')
      summary = `${resource.name}: soft delete enabled`
      break
    }

    case 'require-tls': {
      if (resource.properties.kind !== 'storage') {
        return refuse(`${resource.name} is not a storage account`)
      }
      if (resource.properties.tlsMin === '1.2') {
        return refuse(`${resource.name} already requires TLS 1.2`)
      }
      resource.properties.tlsMin = '1.2'
      notes.push('The minimum accepted version is now TLS 1.2.')
      notes.push('Clients still on TLS 1.0 will be refused rather than downgraded.')
      summary = `${resource.name}: TLS 1.2 required`
      break
    }

    case 'scale-up': {
      if (resource.properties.kind !== 'webapp') {
        return refuse(`${resource.name} is not an App Service`)
      }
      if (resource.properties.planSku !== 'Free') {
        return refuse(`${resource.name} is already on the ${resource.properties.planSku} plan`)
      }
      resource.properties.planSku = 'Standard'
      notes.push('The app was moved to a Standard plan: the daily CPU quota no longer applies.')
      notes.push('The monthly cost rises with the plan, so this is a spending decision too.')
      summary = `${resource.name}: moved to the Standard plan`
      break
    }

    case 'assign-role': {
      const principal = PRINCIPALS.find((entry) => entry.id === request.principal)
      if (!principal) {
        return refuse('Choose the principal the role is for')
      }
      const role = request.role
      if (!role || !ROLES.includes(role)) {
        return refuse('Choose the role to grant')
      }
      const existing = state.roles.find(
        (entry) => entry.scope === resource.resourceGroupId && entry.principal === principal.id,
      )
      if (existing?.role === role) {
        return refuse(`${principal.label} already holds ${role} on this resource group`)
      }
      const note = existing
        ? `${principal.label} changed from ${existing.role} to ${role} on ${resource.resourceGroupId}.`
        : `${principal.label} granted ${role} on ${resource.resourceGroupId}.`
      nextState = {
        ...state,
        roles: [
          ...state.roles.filter(
            (entry) =>
              !(entry.scope === resource.resourceGroupId && entry.principal === principal.id),
          ),
          {
            id: `role-${principal.id}-${resource.resourceGroupId}`,
            principal: principal.id,
            principalLabel: principal.label,
            scope: resource.resourceGroupId,
            role,
          },
        ],
      }
      notes.push(note)
      notes.push('The role applies to everything in the group, so the scope matters more than the name.')
      summary = `${principal.label} now holds ${role} on ${resource.resourceGroupId}`
      break
    }

    case 'delete-vm': {
      if (resource.properties.kind !== 'vm') {
        return refuse(`${resource.name} is not a virtual machine`)
      }
      resource.deleted = true
      notes.push('The machine and its disks were deleted. Nothing can be recovered.')
      notes.push('Deleting a machine is not how a cost ticket is closed: a deallocation keeps the disks.')
      summary = `${resource.name} deleted`
      break
    }

    case 'delete-resource-group': {
      const group = state.resourceGroups.find((entry) => entry.id === resource.resourceGroupId)
      resource.deleted = true
      const doomed = state.resources.filter(
        (entry) => entry.resourceGroupId === resource.resourceGroupId && !entry.deleted,
      )
      const doomedIds = new Set(doomed.map((entry) => entry.id))
      nextState = {
        ...state,
        resources: state.resources.map((entry) =>
          doomedIds.has(entry.id) ? { ...entry, deleted: true } : entry,
        ),
        nsgRules: state.nsgRules.filter((rule) => !doomedIds.has(rule.nsgId)),
        roles: state.roles.filter((entry) => entry.scope !== resource.resourceGroupId),
      }
      notes.push(
        `Deleted ${doomed.length} resource${doomed.length === 1 ? '' : 's'} in ${group?.name ?? resource.resourceGroupId}.`,
      )
      notes.push('Role assignments over the group were removed with it.')
      notes.push('Nothing in that group can be recovered. This is not a spending fix.')
      summary = `${group?.name ?? 'The resource group'} deleted`
      break
    }
  }

  const event: AzureEvent = {
    id: nextEventId(state),
    resourceId: resource.id,
    action: request.action,
    at: now,
    outcome: status,
    summary,
    notes,
  }

  return {
    state: {
      ...nextState,
      resources: nextState.resources.map((entry) =>
        entry.id === resource.id ? resource : entry,
      ),
      events: [...state.events, event],
    },
    event,
    status,
    summary,
    notes,
  }
}
