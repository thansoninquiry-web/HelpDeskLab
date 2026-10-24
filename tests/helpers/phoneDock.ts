import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { TEXT_SIZES, type TextSize } from '../../src/domain/appearance/textSize'

/**
 * The docked console's geometry, as the stylesheet declares it.
 *
 * jsdom applies no media queries and lays nothing out, so the phone dock has
 * never been *measured* by the suite: `workspaceNarrow.test.ts` holds its shape
 * with regular expressions, which cannot say whether the log that results is
 * readable. This module is the arithmetic those rules imply, with every number
 * read out of the stylesheets rather than copied here — the card's share of the
 * screen and its border, the console's row and its floor, the head, the chips,
 * the command line, the tabs a split hides, and the line box the log sets its
 * text in. Only two constants are assumed rather than declared: the root font
 * size the text-size setting multiplies, and the body's line-height, which every
 * control inherits through `font: inherit`.
 *
 * The model is the *declared* geometry, not a fit to one screenshot, so a card
 * that shrinks, a floor that is lowered, a chrome row that grows or a type scale
 * that is raised all move the answer. `tests/ui/phoneLog.test.ts` walks a table of
 * real phone viewports with it and fails when the log comes out under two lines.
 *
 * Three things are deliberately outside the model, each of them a state rather
 * than the geometry: an on-screen keyboard (the inset is 0 here, so this is the
 * card at rest), the refusal notice that pushes the chips row down while a
 * ticket is being closed as denied, and a card's head whose eyebrow wraps to a
 * second line on the narrowest panes — that one only competes with the tool pane,
 * because it happens where the console's floor is what sizes the console.
 */

const UI_ROOT = join(process.cwd(), 'src/ui')

function sheet(path: string): string {
  const raw = readFileSync(join(UI_ROOT, path), 'utf8')
  // Comments first: these stylesheets explain themselves in prose, values and all.
  return raw.replace(/\/\*[\s\S]*?\*\//g, ' ')
}

const WORKSPACE = unconditionalBlock(sheet('routes/workspace.module.css'))
const PRACTICE = unconditionalBlock(sheet('routes/practice.module.css'))
/** The full sheet, for a breakpoint's own rules. */
const WORKSPACE_ALL = sheet('routes/workspace.module.css')
/** The app's frame: the header is what the docked card hangs under. */
const SHELL = sheet('components/AppShell.module.css')
const TOKENS = sheet('styles/tokens.css')
const GLOBAL = sheet('styles/global.css')

/** The body of the block that opens at `start`, brace-balanced. */
function blockBody(css: string, start: number): string {
  const open = css.indexOf('{', start)
  let depth = 0
  for (let index = open; index < css.length; index += 1) {
    if (css[index] === '{') depth += 1
    if (css[index] === '}') {
      depth -= 1
      if (depth === 0) return css.slice(open + 1, index)
    }
  }
  throw new Error('a block is unterminated')
}

/** One breakpoint's block, by the query the stylesheet writes. */
function mediaBlock(css: string, query: string): string {
  const start = css.indexOf(query)
  if (start < 0) throw new Error(`no ${query} in the stylesheet`)
  return blockBody(css, start)
}

/**
 * The sheet with every conditional block removed: the rules that always apply.
 * A breakpoint's override must not leak into the base numbers it overrides, so
 * the two are read separately and chosen by the viewport, never merged.
 */
function unconditionalBlock(css: string): string {
  let rest = ''
  let cursor = 0
  for (const match of css.matchAll(/@(media|container)\b/g)) {
    const at = match.index ?? 0
    if (at < cursor) continue
    rest += css.slice(cursor, at)
    const open = css.indexOf('{', at)
    const body = blockBody(css, at)
    cursor = open + body.length + 2
  }
  return rest + css.slice(cursor)
}

/**
 * Every declaration written for `selector`, in the order the sheet states them,
 * so a later rule overrides an earlier one as the cascade would. A rule may be
 * written with companions (`.ticketCard, .caseCard, .toolCard`), so the selector
 * is matched as one item of its list — which is how the card's border is found
 * without repeating the number here.
 */
function declarations(css: string, selector: string): string {
  const found: string[] = []
  for (const match of css.matchAll(/([^{}]*)\{([^{}]*)\}/g)) {
    const selectors = (match[1] ?? '').split(',').map((item) => item.trim())
    if (selectors.includes(selector)) found.push(match[2] ?? '')
  }
  if (found.length === 0) throw new Error(`no rule for ${selector}`)
  return found.join(';')
}

/** One property from a rule; an undeclared property is null, as it is in CSS. */
function maybeProp(css: string, selector: string, property: string): string | null {
  const matches = [
    ...declarations(css, selector).matchAll(new RegExp(`(?:^|[\\s;])${property}\\s*:\\s*([^;]+)`, 'g')),
  ]
  const last = matches.at(-1)?.[1]
  return last === undefined ? null : last.trim()
}

/** One property from a rule, or a hard failure: an audit may not guess. */
function prop(css: string, selector: string, property: string): string {
  const value = maybeProp(css, selector, property)
  if (value === null) throw new Error(`${selector} declares no ${property}`)
  return value
}

/** Every custom property a sheet declares, the first declaration winning. */
const TOKEN_VALUES: ReadonlyMap<string, string> = new Map(
  [...TOKENS.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)].map((match) => [
    match[1] ?? '',
    (match[2] ?? '').trim(),
  ]),
)

