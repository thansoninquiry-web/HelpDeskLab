#!/usr/bin/env node
/**
 * Check a pasted specification's claims against the reference's served assets.
 *
 * The spec arrives as prose. Its checkable claims — file sizes, identifiers that
 * should be in a bundle, identifiers that should not, and the set of scripts the
 * entry page loads — are transcribed once into a claim file (JSON), each entry
 * keeping the sentence it came from. This script then fetches every asset the
 * claim file names, once, and answers each claim against the bytes that were
 * actually served. One command, no dependencies, nothing executed, nothing
 * changed on the target.
 *
 * Usage:
 *   node scripts/check-bundle-claims.mjs [claim-file] [options]
 *   npm run check:claims
 *
 * Options:
 *   --assets <dir|url>   Read from a saved copy instead of the spec's baseUrl.
 *                        A directory is walked; a URL is fetched.
 *   --save <dir>         Write everything fetched into <dir>, so a later run can
 *                        be repeated offline with --assets <dir>.
 *   --timeout <ms>       Per-request timeout. Default 20000.
 *   --json               Print the report as JSON instead of a table.
 *   --help               Print this text.
 *
 * Exit codes, so a shell can branch on the outcome:
 *   0  every claim held: every file was served at its claimed size and every
 *      literal claim was confirmed against the served bytes.
 *   1  at least one claim was contradicted by the bytes.
 *   2  nothing was contradicted, but something could not be checked: an asset
 *      is no longer served, a pattern matched nothing, or a fetch failed.
 *   3  the claim file or the options could not be used.
 *
 * A "missing" asset is not a bug in this script. The reference redeploys, and a
 * content hash in the spec is a statement about one deployment, not about the
 * product. A literal claim is the durable half: it holds across redeploys for as
 * long as the feature exists, which is why a claim may name a pattern
 * (`assets/ServerRoomPanel-*.js`) instead of the hash of the day.
 */

import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises'
import { join, resolve, sep } from 'node:path'
import process from 'node:process'

const DEFAULT_CLAIM_FILE = 'docs/research/reference-bundle-claims.json'
const DEFAULT_TIMEOUT_MS = 20_000
/** Refuse to pull an unreasonable amount of a third party's bandwidth. */
const MAX_TOTAL_BYTES = 32 * 1024 * 1024
const CONCURRENCY = 4
/** One level is enough to see the lazy chunks the entry bundles name. */
const ASSET_REFERENCE = /assets\/[A-Za-z0-9_./-]+\.js/g

class ClaimFileError extends Error {}

/**
 * Run `fn` over every item with at most `limit` in flight, keeping the results
 * in the order the items were given so a report never reshuffles between runs.
 */
async function mapLimit(items, limit, fn) {
  const results = new Array(items.length)
  let next = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next
      next += 1
      results[index] = await fn(items[index], index)
    }
  })
  await Promise.all(workers)
  return results
}

function fail(message) {
  process.stderr.write(`check-bundle-claims: ${message}\n`)
  process.exit(3)
}

/** The flags, in the same words as the header comment. */
function usage() {
  process.stdout.write(`${usageText()}\n`)
}

function usageText() {
  return `Check a spec's claims against the reference's served assets.

Usage:
  node scripts/check-bundle-claims.mjs [claim-file] [options]
  npm run check:claims

Options:
  --assets <dir|url>   Read a saved copy instead of the spec's baseUrl.
  --save <dir>         Save everything fetched into <dir> for an offline re-run.
  --timeout <ms>       Per-request timeout in milliseconds (default ${DEFAULT_TIMEOUT_MS}).
  --json               Print the report as JSON.
  --help               Show this text.

Claim file defaults to ${DEFAULT_CLAIM_FILE}.
Exit codes: 0 all held, 1 contradicted, 2 unverifiable, 3 bad input.`
}

