import type {
  AzureResource,
  AzureResourceGroup,
  AzureRoleAssignment,
  AzureState,
  NsgRule,
} from '../types'

/**
 * The seeded estate: four resource groups, thirteen resources, six rules and
 * five role assignments.
 *
 * Nothing here is copied from a real subscription. The names describe a small
 * fictional business — Harbour — and every resource exists to make one console
 * decision visible: a machine left running, a blob anyone can read, a management
 * port open to the world, a role that is wider than the person.
 */

export const SEED_GROUPS: readonly AzureResourceGroup[] = [
  { id: 'rg-harbour-prod', name: 'rg-harbour-prod', region: 'uksouth', ownerTeam: 'Platform' },
  { id: 'rg-harbour-dev', name: 'rg-harbour-dev', region: 'uksouth', ownerTeam: 'Platform' },
  {
    id: 'rg-shared-services',
    name: 'rg-shared-services',
    region: 'ukwest',
    ownerTeam: 'Service desk',
  },
  { id: 'rg-field-apps', name: 'rg-field-apps', region: 'westeurope', ownerTeam: 'Field ops' },
]

export const SEED_RESOURCES: readonly AzureResource[] = [
  {
    id: 'res-vm-app-01',
    name: 'vm-app-01',
    resourceGroupId: 'rg-harbour-prod',
    region: 'uksouth',
    properties: {
      kind: 'vm',
      size: 'Standard_D2s_v3',
      power: 'running',
      os: 'Ubuntu 22.04',
      schedule: 'always-on',
    },
  },
  {
    id: 'res-vm-app-02',
    name: 'vm-app-02',
    resourceGroupId: 'rg-harbour-prod',
    region: 'uksouth',
    properties: {
      kind: 'vm',
      size: 'Standard_D2s_v3',
      power: 'running',
      os: 'Ubuntu 22.04',
      schedule: 'always-on',
    },
  },
  {
    id: 'res-vm-fin-01',
    name: 'vm-fin-01',
    resourceGroupId: 'rg-harbour-prod',
    region: 'uksouth',
    properties: {
      kind: 'vm',
      size: 'Standard_B2s',
      power: 'deallocated',
      os: 'Windows Server 2022',
      schedule: 'always-on',
    },
  },
  {
    id: 'res-vm-dev-04',
    name: 'vm-dev-04',
    resourceGroupId: 'rg-harbour-dev',
    region: 'uksouth',
    properties: {
      kind: 'vm',
      size: 'Standard_B2s',
      power: 'running',
      os: 'Ubuntu 22.04',
      schedule: 'business-hours',
    },
  },
  {
    id: 'res-vm-sql-01',
    name: 'vm-sql-01',
    resourceGroupId: 'rg-harbour-prod',
    region: 'uksouth',
    properties: {
      kind: 'vm',
      size: 'Standard_E4s_v3',
      power: 'running',
      os: 'Windows Server 2022',
      schedule: 'always-on',
    },
  },
  {
    id: 'res-vm-build-02',
    name: 'vm-build-02',
    resourceGroupId: 'rg-harbour-dev',
    region: 'uksouth',
    properties: {
      kind: 'vm',
      size: 'Standard_B2s',
      power: 'deallocated',
      os: 'Ubuntu 22.04',
      schedule: 'business-hours',
    },
  },
  {
    id: 'res-st-apps',
    name: 'stharbourapps',
    resourceGroupId: 'rg-harbour-prod',
    region: 'uksouth',
    properties: {
      kind: 'storage',
      publicBlobAccess: true,
      softDeleteDays: 30,
      tlsMin: '1.2',
      replication: 'LRS',
    },
  },
  {
    id: 'res-st-backups',
    name: 'stharbourbackups',
    resourceGroupId: 'rg-shared-services',
    region: 'ukwest',
    properties: {
      kind: 'storage',
      publicBlobAccess: false,
      softDeleteDays: 0,
      tlsMin: '1.2',
      replication: 'GRS',
    },
  },
  {
    id: 'res-st-logs',
    name: 'stharbourlogs',
    resourceGroupId: 'rg-shared-services',
    region: 'ukwest',
    properties: {
      kind: 'storage',
      publicBlobAccess: false,
      softDeleteDays: 7,
      tlsMin: '1.0',
      replication: 'LRS',
    },
  },
  {
    id: 'res-nsg-web',
    name: 'nsg-web-prod',
    resourceGroupId: 'rg-harbour-prod',
    region: 'uksouth',
    properties: { kind: 'nsg', attachedTo: 'app-portal' },
  },
  {
    id: 'res-nsg-jump',
    name: 'nsg-jump-prod',
    resourceGroupId: 'rg-harbour-prod',
    region: 'uksouth',
    properties: { kind: 'nsg', attachedTo: 'vm-app-01' },
  },
  {
    id: 'res-app-portal',
    name: 'app-portal',
    resourceGroupId: 'rg-harbour-prod',
    region: 'uksouth',
    properties: {
      kind: 'webapp',
      planSku: 'Free',
      runtime: '.NET 8 (Linux)',
      httpsOnly: true,
    },
  },
  {
    id: 'res-app-status',
    name: 'app-status',
    resourceGroupId: 'rg-shared-services',
    region: 'ukwest',
    properties: {
      kind: 'webapp',
      planSku: 'Standard',
      runtime: 'Node 20 (Linux)',
      httpsOnly: true,
    },
  },
]

