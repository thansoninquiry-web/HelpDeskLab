/**
 * What a note has to contain, and how a note is read against it.
 *
 * The simulator asks for two notes with the same shape: the hand-off a fix
 * leaves for the next team, and the report a refusal leaves for Security. Both
 * are three things in any words — what came in, what the desk checked, and what
 * happens next — so the vocabulary lives here once. The scorer reads the
 * hand-off with it, and a refusal close reads its own report with it before the
 * ticket is allowed to close, which is what keeps the labelled field from asking
 * for something nobody checkable.
 */

/**
 * One thing a note has to contain. `any` is a list of case-insensitive
 * fragments: a note satisfies the part by using any one of them, because the
 * desk is writing prose, not filling in a form.
 */
export interface NoteCoveragePart {
  id: string
  /** Shown to the learner, for example "what the next team should do". */
  label: string
  /** Any one of these case-insensitive fragments satisfies the part. */
  any: readonly string[]
}

/** The shortest note the desk reads as a record rather than a placeholder. */
export const HANDOFF_NOTE_MIN_LENGTH = 40

/** What a fix was checked against, as the desk would say it in a note. */
const CHECKED_FRAGMENTS: readonly string[] = [
  'checked',
  'checking',
  'confirmed',
  'verified',
  'reviewed',
  'tested',
  'ran ',
  'looked',
  'inspected',
  'ipconfig',
  'nslookup',
  'get-account',
  'get-signin-log',
  'get-share-access',
  'get-dhcp-scope',
  'scope',
  'sign-in log',
  'share access',
]

/** What the next team is being asked to do. */
const NEXT_FRAGMENTS: readonly string[] = [
  'next',
  'tier 2',
  'tier2',
  'escalat',
  'network team',
  'identity team',
  'data owner',
  'owner',
  'follow up',
  'follow-up',
  'should',
  'needs to',
  'will need',
  'handoff',
]

/**
 * The hand-off note is scored on its content, not its length: the next person
 * needs the report, the evidence, and the next action, in any words.
 */
export const HANDOFF_NOTE_PARTS: readonly NoteCoveragePart[] = [
  {
    id: 'reported',
    label: 'what the user reported',
    any: ['report', 'said', 'says', 'states', 'complains', 'denied access', 'cannot', "can't", 'unable to', 'error'],
  },
  { id: 'checked', label: 'what you checked', any: CHECKED_FRAGMENTS },
  { id: 'next', label: 'what the next team should do', any: NEXT_FRAGMENTS },
]

/**
 * What a security report has to contain, in the words the close form uses. The
 * first part is the refusal's own subject — what was asked for — rather than
 * what a user reported, so it is written here rather than shared with the
 * hand-off; the other two are the same questions, about the same next team.
 */
export const SECURITY_REPORT_PARTS: readonly NoteCoveragePart[] = [
  {
    id: 'asked',
    label: 'what was asked for',
    any: ['ask', 'request', 'want', 'demand', 'read out', 'tried to'],
  },
  {
    id: 'checked',
    label: 'what you checked before refusing',
    // The identity evidence a refusal is decided on: the directory record, the
    // sign-in history, and the mailbox behind the account that asked. "Verified"
    // is left out on purpose — "unverified" contains it, and an unverified
    // caller is the thing being refused, not the evidence that was read.
    any: [
      ...CHECKED_FRAGMENTS.filter((fragment) => fragment !== 'verified'),
      'directory',
      'mailbox',
      'forwarding',
      'account status',
    ],
  },
  { id: 'next', label: 'what Security should do next', any: NEXT_FRAGMENTS },
]

/** The lowest number of characters a security report can be and still be read. */
export const SECURITY_REPORT_MIN_LENGTH = HANDOFF_NOTE_MIN_LENGTH

/** Which of `parts` the text does not say, in the order they were given. */
export function missingNoteParts(
  text: string,
  parts: readonly NoteCoveragePart[],
): NoteCoveragePart[] {
  const haystack = text.toLowerCase()
  return parts.filter(
    (part) => !part.any.some((fragment) => haystack.includes(fragment.toLowerCase())),
  )
}

/** What a security report still lacks. */
export interface SecurityReportGaps {
  /** The parts the report does not mention, in the copy's own order. */
  missing: readonly NoteCoveragePart[]
  /** True when the report is too short to be read as a record at all. */
  tooShort: boolean
}

/**
 * What a refusal's report still has to say, or `null` when it says all of it.
 * The report is the close's own contract rather than a target to aim at: a
 * refusal that closes without it leaves Security with a disposition and no
 * account of the request that was refused.
 */
export function securityReportGaps(report: string): SecurityReportGaps | null {
  const text = report.trim()
  const tooShort = text.length < SECURITY_REPORT_MIN_LENGTH
  const missing = missingNoteParts(text, SECURITY_REPORT_PARTS)
  if (!tooShort && missing.length === 0) {
    return null
  }
  return { missing, tooShort }
}

/** "a", "a and b", "a, b and c" — the labels as the refusal reads them. */
function labelList(parts: readonly NoteCoveragePart[]): string {
  const labels = parts.map((part) => part.label)
  if (labels.length <= 1) {
    return labels[0] ?? ''
  }
  return `${labels.slice(0, -1).join(', ')} and ${labels.at(-1) ?? ''}`
}

/**
 * The one sentence that says what is missing, used by the close form and by the
 * service that refuses the close, so a learner never reads two accounts of it.
 */
export function securityReportShortfall(gaps: SecurityReportGaps): string {
  if (gaps.missing.length === 0) {
    return `A security report has to be at least ${SECURITY_REPORT_MIN_LENGTH} characters, so Security can read what was refused.`
  }
  const wants = `it still has to say ${labelList(gaps.missing)}`
  return gaps.tooShort
    ? `A security report has to be at least ${SECURITY_REPORT_MIN_LENGTH} characters, and ${wants}.`
    : `This security report is not ready: ${wants}.`
}
