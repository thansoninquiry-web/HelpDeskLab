import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { COMMANDS } from '../../../src/domain/environment/commands'
import type { PolicyRuleId } from '../../../src/domain/environment/policy'
import {
  NON_REFUSAL_AUDIT_ROWS,
  REFUSAL_REASONS,
} from '../../../src/domain/environment/refusals'

const COMMANDS_DIR = join(process.cwd(), 'src/domain/environment/commands')
const AUDIT_DOC = join(process.cwd(), 'docs/research/decision-binding-audit.md')

/**
 * The wording of a failure that is the *argument's* own problem: a site, tag,
 * share, printer or account that does not exist, a value of the wrong shape, or a
 * usage line. These are answered where the argument is parsed rather than by a
 * decision on record, so they are not in the inventory — but they are still a
 * closed list: a new message has to be added here, which is where a reviewer sees
 * whether it is really an argument error or a decision wearing the same clothes.
 */
const INPUT_ERROR_PATTERNS: readonly RegExp[] = [
  /Usage: /,
  /Unknown site '/,
  /No machine in the register matches/,
  /No deployment is booked for/,
  /is not on any shelf\./,
  /No DHCP scope is defined for/,
  /No lease for .* exists in/,
  /No help found for/,
  /could not be found/,
  /No message '.*' is recorded in the tenant\./,
  /No mailbox exists for/,
  /No Microsoft 365 account exists for/,
  /is not a delivery state\./,
  /was not found on this site\./,
  /was not found at /,
  /No machine '.*' is inventoried\./,
  /Share '.*' was not found\./,
  /Group '.*' was not found\./,
  /No machine with the tag .* is on a shelf\./,
  /No account '.*' exists in the directory\./,
  /Give one word for the reason/,
  /No shipment with the reference/,
  /is not a number of days\./,
  /Unable to determine the signed-in user/,
  /The system cannot find the file specified/,
  /Unable to resolve target system name/,
  /The user name could not be found\./,
]

/**
 * A refusal built from the policy module's own lines rather than its wording: the
 * shelf and imaging commands print what `stockPolicy` answered, so the message is
 * the rule's and is declared by `stock-not-available`.
 */
const POLICY_HELPER_MARKERS: readonly string[] = ['unavailable.lines']

interface RefusalSite {
  file: string
  line: number
  body: string
}

/** Every `failed(...)` call in the command layer, with the body it was handed. */
function refusalSites(): RefusalSite[] {
  const sites: RefusalSite[] = []
  const files = readdirSync(COMMANDS_DIR).filter(
    (name) => name.endsWith('.ts') && name !== 'types.ts',
  )

  for (const name of files) {
    const source = readFileSync(`${COMMANDS_DIR}/${name}`, 'utf8')
    const pattern = /\bfailed\(/g
    let match: RegExpExecArray | null

    while ((match = pattern.exec(source)) !== null) {
      const start = match.index + match[0].length
      let depth = 1
      let index = start
      while (index < source.length && depth > 0) {
        if (source[index] === '(') depth += 1
        else if (source[index] === ')') depth -= 1
        index += 1
      }
      sites.push({
        file: name,
        line: source.slice(0, match.index).split('\n').length,
        body: source.slice(start, index - 1),
      })
    }
  }

  return sites
}

function declaredReason(body: string): string | null {
  for (const marker of POLICY_HELPER_MARKERS) {
    if (body.includes(marker)) return 'stock-not-available'
  }
  for (const reason of REFUSAL_REASONS) {
    if (reason.messages.some((message) => body.includes(message))) return reason.id
  }
  return null
}

function isInputError(body: string): boolean {
  return INPUT_ERROR_PATTERNS.some((pattern) => pattern.test(body))
}

function readAuditRows(): Map<number, string> {
  const rows = new Map<number, string>()
  for (const line of readFileSync(AUDIT_DOC, 'utf8').split('\n')) {
    const match = /^\|\s*(\d+)\s*\|\s*`?([a-z-]+)`?\s*\|/.exec(line)
    if (match?.[1] !== undefined) {
      rows.set(Number(match[1]), match[2] ?? '')
    }
  }
  return rows
}

describe('the refusal inventory', () => {
  it('holds every hand-written refusal in the command layer', () => {
    const sites = refusalSites()
    // The scan is only meaningful if it found the refusals: a parser that stopped
    // matching would otherwise pass by finding nothing.
    expect(sites.length).toBeGreaterThan(40)

    const undeclared = sites
      .filter((site) => declaredReason(site.body) === null && !isInputError(site.body))
      .map((site) => `${site.file}:${site.line} — ${site.body.replace(/\s+/g, ' ').slice(0, 160)}`)

    expect(
      undeclared,
      'A command refuses for a reason the audit inventory does not list. If it is a ' +
        'decision on record, add a row to docs/research/decision-binding-audit.md and a ' +
        'reason to src/domain/environment/refusals.ts (or move the check into policy.ts ' +
        'when it reads a record and stops a command on every surface). If it is the ' +
        "argument's own problem, add its wording to INPUT_ERROR_PATTERNS in this test.",
    ).toEqual([])
  })

  it('keeps the inventory and the audit table as one list', () => {
    const rows = readAuditRows()
    expect(rows.size).toBeGreaterThan(10)

    const missingRows = REFUSAL_REASONS.filter((reason) => !rows.has(reason.auditRow)).map(
      (reason) => `${reason.id} → row ${reason.auditRow}`,
    )
    expect(missingRows).toEqual([])

    // Each reason is written into its row by id, so the doc and the code name the
    // same decision rather than merely describing one another.
    const missingIds = REFUSAL_REASONS.filter((reason) => rows.get(reason.auditRow) !== reason.id).map(
      (reason) => `${reason.id} → row ${reason.auditRow} says ${rows.get(reason.auditRow) ?? 'nothing'}`,
    )
    expect(missingIds).toEqual([])

    // And no row is unaccounted for: every number in the table is either a reason
    // above or one of the deliberate non-refusals.
    const accounted = new Set([
      ...REFUSAL_REASONS.map((reason) => reason.auditRow),
      ...NON_REFUSAL_AUDIT_ROWS,
    ])
    const unaccounted = [...rows.keys()].filter((row) => !accounted.has(row))
    expect(unaccounted).toEqual([])
  })

  it('declares every policy rule, so a rule added to policy.ts lands in the table', () => {
    const ruleIds: PolicyRuleId[] = [
      'request-refused',
      'no-live-session',
      'spooler-stopped',
      'stock-not-available',
    ]
    const declared = new Set(
      REFUSAL_REASONS.filter((reason) => reason.policyRule !== undefined).map(
        (reason) => reason.policyRule,
      ),
    )

    expect([...declared].sort()).toEqual([...ruleIds].sort())
  })

  it('declares only reasons whose commands exist, and never an empty wording', () => {
    const names = new Set(COMMANDS.map((command) => command.name))
    const problems: string[] = []

    for (const reason of REFUSAL_REASONS) {
      if (reason.messages.length === 0) {
        problems.push(`${reason.id}: no message to match a refusal against`)
      }
      if (reason.enforcedBy.trim().length === 0) {
        problems.push(`${reason.id}: does not say what enforces it`)
      }
    }

    // The commands a reason names through its wording are checked by the first
    // case; here the registry is only asked to still hold the ones it should.
    for (const required of ['book-shelf-machine', 'start-deployment', 'release-quarantine']) {
      if (!names.has(required)) problems.push(`command ${required} has gone from the registry`)
    }

    expect(problems).toEqual([])
  })
})