export const SEED_RULES: readonly NsgRule[] = [
  {
    id: 'rule-web-http',
    nsgId: 'res-nsg-web',
    name: 'Allow-HTTP',
    priority: 100,
    direction: 'inbound',
    access: 'allow',
    protocol: 'TCP',
    port: 80,
    source: 'Internet',
  },
  {
    id: 'rule-web-ssh',
    nsgId: 'res-nsg-web',
    name: 'Allow-SSH-Admin',
    priority: 110,
    direction: 'inbound',
    access: 'allow',
    protocol: 'TCP',
    port: 22,
    source: '10.20.0.0/16',
  },
  {
    id: 'rule-jump-rdp',
    nsgId: 'res-nsg-jump',
    name: 'Allow-RDP',
    priority: 100,
    direction: 'inbound',
    access: 'allow',
    protocol: 'TCP',
    port: 3389,
    source: 'Internet',
  },
  {
    id: 'rule-jump-https',
    nsgId: 'res-nsg-jump',
    name: 'Allow-HTTPS',
    priority: 120,
    direction: 'inbound',
    access: 'allow',
    protocol: 'TCP',
    port: 443,
    source: 'Internet',
  },
  {
    id: 'rule-web-out',
    nsgId: 'res-nsg-web',
    name: 'Allow-Outbound-All',
    priority: 100,
    direction: 'outbound',
    access: 'allow',
    protocol: 'Any',
    port: null,
    source: 'VirtualNetwork',
  },
]

export const SEED_ROLES: readonly AzureRoleAssignment[] = [
  {
    id: 'role-contractor-owner',
    principal: 'usr-contractor',
    principalLabel: 'Rowan Vale (contractor)',
    scope: 'rg-harbour-prod',
    role: 'Owner',
  },
  {
    id: 'role-platform-contributor',
    principal: 'grp-platform-team',
    principalLabel: 'Platform team',
    scope: 'rg-harbour-prod',
    role: 'Contributor',
  },
  {
    id: 'role-desk-reader',
    principal: 'grp-service-desk',
    principalLabel: 'Service desk',
    scope: 'subscription',
    role: 'Reader',
  },
  {
    id: 'role-platform-dev',
    principal: 'grp-platform-team',
    principalLabel: 'Platform team',
    scope: 'rg-harbour-dev',
    role: 'Contributor',
  },
  {
    id: 'role-dana-owner',
    principal: 'usr-dana',
    principalLabel: 'Dana Okafor (platform lead)',
    scope: 'subscription',
    role: 'Owner',
  },
]

export function seedState(): AzureState {
  return {
    resourceGroups: SEED_GROUPS.map((group) => ({ ...group })),
    resources: SEED_RESOURCES.map((resource) => ({
      ...resource,
      properties: { ...resource.properties },
    })),
    nsgRules: SEED_RULES.map((rule) => ({ ...rule })),
    roles: SEED_ROLES.map((role) => ({ ...role })),
    events: [],
  }
}
