import type { PressureLine } from '../environment/pressure'
import type { Device, DirectoryUser, Site, VerificationMethod, World } from '../environment/types'
import type { DecisionOutcome, RefusalReason, Rubric } from '../scoring/types'
import type { VoicemailArrival } from '../tickets/voicemail'
import type { Rng } from '../shared/rng'

export type Severity = 'critical' | 'high' | 'medium' | 'low'
export type TicketCategory = 'access' | 'identity' | 'network' | 'printer' | 'mail' | 'device'

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
  /**
   * Present when the request arrived as a message on the desk's voicemail. The
   * report above is the recording's transcript, so a ticket read in the queue
   * and the message played in the workspace are the same words.
   */
  voicemail?: VoicemailArrival
}

export type ReferenceNoteKind = 'troubleshooting' | 'customer' | 'resolution'

export type ReferenceStep =
  | {
      type: 'command'
      input: string
      /**
       * Why this step is in the path, for a step whose command alone does not
       * say it — the second lookup in a before-and-after pair, for instance.
       * When it is set the command moves to the step's detail, so a learner
       * still sees the line to run.
       */
      label?: string
    }
  /** How the reference proves who is on the call; a code unless it says otherwise. */
  | { type: 'verify-caller'; method?: VerificationMethod }
  /** The refusal the path takes, with the reason the ticket needs when it matters. */
  | { type: 'deny-caller'; reason?: RefusalReason }
  | { type: 'ask-user'; intent: string }
  | { type: 'note'; noteKind: ReferenceNoteKind; text: string }

export interface BuildContext {
  rng: Rng
  world: World
  user: DirectoryUser
  device: Device
  site: Site
  domain: string
  /**
   * Set by a variant whose fault is on a second machine at the site, such as
   * the one a user has been handed. Ticket text can name it with the
   * `{targetHostname}` slot, and the reference path aims at it.
   */
  targetHostname?: string
  /**
   * Set by a variant whose fault is on a machine on a shelf. Ticket text can
   * name it with the `{assetTag}` slot.
   */
  targetAssetTag?: string
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
  /**
   * The lines this caller breaks in with when the desk stalls or plays into
   * their hands. Due-ness is the rule in `domain/environment/pressure`; the
   * lines and their triggers are ticket content, held with the rest of the
   * variant so a new pressured ticket needs no entry anywhere else.
   */
  pressure?: readonly PressureLine[]
}

export interface ScenarioFamily {
  id: string
  title: string
  category: TicketCategory
  variants: readonly ScenarioVariant[]
}

export interface GenerateTicketOptions {
  familyId?: string
  /**
   * Pin the variant instead of drawing one. A stored ticket names the variant it
   * was created with, so replaying it lands on that variant even after the
   * family gains new ones.
   */
  variantId?: string
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
  /** The caller's script, when this variant has one. */
  pressure?: readonly PressureLine[]
}
