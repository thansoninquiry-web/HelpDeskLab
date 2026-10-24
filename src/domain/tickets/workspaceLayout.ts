import type { JsonObject } from '../shared/json'
import { splitRatioWithin } from './splitLayout'

/**
 * Which half of the workspace was in front. The tabbed layout shows one at a
 * time, and this is the tab that was selected; on the split layout both are on
 * screen and the pane only decides which one the tabs would show.
 */
export type WorkspacePane = 'terminal' | 'tools'

/**
 * Where the learner was working inside a ticket: the pane in front, the tool
 * console showing, and the tabs left open beside it — in the order they put them
 * in, with the ones they pinned held as a group at the left of the strip.
 *
 * It belongs to the attempt rather than to the device, because it is work in
 * progress rather than taste: the consoles in front project *this* ticket's
 * machines and this attempt's evidence, so the next ticket is free to open on a
 * clean terminal. Window shape is the other kind of preference and stays where
 * it is — the split is a setting, read before the first paint.
 */
export interface WorkspaceLayout {
  pane: WorkspacePane
  /** The console in front, or null while the tools pane shows the picker. */
  tool: string | null
  /**
   * The open console tabs, in the learner's order. The pinned ones are always
   * first, in the order they were pinned: see `pinWorkspaceTool`, which is the
   * only thing that puts one there.
   */
  tabs: readonly string[]
  /**
   * The consoles held as a group at the left of the strip, in the order they
   * were pinned. A pinned tab cannot be dragged out of the group, and nothing
   * unpinned can be dragged ahead of it, so a working set stays where the hand
   * expects it while other tabs come and go.
   */
  pinned: readonly string[]
  /**
   * Where the split divider stood on this attempt, or null when it was never
   * moved here. The width the desk works at is part of how it was working — a
   * case file that wants two thirds on one ticket and half on another — so it is
   * kept with the tabs rather than only with the device's own preference, which
   * remains the starting width for a ticket that has never been sized.
   */
  ratio: number | null
}

export const DEFAULT_WORKSPACE_LAYOUT: WorkspaceLayout = {
  pane: 'terminal',
  tool: null,
  tabs: [],
  pinned: [],
  ratio: null,
}

/**
 * Reads a stored layout back into a usable one. Nothing stored is ever
 * rejected, and the result always holds the invariants the pane relies on: a
 * console can only be in front if it is open, every pinned console is one of the
 * open tabs, the pinned ones are the front of the strip, and none is pinned
 * twice. A corrupt row cannot grow a tab strip longer than the consoles that
 * exist.
 *
 * A `pinned` written before the group existed is a single id rather than a list,
 * and reads as a group of one: the row is JSON, so old attempts are read rather
 * than migrated.
 */
export function normalizeWorkspaceLayout(
  value: unknown,
  consoleIds: readonly string[],
): WorkspaceLayout {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return DEFAULT_WORKSPACE_LAYOUT
  }

  const record = value as Record<string, unknown>
  const stored = Array.isArray(record.tabs) ? record.tabs : []
  const tabs = [
    ...new Set(
      stored.filter(
        (id): id is string => typeof id === 'string' && consoleIds.includes(id),
      ),
    ),
  ].slice(0, consoleIds.length)

  const storedPins = Array.isArray(record.pinned)
    ? record.pinned
    : typeof record.pinned === 'string'
      ? [record.pinned]
      : []
  const pinned = [
    ...new Set(
      storedPins.filter((id): id is string => typeof id === 'string' && tabs.includes(id)),
    ),
  ]

  return {
    pane: record.pane === 'tools' ? 'tools' : 'terminal',
    tool:
      typeof record.tool === 'string' && tabs.includes(record.tool) ? record.tool : null,
    // The pins outrank the stored order: the pinned ones are the front of the
    // strip, in the order they were pinned, whatever the row says.
    tabs: [...pinned, ...tabs.filter((id) => !pinned.includes(id))],
    pinned,
    // A divider is read inside the bounds the pointer respects, and a row that
    // names no width — every row written before this existed — keeps the
    // device's own preference instead of the default half.
    ratio: typeof record.ratio === 'number' ? splitRatioWithin(record.ratio) : null,
  }
}

