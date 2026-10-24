/**
 * The drag a tool makes when it is carried out of a picker and onto the strip.
 *
 * Both ends of the gesture need the same answer, so both read it here: the picker
 * writes the console's id into the drag, and the strip reads it back to know that
 * what is arriving is a tool to open rather than a tab to move. A private type
 * rather than `text/plain` is what keeps a dragged tab, or a selection of text on
 * the page, from being opened as a console that does not exist.
 */
export const TOOL_DRAG_TYPE = 'application/x-helpdesk-tool'

/** Whether the drag carries a tool, by the type the picker wrote into it. */
export function carriesToolDrag(dataTransfer: DataTransfer | null): boolean {
  if (!dataTransfer) {
    return false
  }
  return Array.from(dataTransfer.types ?? []).includes(TOOL_DRAG_TYPE)
}

/**
 * The tool a drag is carrying, or null for a drag that carries none.
 *
 * `dragging` is the picker's own record of what it picked up. It comes first
 * because it is the same document's state and is set before the pointer moves,
 * and because a `DataTransfer` is not something every environment hands back —
 * the test environment, for one, has none at all.
 */
export function toolDragId(
  dataTransfer: DataTransfer | null,
  dragging: string | null,
): string | null {
  if (dragging !== null) {
    return dragging
  }
  if (!carriesToolDrag(dataTransfer)) {
    return null
  }
  const carried = dataTransfer?.getData(TOOL_DRAG_TYPE) ?? ''
  return carried === '' ? null : carried
}
