import type {
  CompliancePolicy,
  ComplianceState,
  IntuneApp,
  IntuneDevice,
  PolicyRule,
} from '../types'

/** After this long without a check-in a device is no longer judged at all. */
export const STALE_AFTER_DAYS = 14

const DAY = 24 * 60 * 60 * 1000

/** Compares `10.0.19045`-style versions, segment by segment. */
export function compareVersions(left: string, right: string): number {
  const a = left.split('.').map((part) => Number.parseInt(part, 10) || 0)
  const b = right.split('.').map((part) => Number.parseInt(part, 10) || 0)
  const length = Math.max(a.length, b.length)
  for (let index = 0; index < length; index += 1) {
    const diff = (a[index] ?? 0) - (b[index] ?? 0)
    if (diff !== 0) {
      return diff
    }
  }
  return 0
}

export function policyAppliesTo(policy: CompliancePolicy, device: IntuneDevice): boolean {
  return policy.platform === 'mobile'
    ? device.platform === 'iOS' || device.platform === 'Android'
    : device.platform === 'Windows'
}

function ruleFailure(rule: PolicyRule, device: IntuneDevice): string | null {
  switch (rule.kind) {
    case 'bitlocker':
      // BitLocker is a Windows setting; the mobile policy never asks for it.
      return device.platform === 'Windows' && !device.bitlocker
        ? 'BitLocker is off'
        : null
    case 'passcode':
      return device.passcodeSet ? null : 'No device passcode is set'
    case 'encryption':
      return device.encrypted ? null : 'Storage encryption is off'
    case 'min-os':
      return compareVersions(device.osVersion, rule.version) < 0
        ? `${device.platform} ${device.osVersion} is below the required ${rule.version}`
        : null
  }
}

export interface ComplianceVerdict {
  state: ComplianceState
  reasons: readonly string[]
}

/**
 * Judges one device against every policy that applies to it.
 *
 * Two things are deliberately not failures here. A device that has never
 * reported, or has been silent for a fortnight, is `not-evaluated` rather than
 * non-compliant: the console does not know, and pretending otherwise is how real
 * consoles send people to fix machines that are simply switched off.
 */
export function evaluateCompliance(
  device: IntuneDevice,
  policies: readonly CompliancePolicy[],
  now: number,
): ComplianceVerdict {
  if (device.lifecycle !== 'managed') {
    return {
      state: 'not-evaluated',
      reasons: [
        device.lifecycle === 'retired'
          ? 'Device is retired and no longer receives policy'
          : 'Device was wiped and no longer receives policy',
      ],
    }
  }

  if (device.lastCheckIn === null) {
    return { state: 'not-evaluated', reasons: ['Device has never reported to the service'] }
  }

  const silentDays = (now - device.lastCheckIn) / DAY
  if (silentDays > STALE_AFTER_DAYS) {
    return {
      state: 'not-evaluated',
      reasons: [
        `No check-in for ${Math.floor(silentDays)} days, so the device cannot be judged`,
      ],
    }
  }

  if (device.policyStale) {
    return {
      state: 'not-evaluated',
      reasons: ['The device checked in, but the policy has not been evaluated since it changed'],
    }
  }

  const reasons: string[] = []
  const failingPolicies: CompliancePolicy[] = []
  for (const policy of policies) {
    if (!policyAppliesTo(policy, device)) {
      continue
    }
    const failures = policy.rules
      .map((rule) => ruleFailure(rule, device))
      .filter((failure): failure is string => failure !== null)
    if (failures.length > 0) {
      failingPolicies.push(policy)
      reasons.push(...failures.map((failure) => `${policy.name}: ${failure}`))
    }
  }

  if (reasons.length === 0) {
    return { state: 'compliant', reasons: [] }
  }

  // Grace belongs to the policy that is being broken; the shortest window wins,
  // because a device is only as tolerated as its strictest requirement.
  const graceDays = Math.min(...failingPolicies.map((policy) => policy.graceDays))
  const failingFor = device.nonComplianceSince === null ? null : (now - device.nonComplianceSince) / DAY
  if (failingFor !== null && failingFor < graceDays) {
    return { state: 'in-grace', reasons }
  }

  return { state: 'non-compliant', reasons }
}

/** The apps a device's group requires, in the order the catalogue lists them. */
export function requiredAppsFor(
  device: IntuneDevice,
  apps: readonly IntuneApp[],
): readonly IntuneApp[] {
  if (device.groupId === null) {
    return []
  }
  return apps.filter(
    (app) =>
      app.assignment.install === 'required' &&
      app.assignment.groupIds.includes(device.groupId ?? '') &&
      (app.platform === 'all' || app.platform === device.platform),
  )
}

export function appName(apps: readonly IntuneApp[], appId: string): string {
  return apps.find((app) => app.id === appId)?.name ?? appId
}
