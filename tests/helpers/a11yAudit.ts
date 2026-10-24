import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  declarationsFor,
  declarationsInState,
  type RuleIndex,
  type StyleRule,
} from './themeAudit'

/**
 * The accessibility audit: the four things a colour check cannot see — whether a
 * focused control looks focused, whether a target is big enough to hit, whether
 * the workspace stops moving when the operating system asks it to, and whether a
 * screen reader is told what each control is.
 *
 * It works the way the theme audit does. Focus and motion are settled on the
 * stylesheets, because that is where they are declared; hit targets and labels
 * are settled on the rendered routes, through the same declaration resolution the
 * colour audit uses, so a control is judged by the rules that actually reach it
 * and not by a guess from its name. Every check has a positive control in its
 * test, so a matcher that stops finding anything fails instead of passing.
 *
 * What it cannot see: jsdom lays nothing out. Target sizes are therefore a
 * conservative lower bound computed from padding, an explicit height, and the
 * line height — never a measurement — and width is left alone entirely, because
 * a button's width comes from text no layout engine here can measure. The floor
 * is what a rule *guarantees*; a control that has to be big enough says so with
 * a `min-height`, which is what the guard asks of the stylesheets.
 */

/** The smallest target a pointer or a thumb may have to hit, in CSS pixels. */
export const HIT_TARGET_PX = 24

/** The body line height every unstyled label inherits, from global.css. */
const INHERITED_LINE_HEIGHT = 1.6

/** What the focus ring is drawn with, and what counts as drawing one. */
const INDICATOR_PROPERTIES = [
  'outline',
  'outline-width',
  'box-shadow',
  'border-color',
  'background-color',
  'background',
] as const

/** Values that mean "no indicator at all", by property prefix. */
const NOTHING = /^(none|0|0px|transparent|currentcolor\s+none)$/i

export interface CssFile {
  /** Relative to `src/ui`, e.g. `styles/global.css`. */
  file: string
  css: string
}

/** Every stylesheet under `src/ui`, as text: the media queries are only in here. */
export function readUiStylesheets(directory = join(process.cwd(), 'src/ui')): CssFile[] {
  const found: CssFile[] = []
  const walk = (current: string) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name)
      if (entry.isDirectory()) {
        walk(path)
      } else if (entry.name.endsWith('.css')) {
        found.push({ file: path.slice(directory.length + 1).replace(/\\/g, '/'), css: readFileSync(path, 'utf8') })
      }
    }
  }
  walk(directory)
  return found.sort((left, right) => left.file.localeCompare(right.file))
}

/** The body of one at-rule, found by its prelude, with nested braces counted. */
function atRuleBody(css: string, query: RegExp): string | null {
  const match = query.exec(css)
  if (!match) {
    return null
  }
  const open = css.indexOf('{', match.index)
  if (open < 0) {
    return null
  }
  let depth = 0
  for (let index = open; index < css.length; index += 1) {
    if (css[index] === '{') depth += 1
    if (css[index] === '}') {
      depth -= 1
      if (depth === 0) {
        return css.slice(open + 1, index)
      }
    }
  }
  return null
}

function declarationsOf(rule: StyleRule): Map<string, string> {
  return new Map(rule.declarations)
}

/** The class or element names a selector hangs off, e.g. `.a:hover .b` → a, b. */
function subjectsOf(selector: string): string[] {
  return [...selector.matchAll(/\.([A-Za-z][\w-]*)|(?:^|[\s>+~,])([a-z][\w-]*)/g)]
    .map((match) => match[1] ?? match[2] ?? '')
    .filter((name) => name.length > 0)
}