/**
 * The text sizes Settings offers and the root scale each sets, read from the
 * stylesheet keyed by the domain's list: a size that exists on only one side is
 * a size this audit would silently skip.
 */
export const TEXT_SIZE_SCALES: ReadonlyMap<TextSize, number> = new Map(
  TEXT_SIZES.map((size) => {
    const block = new RegExp(`:root\\[data-text-size='${size}'\\]\\s*\\{([^}]*)\\}`).exec(TOKENS)?.[1]
    const scale = block === undefined ? undefined : /--ui-scale\s*:\s*([\d.]+)/.exec(block)?.[1]
    if (scale === undefined) throw new Error(`the stylesheet has no --ui-scale for ${size}`)
    return [size, Number.parseFloat(scale)]
  }),
)

/** The rem base the text-size setting multiplies, and the line-height it inherits. */
const ROOT_FONT_PX = Number(
  /(?:^|\n)html\s*\{[^}]*font-size:\s*calc\(\s*([\d.]+)px/.exec(GLOBAL)?.[1],
)
const LINE_FACTOR = Number(/(?:^|\n)body\s*\{[^}]*line-height:\s*([\d.]+)/.exec(GLOBAL)?.[1])

export interface Viewport {
  width: number
  height: number
}

/**
 * A declared length in CSS pixels: `px`, `rem`, `vw`, a custom property, or a
 * `clamp()` of those. Null for anything else, so the caller has to say what it
 * does not understand rather than quietly reading it as zero.
 */
function length(value: string, rem: number, viewport: Viewport, depth = 0): number | null {
  const trimmed = value.trim()
  if (depth > 5) return null

  const token = /^var\(\s*(--[a-z0-9-]+)\s*(?:,\s*([^)]+))?\)$/.exec(trimmed)
  if (token) {
    const declared = TOKEN_VALUES.get(token[1] ?? '')
    if (declared !== undefined) return length(declared, rem, viewport, depth + 1)
    return token[2] === undefined ? null : length(token[2], rem, viewport, depth + 1)
  }

  const clamp = /^clamp\(\s*([^,]+),\s*([^,]+),\s*([^)]+)\)$/.exec(trimmed)
  if (clamp) {
    const low = length(clamp[1] ?? '', rem, viewport, depth + 1)
    const mid = length(clamp[2] ?? '', rem, viewport, depth + 1)
    const high = length(clamp[3] ?? '', rem, viewport, depth + 1)
    if (low === null || mid === null || high === null) return null
    return Math.min(Math.max(mid, low), high)
  }

  // `dvh` is measured against the same viewport the model is handed: the one with
  // the browser's chrome showing is the only one an audit can name.
  const measured = /^(-?[\d.]+)(px|rem|vw|vh|dvh)$/.exec(trimmed)
  if (measured) {
    const amount = Number.parseFloat(measured[1] ?? '0')
    if (measured[2] === 'rem') return amount * rem
    if (measured[2] === 'vw') return (amount / 100) * viewport.width
    if (measured[2] === 'vh' || measured[2] === 'dvh') return (amount / 100) * viewport.height
    return amount
  }
  return trimmed === '0' ? 0 : null
}

function must(value: string, rem: number, viewport: Viewport, label: string): number {
  const resolved = length(value, rem, viewport)
  if (resolved === null) throw new Error(`${label} is not a length this audit can read: ${value}`)
  return resolved
}

/** A geometry custom property, read the way a stylesheet value would be. */
function token(name: string, rem: number, viewport: Viewport): number {
  const declared = TOKEN_VALUES.get(name)
  if (declared === undefined) throw new Error(`the stylesheet declares no ${name}`)
  return must(declared, rem, viewport, name)
}

/** The line box a font size sits in: the body's line-height, inherited by every control. */
function line(fontPx: number): number {
  return fontPx * LINE_FACTOR
}