function parseArgs(argv) {
  const options = {
    claimFile: DEFAULT_CLAIM_FILE,
    assets: null,
    save: null,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    json: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--help' || arg === '-h') {
      return { help: true }
    }
    if (arg === '--json') {
      options.json = true
      continue
    }
    if (arg === '--assets' || arg === '--save' || arg === '--timeout') {
      const value = argv[index + 1]
      if (value === undefined) {
        fail(`${arg} needs a value`)
      }
      index += 1
      if (arg === '--assets') {
        options.assets = value
      } else if (arg === '--save') {
        options.save = value
      } else {
        const parsed = Number(value)
        if (!Number.isFinite(parsed) || parsed <= 0) {
          fail(`--timeout takes a positive number of milliseconds, not '${value}'`)
        }
        options.timeoutMs = parsed
      }
      continue
    }
    if (arg.startsWith('-')) {
      fail(`unknown option '${arg}' (try --help)`)
    }
    if (options.claimFile !== DEFAULT_CLAIM_FILE) {
      fail('only one claim file can be checked at a time')
    }
    options.claimFile = arg
  }

  return options
}

function isHttp(value) {
  return /^https?:\/\//i.test(value)
}

function trimBase(url) {
  return url.replace(/\/+$/, '')
}

/**
 * One place that knows how to get bytes: from the deployment, or from a saved
 * copy on disk. Everything is fetched once and kept, because a claim file asks
 * several questions about the same few files.
 */
function createSource({ baseUrl, assetsDir, timeoutMs, saveDir }) {
  const cache = new Map()
  const saved = new Map()
  let totalBytes = 0
  // Only --assets changes where bytes come from; --save writes a copy for a
  // later offline run without turning this run into a local read.
  const localRoot = assetsDir && !isHttp(assetsDir) ? resolve(assetsDir) : null
  const remoteBase = isHttp(assetsDir ?? '') ? trimBase(assetsDir) : localRoot ? null : trimBase(baseUrl)

  async function readRemote(path) {
    if (!remoteBase) {
      throw new Error('no remote base URL')
    }
    let response
    try {
      response = await fetch(`${remoteBase}/${path}`, {
        signal: AbortSignal.timeout(timeoutMs),
        redirect: 'follow',
        // The registry's byte counts were taken with a plain curl, so ask for the
        // stored file rather than a compressed transfer: a gzipped body would be
        // decompressed here and the size would stop meaning the same thing.
        headers: { 'user-agent': 'helpdesklab-claim-check', 'accept-encoding': 'identity' },
      })
    } catch (error) {
      return { error: describeFetchError(error) }
    }
    if (!response.ok) {
      // The body of a 404 is not the asset; keep the status and move on.
      try {
        await response.body?.cancel()
      } catch {
        // A body that will not cancel does not change the answer.
      }
      return { error: `HTTP ${response.status}` }
    }
    const bytes = new Uint8Array(await response.arrayBuffer())
    totalBytes += bytes.byteLength
    if (totalBytes > MAX_TOTAL_BYTES) {
      return { error: `more than ${MAX_TOTAL_BYTES / (1024 * 1024)} MB fetched; stopping` }
    }
    const text = new TextDecoder('utf-8').decode(bytes)
    saved.set(path, bytes)
    return { bytes, text }
  }

  async function readLocal(path) {
    if (!localRoot) {
      throw new Error('no local root')
    }
    const full = join(localRoot, path.split('/').join(sep))
    // A saved copy is only ever read, never written, by a claim check.
    if (full !== localRoot && !full.startsWith(`${localRoot}${sep}`)) {
      return { error: 'path escapes the saved copy' }
    }
    try {
      const bytes = new Uint8Array(await readFile(full))
      return { bytes, text: new TextDecoder('utf-8').decode(bytes) }
    } catch (error) {
      return { error: error.code === 'ENOENT' ? 'not in the saved copy' : describeFetchError(error) }
    }
  }

  return {
    /** The bytes for one path, or {error}. Two callers asking at once share one read. */
    get(path) {
      if (!cache.has(path)) {
        cache.set(path, localRoot ? readLocal(path) : readRemote(path))
      }
      return cache.get(path)
    },
    async save() {
      if (!saveDir) {
        return 0
      }
      let written = 0
      for (const [path, bytes] of saved) {
        const full = join(resolve(saveDir), path.split('/').join(sep))
        await mkdir(join(full, '..'), { recursive: true })
        await writeFile(full, bytes)
        written += 1
      }
      return written
    },
    mode: localRoot ? 'saved copy' : remoteBase,
    localRoot,
  }
}

function describeFetchError(error) {
  if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
    return 'timed out'
  }
  return error instanceof Error ? error.message : String(error)
}

