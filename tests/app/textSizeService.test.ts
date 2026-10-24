import { beforeEach, describe, expect, it, vi } from 'vitest'

// The service reads and writes one settings row; this stand-in keeps the real
// normalizing in play instead of stubbing the service itself.
const settings = vi.hoisted(() => ({ rows: {} as Record<string, unknown>, failRead: false }))

vi.mock('../../src/app/persistenceService', () => ({
  getLocalDatabase: async () => ({
    settings: {
      get: async (key: string) => {
        if (settings.failRead) {
          throw new Error('IndexedDB is unavailable')
        }
        return settings.rows[key] ?? null
      },
      set: async (key: string, value: unknown) => {
        settings.rows[key] = value
      },
    },
  }),
}))

import { describeTextSize, DEFAULT_TEXT_SIZE } from '../../src/domain/appearance/textSize'
import {
  applyTextSize,
  currentTextSize,
  describeCurrentTextSize,
  loadTextSize,
  saveTextSize,
  startTextSize,
  textSizeChoices,
} from '../../src/app/textSizeService'

const CACHE_KEY = 'helpdesklab.textSize'

function documentSize(): string | undefined {
  return document.documentElement.dataset.textSize
}

beforeEach(() => {
  settings.rows = {}
  settings.failRead = false
  // The size is module state; it is reset through the same setter the app uses,
  // and the cache is cleared after it so each test starts from nothing stored.
  applyTextSize(DEFAULT_TEXT_SIZE)
  localStorage.clear()
  delete document.documentElement.dataset.textSize
})

describe('the text size setting', () => {
  it('offers every size the domain declares, so the form cannot invent one', () => {
    expect(textSizeChoices().map((choice) => choice.value)).toEqual(['small', 'default', 'large'])
  })

  it('applies a size to the document, stores it, and mirrors it for the first frame', async () => {
    expect(await saveTextSize('large')).toBe('large')

    expect(documentSize()).toBe('large')
    expect(settings.rows.textSize).toBe('large')
    expect(localStorage.getItem(CACHE_KEY)).toBe('large')
    expect(currentTextSize()).toBe('large')
    expect(describeCurrentTextSize()).toBe(describeTextSize('large'))

    expect(await saveTextSize('small')).toBe('small')
    expect(documentSize()).toBe('small')
    expect(localStorage.getItem(CACHE_KEY)).toBe('small')
  })

  it('refuses a size it does not offer, and changes nothing', async () => {
    const before = documentSize()

    await expect(saveTextSize('huge')).rejects.toThrow('Unknown text size: huge')

    expect(documentSize()).toBe(before)
    expect(settings.rows.textSize).toBeUndefined()
  })

  it('reads a stored size and caches it for the next boot', async () => {
    settings.rows.textSize = 'small'

    expect(await loadTextSize()).toBe('small')
    expect(localStorage.getItem(CACHE_KEY)).toBe('small')
  })

  it('reads an unrecognizable stored value as the design size', async () => {
    settings.rows.textSize = 'gigantic'

    expect(await loadTextSize()).toBe('default')
    expect(localStorage.getItem(CACHE_KEY)).toBe('default')
  })

  it('paints the cached size first, then the stored one', async () => {
    localStorage.setItem(CACHE_KEY, 'large')
    settings.rows.textSize = 'small'

    startTextSize()
    // The first frame cannot wait for the database: the cache is on the document
    // before the row has been read.
    expect(documentSize()).toBe('large')

    await vi.waitFor(() => {
      expect(documentSize()).toBe('small')
    })
    expect(currentTextSize()).toBe('small')
    expect(localStorage.getItem(CACHE_KEY)).toBe('small')
  })

  it('keeps the cached size when the stored row cannot be read', async () => {
    localStorage.setItem(CACHE_KEY, 'small')
    settings.failRead = true

    startTextSize()
    expect(documentSize()).toBe('small')

    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(documentSize()).toBe('small')
  })

  it('boots on the design size when storage itself is unavailable', () => {
    const denied = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage is denied')
    })

    expect(() => startTextSize()).not.toThrow()
    expect(documentSize()).toBe('default')

    denied.mockRestore()
  })

  it('applies a size without touching the settings table', () => {
    // What the Settings form does on the click, before the write lands.
    expect(applyTextSize('large')).toBe('large')

    expect(documentSize()).toBe('large')
    expect(settings.rows.textSize).toBeUndefined()
  })
})