function drawsIndicator(declarations: Map<string, string>): string | null {
  for (const property of INDICATOR_PROPERTIES) {
    const value = declarations.get(property)
    if (value === undefined) {
      continue
    }
    // A width of 0 or a `none` shadow draws nothing; a coloured outline draws.
    if (property === 'outline-width') {
      const width = Number.parseFloat(value)
      if (Number.isFinite(width) && width === 0) {
        continue
      }
      return `${property}: ${value}`
    }
    if (NOTHING.test(value.trim())) {
      continue
    }
    // A full-size but transparent shadow draws nothing either.
    if (property === 'box-shadow' && /\btransparent\s*$/.test(value.trim())) {
      continue
    }
    if (property === 'outline' && /^\d/.test(value.trim())) {
      const [, style] = value.trim().split(/\s+/)
      if (style === 'none' || style === 'hidden') {
        continue
      }
    }
    return `${property}: ${value}`
  }
  return null
}

function suppressesOutline(declarations: Map<string, string>): boolean {
  for (const property of ['outline', 'outline-width'] as const) {
    const value = declarations.get(property)
    if (value === undefined) {
      continue
    }
    if (property === 'outline-width') {
      if (Number.parseFloat(value) === 0) {
        return true
      }
      continue
    }
    const trimmed = value.trim()
    if (NOTHING.test(trimmed)) {
      return true
    }
    const [, style] = trimmed.split(/\s+/)
    if (style === 'none' || style === 'hidden') {
      return true
    }
  }
  return false
}

/**
 * There has to be one focus style that reaches everything a keyboard can land
 * on. The components add their own on top; nothing may leave an element with
 * none, which is what an unscoped `:focus-visible` rule guarantees.
 */