/**
 * Pins a tab into the group at the left of the strip, or takes it out again.
 *
 * Pinning puts the tab at the end of the group, so a group built one click at a
 * time keeps the order it was built in rather than reshuffling under the hand.
 * Unpinning puts the tab at the front of what is free to drag — the edge the
 * group leaves — rather than at the end, because taking a tab out of the group
 * is not a request to move it across the strip. It cannot stay exactly where it
 * was, because the group is the front of the row: a tab released in the middle
 * of it would leave a pinned tab behind an unpinned one. A tool that is not open
 * cannot be pinned: there is no tab to hold.
 */
export function pinWorkspaceTool(layout: WorkspaceLayout, tool: string): WorkspaceLayout {
  if (!layout.tabs.includes(tool)) {
    return layout
  }
  if (layout.pinned.includes(tool)) {
    const pinned = layout.pinned.filter((id) => id !== tool)
    return {
      ...layout,
      pinned,
      tabs: [...pinned, tool, ...layout.tabs.filter((id) => id !== tool && !pinned.includes(id))],
    }
  }
  return {
    ...layout,
    pinned: [...layout.pinned, tool],
    tabs: [...layout.pinned, tool, ...layout.tabs.filter((id) => !layout.pinned.includes(id) && id !== tool)],
  }
}

/**
 * Moves an open tab to a new place in the strip, which is what a drag does. The
 * pinned group keeps the front: a move that would put something ahead of it
 * lands behind it instead, and a pinned tab itself does not move. An index off
 * the end of the strip, or a move onto the tab's own place, changes nothing.
 */
export function reorderWorkspaceTools(
  layout: WorkspaceLayout,
  from: number,
  to: number,
): WorkspaceLayout {
  const floor = layout.pinned.length
  const start = from < floor || from >= layout.tabs.length ? null : from
  const end = Math.min(Math.max(to, floor), layout.tabs.length - 1)
  if (start === null || start === end) {
    return layout
  }

  const tabs = [...layout.tabs]
  const [moved] = tabs.splice(start, 1)
  if (moved === undefined) {
    return layout
  }
  tabs.splice(end, 0, moved)
  return { ...layout, tabs }
}

/**
 * Where a tool dropped on the strip would actually land. The strip is drawn as a
 * row, so the drop asks for a place between tabs; the pins outrank the pointer,
 * exactly as they outrank a drag, so nothing lands ahead of the group. The tool
 * itself is left out of the count, because a drop on a tab that is already open
 * is a move rather than a second copy of it — and a pinned tool cannot be moved
 * at all, so its own place is the answer for it.
 */
export function workspaceInsertIndex(
  layout: WorkspaceLayout,
  tool: string,
  index: number,
): number {
  if (layout.pinned.includes(tool)) {
    return Math.max(0, layout.tabs.indexOf(tool))
  }
  const others = layout.tabs.filter((id) => id !== tool)
  const floor = layout.pinned.length
  const wanted = Number.isFinite(index) ? Math.round(index) : floor
  return Math.min(Math.max(wanted, floor), others.length)
}

/**
 * Puts a tool at a place in the strip, which is what dropping it there does. A
 * tool that is not open yet becomes a tab there; one that is already open moves
 * to that place instead of appearing twice, so the strip keeps one tab per
 * console and the drop means what it says. The pinned group holds the front and
 * does not move.
 */
export function insertWorkspaceTool(
  layout: WorkspaceLayout,
  tool: string,
  index: number,
): WorkspaceLayout {
  if (layout.pinned.includes(tool)) {
    return layout
  }
  const at = workspaceInsertIndex(layout, tool, index)
  if (layout.tabs.includes(tool) && layout.tabs.indexOf(tool) === at) {
    return layout
  }
  const tabs = layout.tabs.filter((id) => id !== tool)
  tabs.splice(at, 0, tool)
  return { ...layout, tabs }
}

/** The form written to `sessions.workspace_layout_json`. */
export function workspaceLayoutJson(layout: WorkspaceLayout): JsonObject {
  return {
    pane: layout.pane,
    tool: layout.tool,
    tabs: [...layout.tabs],
    pinned: [...layout.pinned],
    ratio: layout.ratio,
  }
}

/**
 * True when the layout carries nothing worth storing or restoring. Moving the
 * divider counts: the desk was made a shape, even if no console was opened in it.
 */
export function isEmptyWorkspaceLayout(layout: WorkspaceLayout): boolean {
  return (
    layout.pane === 'terminal' &&
    layout.tool === null &&
    layout.tabs.length === 0 &&
    layout.pinned.length === 0 &&
    layout.ratio === null
  )
}
