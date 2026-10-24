#!/usr/bin/env node
/**
 * Serves the production build over HTTPS so a phone can install the lab as an
 * app.
 *
 * Why HTTPS is required: an installed PWA needs a service worker, and a service
 * worker only registers in a secure context. The lab runs perfectly over plain
 * http on a LAN or tailnet address — that is a supported way to open the dev
 * server — but that origin is not a secure context, so it can never be
 * installed, and nothing offline works there.
 *
 * Why a local CA rather than a real certificate: a tailnet with HTTPS
 * certificates enabled can issue a trusted one for its own name, and where that
 * is not available this script mints its own CA and a leaf that chains to it. The
 * phone has to trust that CA — not for the padlock's sake, but because a browser
 * refuses to register a service worker on a certificate it cannot verify, which is
 * the whole point of serving over HTTPS here. Everything stays file-local: no
 * accounts, no outside services, and nothing is written to the machine's trust
 * store.
 *
 * Usage: `npm run serve:phone`, then open one of the printed addresses.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { networkInterfaces, hostname } from 'node:os'
import { resolve } from 'node:path'
import { preview } from 'vite'

const CERT_DIR = resolve('.freebuff/certs')
const PORT = Number(process.env.HELPDESKLIB_PHONE_PORT ?? 8443)

/** The tailnet name Tailscale would serve the app from, when its CLI is around. */
function tailnetName() {
  try {
    const status = execFileSync('tailscale', ['status', '--json'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    const name = JSON.parse(status).Self?.DNSName
    return typeof name === 'string' && name.length > 0 ? name.replace(/\.$/, '') : null
  } catch {
    // Not installed, not signed in, or not a Tailscale machine: IP addresses are
    // still enough to reach the server.
    return null
  }
}

/** Every address the phone might type, so the certificate matches all of them. */
function reachableAddresses() {
  const addresses = ['127.0.0.1']
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family === 'IPv4' && !entry.internal) {
        addresses.push(entry.address)
      }
    }
  }
  return [...new Set(addresses)]
}

function dnsNames() {
  const names = ['localhost', hostname()]
  const tailnet = tailnetName()
  if (tailnet) {
    names.push(tailnet)
  }
  for (const extra of (process.env.HELPDESKLIB_PHONE_HOSTS ?? '').split(',')) {
    const name = extra.trim()
    if (name.length > 0) {
      names.push(name)
    }
  }
  return [...new Set(names.filter((name) => name.length > 0))].sort()
}

function sanConfig(names, addresses) {
  const lines = ['[alt_names]']
  names.forEach((name, index) => lines.push(`DNS.${index + 1} = ${name}`))
  addresses.forEach((address, index) => lines.push(`IP.${index + 1} = ${address}`))
  lines.push(
    '',
    '[v3_leaf]',
    'basicConstraints = critical,CA:FALSE',
    'keyUsage = critical,digitalSignature,keyEncipherment',
    'extendedKeyUsage = serverAuth',
    'subjectAltName = @alt_names',
    '',
  )
  return lines.join('\n')
}

/**
 * Creates the CA and leaf once, and again when the addresses change — a new
 * lease or a new tailnet address would otherwise serve a certificate that no
 * longer matches the URL, which is the same error screen as no certificate.
 */
