// @vitest-environment node
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

function read(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(`../../${relativePath}`, import.meta.url)), 'utf8')
}

/**
 * Stylesheets that draw the always-dark chrome: the header, brand, nav and rail.
 * Keep this list growing with the shell: a new chrome stylesheet belongs here so
 * the guard covers it without anyone remembering to add the check.
 */
const SHELL_STYLESHEETS = ['src/ui/components/AppShell.module.css']

/**
 * The page canvas and the content area behind the chrome are workspace surface,
 * not rail: they have to follow the palette, so their own rules may read it.
 * Everything else in the shell is dark in both themes.
 */
const WORKSPACE_SURFACE_SELECTORS = new Set(['.shell', '.main'])

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '')
}

function isColour(value: string): boolean {
  return /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|\btransparent\b/i.test(value)
}

/** Every token the palette declares, first value per name. */
const paletteTokens = new Map<string, string>()
for (const match of stripComments(read('src/ui/styles/tokens.css')).matchAll(
  /(--[a-z0-9-]+)\s*:\s*([^;]+);/gi,
)) {
  const [, name, value] = match
  if (name && value && !paletteTokens.has(name)) {
    paletteTokens.set(name, value.trim())
  }
}

/**
 * A colour token is one a palette re-points. Geometry and type tokens cannot
 * leak a palette value, so the shell may keep using them for its layout.
 */
const colourTokens = new Set(
  [...paletteTokens.entries()]
    .filter(([, value]) => isColour(value))
    .map(([name]) => name),
)

interface TokenReference {
  selector: string
  token: string
}

/** Every `var(--token)` a rule reads, with the selector that reads it. */
function tokenReferences(css: string): TokenReference[] {
  const references: TokenReference[] = []

  for (const rule of stripComments(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = (rule[1] ?? '').replace(/\s+/g, ' ').trim()
    if (selector.length === 0 || selector.startsWith('@')) {
      continue
    }
    for (const reference of (rule[2] ?? '').matchAll(/var\(\s*(--[a-z0-9-]+)/gi)) {
      const token = reference[1]
      if (token) {
        references.push({ selector, token })
      }
    }
  }

  return references
}

/** `--rail` itself and every token under the rail's prefix. */
function isRailToken(token: string): boolean {
  return token === '--rail' || token.startsWith('--rail-')
}

/** Colour references in the chrome that are not the rail's own tokens. */
function chromeColourLeaks(css: string): TokenReference[] {
  return tokenReferences(css).filter(
    ({ selector, token }) =>
      !WORKSPACE_SURFACE_SELECTORS.has(selector) &&
      !isRailToken(token) &&
      colourTokens.has(token),
  )
}

describe('the shell rail palette', () => {
  it('keeps workspace colours off the dark chrome', () => {
    const leaks = SHELL_STYLESHEETS.flatMap((file) =>
      chromeColourLeaks(read(file)).map(
        ({ selector, token }) => `${file} → ${selector}: var(${token})`,
      ),
    )

    expect(leaks).toEqual([])
  })

  it('still recognises a leak, so the guard cannot pass by parsing nothing', () => {
    const sample = [
      '.rankName { color: var(--text); }',
      '.navLink { border-color: var(--rail-border); font-family: var(--font-mono); }',
      '.shell { background: var(--bg); }',
    ].join('\n')

    expect(colourTokens.has('--text')).toBe(true)
    expect(colourTokens.has('--font-mono')).toBe(false)
    expect(chromeColourLeaks(sample)).toEqual([
      { selector: '.rankName', token: '--text' },
    ])
  })

  it('lets the page canvas keep following the workspace palette', () => {
    expect(chromeColourLeaks('.shell { background: var(--bg); }')).toEqual([])
    expect(chromeColourLeaks('.main { color: var(--text); }')).toEqual([])
  })
})
