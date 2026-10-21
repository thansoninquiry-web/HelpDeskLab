/**
 * A RFC 4122 version 4 UUID.
 *
 * `crypto.randomUUID` only exists in a secure context, so it is missing when the
 * lab is opened over plain http on a LAN or Tailscale address — a supported way
 * to reach the dev server, which listens on the network. Every id the app stores
 * comes from here so the shape does not depend on the origin: the fallback draws
 * the same sixteen bytes from `crypto.getRandomValues`, which every context has,
 * and stamps the version and variant bits itself.
 */
export function createId(): string {
  const source = globalThis.crypto
  if (typeof source?.randomUUID === 'function') {
    return source.randomUUID()
  }
  if (typeof source?.getRandomValues !== 'function') {
    throw new Error('This browser offers no cryptographic random source to create an id.')
  }

  const bytes = source.getRandomValues(new Uint8Array(16))
  // Version 4, variant 1 — the same bits `randomUUID` sets.
  for (let index = 0; index < bytes.length; index += 1) {
    const byte = bytes[index] ?? 0
    if (index === 6) {
      bytes[index] = (byte & 0x0f) | 0x40
    } else if (index === 8) {
      bytes[index] = (byte & 0x3f) | 0x80
    }
  }

  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join('-')
}