/** A rule's font size, in pixels at this text size. */
function fontPx(css: string, selector: string, rem: number, viewport: Viewport, label: string): number {
  return must(prop(css, selector, 'font-size'), rem, viewport, label)
}

interface Edges {
  padding: number
  border: number
}

/** One side's border width, from its own declaration or the `border` shorthand. */
function borderWidth(css: string, selector: string, side: 'top' | 'bottom'): number {
  const own = maybeProp(css, selector, `border-${side}`)
  const shorthand = maybeProp(css, selector, 'border')
  const source = (own ?? shorthand ?? '0').trim()
  if (source === '0' || source === 'none') return 0
  const width = /^([\d.]+)px/.exec(source)?.[1]
  if (width === undefined) throw new Error(`${selector} has a border this audit cannot read: ${source}`)
  return Number.parseFloat(width)
}

/** A box's vertical padding and border, top and bottom together. */
function edges(css: string, selector: string, rem: number, viewport: Viewport): Edges {
  const padding = (maybeProp(css, selector, 'padding') ?? '0').split(/\s+/)
  return {
    padding:
      must(padding[0] ?? '0', rem, viewport, `${selector} padding`) +
      must(padding[2] ?? padding[0] ?? '0', rem, viewport, `${selector} padding`),
    border: borderWidth(css, selector, 'top') + borderWidth(css, selector, 'bottom'),
  }
}

/** The height of a box whose content is one line of its own font size. */
function boxHeight(
  css: string,
  selector: string,
  rem: number,
  viewport: Viewport,
  label: string,
): number {
  const box = edges(css, selector, rem, viewport)
  return line(fontPx(css, selector, rem, viewport, label)) + box.padding + box.border
}

export type DockMode = 'phone' | 'short'

export interface DockLayout {
  mode: DockMode
  /** The docked card's border-box height. */
  card: number
  /** The head above the panes. */
  head: number
  /** The console's own row inside the card, hairline included. */
  console: number
  /** The quick-command chips above the log. */
  chips: number
  /** The command line under the log. */
  command: number
  /** The log's scroll viewport, inside its padding: where entries are read. */
  log: number
  /** One line of log text. */
  line: number
  /** How many whole lines of log fit at once. */
  lines: number
}

/**
 * Which dock a viewport asks for, if any. The two own either side of one
 * boundary: under 481px tall is the side dock (every landscape phone, and a
 * short window however wide), and phone width above it is the bottom dock. A
 * window that is both narrow and short enough to be neither — 480×480 — is
 * docked by nothing, as it is in the stylesheet.
 */
export function dockModeFor(viewport: Viewport): DockMode | null {
  if (viewport.height <= 480 && viewport.width >= 481) return 'short'
  if (viewport.width <= 600 && viewport.height >= 481) return 'phone'
  return null
}

const PHONE_BLOCK = '@media (max-width: 600px) and (min-height: 481px)'
const SHORT_BLOCK = '@media (max-height: 480px) and (min-width: 481px)'
const NARROW_LOG_BLOCK = '@container (max-width: 22rem)'
const SHELL_PHONE_BLOCK = '@media (max-width: 600px)'
const SHELL_SIDE_BLOCK = '@media (max-width: 600px) and (max-height: 480px)'

function dockBlock(mode: DockMode): string {
  return mediaBlock(WORKSPACE_ALL, mode === 'phone' ? PHONE_BLOCK : SHORT_BLOCK)
}

/**
 * The sticky header's height, in the state the card is smallest under: a phone
 * at rest keeps the section row, a phone on its side starts folded to one row,
 * and a scrolled phone folds too — so the taller value of each pair is the one
 * measured here.
 */
function headerHeight(viewport: Viewport, rem: number): number {
  if (viewport.width <= 600) {
    const block =
      viewport.height <= 480 && SHELL.includes(SHELL_SIDE_BLOCK)
        ? SHELL_SIDE_BLOCK
        : SHELL_PHONE_BLOCK
    const declared = maybeProp(mediaBlock(SHELL, block), '.shell', '--header-height')
    if (declared !== null) return must(declared, rem, viewport, 'header height')
  }
  return token('--header-height', rem, viewport)
}