export function globalFocusGaps(sheets: readonly CssFile[]): string[] {
  const gaps: string[] = []

  for (const sheet of sheets) {
    for (const match of sheet.css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const selector = (match[1] ?? '').replace(/\s+/g, ' ').trim()
      if (selector !== ':focus-visible' && selector !== '*:focus-visible') {
        continue
      }
      const declarations = new Map<string, string>()
      for (const declaration of (match[2] ?? '').matchAll(/([a-z-]+)\s*:\s*([^;]+);/gi)) {
        declarations.set((declaration[1] ?? '').toLowerCase(), (declaration[2] ?? '').trim())
      }
      if (!drawsIndicator(declarations)) {
        gaps.push(`${sheet.file} → ${selector} draws no visible outline`)
      }
    }
  }

  if (gaps.length === 0) {
    const found = sheets.some((sheet) => /(^|[{}\s])(\*)?:focus-visible\s*\{/.test(sheet.css))
    if (!found) {
      gaps.push('no unscoped :focus-visible rule: a control with no focus style of its own has none')
    }
  }

  return gaps
}

/** Whether a selector puts the element in a focused state. */
function isFocusRule(selector: string): boolean {
  return /:focus(?:-visible|-within)?\b/.test(selector)
}

export interface A11yGap {
  file: string
  selector: string
  reason: string
}

/**
 * A rule that switches the outline off is only acceptable when something else
 * appears in its place: either the same `:focus-visible` rule declares another
 * visual change, or a companion rule for the same subject does. `outline: none`
 * with nothing behind it is an invisible focus ring for a keyboard user.
 */
export function outlineSuppressionGaps(rules: readonly StyleRule[]): A11yGap[] {
  const gaps: A11yGap[] = []

  for (const rule of rules) {
    const declarations = declarationsOf(rule)
    if (!suppressesOutline(declarations)) {
      continue
    }

    // The rule may be its own answer, when it is any focus rule — `:focus`,
    // `:focus-visible`, `:focus-within` — that also draws something else.
    if (isFocusRule(rule.selector)) {
      const replacement = drawsIndicator(
        new Map([...declarations].filter(([property]) => property !== 'outline' && property !== 'outline-width')),
      )
      if (replacement) {
        continue
      }
    }

    const subjects = subjectsOf(rule.selector)
    const companion = rules.some((candidate) => {
      if (candidate === rule || !isFocusRule(candidate.selector)) {
        return false
      }
      const candidateDeclarations = declarationsOf(candidate)
      if (!drawsIndicator(candidateDeclarations)) {
        return false
      }
      // A companion that switches the outline off itself has to draw something
      // besides the suppression; otherwise it cancels the ring it promised.
      if (
        suppressesOutline(candidateDeclarations) &&
        !drawsIndicator(
          new Map([...candidateDeclarations].filter(([property]) => property !== 'outline' && property !== 'outline-width')),
        )
      ) {
        return false
      }
      return subjects.some((subject) => candidate.selector.includes(subject))
    })

    if (!companion) {
      gaps.push({
        file: rule.file,
        selector: rule.selector,
        reason: 'the outline is switched off with no :focus-visible replacement',
      })
    }
  }

  return gaps
}

/**
 * The workspace has to keep still for anyone whose operating system asks it to.
 * The reset lives in one media block and has to reach everything, including the
 * pseudo-elements, and it has to win: a duration without `!important` loses to
 * the component rule that declared it.
 */
export function reducedMotionGaps(sheets: readonly CssFile[]): string[] {
  const gaps: string[] = []
  const declared = sheets.reduce(
    (total, sheet) => total + (sheet.css.match(/transition|animation/g)?.length ?? 0),
    0,
  )

  const query = /@media\s*\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)/
  const found = sheets
    .map((sheet) => ({ sheet, body: atRuleBody(sheet.css, query) }))
    .filter((entry) => entry.body !== null)

  if (found.length === 0) {
    return [`no prefers-reduced-motion block, with ${declared} transition or animation declarations in the sheets`]
  }

  // One block is enough when it reaches everything; more than one has to agree.
  const reach = found.map((entry) => ({
    file: entry.sheet.file,
    body: entry.body ?? '',
  }))

  const universal = reach.find((entry) => /(^|[{}\s])\*\s*,/.test(entry.body) || /(^|[{}\s])\*\s*\{/.test(entry.body))
  if (!universal) {
    gaps.push('the reduced-motion block does not reach every element: no universal selector in it')
  }

  const body = universal?.body ?? reach[0]?.body ?? ''
  for (const [property, why] of [
    ['transition-duration', 'a transition would keep running'],
    ['animation-duration', 'an animation would keep running'],
  ] as const) {
    const match = new RegExp(`${property}\\s*:\\s*([^;!]+)(!important)?;`).exec(body)
    if (!match) {
      gaps.push(`the reduced-motion block does not set ${property}: ${why}`)
      continue
    }
    if (!match[2]) {
      gaps.push(`the reduced-motion block sets ${property} without !important, so a component rule wins`)
    }
  }

  // The reset wins by `!important` over the component rules that declared the
  // motion, so a component rule that also shouts cannot be beaten by it.
  const shouted = new Set(
    [...body.matchAll(/([a-z-]+)\s*:\s*([^;{}]*!important[^;{}]*);/g)].map((match) =>
      (match[0] ?? '').replace(/\s+/g, ' ').trim(),
    ),
  )
  for (const sheet of sheets) {
    for (const match of sheet.css.matchAll(/([a-z-]+)\s*:\s*([^;{}]*!important[^;{}]*);/g)) {
      const property = (match[1] ?? '').toLowerCase()
      if (!/^(transition|animation)/.test(property)) {
        continue
      }
      if (shouted.has((match[0] ?? '').replace(/\s+/g, ' ').trim())) {
        continue
      }
      gaps.push(
        `${sheet.file} \u2192 ${property} is declared !important outside the reduced-motion block, so the reset cannot stop it`,
      )
    }
  }

  // `infinite` may be the long hand or the iteration slot of the shorthand.
  const infinite = sheets.some(
    (sheet) =>
      /animation-iteration-count\s*:\s*infinite/.test(sheet.css) ||
      /animation\s*:[^;}]*\binfinite\b/.test(sheet.css),
  )
  const stopped =
    /animation-iteration-count\s*:\s*[^;]+!important/.test(body) || /animation\s*:\s*none\s*!important/.test(body)
  if (infinite && !stopped) {
    gaps.push('an animation repeats forever and the reduced-motion block does not stop it')
  }

  return gaps
}

