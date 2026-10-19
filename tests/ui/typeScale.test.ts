// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * The type scale is a promise: every label and heading is one of the steps in
 * tokens.css, so a size is a decision someone made once and documented, not a
 * number a stylesheet picked for itself. This holds the three halves of that
 * promise — the steps exist above the readable floor, they are documented with
 * the pixel size they come to, and no stylesheet writes a raw size or names a
 * step that is not in the scale.
 */

function read(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(`../../${relativePath}`, import.meta.url)), 'utf8')
}

/** Every stylesheet under a directory, as project-relative paths. */
function stylesheets(directory: string): string[] {
  const root = fileURLToPath(new URL(`../../${directory}`, import.meta.url))
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory()
        ? walk(`${dir}/${entry.name}`)
        : entry.name.endsWith('.css')
          ? [`${dir}/${entry.name}`]
          : [],
    )

  return walk(root)
    .map((file) => file.slice(root.length).replace(/\\/g, '/'))
    .map((file) => `${directory}${file}`)
    .sort()
}

const TOKENS_FILE = 'src/ui/styles/tokens.css'
const tokensCss = read(TOKENS_FILE)
const SHEETS = stylesheets('src')

/** The readable floor the scale is built on, in rem. */
const FLOOR_REM = 0.7

interface Step {
  token: string
  value: string
  /** The rem value of a fixed step; null for the fluid clamp steps. */
  rem: number | null
}

const SCALE: Step[] = [...tokensCss.matchAll(/(--type-[a-z0-9-]+)\s*:\s*([^;]+);/g)].map(
  ([, token, value]) => {
    const rem = /^([\d.]+)rem$/.exec(value?.trim() ?? '')
    return {
      token: token ?? '',
      value: (value ?? '').trim(),
      rem: rem?.[1] ? Number.parseFloat(rem[1]) : null,
    }
  },
)

const STEPS = new Set(SCALE.map((step) => step.token))
const FIXED_STEPS = SCALE.filter((step) => step.rem !== null)

/**
 * The steps the comment block lists, as `0.7rem 11.2px --type-2xs`. Reading the
 * prose back is what stops the table drifting from the values beside it.
 */
const DOCUMENTED = [
  ...tokensCss.matchAll(/^\s*\*\s+([\d.]+)rem\s+([\d.]+)px\s+(--type-[a-z0-9-]+)/gm),
].map(([, rem, px, token]) => ({
  token: token ?? '',
  rem: Number.parseFloat(rem ?? '0'),
  px: Number.parseFloat(px ?? '0'),
}))

interface Declaration {
  selector: string
  value: string
}

/** Every `font-size` a sheet declares, with the rule it sits in. */
function fontSizeDeclarations(css: string): Declaration[] {
  const body = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const declarations: Declaration[] = []

  for (const rule of body.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = (rule[1] ?? '').replace(/\s+/g, ' ').trim()
    if (selector.length === 0 || selector.startsWith('@')) {
      continue
    }
    // The closing semicolon is optional, so a size written as the last
    // declaration in a block is read rather than dodging the guard.
    for (const match of (rule[2] ?? '').matchAll(/font-size\s*:\s*([^;]+?)(?:;|\s*$)/g)) {
      declarations.push({ selector, value: (match[1] ?? '').trim() })
    }
  }

  return declarations
}

/** Declarations that write a size instead of naming a step. */
function handPickedSizes(css: string): string[] {
  return fontSizeDeclarations(css)
    .filter(({ selector, value }) => {
      // The root anchor global.css sets is the rem the scale is measured in.
      if (selector === 'html' && value === '16px') {
        return false
      }
      return !/^var\(--type-[a-z0-9-]+\)$/.test(value)
    })
    .map(({ selector, value }) => `${selector}: font-size: ${value}`)
}

/**
 * A `font:` shorthand that carries a size of its own. The shorthand is the other
 * way to set a font size, so it belongs to the same promise: `font: inherit` and
 * a shorthand built from tokens are fine, a raw length is not.
 */
function handPickedShorthands(css: string): string[] {
  const body = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const offenders: string[] = []

  for (const rule of body.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = (rule[1] ?? '').replace(/\s+/g, ' ').trim()
    if (selector.length === 0 || selector.startsWith('@')) {
      continue
    }
    for (const match of (rule[2] ?? '').matchAll(/(?:^|[;\s])font\s*:\s*([^;]+?)(?:;|\s*$)/g)) {
      const value = (match[1] ?? '').trim()
      // A step of the scale does not count as a size picked here.
      if (/\d/.test(value.replace(/var\(\s*--[a-z0-9-]+\s*\)/g, ''))) {
        offenders.push(`${selector}: font: ${value}`)
      }
    }
  }

  return offenders
}

