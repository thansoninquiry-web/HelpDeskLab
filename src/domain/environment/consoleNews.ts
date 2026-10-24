import type { ConsoleEntry, ConsoleId } from './console'
import type { DesktopView } from './remoteDesktop'
import type { TopologyView } from './topology'

/**
 * Which open console has something the learner has not read yet.
 *
 * A console projects machine state at the moment it is read, so a command typed
 * anywhere — in the side terminal, in another console, in a desktop shell — can
 * change what a tab would print while the learner is looking somewhere else. This
 * module is the sum that notices: a digest of the page a console would draw, and
 * the digest each console had the last time the workspace read it.
 *
 * Nothing here is persisted. The tabs and their order belong to the attempt, but
 * "have I read this yet" belongs to the visit, so a reopened ticket starts with
 * every tab quiet rather than twelve of them marked as news.
 *
 * The digest covers what a console prints and nothing else. Fields the page never
 * draws are left out on purpose: the record's filter ids, the map check's `atMs`,
 * and the fake desktop's clock, which follows every command. A digest that moved
 * for any of those would mark every tab as news after every command.
 */

/** What a console would print, which is all the digest reads. */
export interface ConsolePage {
  entries: readonly ConsoleEntry[]
  topology: TopologyView | null
  desktop?: DesktopView | null
}

/** The digest each console had the last time the workspace read it. */
export type ConsoleReads = Readonly<Partial<Record<ConsoleId, string>>>

/** Separators no console prints, so two different pages cannot digest alike. */
const FIELD = '\u0001'
const LINE = '\u0002'

function digestEntry(entry: ConsoleEntry): string {
  return [
    entry.id,
    entry.title,
    entry.subtitle,
    entry.note ?? '',
    entry.facts.map((fact) => `${fact.label}=${fact.value}`).join(LINE),
    entry.groups
      .map((group) => `${group.label}=${group.items.join(FIELD)}/${group.empty}`)
      .join(LINE),
    entry.actions.map((action) => `${action.id}=${action.label}`).join(LINE),
    (entry.history ?? [])
      .map((step) => `${step.kind}=${step.text}=${step.ticket}=${step.outcome ?? ''}`)
      .join(LINE),
  ].join(FIELD)
}

function digestTopology(topology: TopologyView | null): string {
  if (topology === null) {
    return ''
  }
  return [
    topology.originHostname,
    topology.originSiteName,
    `${topology.proved}/${topology.failed}/${topology.total}`,
    topology.groups
      .map((group) =>
        [
          group.id,
          group.kind,
          group.title,
          group.subtitle,
          group.checks
            .map((check) => `${check.id}=${check.label}=${check.state}=${check.evidence ?? ''}`)
            .join(LINE),
        ].join(FIELD),
      )
      .join(LINE),
  ].join(FIELD)
}

function digestDesktop(desktop: DesktopView | null | undefined): string {
  if (!desktop) {
    return ''
  }
  return [
    desktop.entryId,
    desktop.hostname,
    desktop.userName,
    desktop.userAccount,
    String(desktop.signedIn),
    desktop.siteName,
    desktop.domain,
    desktop.os,
    desktop.ipMode,
    desktop.ipAddress ?? '',
    desktop.dnsServers.join(FIELD),
    String(desktop.diskFreePercent),
    String(desktop.lastUpdateDays),
    String(desktop.pendingReboot),
    desktop.spoolerStatus,
    desktop.printers
      .map((printer) =>
        [
          printer.id,
          printer.name,
          printer.model,
          printer.status,
          String(printer.isDefault),
          printer.jobs
            .map((job) => `${job.id}=${job.document}=${job.owner}=${job.status}`)
            .join(LINE),
        ].join(FIELD),
      )
      .join(LINE),
    desktop.openDesktops.map((session) => `${session.entryId}=${session.hostname}`).join(LINE),
  ].join(FIELD)
}

/** What a console would print, as one comparable string. */
export function consoleDigest(page: ConsolePage): string {
  return [
    page.entries.map(digestEntry).join(LINE),
    digestTopology(page.topology),
    digestDesktop(page.desktop),
  ].join(FIELD)
}

/**
 * Files what a read of a console found. A console the learner is looking at is
 * recorded as read as it changes — it is the one on screen — while one standing
 * behind another tab keeps the digest it had, which is what lets the tab say what
 * it has not been told yet. The first read of a console is never news: that read
 * is what put the tab there.
 *
 * The same map comes back when nothing changed, so the caller can put it straight
 * into state without a render.
 */
export function noteConsoleRead(
  reads: ConsoleReads,
  read: { id: ConsoleId; digest: string },
  looked: boolean,
): ConsoleReads {
  const known = reads[read.id]
  if (known === undefined) {
    return { ...reads, [read.id]: read.digest }
  }
  if (looked && known !== read.digest) {
    return { ...reads, [read.id]: read.digest }
  }
  return reads
}

/**
 * Whether a console has printed something the learner has not read. A console
 * with no read on file has nothing to report: it has not been looked away from.
 */
export function consoleHasNews(
  reads: ConsoleReads,
  id: ConsoleId,
  digest: string | undefined,
): boolean {
  if (digest === undefined) {
    return false
  }
  const known = reads[id]
  return known !== undefined && known !== digest
}

/**
 * The next open tab with something unread, stepping from the tab in front and
 * wrapping once around the strip — or `null` when every tab has been read.
 *
 * The search starts *after* the tab in front, so a second press carries on along
 * the strip rather than landing on the one already showing, and a strip taller
 * than the card is walked in the order it is drawn. The tab in front is still a
 * candidate once the turn comes back round to it: that is the one case where the
 * console being looked at can carry news, because its pane was behind the
 * terminal when the change arrived.
 */
export function nextConsoleWithNews(
  openTools: readonly ConsoleId[],
  current: ConsoleId | null,
  reads: ConsoleReads,
  digests: Readonly<Partial<Record<ConsoleId, string>>>,
): ConsoleId | null {
  const from = current === null ? 0 : openTools.indexOf(current) + 1
  for (let step = 0; step < openTools.length; step += 1) {
    const id = openTools[(from + step) % openTools.length]
    if (id !== undefined && consoleHasNews(reads, id, digests[id])) {
      return id
    }
  }
  return null
}
