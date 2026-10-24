// @vitest-environment node
import { execFile, spawnSync } from 'node:child_process'
import { promisify } from 'node:util'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

const SCRIPT = fileURLToPath(new URL('../../scripts/check-bundle-claims.mjs', import.meta.url))

/**
 * The claim check is a shell tool, so it is tested the way it is used: a claim
 * file, a set of served bytes, and an exit code. Nothing here touches the
 * network beyond a loopback server this file starts itself.
 */

interface ClaimFileInput {
  files?: Array<{ path: string; bytes: number }>
  claims?: Array<Record<string, unknown>>
  entryScripts?: { claim: string; expect: string[] }
  entry?: string
}

const workspaces: string[] = []

function workspace(): string {
  const dir = mkdtempSync(join(tmpdir(), 'claims-'))
  workspaces.push(dir)
  return dir
}

afterEach(() => {
  // A temp tree per test; leaving them behind would leak into later runs.
  for (const dir of workspaces.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

function write(root: string, path: string, content: string | Buffer): number {
  const full = join(root, path.split('/').join('/'))
  mkdirSync(join(full, '..'), { recursive: true })
  writeFileSync(full, content)
  return Buffer.byteLength(content)
}

function claimFile(root: string, input: ClaimFileInput, name = 'claims.json'): string {
  const path = join(root, name)
  writeFileSync(
    path,
    JSON.stringify({
      spec: {
        title: 'A spec under test',
        source: 'fixture',
        checked: '2026-10-20',
        baseUrl: 'https://example.invalid',
      },
      entry: input.entry,
      files: input.files ?? [],
      claims: input.claims ?? [],
      entryScripts: input.entryScripts,
    }),
  )
  return path
}

function run(args: string[]): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' })
  return { status: result.status, stdout: result.stdout, stderr: result.stderr }
}

/**
 * The blocking runner deadlocks a server hosted by this same test process, so a
 * test that serves its fixture uses the async one.
 */
async function runAsync(
  args: string[],
): Promise<{ status: number | null; stdout: string; stderr: string }> {
  try {
    const result = await promisify(execFile)(process.execPath, [SCRIPT, ...args], {
      encoding: 'utf8',
    })
    return { status: 0, stdout: result.stdout, stderr: result.stderr }
  } catch (error) {
    const failed = error as { code?: number; stdout?: string; stderr?: string }
    return { status: failed.code ?? null, stdout: failed.stdout ?? '', stderr: failed.stderr ?? '' }
  }
}

const ALPHA = 'const panels={title:"Gridpoint GP-R4"};'
const BETA = 'export const note="PXE does not run over WiFi";'

/** A saved copy that a whole claim file can be verified against. */
function servedCopy(): string {
  const root = workspace()
  write(
    root,
    'index.html',
    '<script type="module" src="/assets/Panel-abc123.js"></script>' +
      '<link rel="modulepreload" href="/assets/Other-def456.js">',
  )
  write(root, 'assets/Panel-abc123.js', ALPHA)
  write(root, 'assets/Other-def456.js', BETA)
  return root
}

describe('the claim check', () => {
  it('verifies every claim against a saved copy and exits 0', () => {
    const root = servedCopy()
    const claims = claimFile(root, {
      files: [
        { path: 'assets/Panel-abc123.js', bytes: Buffer.byteLength(ALPHA) },
        { path: 'assets/Other-def456.js', bytes: Buffer.byteLength(BETA) },
      ],
      claims: [
        {
          id: 'rogue-ap',
          claim: 'Rogue AP in the server room',
          verdict: 'present',
          files: ['assets/Panel-abc123.js'],
          match: ['Gridpoint', 'GP-R4'],
        },
        {
          id: 'pxe',
          claim: 'PXE refuses wireless',
          verdict: 'present',
          files: ['assets/Other-*.js'],
          match: ['PXE does not run over WiFi'],
        },
        {
          id: 'no-dkim',
          claim: 'Quarantine inspects DKIM',
          verdict: 'absent',
          files: ['assets/Other-*.js'],
          match: ['dkim'],
          caseSensitive: false,
        },
      ],
      entryScripts: { claim: 'The entry page loads the panel', expect: ['Panel'] },
    })

    const result = run([claims, '--assets', root])

    expect(result.stderr).toBe('')
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('2/2 at the claimed size')
    expect(result.stdout).toContain('3/3 held')
    expect(result.stdout).toContain('VERIFIED')
    // The pattern is reported by the file it actually resolved to.
    expect(result.stdout).toContain('Other-def456.js')
  })

  it('contradicts a size the served file does not have', () => {
    const root = servedCopy()
    const claims = claimFile(root, {
      files: [{ path: 'assets/Panel-abc123.js', bytes: 12 }],
    })

    const result = run([claims, '--assets', root])

    expect(result.status).toBe(1)
    expect(result.stdout).toContain('claimed 12 B, served')
    expect(result.stdout).toContain('CONTRADICTED')
  })

  it('contradicts a literal the bytes do not contain', () => {
    const root = servedCopy()
    const claims = claimFile(root, {
      claims: [
        {
          id: 'missing-literal',
          claim: 'The panel names a second access point',
          verdict: 'present',
          files: ['assets/Panel-*.js'],
          match: ['Gridpoint', 'ap-lobby'],
        },
      ],
    })

    const result = run([claims, '--assets', root])

    expect(result.status).toBe(1)
    expect(result.stdout).toContain('not found: "ap-lobby"')
    expect(result.stdout).toContain('found "Gridpoint"')
  })

  it('contradicts an absent claim the bytes actually satisfy', () => {
    const root = servedCopy()
    const claims = claimFile(root, {
      claims: [
        {
          id: 'no-spf',
          claim: 'Quarantine inspects SPF headers',
          verdict: 'absent',
          files: ['assets/Panel-*.js'],
          match: ['Gridpoint'],
        },
      ],
    })

    const result = run([claims, '--assets', root])

    expect(result.status).toBe(1)
    expect(result.stdout).toContain('"Gridpoint" found in')
  })

  it('reports an asset that is no longer served instead of failing the run', () => {
    const root = servedCopy()
    const claims = claimFile(root, {
      files: [{ path: 'assets/Gone-zzz999.js', bytes: 100 }],
      claims: [
        {
          id: 'gone-literal',
          claim: 'A claim about a chunk that was replaced',
          verdict: 'present',
          files: ['assets/Gone-*.js'],
          match: ['anything'],
        },
      ],
    })

    const result = run([claims, '--assets', root])

    expect(result.status).toBe(2)
    expect(result.stdout).toContain('not in the saved copy')
    expect(result.stdout).toContain('no served asset matches "assets/Gone-*.js"')
    expect(result.stdout).toContain('UNVERIFIED')
  })

  it('holds the entry-page claim only when every named bundle is loaded', () => {
    const root = servedCopy()
    const hold = claimFile(
      root,
      {
        entryScripts: { claim: 'The entry page loads both bundles', expect: ['Panel', 'Other'] },
      },
      'hold.json',
    )
    const fail = claimFile(
      root,
      {
        entryScripts: {
          claim: 'The entry page loads both bundles',
          expect: ['Panel', 'Other', 'workflow-suite'],
        },
      },
      'fail.json',
    )

    const held = run([hold, '--assets', root])
    expect(held.status).toBe(0)

    const failed = run([fail, '--assets', root])
    expect(failed.status).toBe(1)
    expect(failed.stdout).toContain('missing: workflow-suite')
  })

  it('prints a JSON report a caller can read', () => {
    const root = servedCopy()
    const claims = claimFile(root, {
      files: [{ path: 'assets/Panel-abc123.js', bytes: Buffer.byteLength(ALPHA) }],
    })

    const result = run([claims, '--assets', root, '--json'])
    const report = JSON.parse(result.stdout) as {
      files: Array<{ path: string; status: string }>
      summary: { result: string; filesVerified: number }
    }

    expect(result.status).toBe(0)
    expect(report.summary).toMatchObject({ result: 'verified', filesVerified: 1 })
    expect(report.files[0]).toMatchObject({ path: 'assets/Panel-abc123.js', status: 'match' })
  })

  it('fetches once over HTTP, saves the bytes, and re-checks them offline', async () => {
    const root = servedCopy()
    const claims = claimFile(root, {
      files: [{ path: 'assets/Panel-abc123.js', bytes: Buffer.byteLength(ALPHA) }],
      claims: [
        {
          id: 'rogue-ap',
          claim: 'Rogue AP in the server room',
          verdict: 'present',
          files: ['assets/Panel-*.js'],
          match: ['Gridpoint', 'GP-R4'],
        },
      ],
    })

    const requests: string[] = []
    const server = createServer((request, response) => {
      const url = request.url ?? '/'
      requests.push(url)
      const path = url === '/' ? 'index.html' : url.replace(/^\/+/, '')
      const full = join(root, path)
      try {
        const body = readFileSync(full)
        response.writeHead(200, { 'content-type': 'text/javascript' })
        response.end(body)
      } catch {
        response.writeHead(404)
        response.end('not found')
      }
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`

    try {
      const saved = join(workspace(), 'saved')
      const live = await runAsync([claims, '--assets', origin, '--save', saved])
      expect(live.stderr).toBe('')
      expect(live.status).toBe(0)
      expect(live.stdout).toContain(`Assets: ${origin}`)
      // The registry row and the literal claim name the same file; it is read once.
      expect(requests.filter((path) => path === '/assets/Panel-abc123.js')).toHaveLength(1)
      expect(requests.filter((path) => path === '/index.html')).toHaveLength(1)

      // The same claims, now from the copy the first run wrote.
      const offline = await runAsync([claims, '--assets', saved])
      expect(offline.status).toBe(0)
      expect(offline.stdout).toContain('Assets: saved copy')
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  })

  it('refuses a claim file it cannot use', () => {
    const root = workspace()
    writeFileSync(join(root, 'broken.json'), '{ not json')
    const broken = run([join(root, 'broken.json'), '--assets', root])
    expect(broken.status).toBe(3)
    expect(broken.stderr).toContain('not valid JSON')

    const noSuchFile = run([join(root, 'absent.json'), '--assets', root])
    expect(noSuchFile.status).toBe(3)
    expect(noSuchFile.stderr).toContain('no claim file')

    const unknown = run(['--nonsense'])
    expect(unknown.status).toBe(3)
    expect(unknown.stderr).toContain('unknown option')
  })
})
