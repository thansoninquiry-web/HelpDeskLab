import type { Device, DirectoryUser, Site, World } from '../environment/types'
import type { DecisionOutcome, Rubric } from '../scoring/types'
import type { Rng } from '../shared/rng'

export type Severity = 'critical' | 'high' | 'medium' | 'low'
export type TicketCategory = 'identity' | 'network' | 'printer'

export interface TicketRequester {
  name: string
  samAccountName: string
  employeeId: string
  department: string
  email: string
  siteName: string
}

export interface TicketDeviceSummary {
  hostname: string
  kind: string
  os: string
  siteName: string
}

export interface PublicTicket {
  subject: string
  body: string
  scenarioTitle: string
  variantLabel: string
  category: TicketCategory
  severity: Severity
  requester: TicketRequester
  device: TicketDeviceSummary
  reportedSymptoms: string[]
  createdAt: number
}

export type ReferenceNoteKind = 'troubleshooting' | 'customer' | 'resolution'

export type ReferenceStep =
  | { type: 'command'; input: string }
  | { type: 'verify-caller' }
  | { type: 'ask-user'; intent: string }
  | { type: 'note'; noteKind: ReferenceNoteKind; text: string }

export interface BuildContext {
  rng: Rng
  world: World
  user: DirectoryUser
  device: Device
  site: Site
  domain: string
}

export interface ScenarioVariant {
  id: string
  label: string
  summary: string
  difficulty: 1 | 2 | 3
  severity: Severity
  subjects: readonly string[]
  bodies: readonly string[]
  symptoms: readonly string[]
  /** Injects the fault into the world and returns a fingerprint for the signature. */
  build(context: BuildContext): string
  rubric(context: BuildContext): Rubric
  reference(context: BuildContext): ReferenceStep[]
  expectedOutcome: DecisionOutcome
  expectedCodes: readonly string[]
}

export interface ScenarioFamily {
  id: string
  title: string
  category: TicketCategory
  variants: readonly ScenarioVariant[]
}

export interface GenerateTicketOptions {
  familyId?: string
  avoidSignatures?: readonly string[]
  clock?: number
}

export interface GeneratedTicket {
  scenarioId: string
  variantId: string
  variantLabel: string
  difficulty: 1 | 2 | 3
  severity: Severity
  seed: number
  signature: string
  public: PublicTicket
  world: World
  rubric: Rubric
  reference: ReferenceStep[]
  expectedOutcome: DecisionOutcome
  expectedCodes: readonly string[]
}