/**
 * Every bundle the entry page names. Vite emits one module script and a set of
 * modulepreload links, so reading `<script src>` alone sees one file where the
 * page actually loads fifteen; the page's own asset references are the claim.
 */
function entryAssetsIn(html) {
  return [...new Set(referencesIn(html))]
}

function referencesIn(text) {
  const found = []
  for (const match of text.matchAll(ASSET_REFERENCE)) {
    found.push(match[0])
  }
  return found
}

async function walkLocal(root) {
  const found = []
  const stack = ['']
  while (stack.length > 0) {
    const relative = stack.pop()
    const entries = await readdir(join(root, relative), { withFileTypes: true })
    for (const entry of entries) {
      const next = relative ? `${relative}/${entry.name}` : entry.name
      if (entry.isDirectory()) {
        stack.push(next)
      } else if (entry.isFile()) {
        found.push(next)
      }
    }
  }
  return found
}

/**
 * The assets a claim may name. Discovery is the entry page's own scripts plus
 * the lazy chunks those scripts reference — enough to find a panel chunk by
 * pattern without crawling the whole deployment.
 */
async function discover(source, entryPath, { expand }) {
  const entry = await source.get(entryPath)
  if (entry.error) {
    return { entry, entryAssets: [], assets: new Set(), error: entry.error }
  }
  const entryAssets = entryAssetsIn(entry.text)
  const assets = new Set(entryAssets)

  // Reading every entry bundle is only worth its bytes when a claim names a
  // pattern that has to be resolved; an exact path is fetched on its own.
  if (expand) {
    const bundles = await mapLimit(entryAssets, CONCURRENCY, (path) => source.get(path))
    for (const resolved of bundles) {
      if (resolved.error) {
        continue
      }
      for (const reference of referencesIn(resolved.text)) {
        assets.add(reference)
      }
    }
  }

  if (source.localRoot) {
    for (const path of await walkLocal(source.localRoot)) {
      if (path.endsWith('.js')) {
        assets.add(path.split(sep).join('/'))
      }
    }
  }

  return { entry, entryAssets, assets }
}

function globToRegExp(pattern) {
  const escaped = pattern
    .split('*')
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*')
  return new RegExp(`^${escaped}$`)
}

/** A claim's file entries are paths or patterns; a pattern may match several. */
function resolveSpecifiers(specifiers, discovered) {
  const paths = []
  const unresolved = []
  for (const specifier of specifiers) {
    if (!specifier.includes('*')) {
      paths.push(specifier)
      continue
    }
    const pattern = globToRegExp(specifier)
    const matches = [...discovered].filter((path) => pattern.test(path)).sort()
    if (matches.length === 0) {
      unresolved.push(specifier)
    } else {
      paths.push(...matches)
    }
  }
  return { paths: [...new Set(paths)], unresolved }
}

function basenames(paths) {
  return paths.map((path) => path.slice(path.lastIndexOf('/') + 1)).join(', ')
}

function formatBytes(bytes) {
  return bytes.toLocaleString('en-US')
}

function checkFileEntry(file) {
  if (typeof file?.path !== 'string' || file.path.length === 0) {
    throw new ClaimFileError('every file needs a "path"')
  }
  if (!Number.isInteger(file.bytes) || file.bytes < 0) {
    throw new ClaimFileError(`${file.path}: "bytes" must be a whole number`)
  }
  return file
}

function checkClaimEntry(claim, position) {
  const id = typeof claim?.id === 'string' && claim.id.length > 0 ? claim.id : `claim-${position + 1}`
  if (claim?.verdict !== 'present' && claim?.verdict !== 'absent') {
    throw new ClaimFileError(`${id}: "verdict" must be "present" or "absent"`)
  }
  if (!Array.isArray(claim.match) || claim.match.length === 0) {
    throw new ClaimFileError(`${id}: "match" must list at least one string`)
  }
  if (!claim.match.every((needle) => typeof needle === 'string' && needle.length > 0)) {
    throw new ClaimFileError(`${id}: every "match" entry must be a non-empty string`)
  }
  if (!Array.isArray(claim.files) || claim.files.length === 0) {
    throw new ClaimFileError(`${id}: "files" must name at least one asset or pattern`)
  }
  return { ...claim, id, caseSensitive: claim.caseSensitive !== false }
}