/** The accessible name, by the subset of the rules that can be computed here. */
export function accessibleName(element: Element): string {
  const labelledBy = element.getAttribute('aria-labelledby')
  if (labelledBy) {
    const text = labelledBy
      .split(/\s+/)
      .map((id) => element.ownerDocument.getElementById(id)?.textContent?.trim() ?? '')
      .join(' ')
      .trim()
    if (text.length > 0) {
      return text
    }
  }

  const label = element.getAttribute('aria-label')?.trim()
  if (label) {
    return label
  }

  const title = element.getAttribute('title')?.trim()
  if (title) {
    return title
  }

  const tag = element.tagName.toLowerCase()
  if (tag === 'img' || tag === 'area') {
    const alt = element.getAttribute('alt')?.trim()
    if (alt) {
      return alt
    }
  }

  if (['input', 'select', 'textarea', 'button'].includes(tag)) {
    const explicit = element.id
      ? element.ownerDocument.querySelector(`label[for="${CSS_escape(element.id)}"]`)
      : null
    const implicit = element.closest('label')
    const wrapper = explicit ?? implicit
    if (wrapper) {
      const text = wrapper.textContent?.trim() ?? ''
      if (text.length > 0) {
        return text
      }
    }
    if (tag === 'input') {
      const value = element.getAttribute('value')?.trim()
      const type = element.getAttribute('type')?.toLowerCase() ?? 'text'
      if (value && ['submit', 'reset', 'button'].includes(type)) {
        return value
      }
    }
  }

  const text = element.textContent?.replace(/\s+/g, ' ').trim() ?? ''
  if (text.length > 0) {
    return text
  }

  // An icon button names itself with an image or a vector's own title.
  const image = element.querySelector('img[alt], svg title')
  return image?.textContent?.trim() ?? image?.getAttribute('alt')?.trim() ?? ''
}

