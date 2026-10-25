import type {
  AzureResource,
  AzureState,
  Exposure,
  NsgRule,
  ResourceKind,
  RoleName,
} from '../types'

/**
 * What the console can say about a resource without changing it.
 *
 * The read step is the whole point of the module: a portal row that says
 * "exposed" is a prompt, and the record is where the reason lives. Findings are
 * ordered worst first so the sentence the learner reads starts with the thing
 * that matters.
 */
export interface Finding {
  text: string
  severity: Exposure
}

export function resourceKindLabel(kind: ResourceKind): string {
  switch (kind) {
    case 'vm':
      return 'Virtual machine'
    case 'storage':
      return 'Storage account'
    case 'nsg':
      return 'Network security group'
    case 'webapp':
      return 'App Service'
  }
}

export function resourceGroupName(state: AzureState, id: string): string {
  return state.resourceGroups.find((group) => group.id === id)?.name ?? id
}

/** Whether an inbound allow rule lets `port` in from the internet. */
export function isPortOpenToInternet(
  rules: readonly NsgRule[],
  nsgId: string,
  port: number,
): boolean {
  return rules.some(
    (rule) =>
      rule.nsgId === nsgId &&
      rule.direction === 'inbound' &&
      rule.access === 'allow' &&
      (rule.port === null || rule.port === port) &&
      rule.source === 'Internet',
  )
}

/** Whether anything inbound allows a port, whatever the source. */
export function allowsPort(rules: readonly NsgRule[], nsgId: string, port: number): boolean {
  return rules.some(
    (rule) =>
      rule.nsgId === nsgId &&
      rule.direction === 'inbound' &&
      rule.access === 'allow' &&
      (rule.port === null || rule.port === port),
  )
}

const SEVERITY_WEIGHT: Record<Exposure, number> = { low: 0, medium: 1, high: 2 }

function worst(findings: readonly Finding[]): Exposure {
  return findings.reduce<Exposure>(
    (worstSoFar, finding) =>
      SEVERITY_WEIGHT[finding.severity] > SEVERITY_WEIGHT[worstSoFar]
        ? finding.severity
        : worstSoFar,
    'low',
  )
}

const OWNER_NOTE =
  ' holds Owner at resource-group scope: the role can grant access and delete anything in the group.'

/** The findings behind one resource, worst first. */
export function findingsFor(resource: AzureResource, state: AzureState): Finding[] {
  const findings: Finding[] = []
  const properties = resource.properties

  switch (properties.kind) {
    case 'vm': {
      if (properties.power === 'running' && properties.schedule === 'business-hours') {
        findings.push({
          text: 'Tagged business-hours but still running: compute is billed around the clock.',
          severity: 'medium',
        })
      }
      if (properties.power === 'deallocated') {
        findings.push({
          text: 'Deallocated: no compute is billed, and nothing is serving traffic.',
          severity: 'low',
        })
      }
      break
    }
    case 'storage': {
      if (properties.publicBlobAccess) {
        findings.push({
          text: 'Public blob access is on: anyone with the URL can read a blob anonymously.',
          severity: 'high',
        })
      }
      if (properties.softDeleteDays === 0) {
        findings.push({
          text: 'Soft delete is off: a deleted or overwritten blob cannot be recovered.',
          severity: 'medium',
        })
      }
      if (properties.tlsMin === '1.0') {
        findings.push({
          text: 'TLS 1.0 is accepted: the account still negotiates an obsolete protocol.',
          severity: 'medium',
        })
      }
      break
    }
    case 'nsg': {
      for (const rule of state.nsgRules) {
        if (rule.nsgId !== resource.id || rule.direction !== 'inbound') {
          continue
        }
        const port = rule.port
        // Only the internet counts: an allow rule from the office range is the
        // control, not the exposure this finding is about.
        const remote = rule.source === 'Internet'
        if (rule.access === 'allow' && remote && (port === 3389 || port === 22)) {
          findings.push({
            text: `Management port ${port} is open to the internet (${rule.name}).`,
            severity: 'high',
          })
        }
      }
      if (!allowsPort(state.nsgRules, resource.id, 443)) {
        findings.push({
          text: 'Nothing allows 443 inbound, so the default deny drops HTTPS.',
          severity: 'medium',
        })
      }
      break
    }
    case 'webapp': {
      if (properties.planSku === 'Free') {
        findings.push({
          text: 'Free plan: the daily CPU quota throttles the site once it is used.',
          severity: 'medium',
        })
      }
      if (!properties.httpsOnly) {
        findings.push({
          text: 'HTTPS only is off: the site still answers over plain HTTP.',
          severity: 'high',
        })
      }
      break
    }
  }

  return findings.sort(
    (left, right) => SEVERITY_WEIGHT[right.severity] - SEVERITY_WEIGHT[left.severity],
  )
}