/** Sizes that name a step the scale does not declare. */
function unknownSteps(css: string): string[] {
  return [...css.matchAll(/var\(\s*(--type-[a-z0-9-]+)/g)]
    .map(([, token]) => token ?? '')
    .filter((token) => !STEPS.has(token))
}

describe('the type scale', () => {
  it('declares fixed steps from the readable floor upwards', () => {
    expect(FIXED_STEPS.length).toBeGreaterThanOrEqual(8)

    for (const step of FIXED_STEPS) {
      expect(step.rem, `${step.token} is below the ${FLOOR_REM}rem floor`).toBeGreaterThanOrEqual(
        FLOOR_REM,
      )
    }
  })

  it('orders the ladder, so the next size up is the next step', () => {
    const values = FIXED_STEPS.map((step) => step.rem)
    const ascending = [...values].sort((left, right) => (left ?? 0) - (right ?? 0))
    expect(values).toEqual(ascending)
    expect(new Set(values).size).toBe(values.length)
  })

  it('documents every step with the pixel size it comes to', () => {
    for (const step of FIXED_STEPS) {
      const documented = DOCUMENTED.find((entry) => entry.token === step.token)
      expect(documented, `${step.token} is not in the scale's comment`).toBeTruthy()
      expect(documented?.rem).toBe(step.rem)
      expect(documented?.px).toBeCloseTo((step.rem ?? 0) * 16, 1)
    }

    // The fluid steps have no fixed pixel size, so the comment names them and
    // this checks the naming: they are declared in the same documented block.
    const comment = tokensCss.slice(0, tokensCss.indexOf(`${FIXED_STEPS[0]?.token}:`))
    const fluid = SCALE.filter((entry) => entry.rem === null)
    expect(fluid.length).toBeGreaterThan(0)
    for (const step of fluid) {
      expect(comment, `${step.token} is not named in the scale's comment`).toContain(step.token)
      expect(step.value).toMatch(/^clamp\(/)
    }
    expect(DOCUMENTED.length).toBe(FIXED_STEPS.length)
  })

  it('leaves no stylesheet free to pick its own size', () => {
    expect(SHEETS.length).toBeGreaterThanOrEqual(12)

    const offenders = SHEETS.flatMap((file) =>
      handPickedSizes(read(file)).map((declaration) => `${file} → ${declaration}`),
    )
    expect(offenders).toEqual([])

    // The sheets are read, not skipped: the walk finds the whole scale in use.
    const declarations = SHEETS.reduce((total, file) => total + fontSizeDeclarations(read(file)).length, 0)
    expect(declarations).toBeGreaterThan(300)
  })

  it('leaves no shorthand free to carry a size of its own', () => {
    const offenders = SHEETS.flatMap((file) =>
      handPickedShorthands(read(file)).map((declaration) => `${file} → ${declaration}`),
    )
    expect(offenders).toEqual([])
  })

  it('lets a stylesheet read only steps the scale declares', () => {
    const unknown = SHEETS.flatMap((file) =>
      unknownSteps(read(file)).map((token) => `${file} → var(${token})`),
    )
    expect(unknown).toEqual([])
  })

  it('still recognises a hand-picked size, so the guard cannot pass by parsing nothing', () => {
    expect(handPickedSizes('.label { font-size: 0.85rem; }')).toEqual([
      '.label: font-size: 0.85rem',
    ])
    expect(handPickedSizes('.label { font-size: var(--type-nope); }')).toEqual([])
    expect(handPickedSizes('.label { font-size: var(--type-md); }')).toEqual([])
    // The root anchor is the one size that is not a step of the scale.
    expect(handPickedSizes('html { font-size: 16px; }')).toEqual([])
    expect(handPickedSizes('html { font-size: 15px; }')).toEqual(['html: font-size: 15px'])
    // A nested rule inside a media block is read too, not skipped with it.
    expect(handPickedSizes('@media (max-width: 600px) { .label { font-size: 0.9rem; } }')).toEqual([
      '.label: font-size: 0.9rem',
    ])

    // A size written as the last declaration in a block is read too.
    expect(handPickedSizes('.label { color: red; font-size: 1.1rem }')).toEqual([
      '.label: font-size: 1.1rem',
    ])

    expect(handPickedShorthands('.label { color: red; font: inherit; }')).toEqual([])
    expect(handPickedShorthands('.label { font: var(--type-sm) var(--font-sans); }')).toEqual([])
    expect(handPickedShorthands('.label { font: 700 0.8rem/1.4 var(--font-sans); }')).toEqual([
      '.label: font: 700 0.8rem/1.4 var(--font-sans)',
    ])
    // The neighbouring properties are not shorthands and are read on their own.
    expect(handPickedShorthands('.label { font-family: var(--font-sans); font-weight: 600; }')).toEqual(
      [],
    )

    expect(unknownSteps('.label { font-size: var(--type-nope); }')).toEqual(['--type-nope'])
    expect(unknownSteps('.label { font-size: var(--type-sm); }')).toEqual([])
  })
})