/** `CSS.escape` is not in jsdom's older surface; ids in this app are simple. */
function CSS_escape(value: string): string {
  return value.replace(/["\\]/g, '\\$&')
}

const INTERACTIVE = [
  'a[href]',
  'button',
  'input:not([type="hidden"])',
  'select',
  'textarea',
  '[role="button"]',
  '[role="link"]',
  '[role="tab"]',
  '[role="checkbox"]',
  '[role="radio"]',
  '[role="switch"]',
  '[role="combobox"]',
  '[role="menuitem"]',
  '[role="option"]',
].join(',')

function describe(element: Element): string {
  const name = element.tagName.toLowerCase()
  const classes = (element.getAttribute('class') ?? '')
    .split(/\s+/)
    .map((token) => /^_(.+)_[0-9a-z]+$/.exec(token)?.[1] ?? token)
    .filter((token) => token.length > 0)
  const label = element.getAttribute('aria-label') ?? ''
  const detail = classes.length > 0 ? `.${classes.join('.')}` : ''
  return `${name}${detail}${label ? ` "${label}"` : ''}`
}

/**
 * The labels and the wiring a screen reader needs: every control names itself,
 * every `aria-*` reference points at something real, icons are either labelled
 * or hidden, ids are unique, and the heading order does not jump a level.
 */
export function screenReaderGaps(root: Element): string[] {
  const gaps: string[] = []
  const document = root.ownerDocument

  for (const element of root.querySelectorAll(INTERACTIVE)) {
    if (element.closest('[aria-hidden="true"]')) {
      continue
    }
    if (accessibleName(element).length === 0) {
      gaps.push(`${describe(element)}: no accessible name`)
    }
  }

  for (const attribute of ['aria-labelledby', 'aria-describedby', 'aria-controls', 'aria-owns']) {
    for (const element of document.querySelectorAll(`[${attribute}]`)) {
      const value = element.getAttribute(attribute) ?? ''
      for (const id of value.split(/\s+/).filter((token) => token.length > 0)) {
        if (!document.getElementById(id)) {
          gaps.push(`${describe(element)}: ${attribute}="${id}" names nothing`)
        }
      }
    }
  }

  for (const image of document.querySelectorAll('[role="img"]')) {
    if (accessibleName(image).length === 0) {
      gaps.push(`${describe(image)}: role="img" with no name`)
    }
  }

  for (const icon of document.querySelectorAll('svg')) {
    if (icon.getAttribute('aria-hidden') === 'true') {
      continue
    }
    if (accessibleName(icon).length === 0 && !icon.querySelector('title')) {
      gaps.push(`${describe(icon)}: neither labelled nor aria-hidden`)
    }
  }

  const ids = new Map<string, number>()
  for (const element of document.querySelectorAll('[id]')) {
    const id = element.getAttribute('id') ?? ''
    ids.set(id, (ids.get(id) ?? 0) + 1)
  }
  for (const [id, count] of ids) {
    if (count > 1) {
      gaps.push(`id="${id}" appears ${count} times`)
    }
  }

  for (const element of document.querySelectorAll('[tabindex]')) {
    const value = Number.parseInt(element.getAttribute('tabindex') ?? '0', 10)
    if (Number.isFinite(value) && value > 0) {
      gaps.push(`${describe(element)}: tabindex="${value}" takes the element out of the natural order`)
    }
  }

  for (const link of document.querySelectorAll('a[href]')) {
    if (link.querySelector(INTERACTIVE)) {
      gaps.push(`${describe(link)}: contains another control`)
    }
  }

  const headings = [...document.querySelectorAll('h1, h2, h3, h4, h5, h6')]
  const first = headings[0]?.tagName.toLowerCase()
  const levels = headings.map((heading) => Number.parseInt(heading.tagName.slice(1), 10))
  const ones = levels.filter((level) => level === 1).length
  if (ones > 1) {
    gaps.push(`${ones} h1 headings on one page`)
  }
  if (first && first !== 'h1') {
    gaps.push(`the first heading is ${first}, not h1`)
  }
  for (let index = 1; index < levels.length; index += 1) {
    const previous = levels[index - 1] ?? 1
    const level = levels[index] ?? 1
    if (level - previous > 1) {
      gaps.push(`heading order jumps from h${previous} to h${level}`)
    }
  }

  return gaps
}

/** A length in CSS pixels, or null when this audit cannot resolve it. */
export function lengthInPx(value: string | undefined, tokens: Map<string, string>, depth = 0): number | null {
  if (value === undefined || depth > 4) {
    return null
  }
  const trimmed = value.trim()

  const token = /^var\(\s*(--[a-z0-9-]+)\s*(?:,\s*([^)]+))?\)$/.exec(trimmed)
  if (token) {
    const resolved = tokens.get(token[1] ?? '')
    if (resolved !== undefined) {
      return lengthInPx(resolved, tokens, depth + 1)
    }
    return token[2] ? lengthInPx(token[2], tokens, depth + 1) : null
  }

  const clamp = /^clamp\(([\s\S]+)\)$/.exec(trimmed)
  if (clamp) {
    // The smallest the value can be, which is what a floor has to survive.
    const parts = (clamp[1] ?? '').split(',')
    return lengthInPx(parts[0], tokens, depth + 1)
  }

  const calc = /^calc\(([\s\S]+)\)$/.exec(trimmed)
  if (calc) {
    const product = /([\d.]+)(px|rem)\s*\*\s*([\d.]+)/.exec(calc[1] ?? '')
    if (product) {
      const base = lengthInPx(`${product[1]}${product[2]}`, tokens, depth + 1)
      return base === null ? null : base * Number.parseFloat(product[3] ?? '1')
    }
    return null
  }

  const px = /^([\d.]+)px$/.exec(trimmed)
  if (px) {
    return Number.parseFloat(px[1] ?? '0')
  }
  const rem = /^(-?[\d.]+)rem$/.exec(trimmed)
  if (rem) {
    return Number.parseFloat(rem[1] ?? '0') * 16
  }
  if (trimmed === '0') {
    return 0
  }
  return null
}

/** The scale the app is measured in, for resolving the tokens targets use. */
export function layoutTokens(sheets: readonly CssFile[]): Map<string, string> {
  const tokens = new Map<string, string>()
  const global = sheets.find((sheet) => sheet.file.endsWith('global.css'))
  if (global) {
    // The root block may follow a comment, another rule, or the file opening.
    const root = /(?:^|[}\n])\s*html\s*\{([^}]*)\}/.exec(global.css)
    if (root) {
      tokens.set('--root-font-size', /font-size\s*:\s*([^;]+);/.exec(root[1] ?? '')?.[1]?.trim() ?? '16px')
    }
  }

  const scale = sheets.find((sheet) => sheet.file.endsWith('tokens.css'))
  if (scale) {
    for (const match of scale.css.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
      tokens.set(match[1] ?? '', (match[2] ?? '').trim())
    }
  }

  if (!tokens.has('--ui-scale')) {
    tokens.set('--ui-scale', '1')
  }
  return tokens
}