function loadClaimFile(text) {
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch (error) {
    throw new ClaimFileError(`the claim file is not valid JSON (${error.message})`)
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new ClaimFileError('the claim file must be a JSON object')
  }
  const spec = parsed.spec ?? {}
  if (typeof spec.baseUrl !== 'string' || !isHttp(spec.baseUrl)) {
    throw new ClaimFileError('spec.baseUrl must be the http(s) address the spec was checked against')
  }
  const files = Array.isArray(parsed.files) ? parsed.files.map(checkFileEntry) : []
  const claims = Array.isArray(parsed.claims)
    ? parsed.claims.map((claim, index) => checkClaimEntry(claim, index))
    : []
  const entryScripts = parsed.entryScripts
    ? {
        claim: String(parsed.entryScripts.claim ?? 'the entry page loads these bundles'),
        expect: Array.isArray(parsed.entryScripts.expect)
          ? parsed.entryScripts.expect.filter((name) => typeof name === 'string')
          : [],
      }
    : null
  if (entryScripts && entryScripts.expect.length === 0) {
    throw new ClaimFileError('entryScripts.expect must list the bundle names to look for')
  }
  if (files.length === 0 && claims.length === 0 && !entryScripts) {
    throw new ClaimFileError(
      'the claim file checks nothing: add "files", "claims" or "entryScripts"',
    )
  }
  const notes = Array.isArray(parsed.notes)
    ? parsed.notes.filter((note) => typeof note === 'string')
    : []
  return {
    spec: {
      title: String(spec.title ?? 'untitled spec'),
      source: String(spec.source ?? ''),
      checked: String(spec.checked ?? ''),
      baseUrl: spec.baseUrl,
      entry: typeof parsed.entry === 'string' ? parsed.entry : 'index.html',
    },
    files,
    claims,
    entryScripts,
    notes,
  }
}

/**
 * Look for each needle in each haystack, remembering where it was found. A
 * present claim needs every needle found somewhere; an absent claim needs none.
 */
function searchClaim(claim, haystacks) {
  const hits = []
  const misses = []
  for (const needle of claim.match) {
    const where = haystacks.find((haystack) =>
      (claim.caseSensitive ? haystack.text : haystack.text.toLowerCase()).includes(
        claim.caseSensitive ? needle : needle.toLowerCase(),
      ),
    )
    if (where) {
      hits.push({ needle, path: where.path })
    } else {
      misses.push(needle)
    }
  }

  if (claim.verdict === 'present') {
    return hits.length === claim.match.length
      ? {
          status: 'holds',
          detail: `found ${quoteAll(hits.map((hit) => hit.needle))} in ${basenames([
            ...new Set(hits.map((hit) => hit.path)),
          ])}`,
        }
      : {
          status: 'fails',
          detail: `not found: ${quoteAll(misses)}${
            hits.length > 0 ? ` (found ${quoteAll(hits.map((hit) => hit.needle))})` : ''
          }`,
        }
  }

  return hits.length === 0
    ? {
        status: 'holds',
        detail: `none of ${quoteAll(claim.match)} is in ${basenames(
          [...new Set(haystacks.map((haystack) => haystack.path))],
        )}`,
      }
    : {
        status: 'fails',
        detail: `${quoteAll(hits.map((hit) => hit.needle))} found in ${basenames([
          ...new Set(hits.map((hit) => hit.path)),
        ])}`,
      }
}

function quoteAll(values) {
  return values.map((value) => `"${value}"`).join(', ')
}

