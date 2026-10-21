import { afterEach, describe, expect, it, vi } from 'vitest'
import { createId } from '../../src/app/ids'

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('createId', () => {
  it('uses randomUUID where the browser has it', () => {
    const getRandomValues = vi.fn()
    vi.stubGlobal('crypto', { randomUUID: () => 'secure-context-id', getRandomValues })

    expect(createId()).toBe('secure-context-id')
    // A secure context never pays for the fallback.
    expect(getRandomValues).not.toHaveBeenCalled()
  })

  // Opening the lab over plain http on a LAN or Tailscale address is not a
  // secure context, so `randomUUID` is simply absent there.
  it('falls back to getRandomValues when randomUUID is missing', () => {
    const bytes = Uint8Array.from({ length: 16 }, (_, index) => index * 16)
    vi.stubGlobal('crypto', {
      getRandomValues: (array: Uint8Array) => {
        array.set(bytes)
        return array
      },
    })

    // Same sixteen bytes, with version 4 in byte 6 and the RFC 4122 variant in
    // byte 8: the id keeps the shape a secure context would have produced.
    expect(createId()).toBe('00102030-4050-4070-8090-a0b0c0d0e0f0')
  })

  it('draws a fresh random id on every call in the fallback', () => {
    let counter = 0
    vi.stubGlobal('crypto', {
      getRandomValues: (array: Uint8Array) => {
        counter += 1
        array.fill(counter)
        return array
      },
    })

    const first = createId()
    const second = createId()
    expect(first).toMatch(UUID_V4)
    expect(second).toMatch(UUID_V4)
    expect(first).not.toBe(second)
  })

  it('says so when the browser has no random source at all', () => {
    vi.stubGlobal('crypto', {})

    expect(() => createId()).toThrow(/no cryptographic random source/i)
  })
})