/**
 * The access side of a record: an Owner assignment over the resource's group.
 *
 * Kept apart from the settings findings so the inventory's exposure column
 * describes the resource itself. A group-wide role would otherwise make every
 * resource in production read as high risk, which buries the machine that is
 * actually exposed. The resource page and the read step show both.
 */
export function accessFindingsFor(
  resource: AzureResource,
  state: AzureState,
): Finding[] {
  return state.roles
    .filter(
      (assignment) =>
        assignment.scope === resource.resourceGroupId && assignment.role === 'Owner',
    )
    .map((assignment) => ({
      text: `${assignment.principalLabel}${OWNER_NOTE}`,
      severity: 'high' as const,
    }))
}

/** Everything a record page shows: its settings, then the access over its group. */
export function allFindingsFor(
  resource: AzureResource,
  state: AzureState,
): Finding[] {
  return [...findingsFor(resource, state), ...accessFindingsFor(resource, state)].sort(
    (left, right) => SEVERITY_WEIGHT[right.severity] - SEVERITY_WEIGHT[left.severity],
  )
}

/** The worst finding's severity, or `low` when the record is clean. */
export function exposureOf(findings: readonly Finding[]): Exposure {
  return worst(findings)
}

/** The sentence a read step returns, in the console's own words. */
export function diagnose(resource: AzureResource, state: AzureState): string {
  const findings = allFindingsFor(resource, state)
  if (findings.length === 0) {
    return `${resource.name}: no findings — every setting on the record is within the platform baseline.`
  }
  return `${resource.name}: ${exposureOf(findings)} exposure — ${findings
    .map((finding) => finding.text.replace(/\.$/, ''))
    .join('; ')}.`
}

const VM_COST: Record<string, number> = {
  'Standard_B2s': 31,
  'Standard_D2s_v3': 62,
  'Standard_E4s_v3': 148,
}

const APP_PLAN_COST: Record<string, number> = { Free: 0, Basic: 48, Standard: 120 }

/**
 * What the resource costs a month, in pounds, at its current settings.
 *
 * Derived rather than stored: a deallocated machine costs nothing in compute the
 * moment it is deallocated, and a stored number would have to be kept in step
 * with every action. The console's cost column and its tickets read the same
 * function, so they cannot disagree.
 */
export function monthlyCost(resource: AzureResource): number {
  const properties = resource.properties
  switch (properties.kind) {
    case 'vm':
      // The disks survive a deallocation, so the machine is cheap rather than free.
      return properties.power === 'running' ? (VM_COST[properties.size] ?? 0) : 8
    case 'storage':
      return properties.replication === 'GRS' ? 42 : 18
    case 'nsg':
      return 2
    case 'webapp':
      return APP_PLAN_COST[properties.planSku] ?? 0
  }
}

export function totalMonthlyCost(state: AzureState): number {
  return state.resources.reduce((total, resource) => total + monthlyCost(resource), 0)
}

export function formatMoney(amount: number): string {
  return `£${amount.toLocaleString('en-GB')}`
}

/** The role held over a resource group, for the access page and its ticket. */
export function roleOver(
  state: AzureState,
  scope: string,
  principal: string,
): RoleName | null {
  const assignment = state.roles.find(
    (entry) => entry.scope === scope && entry.principal === principal,
  )
  return assignment?.role ?? null
}

export function scopeName(state: AzureState, scope: string): string {
  if (scope === 'subscription') {
    return 'the whole subscription'
  }
  return `resource group ${resourceGroupName(state, scope)}`
}