function matchesBundleName(scriptPath, name) {
  const base = scriptPath.slice(scriptPath.lastIndexOf('/') + 1)
  return base === `${name}.js` || new RegExp(`^${escapeRegExp(name)}-[A-Za-z0-9_-]+\\.js$`).test(base)
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

async function run(options) {
  const claimText = await readFile(resolve(options.claimFile), 'utf8').catch((error) => {
    if (error.code === 'ENOENT') {
      fail(`no claim file at ${options.claimFile}`)
    }
    fail(`could not read ${options.claimFile}: ${error.message}`)
  })

  let claims
  try {
    claims = loadClaimFile(claimText)
  } catch (error) {
    if (error instanceof ClaimFileError) {
      fail(`${options.claimFile}: ${error.message}`)
    }
    throw error
  }

  const source = createSource({
    baseUrl: claims.spec.baseUrl,
    assetsDir: options.assets,
    timeoutMs: options.timeoutMs,
    saveDir: options.save,
  })

  const report = {
    spec: claims.spec,
    servedFrom: source.mode,
    entry: null,
    files: [],
    claims: [],
    omitted: claims.notes,
    summary: {},
  }

  const discovered = await discover(source, claims.spec.entry, {
    expand: claims.claims.some((claim) => claim.files.some((specifier) => specifier.includes('*'))),
  })
  report.entry = {
    path: claims.spec.entry,
    status: discovered.error ? 'unavailable' : 'read',
    assets: discovered.entryAssets.length,
    detail: discovered.error ?? `${discovered.entryAssets.length} bundle references`,
  }

  const fetchedFiles = await mapLimit(claims.files, CONCURRENCY, (file) => source.get(file.path))
  for (const [index, file] of claims.files.entries()) {
    const result = fetchedFiles[index]
    if (result.error) {
      report.files.push({
        path: file.path,
        status: 'missing',
        claimedBytes: file.bytes,
        detail: result.error,
      })
      continue
    }
    const servedBytes = result.bytes.byteLength
    report.files.push({
      path: file.path,
      status: servedBytes === file.bytes ? 'match' : 'size-mismatch',
      claimedBytes: file.bytes,
      servedBytes,
      detail:
        servedBytes === file.bytes
          ? `${formatBytes(servedBytes)} B`
          : `claimed ${formatBytes(file.bytes)} B, served ${formatBytes(servedBytes)} B`,
    })
  }

  for (const claim of claims.claims) {
    const { paths, unresolved } = resolveSpecifiers(claim.files, discovered.assets)
    if (unresolved.length > 0) {
      report.claims.push({
        id: claim.id,
        claim: claim.claim,
        verdict: claim.verdict,
        status: 'unverifiable',
        detail: `no served asset matches ${quoteAll(unresolved)}`,
      })
      continue
    }

    const haystacks = []
    const failures = []
    const read = await mapLimit(paths, CONCURRENCY, (path) => source.get(path))
    for (const [index, result] of read.entries()) {
      const path = paths[index]
      if (result.error) {
        failures.push(`${path} (${result.error})`)
      } else {
        haystacks.push({ path, text: result.text })
      }
    }

    if (haystacks.length === 0) {
      report.claims.push({
        id: claim.id,
        claim: claim.claim,
        verdict: claim.verdict,
        status: 'unverifiable',
        detail: `could not read ${failures.join(', ')}`,
      })
      continue
    }

    const outcome = searchClaim(claim, haystacks)
    report.claims.push({
      id: claim.id,
      claim: claim.claim,
      verdict: claim.verdict,
      status: outcome.status,
      detail: outcome.detail,
      files: haystacks.map((haystack) => haystack.path),
    })
  }

  if (claims.entryScripts) {
    const missing = claims.entryScripts.expect.filter(
      (name) => !discovered.entryAssets.some((asset) => matchesBundleName(asset, name)),
    )
    report.entryScripts = {
      claim: claims.entryScripts.claim,
      expected: claims.entryScripts.expect.length,
      found: claims.entryScripts.expect.length - missing.length,
      status: missing.length === 0 ? 'holds' : discovered.error ? 'unverifiable' : 'fails',
      detail: discovered.error
        ? `could not read ${claims.spec.entry} (${discovered.error})`
        : missing.length === 0
          ? `${claims.entryScripts.expect.length} bundles in ${discovered.entryAssets.length} references`
          : `missing: ${missing.join(', ')}`,
    }
  }

  const fileCounts = countBy(report.files, (file) => file.status)
  const claimCounts = countBy(report.claims, (claim) => claim.status)
  const entryFailed = report.entryScripts?.status === 'fails'
  const contradicted =
    (fileCounts.get('size-mismatch') ?? 0) +
    (claimCounts.get('fails') ?? 0) +
    (entryFailed ? 1 : 0)
  const unverified =
    (fileCounts.get('missing') ?? 0) +
    (claimCounts.get('unverifiable') ?? 0) +
    (report.entryScripts?.status === 'unverifiable' ? 1 : 0)

  report.summary = {
    files: report.files.length,
    filesVerified: fileCounts.get('match') ?? 0,
    filesContradicted: fileCounts.get('size-mismatch') ?? 0,
    filesMissing: fileCounts.get('missing') ?? 0,
    claims: report.claims.length,
    claimsHeld: claimCounts.get('holds') ?? 0,
    claimsContradicted: claimCounts.get('fails') ?? 0,
    claimsUnverifiable: claimCounts.get('unverifiable') ?? 0,
    contradicted,
    unverified,
    result: contradicted > 0 ? 'contradicted' : unverified > 0 ? 'unverifiable' : 'verified',
  }

  if (options.save) {
    report.saved = await source.save()
  }

  return report
}

function countBy(entries, key) {
  const counts = new Map()
  for (const entry of entries) {
    const value = key(entry)
    counts.set(value, (counts.get(value) ?? 0) + 1)
  }
  return counts
}

const FILE_MARK = { match: 'OK  ', 'size-mismatch': 'FAIL', missing: '--  ' }
const CLAIM_MARK = { holds: 'OK  ', fails: 'FAIL', unverifiable: '--  ' }

function printReport(report) {
  const lines = []
  lines.push(`Reference bundle claim check — ${report.spec.title}`)
  const provenance = [report.spec.source, report.spec.checked ? `checked ${report.spec.checked}` : '']
    .filter(Boolean)
    .join(' · ')
  if (provenance) {
    lines.push(`Spec: ${provenance}`)
  }
  lines.push(`Assets: ${report.servedFrom}`)
  lines.push(`Entry: ${report.entry.path} — ${report.entry.detail}`)
  lines.push('')

  if (report.files.length > 0) {
    lines.push(`File registry (${report.files.length})`)
    for (const file of report.files) {
      lines.push(`  ${FILE_MARK[file.status]} ${file.path}`)
      lines.push(`       ${file.detail}`)
    }
    lines.push('')
  }

  if (report.claims.length > 0) {
    lines.push(`Claims (${report.claims.length})`)
    for (const claim of report.claims) {
      const what = claim.claim ? ` — ${claim.claim}` : ''
      lines.push(`  ${CLAIM_MARK[claim.status]} ${claim.id} (${claim.verdict})${what}`)
      lines.push(`       ${claim.detail}`)
    }
    lines.push('')
  }

  if (report.entryScripts) {
    lines.push('Entry scripts')
    lines.push(`  ${CLAIM_MARK[report.entryScripts.status]} ${report.entryScripts.claim}`)
    lines.push(`       ${report.entryScripts.detail}`)
    lines.push('')
  }

  if (report.omitted.length > 0) {
    lines.push('Not machine-checkable')
    for (const note of report.omitted) {
      lines.push(`  · ${note}`)
    }
    lines.push('')
  }

  const summary = report.summary
  lines.push(
    `Files: ${summary.filesVerified}/${summary.files} at the claimed size` +
      (summary.filesMissing > 0 ? `, ${summary.filesMissing} not served` : '') +
      (summary.filesContradicted > 0 ? `, ${summary.filesContradicted} at another size` : ''),
  )
  lines.push(
    `Claims: ${summary.claimsHeld}/${summary.claims} held` +
      (summary.claimsContradicted > 0 ? `, ${summary.claimsContradicted} contradicted` : '') +
      (summary.claimsUnverifiable > 0 ? `, ${summary.claimsUnverifiable} unverifiable` : ''),
  )

  const verdict = {
    verified: 'VERIFIED — every claim holds for the bytes that were served.',
    contradicted: 'CONTRADICTED — the served bytes do not support every claim; see FAIL above.',
    unverifiable:
      'UNVERIFIED — nothing was contradicted, but part of the spec could not be checked against what is served now.',
  }[summary.result]
  lines.push(`Result: ${verdict}`)

  process.stdout.write(`${lines.join('\n')}\n`)
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    usage()
    return
  }
  const report = await run(options)
  if (options.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
  } else {
    printReport(report)
  }

  if (report.summary.contradicted > 0) {
    process.exitCode = 1
  } else if (report.summary.unverified > 0) {
    process.exitCode = 2
  }
}

main().catch((error) => {
  if (error instanceof ClaimFileError) {
    fail(error.message)
  }
  process.stderr.write(`check-bundle-claims: ${error?.stack ?? error}\n`)
  process.exitCode = 3
})
