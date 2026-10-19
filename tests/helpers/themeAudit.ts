import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

/**
 * The reading half of the theme audit.
 *
 * Two questions have to be answered without a browser: is every text colour
 * readable on the surface it actually sits on, and does anything about the
 * layout move when the theme changes.
 *
 * The stylesheets answer both, but only if the rules can be matched to the
 * elements they draw. CSS modules are compiled away, so the audit is handed the
 * module objects the components themselves import: they map a source class name
 * to the generated name in the DOM, which lets a rewritten selector be matched
 * against a rendered element with `Element.matches`.
 *
 * Limits, stated rather than hidden:
 * - the cascade is approximated: two rules that hit the same element apply in
 *   source order, with a `[data-theme]` block last. Specificity between two
 *   matching class rules is not weighed.
 * - a gradient or translucent surface is skipped: one ratio would misrepresent
 *   the stops, and a translucent layer has no backdrop the audit can see.
 * - inline styles are checked separately, in the test, by looking for colours.
 */

const UI_ROOT = join(process.cwd(), 'src/ui')

const THEME_MARKER = "[data-theme='light']"

/**
 * Declarations a theme block is allowed to carry. Everything else — spacing,
 * sizes, type, layout — has to be identical in both themes, which is only
 * guaranteed if no theme block can set it.
 */
const APPEARANCE_PROPERTIES = new Set([
  'accent-color',
  'background',
  'background-color',
  'background-image',
  'border-color',
  'border-top-color',
  'border-right-color',
  'border-bottom-color',
  'border-left-color',
  'box-shadow',
  'caret-color',
  'color',
  'color-scheme',
  'fill',
  'filter',
  'outline-color',
  'opacity',
  'stroke',
  'text-decoration-color',
  'text-shadow',
])

/** Colour properties, for the geometry half of the drift check. */
export function isAppearanceProperty(property: string): boolean {
  return property.startsWith('--') || APPEARANCE_PROPERTIES.has(property)
}

export interface Colour {
  r: number
  g: number
  b: number
  a: number
}

export interface StyleRule {
  /** Relative to `src/ui`, e.g. `routes/pages.module.css`. */
  file: string
  selector: string
  declarations: Array<[string, string]>
  /** A rule that only applies to one theme, by `[data-theme=…]` selector. */
  theme: 'light' | 'both'
}

export interface Palette {
  name: 'dark' | 'light'
  /** Every token in force, the dark values with the light overrides applied. */
  tokens: Map<string, string>
}

export interface ThemePair {
  /** The `color` declaration, as written. */
  text: string
  /** The surface declaration, as written. */
  surface: string
  /** Where the pairing comes from, for the failure message. */
  from: string
}

export interface TokenReference {
  token: string
  file: string
}

export interface ThemeAuditData {
  dark: Palette
  light: Palette
  rules: StyleRule[]
  tokenReferences: TokenReference[]
}

/** `file → (source class → generated class)`, as the components import them. */
export type ModuleStyles = Record<string, Record<string, string>>

export interface PreparedRule {
  rule: StyleRule
  /** The selector with `:global(…)` unwrapped and class names generated. */
  selector: string
  /** Generated class names the selector mentions. */
  classes: string[]
}

/** The interactive states a colour has to survive, besides resting. */
export type InteractionState = 'hover' | 'focus-visible' | 'disabled'

export const INTERACTION_STATES: readonly InteractionState[] = [
  'hover',
  'focus-visible',
  'disabled',
]

export interface PreparedStateRule {
  rule: StyleRule
  /** The selector with the state pseudo-class removed, so it can be matched. */
  selector: string
}

/** Rules that only apply while the element is in one interactive state. */
export type StateRuleIndex = Record<
  InteractionState,
  { byClass: Map<string, PreparedStateRule[]>; unscoped: PreparedStateRule[] }
>

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '')
}

function blockAfter(css: string, selectorStart: string): string {
  const start = css.indexOf(selectorStart)
  if (start < 0) {
    throw new Error(`tokens.css has no ${selectorStart} block`)
  }
  const open = css.indexOf('{', start)
  const close = css.indexOf('}', open)
  if (open < 0 || close < 0) {
    throw new Error(`tokens.css has an unterminated ${selectorStart} block`)
  }
  return css.slice(open + 1, close)
}

function customProperties(block: string): Map<string, string> {
  const found = new Map<string, string>()
  for (const match of block.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)) {
    const [, name, value] = match
    if (name && value) {
      found.set(name, value.trim())
    }
  }
  return found
}