/** The card's height: a share of a phone screen, the room under the header on its side. */
function cardHeight(mode: DockMode, viewport: Viewport, rem: number): number {
  const header = headerHeight(viewport, rem)

  if (mode === 'phone') {
    // The card's height is a share of the screen, and the share is a palette
    // token — `--dock-share` — so the sheet can name one number and the workspace
    // can write it while the edge is dragged. A plain length is still read, for a
    // build that states the share inline.
    const declared = (maybeProp(dockBlock(mode), '.toolCard', 'height') ?? '').trim()
    const tokenRef = /^var\(\s*(--[a-z0-9-]+)\s*\)$/.exec(declared)?.[1]
    const height =
      tokenRef === undefined
        ? must(declared, rem, viewport, 'the phone card height')
        : token(tokenRef, rem, viewport)
    // The `max-height` cap: lifted onto the keyboard, a card this tall would climb
    // behind the header, so the room between the two bounds it instead.
    return Math.min(height, viewport.height - header)
  }

  // Docked to the right edge, under the header and above the bottom one.
  return viewport.height - header
}

/** The head above the panes: its padding and hairline, and the taller of its columns. */
function headHeight(viewport: Viewport, rem: number): number {
  const box = edges(WORKSPACE, '.toolHead', rem, viewport)
  const glyph = must(prop(WORKSPACE, '.toolGlyph', 'height'), rem, viewport, 'tool glyph')
  const identity =
    line(fontPx(WORKSPACE, '.toolEyebrow', rem, viewport, 'eyebrow type')) +
    must(prop(WORKSPACE, '.toolIdentity > span:last-child', 'gap'), rem, viewport, 'identity gap') +
    line(fontPx(WORKSPACE, '.toolTitle', rem, viewport, 'title type'))
  return box.padding + box.border + Math.max(glyph, identity)
}

/**
 * The quick-command chips: one sideways row on a phone, its padding and its top
 * edge — or nothing, where the sheet drops the row to spend its height on log.
 */
function chipsHeight(mode: DockMode, viewport: Viewport, rem: number): number {
  if (maybeProp(dockBlock(mode), '.quickRow', 'display') === 'none') return 0
  const box = edges(WORKSPACE, '.quickRow', rem, viewport)
  return box.padding + box.border + boxHeight(WORKSPACE, '.quickCommand', rem, viewport, 'chip type')
}

/** The command line: the form's padding around the taller of its field and its button. */
function commandHeight(viewport: Viewport, rem: number): number {
  const form = edges(WORKSPACE, '.commandForm', rem, viewport)
  const field = boxHeight(WORKSPACE, '.commandInput', rem, viewport, 'field type')
  const button = boxHeight(PRACTICE, '.runButton', rem, viewport, 'button type')
  return form.padding + form.border + Math.max(field, button)
}

/** The pane tabs above the panes, which a split hides. */
function tabsHeight(viewport: Viewport, rem: number): number {
  const strip = edges(WORKSPACE, '.toolTabs', rem, viewport)
  return strip.padding + strip.border + boxHeight(WORKSPACE, '.toolTab', rem, viewport, 'tab type')
}

interface Track {
  min: number
  flex: number
}

/**
 * The rows of a split, in the order the grid fills them. `order` is what decides
 * which pane lands in which row — the terminal is first in the DOM and moves
 * below the tool on a phone — so it is read from the sheet rather than assumed.
 */
function splitRows(
  mode: DockMode,
  viewport: Viewport,
  rem: number,
): { console: Track; tool: Track } {
  const block = dockBlock(mode)
  const tracks = [
    ...prop(block, '.toolSplitOn', 'grid-template-rows').matchAll(/minmax\(\s*([^,]+),\s*([^)]+)\)/g),
  ]
  if (tracks.length !== 2) throw new Error(`the ${mode} split does not declare two rows`)

  const parsed = tracks.map((match) => ({
    min: must(match[1] ?? '0', rem, viewport, 'row floor'),
    flex: Number.parseFloat((match[2] ?? '').trim()) || 0,
  }))
  if (!parsed.every((track) => track.flex > 0)) {
    throw new Error(`the ${mode} split does not size its rows proportionally`)
  }

  const firstOrder = Number.parseInt(prop(block, '.toolSplitOn > .toolBody:first-child', 'order'), 10)
  const lastOrder = Number.parseInt(prop(block, '.toolSplitOn > .toolBody:last-child', 'order'), 10)
  // The terminal is the first pane in the DOM; the lower order is placed earlier.
  const consoleRow = firstOrder <= lastOrder ? 0 : 1
  return { console: parsed[consoleRow] as Track, tool: parsed[1 - consoleRow] as Track }
}

/**
 * How wide the console pane is: inside the card's frame on a phone, the dock's
 * own width on its side. The log's container query is measured against this, so
 * the frame is subtracted rather than rounded away.
 */
function paneWidth(mode: DockMode, viewport: Viewport, rem: number): number {
  if (mode === 'phone') {
    return viewport.width - edges(WORKSPACE, '.toolCard', rem, viewport).border
  }
  return token('--dock-width', rem, viewport)
}

