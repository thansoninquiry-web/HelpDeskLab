/**
 * The page is served under a Content-Security-Policy now, and the part of it
 * that breaks quietly is the inline script hash: `index.html` carries a theme
 * boot script so the workspace never flashes the wrong surface, and a hash that
 * stops matching it takes the first frame's colours with it while leaving the
 * rest of the app working. Nobody would find that by reading the policy.
 *
 * So the hash is computed the way the browser computes it — from the text
 * between the tags in the served HTML — and this file holds the three promises
 * the policy makes: a build never allows inline or evaluated script, the dev
 * server's looser policy stays in the dev server, and the hash the config ships
 * is the hash of the script actually in `index.html`.
 */

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  SECURITY_HEADERS,
  buildContentSecurityPolicy,
  headersFile,
  inlineScriptHashes,
  securityHeaders,
} from '../../scripts/securityHeaders'

function read(relativePath: string): string {
  // Vitest runs from the project root, which is where `index.html` lives.
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8')
}

function directives(policy: string): Map<string, string> {
  const parsed = new Map<string, string>()
  for (const part of policy.split(';')) {
    const [name, ...rest] = part.trim().split(/\s+/)
    if (name) {
      parsed.set(name, rest.join(' '))
    }
  }
  return parsed
}

const html = read('index.html')
const hashes = inlineScriptHashes(html)
const shipped = directives(buildContentSecurityPolicy({ scriptHashes: hashes }))
const development = directives(buildContentSecurityPolicy({ development: true }))

describe('the shipped policy', () => {
  it('allows no inline and no evaluated script', () => {
    expect(shipped.get('script-src')).not.toContain("'unsafe-inline'")
    expect(shipped.get('script-src')).not.toContain("'unsafe-eval'")
  })

  it('still pins every inline script by hash', () => {
    expect(hashes.length).toBeGreaterThan(0)
    for (const hash of hashes) {
      expect(shipped.get('script-src')).toContain(`'sha256-${hash}'`)
    }
  })

  it('keeps the WASM allowance narrow', () => {
    // sql.js cannot instantiate without this, and the whole point of the
    // directive is that it is not 'unsafe-eval'.
    expect(shipped.get('script-src')).toContain("'wasm-unsafe-eval'")
  })

  it('refuses the things the app never does', () => {
    expect(shipped.get('default-src')).toBe("'self'")
    expect(shipped.get('object-src')).toBe("'none'")
    expect(shipped.get('base-uri')).toBe("'none'")
    expect(shipped.get('form-action')).toBe("'none'")
    expect(shipped.get('frame-ancestors')).toBe("'none'")
    // No server of its own, so nothing off-origin is reachable.
    expect(shipped.get('connect-src')).toBe("'self'")
  })

  it('allows the two inline style sources it actually uses', () => {
    expect(shipped.get('style-src')).toContain("'self'")
    expect(shipped.get('style-src')).toContain("'unsafe-inline'")
  })
})

describe('the dev server policy', () => {
  it('is the only place inline and evaluated script appear', () => {
    // React Refresh injects its preamble as an inline script and needs the
    // websocket; neither reaches a build.
    expect(development.get('script-src')).toContain("'unsafe-inline'")
    expect(development.get('script-src')).toContain("'unsafe-eval'")
    expect(development.get('connect-src')).toContain('ws:')
    expect(shipped.get('connect-src')).not.toContain('ws:')
  })

  it('still refuses framing and objects', () => {
    expect(development.get('frame-ancestors')).toBe("'none'")
    expect(development.get('object-src')).toBe("'none'")
  })
})

describe('the inline script hash', () => {
  it('is computed from the bytes between the tags, as the browser does it', () => {
    const match = /<script(?![^>]*\bsrc\s*=)[^>]*>([\s\S]*?)<\/script>/i.exec(html)
    expect(match).not.toBeNull()
    const body = match?.[1] ?? ''
    expect(hashes).toEqual([createHash('sha256').update(body, 'utf8').digest('base64')])
  })

  it('hashes the theme boot script, which is the one index.html carries', () => {
    // If someone replaces that script with a different one, or moves it into a
    // file, this fails before the policy starts blocking the first paint.
    expect(html).toContain("localStorage.getItem('helpdesklab.theme')")
    expect(hashes).toHaveLength(1)
  })

  it('ignores scripts that have a src, which the origin check already covers', () => {
    expect(inlineScriptHashes('<script src="/a.js"></script><script>go()</script>')).toHaveLength(1)
    expect(inlineScriptHashes('<script type="module" src="/main.ts"></script>')).toEqual([])
  })
})

describe('the header set', () => {
  it('carries the policy beside the plain headers', () => {
    const headers = securityHeaders({ scriptHashes: hashes })
    expect(headers['Content-Security-Policy']).toBe(buildContentSecurityPolicy({ scriptHashes: hashes }))
    expect(headers['X-Content-Type-Options']).toBe('nosniff')
    expect(headers['Referrer-Policy']).toBe('no-referrer')
    expect(SECURITY_HEADERS['X-Frame-Options']).toBe('DENY')
  })

  it('serializes to a _headers block a static host can read', () => {
    const file = headersFile(securityHeaders({ scriptHashes: hashes }))
    const lines = file.trimEnd().split('\n')
    expect(lines[0]).toBe('/*')
    expect(lines).toContain("  Referrer-Policy: no-referrer")
    expect(lines.some((line) => line.startsWith('  Content-Security-Policy: '))).toBe(true)
  })
})