function cssFiles(directory: string, out: string[] = []): string[] {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      cssFiles(path, out)
    } else if (entry.name.endsWith('.css')) {
      out.push(path)
    }
  }
  return out
}

function rulesIn(file: string, css: string): StyleRule[] {
  const rules: StyleRule[] = []
  const text = stripComments(css)

  for (const match of text.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = (match[1] ?? '').trim().replace(/\s+/g, ' ')
    // At-rule preludes and the palette itself are not component rules.
    if (selector.length === 0 || selector.startsWith('@') || selector.startsWith(':root')) {
      continue
    }
    const declarations: Array<[string, string]> = []
    for (const declaration of (match[2] ?? '').matchAll(/([a-z-]+)\s*:\s*([^;]+);/gi)) {
      const [, property, value] = declaration
      if (property && value) {
        declarations.push([property.toLowerCase(), value.trim()])
      }
    }
    if (declarations.length === 0) {
      continue
    }
    rules.push({
      file,
      selector,
      declarations,
      theme: selector.includes(THEME_MARKER) ? 'light' : 'both',
    })
  }

  return rules
}

/** Reads the palettes, every component rule, and every `var()` reference. */
export function loadThemeAudit(): ThemeAuditData {
  const tokensCss = readFileSync(join(UI_ROOT, 'styles/tokens.css'), 'utf8')
  // Fixed tokens and geometry live on the root; each look is scoped so any
  // element can ask for it, which the Appearance preview relies on.
  const baseTokens = customProperties(blockAfter(tokensCss, ':root {'))
  const darkOverrides = customProperties(blockAfter(tokensCss, "[data-theme='dark']"))
  const lightOverrides = customProperties(blockAfter(tokensCss, "[data-theme='light']"))

  const rules: StyleRule[] = []
  const tokenReferences: TokenReference[] = []

  for (const path of cssFiles(UI_ROOT)) {
    const file = relative(UI_ROOT, path).split('\\').join('/')
    const css = readFileSync(path, 'utf8')
    if (file !== 'styles/tokens.css') {
      rules.push(...rulesIn(file, css))
    }

    for (const match of stripComments(css).matchAll(/var\(\s*(--[a-z0-9-]+)/gi)) {
      if (match[1]) {
        tokenReferences.push({ token: match[1], file })
      }
    }
  }

  return {
    dark: { name: 'dark', tokens: new Map([...baseTokens, ...darkOverrides]) },
    light: { name: 'light', tokens: new Map([...baseTokens, ...lightOverrides]) },
    rules,
    tokenReferences,
  }
}

/** Resolves a declaration to a colour, following `var()` chains by palette. */
export function colourOf(value: string | undefined, palette: Palette, depth = 0): Colour | null {
  if (value === undefined || depth > 8) {
    return null
  }

  const trimmed = value.trim()
  const reference = /^var\(\s*(--[a-z0-9-]+)\s*(?:,(.+))?\)$/i.exec(trimmed)
  if (reference) {
    const token = reference[1] ? palette.tokens.get(reference[1]) : undefined
    return token === undefined
      ? colourOf(reference[2], palette, depth + 1)
      : colourOf(token, palette, depth + 1)
  }

  return parseColour(trimmed)
}

export function parseColour(value: string): Colour | null {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(value.trim())
  if (hex) {
    const digits = hex[1] ?? ''
    const wide = digits.length === 3 ? [...digits].map((d) => d + d).join('') : digits
    const alpha = wide.length === 8 ? Number.parseInt(wide.slice(6, 8), 16) / 255 : 1
    return {
      r: Number.parseInt(wide.slice(0, 2), 16),
      g: Number.parseInt(wide.slice(2, 4), 16),
      b: Number.parseInt(wide.slice(4, 6), 16),
      a: alpha,
    }
  }

  const functional = /^(rgba?|hsla?)\(([^)]+)\)$/i.exec(value.trim())
  if (!functional) {
    return null
  }

  const parts = (functional[2] ?? '')
    .split(/[,\s/]+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
  if (parts.length < 3) {
    return null
  }

  const alphaPart = parts[3]
  const alpha =
    alphaPart === undefined
      ? 1
      : alphaPart.endsWith('%')
        ? Number(alphaPart.slice(0, -1)) / 100
        : Number(alphaPart)
  const numeric = parts.slice(0, 3).map(Number)
  if (numeric.some((part) => Number.isNaN(part)) || Number.isNaN(alpha)) {
    return null
  }

  if (functional[1]?.toLowerCase().startsWith('hsl')) {
    const hue = numeric[0] ?? 0
    const saturation = numeric[1] ?? 0
    const lightness = numeric[2] ?? 0
    const colour = fromHsl(hue, saturation / 100, lightness / 100)
    return { ...colour, a: alpha }
  }

  // A channel may be written as a percentage in either syntax.
  const scaled = numeric.map((part, index) =>
    parts[index]?.endsWith('%') ? Math.min(255, Math.max(0, part * 2.55)) : clamp(part),
  )
  return { r: scaled[0] ?? 0, g: scaled[1] ?? 0, b: scaled[2] ?? 0, a: alpha }
}

function clamp(value: number): number {
  return Math.min(255, Math.max(0, value))
}

function fromHsl(hue: number, saturation: number, lightness: number): Omit<Colour, 'a'> {
  const h = ((hue % 360) + 360) % 360
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation
  const second = chroma * (1 - Math.abs(((h / 60) % 2) - 1))
  const offset = lightness - chroma / 2
  const [r, g, b] =
    h < 60
      ? [chroma, second, 0]
      : h < 120
        ? [second, chroma, 0]
        : h < 180
          ? [0, chroma, second]
          : h < 240
            ? [0, second, chroma]
            : h < 300
              ? [second, 0, chroma]
              : [chroma, 0, second]

  return {
    r: Math.round(((r ?? 0) + offset) * 255),
    g: Math.round(((g ?? 0) + offset) * 255),
    b: Math.round(((b ?? 0) + offset) * 255),
  }
}

/** WCAG relative luminance, with a translucent foreground composited first. */
function luminance(colour: Colour): number {
  const linear = (value: number) => {
    const scaled = value / 255
    return scaled <= 0.04045 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * linear(colour.r) + 0.7152 * linear(colour.g) + 0.0722 * linear(colour.b)
}

function over(foreground: Colour, background: Colour): Colour {
  if (foreground.a >= 1) {
    return foreground
  }
  const alpha = foreground.a
  return {
    r: foreground.r * alpha + background.r * (1 - alpha),
    g: foreground.g * alpha + background.g * (1 - alpha),
    b: foreground.b * alpha + background.b * (1 - alpha),
    a: 1,
  }
}

export function contrastRatio(foreground: Colour, background: Colour): number {
  const fg = over(foreground, background)
  const first = luminance(fg)
  const second = luminance(background)
  const lighter = Math.max(first, second)
  const darker = Math.min(first, second)
  return (lighter + 0.05) / (darker + 0.05)
}

export interface RuleIndex {
  byClass: Map<string, PreparedRule[]>
  /** Rules with no class at all — `body`, `*`, an element selector — matched per element. */
  unscoped: PreparedRule[]
  /** The same index, per interactive state. */
  states: StateRuleIndex
}

/**
 * Rewrites each selector with the generated class names, so it can be matched
 * against a rendered element. `:global(…)` is unwrapped for the same reason.
 */
export function prepareRules(audit: ThemeAuditData, modules: ModuleStyles): RuleIndex {
  const prepared: PreparedRule[] = []

  for (const rule of audit.rules) {
    const styles = modules[rule.file]
    const selector = rule.selector
      // `:global(x)` scopes nothing; the inner selector is the real one.
      .replace(/:global\(([^)]*)\)/g, '$1')
      .replace(/\.([A-Za-z][\w-]*)/g, (whole, name: string) => {
        const generated = styles?.[name]
        return generated ? `.${generated}` : whole
      })

    const classes = [...selector.matchAll(/\.([^ .:>+~[\]]+)/g)].map((match) => match[1] ?? '')
    prepared.push({ rule, selector, classes })
  }

  const byClass = new Map<string, PreparedRule[]>()
  const unscoped: PreparedRule[] = []

  for (const entry of prepared) {
    if (entry.classes.length === 0) {
      unscoped.push(entry)
      continue
    }
    for (const name of entry.classes) {
      const bucket = byClass.get(name)
      if (bucket) {
        bucket.push(entry)
      } else {
        byClass.set(name, [entry])
      }
    }
  }

  const states: StateRuleIndex = {
    hover: { byClass: new Map(), unscoped: [] },
    'focus-visible': { byClass: new Map(), unscoped: [] },
    disabled: { byClass: new Map(), unscoped: [] },
  }

  for (const entry of prepared) {
    for (const state of INTERACTION_STATES) {
      const selector = selectorInState(entry.selector, state)
      if (selector === null) {
        continue
      }
      const index = states[state]
      const stateRule: PreparedStateRule = { rule: entry.rule, selector }
      if (entry.classes.length === 0) {
        index.unscoped.push(stateRule)
        continue
      }
      for (const name of entry.classes) {
        const bucket = index.byClass.get(name)
        if (bucket) {
          bucket.push(stateRule)
        } else {
          index.byClass.set(name, [stateRule])
        }
      }
    }
  }

  return { byClass, unscoped, states }
}

/**
 * The selector to match for a simulated state: the same selector with the state
 * pseudo-class removed, so `.tab:hover` is matched as `.tab`. `:not(:disabled)`
 * is a guard on a hover rule, not a disabled style, and is left alone.
 */
function selectorInState(selector: string, state: InteractionState): string | null {
  if (state === 'disabled') {
    const marker = /(?<!:not\():disabled/
    return marker.test(selector) ? selector.replace(/(?<!:not\():disabled/g, '') : null
  }

  const marker = `:${state}`
  return selector.includes(marker) ? selector.replaceAll(marker, '') : null
}

function classesOf(element: Element): string[] {
  return (element.getAttribute('class') ?? '').split(/\s+/).filter((name) => name.length > 0)
}

function matches(element: Element, selector: string): boolean {
  try {
    return element.matches(selector)
  } catch {
    // A pseudo-class jsdom cannot evaluate (`:hover`, `::before`) never applies.
    return false
  }
}

/** The declarations a render resolved, kept per element and per render. */
const resolved = new WeakMap<Element, Map<string, string>>()

/**
 * The declarations that apply to one element in one theme: base rules in source
 * order, then the theme block, which wins on specificity as it does in a browser.
 */
export function declarationsFor(
  element: Element,
  theme: 'dark' | 'light',
  index: RuleIndex,
): Map<string, string> {
  const winning = new Map<string, string>()
  const seen = new Set<PreparedRule>()
  const matching: PreparedRule[] = []

  const consider = (candidate: PreparedRule) => {
    if (seen.has(candidate)) {
      return
    }
    seen.add(candidate)
    if (candidate.rule.theme === 'light' && theme !== 'light') {
      return
    }
    if (matches(element, candidate.selector)) {
      matching.push(candidate)
    }
  }

  for (const candidate of index.unscoped) {
    consider(candidate)
  }
  for (const name of classesOf(element)) {
    for (const candidate of index.byClass.get(name) ?? []) {
      consider(candidate)
    }
  }

  matching.sort((left, right) => {
    if (left.rule.theme === right.rule.theme) {
      return 0
    }
    return left.rule.theme === 'both' ? -1 : 1
  })

  for (const entry of matching) {
    for (const [property, value] of entry.rule.declarations) {
      winning.set(property, value)
    }
  }

  resolved.set(element, winning)
  return winning
}

export interface Resolved {
  value: string
  element: Element
}

/** Where a pair reads its declarations from: the resting render, or one state. */
export type DeclarationLookup = (element: Element) => Map<string, string> | undefined

const restingLookup: DeclarationLookup = (element) => resolved.get(element)

/**
 * The nearest declaration of a property, following the ancestors as the browser
 * would. The first declaration wins, whether or not it is a colour: a gradient
 * surface stops the walk rather than being looked through.
 */
function nearestDeclaration(
  element: Element,
  properties: readonly string[],
  lookup: DeclarationLookup = restingLookup,
): Resolved | null {
  let current: Element | null = element
  while (current) {
    const declarations = lookup(current)
    for (const property of properties) {
      const value = declarations?.get(property)
      if (value !== undefined) {
        return { value, element: current }
      }
    }
    current = current.parentElement
  }
  return null
}

export interface TextSurfacePair {
  text: string
  surface: string
  where: string
  /**
   * The pair resolved through the tokens in force at the element, including any
   * custom properties a scoped rule (such as the dark terminal inside a light
   * workspace) re-points. Absent when the pair was written down rather than read
   * from a render.
   */
  textColour?: Colour
  surfaceColour?: Colour
}

/**
 * The palette in force at one element: the theme's tokens with any custom
 * properties declared by the element and its ancestors applied, nearest first.
 * A scoped rule such as `[data-terminal='dark'] .terminalPane` re-points the
 * same token names, so the audit has to cascade them as the browser does.
 */
function paletteInForce(
  element: Element,
  palette: Palette,
  lookup: DeclarationLookup = restingLookup,
): Palette {
  const chain: Element[] = []
  for (let current: Element | null = element; current; current = current.parentElement) {
    chain.push(current)
  }

  const tokens = new Map(palette.tokens)
  for (const current of chain.reverse()) {
    const declarations = lookup(current)
    if (!declarations) {
      continue
    }
    for (const [property, value] of declarations) {
      if (property.startsWith('--')) {
        tokens.set(property, value)
      }
    }
  }

  return { name: palette.name, tokens }
}

/**
 * The text-on-surface pair for one element: its colour and the nearest opaque
 * background behind it. Null when either is a gradient, translucent, or absent.
 */
export function pairForElement(
  element: Element,
  palette: Palette,
  lookup: DeclarationLookup = restingLookup,
): TextSurfacePair | null {
  const tokens = paletteInForce(element, palette, lookup)
  const text = nearestDeclaration(element, ['color'], lookup)
  const textColour = colourOf(text?.value, tokens)
  if (!text || !textColour) {
    return null
  }

  const surface = nearestDeclaration(element, ['background-color', 'background'], lookup)
  const surfaceColour = colourOf(surface?.value, tokens)
  if (!surface || !surfaceColour || surfaceColour.a < 1) {
    return null
  }

  return {
    text: text.value,
    surface: surface.value,
    where: `${describe(element)} (text ${describe(text.element)}, surface ${describe(surface.element)})`,
    textColour,
    surfaceColour,
  }
}

/** The state declarations resolved per element, cached by theme and state. */
const stateResolved = new WeakMap<Element, Map<string, Map<string, string>>>()

/**
 * One element's declarations while it is in an interactive state: its resting
 * declarations with every matching `:hover`, `:focus-visible` or `:disabled`
 * rule laid over the top in source order, exactly as the browser would apply
 * them when the state is on. Theme-scoped state rules come last, as they do in
 * the resting pass.
 */
function declarationsInState(
  element: Element,
  theme: 'dark' | 'light',
  index: RuleIndex,
  state: InteractionState,
  resting: Map<string, string>,
): Map<string, string> {
  const key = `${theme}:${state}`
  const cached = stateResolved.get(element)?.get(key)
  if (cached) {
    return cached
  }

  const winning = new Map(resting)
  const seen = new Set<PreparedStateRule>()
  const matching: PreparedStateRule[] = []
  const stateIndex = index.states[state]

  const consider = (candidate: PreparedStateRule) => {
    if (seen.has(candidate)) {
      return
    }
    seen.add(candidate)
    if (candidate.rule.theme === 'light' && theme !== 'light') {
      return
    }
    if (matches(element, candidate.selector)) {
      matching.push(candidate)
    }
  }

  for (const candidate of stateIndex.unscoped) {
    consider(candidate)
  }
  for (const name of classesOf(element)) {
    for (const candidate of stateIndex.byClass.get(name) ?? []) {
      consider(candidate)
    }
  }

  matching.sort((left, right) => {
    if (left.rule.theme === right.rule.theme) {
      return 0
    }
    return left.rule.theme === 'both' ? -1 : 1
  })

  for (const entry of matching) {
    for (const [property, value] of entry.rule.declarations) {
      winning.set(property, value)
    }
  }

  const byState = stateResolved.get(element) ?? new Map<string, Map<string, string>>()
  byState.set(key, winning)
  stateResolved.set(element, byState)
  return winning
}

function opacityOf(value: string | undefined): number {
  if (value === undefined) {
    return 1
  }
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? Math.min(1, Math.max(0, parsed)) : 1
}

/** The opacity in force from the text element down to its surface. */
function opacityAlong(
  element: Element,
  surface: Element,
  lookup: DeclarationLookup,
): number {
  let opacity = 1
  for (let current: Element | null = element; current; current = current.parentElement) {
    opacity *= opacityOf(lookup(current)?.get('opacity'))
    if (current === surface) {
      break
    }
  }
  return opacity
}

/**
 * The text-on-surface pair for an element while it is hovered, focused, or
 * disabled. The state's declarations are layered over the resting ones, and a
 * state that lowers opacity dims the text onto its own surface, so a control
 * that fades when disabled is checked at the colour a learner actually sees.
 *
 * A filled control whose fill fades with the text is approximated as text-only
 * dimming, which reads the contrast lower than a perfect composite would.
 */
export function pairForState(
  element: Element,
  palette: Palette,
  theme: 'dark' | 'light',
  index: RuleIndex,
  state: InteractionState,
): TextSurfacePair | null {
  const resting = new Map<Element, Map<string, string>>()
  const stated = new Map<Element, Map<string, string>>()
  for (let current: Element | null = element; current; current = current.parentElement) {
    const declarations = declarationsFor(current, theme, index)
    resting.set(current, declarations)
    stated.set(current, declarationsInState(current, theme, index, state, declarations))
  }

  const restingFor = (node: Element) => resting.get(node)
  const statedFor = (node: Element) => stated.get(node)

  const pair = pairForElement(element, palette, statedFor)
  if (!pair || !pair.textColour || !pair.surfaceColour) {
    return null
  }

  const surface = nearestDeclaration(element, ['background-color', 'background'], statedFor)
  if (surface) {
    const inState = opacityAlong(element, surface.element, statedFor)
    const atRest = opacityAlong(element, surface.element, restingFor)
    if (inState < 1 && inState !== atRest) {
      pair.textColour = over(
        { ...pair.textColour, a: pair.textColour.a * inState },
        pair.surfaceColour,
      )
    }
  }

  return { ...pair, where: `${pair.where} [${state}]` }
}

function describe(element: Element): string {
  const name = element.tagName.toLowerCase()
  const classes = classesOf(element)
    .map((token) => /^_(.+)_[0-9a-z]+$/.exec(token)?.[1] ?? token)
    .filter((token) => token.length > 0)
  return classes.length > 0 ? `${name}.${classes.join('.')}` : name
}

export interface ContrastFailure {
  pair: TextSurfacePair
  ratio: number
}

/** Deduplicated failures across a rendered route, worst first. */
export function contrastFailures(pairs: readonly TextSurfacePair[], palette: Palette): ContrastFailure[] {
  const failures = new Map<string, ContrastFailure>()

  for (const pair of pairs) {
    const text = pair.textColour ?? colourOf(pair.text, palette)
    const surface = pair.surfaceColour ?? colourOf(pair.surface, palette)
    if (!text || !surface || surface.a < 1) {
      continue
    }
    const ratio = contrastRatio(text, surface)
    if (ratio >= 4.5) {
      continue
    }
    const key = `${pair.text}|${pair.surface}|${pair.where}`
    failures.set(key, { pair, ratio })
  }

  return [...failures.values()].sort((left, right) => left.ratio - right.ratio)
}

/**
 * Every rule that states a text colour and its own surface. Rules that leave the
 * surface to the page are covered by the rendered pass, which knows the page.
 */
export function declaredPairs(audit: ThemeAuditData): ThemePair[] {
  const pairs = new Map<string, ThemePair>()

  for (const rule of audit.rules) {
    const text = rule.declarations.find(([property]) => property === 'color')?.[1]
    const surface =
      rule.declarations.find(([property]) => property === 'background-color')?.[1] ??
      rule.declarations.find(([property]) => property === 'background')?.[1]
    if (text === undefined || surface === undefined) {
      continue
    }

    const key = `${text}|${surface}`
    if (!pairs.has(key)) {
      pairs.set(key, {
        text,
        surface,
        from: `${rule.file} → ${rule.selector.slice(0, 80)}`,
      })
    }
  }

  return [...pairs.values()]
}

export interface GeometryDrift {
  rule: StyleRule
  property: string
}

/** Anything a theme block sets besides appearance, which is geometry drift. */
export function themeGeometryDrift(audit: ThemeAuditData): GeometryDrift[] {
  const drift: GeometryDrift[] = []

  for (const rule of audit.rules) {
    if (rule.theme !== 'light' && !rule.selector.includes('prefers-color-scheme')) {
      continue
    }
    for (const [property] of rule.declarations) {
      if (!isAppearanceProperty(property)) {
        drift.push({ rule, property })
      }
    }
  }

  return drift
}

/** Tokens a stylesheet asks for that the palette never declares. */
export function undeclaredTokens(audit: ThemeAuditData): TokenReference[] {
  return audit.tokenReferences.filter(
    (reference) =>
      !audit.dark.tokens.has(reference.token) && !audit.light.tokens.has(reference.token),
  )
}