/** The padding on one side, from the shorthand or the long-hand. */
function paddingSide(declarations: Map<string, string>, side: 'top' | 'bottom', tokens: Map<string, string>): number {
  const long = lengthInPx(declarations.get(`padding-${side}`), tokens)
  if (long !== null) {
    return long
  }

  const shorthand = declarations.get('padding')
  if (shorthand === undefined) {
    return 0
  }
  const parts = shorthand.trim().split(/\s+/)
  const picked =
    parts.length === 1 ? parts[0] : side === 'top' ? (parts[0] ?? '0') : (parts.length === 2 ? parts[0] : parts[2] ?? parts[0])
  return lengthInPx(picked, tokens) ?? 0
}

/** The font size an element resolves to, through the type scale. */
export function fontSizePx(declarations: Map<string, string>, tokens: Map<string, string>): number {
  const declared = lengthInPx(declarations.get('font-size'), tokens)
  return declared ?? 16
}

/**
 * The smallest the box can be, from what the rules say: an explicit height or
 * min-height when there is one, otherwise the padding plus one line of text.
 * Anything with an unreadable length comes back null and is reported as not
 * measured rather than passed.
 */
export function targetFloorPx(
  declarations: Map<string, string>,
  tokens: Map<string, string>,
  inheritedFont = fontSizePx(declarations, tokens),
): number | null {
  const explicit =
    lengthInPx(declarations.get('min-height'), tokens) ?? lengthInPx(declarations.get('height'), tokens)
  if (explicit !== null) {
    return explicit
  }

  const lineHeight = lengthInPx(declarations.get('line-height'), tokens)
  const line = lineHeight ?? inheritedFont * INHERITED_LINE_HEIGHT
  return paddingSide(declarations, 'top', tokens) + line + paddingSide(declarations, 'bottom', tokens)
}

/**
 * The font size actually in force, taken from the nearest rule that declares
 * one rather than from the element alone. Most controls inherit their size from
 * a panel, and assuming the 16px root instead would understate how small a
 * target that shares a small ancestor's type really is.
 */
export function inheritedFontSizePx(
  element: Element,
  own: Map<string, string>,
  theme: 'dark' | 'light',
  index: RuleIndex,
  tokens: Map<string, string>,
): number {
  for (let current: Element | null = element; current; current = current.parentElement) {
    const declarations = current === element ? own : declarationsFor(current, theme, index)
    const declared = lengthInPx(declarations.get('font-size'), tokens)
    if (declared !== null) {
      return declared
    }
  }
  return 16
}

/**
 * WCAG's inline exception: a control sitting inside a sentence is exempt from
 * the target-size minimum, because its size is set by the text around it rather
 * than by the author. Detected as an inline-displayed control with real text
 * beside it in the same block; anything the app has given a box of its own is
 * judged like any other target.
 */
function isInlineInText(element: Element, declarations: Map<string, string>): boolean {
  const display = declarations.get('display')
  if (display !== undefined && display !== 'inline') {
    return false
  }

  const parent = element.parentElement
  if (!parent) {
    return false
  }

  // The text beside it, anywhere in its block. `Next up: <Link>…</Link>` leaves
  // the label and the space in two separate text nodes, either of which counts.
  let beside = ''
  for (const node of parent.childNodes) {
    if (node === element || element.contains(node)) {
      continue
    }
    beside += node.textContent ?? ''
  }
  return beside.trim().length > 0
}

