import { createHash } from 'node:crypto'

/**
 * The policy the app is served under.
 *
 * HelpDeskLab calls no server of its own, so the page loads only same-origin
 * assets: the bundle, the SQLite WASM, the manifest and the service worker. A
 * policy that says so is the cheapest way to bound what an injected script
 * could reach if one ever got in.
 *
 * Two allowances are load-bearing rather than convenient:
 *
 * - `'wasm-unsafe-eval'` is what lets `WebAssembly.instantiate` run sql.js. The
 *   narrower directive exists precisely so a page can keep this without
 *   `'unsafe-eval'`, which is why the shipped policy never carries the latter.
 * - `'unsafe-inline'` in `style-src` is required by React's `style` prop, which
 *   the workspace uses for divider positions and progress bars.
 */

export interface CspOptions {
  /** Base64 SHA-256 hashes of the page's inline scripts, as the browser sees them. */
  scriptHashes?: readonly string[]
  /**
   * True only for the Vite dev server, which injects React Refresh's preamble as
   * an inline script and talks to the page over a websocket. A test holds this
   * apart from the policy a build ships.
   */
  development?: boolean
}

/** Applies to every response; none of them is a document the app needs framed. */
export const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), geolocation=(), microphone=(), payment=(), usb=()',
} as const

export function buildContentSecurityPolicy(options: CspOptions = {}): string {
  const hashes = options.scriptHashes ?? []
  const scriptSrc = options.development
    ? // React Refresh needs the inline preamble, and the HMR client is a
      // websocket. Neither reaches a build.
      "'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval'"
    : ["'self'", ...hashes.map((hash) => `'sha256-${hash}'`), "'wasm-unsafe-eval'"].join(' ')

  const directives = [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    // React's style prop is used for the dividers and the progress bars.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    // The dev server's HMR client connects back to this origin.
    `connect-src ${options.development ? "'self' ws: wss:" : "'self'"}`,
    // The service worker; falls back through child-src to default-src otherwise.
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ]

  return directives.join('; ')
}

export function securityHeaders(options: CspOptions = {}): Record<string, string> {
  return { 'Content-Security-Policy': buildContentSecurityPolicy(options), ...SECURITY_HEADERS }
}

/** Inline scripts only: a `<script>` with a `src` is covered by `'self'`. */
const INLINE_SCRIPT = /<script(?![^>]*\bsrc\s*=)[^>]*>([\s\S]*?)<\/script>/gi

/**
 * The hashes the policy needs, read from the HTML a browser is actually given.
 * Vite rewrites `index.html` on the way out, so the bytes hashed here are the
 * served ones rather than the source file's.
 */
export function inlineScriptHashes(html: string): string[] {
  const hashes: string[] = []
  for (const match of html.matchAll(INLINE_SCRIPT)) {
    const body = match[1] ?? ''
    if (body.trim().length === 0) {
      continue
    }
    hashes.push(createHash('sha256').update(body, 'utf8').digest('base64'))
  }
  return hashes
}

/**
 * `_headers` is read by Cloudflare Pages and Netlify, so a static deploy gets
 * the same policy the preview server applies without knowing which host it is.
 */
export function headersFile(headers: Record<string, string>): string {
  const lines = ['/*']
  for (const [name, value] of Object.entries(headers)) {
    lines.push(`  ${name}: ${value}`)
  }
  return `${lines.join('\n')}\n`
}
