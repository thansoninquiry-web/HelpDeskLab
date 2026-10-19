// @vitest-environment node
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

function read(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(`../../${relativePath}`, import.meta.url)), 'utf8')
}

const css = read('src/ui/styles/tokens.css')

/**
 * The shell and the terminal keep their own dark surfaces, so these never move.
 * `--rail-accent` is the rail's active-nav blue, not a workspace colour; the
 * `--terminal-*` values are the night-shift palette the terminal reads when it
 * is set to stay dark on light paper.
 */
const FIXED_TOKENS = [
  '--rail',
  '--rail-text',
  '--rail-muted',
  '--rail-border',
  '--rail-hover',
  '--rail-accent',
  '--terminal-bg',
  '--terminal-panel',
  '--terminal-panel-strong',
  '--terminal-sunken',
  '--terminal-border',
  '--terminal-border-strong',
  '--terminal-text',
  '--terminal-muted',
  '--terminal-faint',
  '--terminal-accent',
  '--terminal-accent-strong',
  '--terminal-accent-soft',
  '--terminal-accent-border',
  '--terminal-hover',
  '--terminal-success',
  '--terminal-success-soft',
  '--terminal-warning',
  '--terminal-warning-soft',
  '--terminal-danger',
  '--terminal-danger-soft',
]

function blockFor(selector: string): string {
  const start = css.indexOf(selector)
  if (start < 0) {
    throw new Error(`tokens.css has no ${selector} block`)
  }
  const open = css.indexOf('{', start)
  const close = css.indexOf('}', open)
  if (open < 0 || close < 0) {
    throw new Error(`tokens.css has an unterminated ${selector} block`)
  }
  return css.slice(open + 1, close)
}

function declarations(block: string): Map<string, string> {
  const found = new Map<string, string>()
  for (const match of block.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)) {
    const name = match[1]
    const value = match[2]
    if (name && value) {
      found.set(name, value.trim())
    }
  }
  return found
}

/** Fixed tokens and geometry, shared by both looks. */
const base = declarations(blockFor(':root {'))
/** The dark colours, scoped so a preview can ask for that look. */
const dark = declarations(blockFor("[data-theme='dark']"))
const light = declarations(blockFor("[data-theme='light']"))

function isColour(value: string): boolean {
  return /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|\btransparent\b/i.test(value)
}

function selectorFor(marker: string): string {
  const start = css.indexOf(marker)
  const open = css.indexOf('{', start)
  return css.slice(start, open).replace(/\s+/g, ' ').trim()
}

describe('light workspace tokens', () => {
  it('re-declares every colour token under the same name', () => {
    const darkColours = [...base.entries(), ...dark.entries()]
      .filter(([name, value]) => isColour(value) && !FIXED_TOKENS.includes(name))
      .map(([name]) => name)

    expect(darkColours.length).toBeGreaterThan(15)
    const missing = darkColours.filter((name) => !light.has(name))
    expect(missing).toEqual([])
  })

  it('leaves the rail and the terminal palette alone, so they are identical in both themes', () => {
    for (const name of FIXED_TOKENS) {
      expect(base.has(name)).toBe(true)
      expect(dark.has(name)).toBe(false)
      expect(light.has(name)).toBe(false)
    }
  })

  it('does not touch geometry or type, so the density is unchanged', () => {
    const nonColours = [...base.entries()]
      .filter(([, value]) => !isColour(value))
      .map(([name]) => name)

    expect(nonColours).toContain('--radius-sm')
    expect(nonColours).toContain('--font-display')
    for (const name of nonColours) {
      expect(light.has(name), `${name} should not be overridden`).toBe(false)
    }
    // A theme carries colours only; the shared block above keeps the rest.
    expect([...dark.entries()].filter(([, value]) => !isColour(value))).toEqual([])
  })

  it('asks the browser for dark form controls by default and light when chosen', () => {
    expect(blockFor("[data-theme='dark']")).toContain('color-scheme: dark')
    expect(blockFor("[data-theme='light']")).toContain('color-scheme: light')
  })

  it('scopes both palettes to any element, so the Appearance preview can paint either look', () => {
    expect(selectorFor("[data-theme='dark']")).toBe("[data-theme='dark'], :root")
    expect(selectorFor("[data-theme='light']")).toBe("[data-theme='light']")
  })
})

describe('pre-paint script', () => {
  const html = read('index.html')
  const service = read('src/app/themeService.ts')

  it('reads the same cache keys the service writes', () => {
    const cacheKey = /const CACHE_KEY = '([^']+)'/.exec(service)?.[1]
    expect(cacheKey).toBe('helpdesklab.theme')
    expect(html).toContain(`localStorage.getItem('${cacheKey}')`)

    const terminalKey = /const CACHE_TERMINAL_KEY = '([^']+)'/.exec(service)?.[1]
    expect(terminalKey).toBe('helpdesklab.terminal')
    expect(html).toContain(`localStorage.getItem('${terminalKey}')`)
  })

  it('runs in the head, before the bundle', () => {
    const script = html.indexOf("localStorage.getItem('helpdesklab.theme')")
    const head = html.indexOf('</head>')
    const bundle = html.indexOf('src="/src/main.tsx"')

    expect(script).toBeGreaterThan(-1)
    expect(script).toBeLessThan(head)
    // In the dev document the bundle is the last thing before </body>.
    expect(bundle).toBeGreaterThan(head)
  })

  it('resolves System, and any unknown choice, through matchMedia', () => {
    const script = html.slice(html.indexOf('function wantsLightNow'), html.indexOf('</script>'))
    expect(script).toContain("choice === 'light'")
    expect(script).toContain("choice === 'dark'")
    expect(script).toContain("matchMedia('(prefers-color-scheme: dark)'")
    expect(script).toContain("choice !== 'schedule'")
    expect(script).toContain("localStorage.getItem('helpdesklab.theme.schedule')")
    // System has no branch of its own: everything but Light, Dark and Schedule
    // follows the operating system, which is also the default.
    expect(script.indexOf("choice === 'light'")).toBeLessThan(
      script.indexOf("choice !== 'schedule'"),
    )
  })
})