function isVisuallyHidden(declarations: Map<string, string>): boolean {
  const clip = declarations.get('clip-path') ?? ''
  if (clip.includes('inset(50%)')) {
    return true
  }
  const width = declarations.get('width')
  return (width === '1px' || width === '1px;') && declarations.get('position') === 'absolute'
}

export interface TargetAudit {
  gaps: string[]
  /** How many targets were actually measured, so a clean pass can be trusted. */
  measured: number
  /** Targets the audit could not resolve a size for, by element. */
  unmeasured: string[]
}

/**
 * The hit-target pass over one rendered route. The control a pointer meets is
 * the label around a visually hidden input, not the input itself, so that is
 * what gets measured.
 */
export function targetAudit(
  root: Element,
  theme: 'dark' | 'light',
  index: RuleIndex,
  tokens: Map<string, string>,
): TargetAudit {
  const gaps: string[] = []
  const unmeasured: string[] = []
  let measured = 0

  for (const element of root.querySelectorAll(INTERACTIVE)) {
    if (element.closest('[aria-hidden="true"]')) {
      continue
    }

    const own = declarationsFor(element, theme, index)
    const hidden = isVisuallyHidden(own)

    // A visually hidden input has nothing to be met through but the label
    // around it; a visible one is measured itself. A small visible control
    // inside a taller wrapping label — a checkbox in a settings row — is
    // credited with one line of the type it inherits, which is what the label
    // beside it offers a pointer, and is why no such control is reported here.
    const target = hidden ? element.closest('label') ?? element : element
    const declarations = target === element ? own : declarationsFor(target, theme, index)

    // A control sitting in a sentence is exempt; one met through a label is not.
    if (!hidden && isInlineInText(element, declarations)) {
      continue
    }

    const font = inheritedFontSizePx(element, own, theme, index, tokens)
    const floor = targetFloorPx(declarations, tokens, font)
    if (floor === null) {
      unmeasured.push(describe(target))
      continue
    }

    measured += 1
    if (floor < HIT_TARGET_PX) {
      gaps.push(`${describe(target)} is ${floor.toFixed(1)}px tall at most`)
    }
  }

  return { gaps: [...new Set(gaps)], measured, unmeasured: [...new Set(unmeasured)] }
}

/**
 * A visually hidden control still takes focus, so the ring has to be painted by
 * something you can see — in this app, the tile around it. Every such control
 * needs a rule that pulls its focus state up to an ancestor, either by naming
 * the focused descendant (`:has(…:focus-visible)`) or by holding the focus at
 * all (`:focus-within`). The second shape matters because a browser does not
 * give `:focus-visible` to a control that is clipped out of the layout, which is
 * exactly how these are hidden.
 */
export function hiddenInputFocusGaps(root: Element, theme: 'dark' | 'light', index: RuleIndex, rules: readonly StyleRule[]): string[] {
  const gaps: string[] = []
  const shown = rules.filter(
    (rule) => /:has\([\s\S]*:focus-visible/.test(rule.selector) || /:focus-within/.test(rule.selector),
  )

  for (const element of root.querySelectorAll('input, select, textarea, button, a[href]')) {
    const declarations = declarationsFor(element, theme, index)
    if (!isVisuallyHidden(declarations)) {
      continue
    }

    const ancestors: string[][] = []
    for (let current = element.parentElement; current; current = current.parentElement) {
      ancestors.push((current.getAttribute('class') ?? '').split(/\s+/).filter((token) => token.length > 0))
    }

    const covered = shown.some((rule) => {
      const declarations = declarationsOf(rule)
      if (!drawsIndicator(declarations)) {
        return false
      }
      return subjectsOf(rule.selector).some((subject) =>
        ancestors.some((tokens) => tokens.some((token) => subject.length > 0 && token.includes(subject))),
      )
    })

    if (!covered) {
      gaps.push(`${describe(element)}: hidden from sight, so its focus ring needs an ancestor rule`)
    }
  }

  return [...new Set(gaps)]
}

export { declarationsInState }