function ensureCertificate(names, addresses) {
  mkdirSync(CERT_DIR, { recursive: true })
  const ca = resolve(CERT_DIR, 'helpdesklab-ca.pem')
  const caKey = resolve(CERT_DIR, 'helpdesklab-ca-key.pem')
  const leaf = resolve(CERT_DIR, 'server.pem')
  const leafKey = resolve(CERT_DIR, 'server-key.pem')
  const configPath = resolve(CERT_DIR, 'san.cnf')
  const config = sanConfig(names, addresses)

  const current = existsSync(configPath) ? readFileSync(configPath, 'utf8') : null
  if (existsSync(leaf) && existsSync(leafKey) && existsSync(ca) && current === config) {
    return { ca, cert: leaf, key: leafKey, created: false }
  }

  const openssl = (args) => execFileSync('openssl', args, { cwd: CERT_DIR, stdio: 'pipe' })
  writeFileSync(configPath, config)

  if (!existsSync(ca) || !existsSync(caKey)) {
    openssl([
      'req', '-x509', '-newkey', 'rsa:2048', '-nodes',
      '-keyout', 'helpdesklab-ca-key.pem',
      '-out', 'helpdesklab-ca.pem',
      '-days', '3650', '-sha256',
      '-subj', '/CN=HelpDeskLab local CA',
      '-addext', 'basicConstraints=critical,CA:TRUE,pathlen:0',
      '-addext', 'keyUsage=critical,keyCertSign,cRLSign',
    ])
  }

  openssl([
    'req', '-new', '-newkey', 'rsa:2048', '-nodes',
    '-keyout', 'server-key.pem',
    '-out', 'server.csr',
    '-subj', '/CN=HelpDeskLab',
  ])
  openssl([
    'x509', '-req', '-in', 'server.csr',
    '-CA', 'helpdesklab-ca.pem', '-CAkey', 'helpdesklab-ca-key.pem',
    '-CAcreateserial',
    '-out', 'server.pem',
    '-days', '825', '-sha256',
    '-extfile', 'san.cnf', '-extensions', 'v3_leaf',
  ])

  // Android's certificate installer only offers files it recognises, and a bare
  // .pem is sometimes not one of them. The same bytes under .crt always are.
  writeFileSync(resolve(CERT_DIR, 'helpdesklab-ca.crt'), readFileSync(ca))

  return { ca, cert: leaf, key: leafKey, created: true }
}

if (!existsSync(resolve('dist/index.html'))) {
  console.error('No production build found. Run `npm run build` first (npm run serve:phone does both).')
  process.exit(1)
}

const addresses = reachableAddresses()
const names = dnsNames()

let certificate
try {
  certificate = ensureCertificate(names, addresses)
} catch (error) {
  if (error?.code === 'ENOENT') {
    console.error('`openssl` was not found on PATH, and it is what mints the local certificate.')
    console.error('Run this from Git Bash (which ships it), or install OpenSSL.')
    process.exit(1)
  }
  throw error
}

const server = await preview({
  preview: {
    host: true,
    port: PORT,
    strictPort: true,
    https: { cert: readFileSync(certificate.cert), key: readFileSync(certificate.key) },
    // Addresses are allowed already; these are the names a phone may type.
    allowedHosts: ['.ts.net', '.local'],
  },
})

const urls = addresses.map((address) => `https://${address}:${PORT}/`)
const tailnet = names.find((name) => name.endsWith('.ts.net'))

console.log('')
console.log('HelpDeskLab is being served over HTTPS for your phone:')
for (const url of urls) {
  console.log(`  ${url}`)
}
if (tailnet) {
  console.log(`  https://${tailnet}:${PORT}/   (tailnet name)`)
}
console.log('')
console.log(`Certificate: ${certificate.created ? 'minted' : 'reused'}  ${certificate.cert}`)
console.log('')
console.log('Before the app can install, the phone must trust this certificate. Chrome\nrefuses to register a service worker on one it cannot verify, so tapping past\nthe warning page is not enough. Install the CA once:')
console.log(`  ${resolve(CERT_DIR, 'helpdesklab-ca.crt')}`)
console.log('  Android: Settings → Security & privacy → More security settings →')
console.log('  Encryption & credentials → Install a certificate → CA certificate.')
console.log('  Taildrop it over with: tailscale file cp <the .crt path> <phone>: ')
console.log('')
console.log('If your tailnet has HTTPS certificates enabled, that road needs no install')
console.log('on the phone: serve the preview and point the tailnet at it — see the')
console.log('README section “On a phone”.')
console.log('')
console.log('Stop with Ctrl+C.')
console.log('')

// Ctrl+C closes the preview server so the port is free for the next run.
process.on('SIGINT', () => {
  server.httpServer?.close(() => process.exit(0))
})