/** The log's own padding, tightened when the pane is too narrow for its full inset. */
function logPadding(mode: DockMode, viewport: Viewport, rem: number): number {
  const narrowAt = Number(/max-width:\s*([\d.]+)rem/.exec(NARROW_LOG_BLOCK)?.[1])
  const css =
    paneWidth(mode, viewport, rem) / rem <= narrowAt
      ? mediaBlock(WORKSPACE_ALL, NARROW_LOG_BLOCK)
      : WORKSPACE
  return edges(css, '.log', rem, viewport).padding
}

/**
 * The docked console's geometry for one viewport, text size and pane state, or
 * null where the stylesheet docks nothing (a desktop window).
 */
export function dockLayout(
  viewport: Viewport,
  textSize: TextSize,
  split: boolean,
): DockLayout | null {
  const mode = dockModeFor(viewport)
  if (mode === null) return null

  const scale = TEXT_SIZE_SCALES.get(textSize)
  if (scale === undefined) throw new Error(`no scale for the ${textSize} text size`)
  const rem = ROOT_FONT_PX * scale

  const card = cardHeight(mode, viewport, rem)
  const head = headHeight(viewport, rem)
  // The card's top edge is a control on a phone — the bar the learner drags to
  // resize the card — so it costs the panes its height the way the head does. A
  // bar drawn taller than the room it takes says so with a negative bottom
  // margin: the strip overlaps the head's padding, and only what is left over
  // after that margin is space the console loses. The side dock does not draw it.
  const edge = (() => {
    if (mode !== 'phone') return 0
    const block = dockBlock(mode)
    const bar = must(prop(block, '.dockHandle', 'height'), rem, viewport, 'dock edge height')
    return bar + must(maybeProp(block, '.dockHandle', 'margin-bottom') ?? '0', rem, viewport, 'dock edge margin')
  })()
  const content = card - edges(WORKSPACE, '.toolCard', rem, viewport).border - head - edge

  let consoleRow: number
  let consoleBorder: number
  if (split) {
    const rows = splitRows(mode, viewport, rem)
    const share = (content * rows.console.flex) / (rows.console.flex + rows.tool.flex)
    consoleRow = Math.max(rows.console.min, share)
    // The console's pane carries the hairline that separates it from the tool above.
    consoleBorder = borderWidth(dockBlock(mode), '.toolSplitOn > .toolBody:first-child', 'top')
  } else {
    consoleRow = content - tabsHeight(viewport, rem)
    consoleBorder = 0
  }

  const chips = chipsHeight(mode, viewport, rem)
  const command = commandHeight(viewport, rem)
  const log = consoleRow - consoleBorder - chips - command - logPadding(mode, viewport, rem)
  const lineBox = line(fontPx(WORKSPACE, '.log', rem, viewport, 'log type'))

  return {
    mode,
    card,
    head,
    console: consoleRow,
    chips,
    command,
    log,
    line: lineBox,
    lines: log / lineBox,
  }
}

/** Real phones, in CSS pixels, both ways up. */
export interface PhoneViewport extends Viewport {
  device: string
}

export const PHONE_VIEWPORTS: readonly PhoneViewport[] = [
  { device: 'iPhone SE (1st gen)', width: 320, height: 568 },
  { device: 'iPhone SE (1st gen), landscape', width: 568, height: 320 },
  { device: 'iPhone 8', width: 375, height: 667 },
  { device: 'iPhone 8, landscape', width: 667, height: 375 },
  { device: 'iPhone SE (2nd/3rd gen)', width: 375, height: 667 },
  { device: 'iPhone 12/13 mini', width: 375, height: 812 },
  { device: 'iPhone 12/13 mini, landscape', width: 812, height: 375 },
  { device: 'Pixel 4a', width: 393, height: 851 },
  { device: 'Pixel 4a, landscape', width: 851, height: 393 },
  { device: 'iPhone 14/15', width: 390, height: 844 },
  { device: 'iPhone 14/15, landscape', width: 844, height: 390 },
  { device: 'iPhone 15 Pro Max', width: 430, height: 932 },
  { device: 'iPhone 15 Pro Max, landscape', width: 932, height: 430 },
  { device: 'Galaxy S8', width: 360, height: 740 },
  { device: 'Galaxy S8, landscape', width: 740, height: 360 },
  { device: 'Galaxy S21', width: 360, height: 800 },
  { device: 'Galaxy S21, landscape', width: 800, height: 360 },
  { device: 'Pixel 7', width: 412, height: 915 },
  { device: 'Pixel 7, landscape', width: 915, height: 412 },
]
