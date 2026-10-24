import {
  describeTextSize,
  isTextSize,
  parseTextSize,
  DEFAULT_TEXT_SIZE,
  TEXT_SIZE_CHOICES,
  type TextSize,
  type TextSizeChoice,
} from '../domain/appearance/textSize'
import { getLocalDatabase } from './persistenceService'

/**
 * The interface's text size, stored as a value in the settings table so it
 * travels with a backup and follows the same rules as every other setting.
 *
 * The database is authoritative, but it opens asynchronously and the first frame
 * cannot wait for it, so the choice is mirrored into `localStorage` and applied
 * by the small inline script in `index.html` before the bundle runs. That mirror
 * is a cache, never a second source of truth: `startTextSize` reconciles it
 * against the database on every boot, and each save writes both.
 *
 * Unlike the theme there is no timer and no listener: nothing changes this while
 * nobody is looking, so a save repaints the document and hands the value back to
 * the form that asked for it.
 *
 * Keep `CACHE_KEY`, the `data-text-size` attribute and its values in step with
 * the inline script in `index.html` and the scale rules in
 * `src/ui/styles/tokens.css`.
 */

const TEXT_SIZE_KEY = 'textSize'
const CACHE_KEY = 'helpdesklab.textSize'

let textSize: TextSize = DEFAULT_TEXT_SIZE

function readCached(): TextSize {
  try {
    return parseTextSize(localStorage.getItem(CACHE_KEY))
  } catch {
    // Private modes and disabled storage are not a reason to fail a boot.
    return DEFAULT_TEXT_SIZE
  }
}

function writeCached(value: TextSize): void {
  try {
    localStorage.setItem(CACHE_KEY, value)
  } catch {
    // The database already holds the choice; the cache is only for first paint.
  }
}

/** Sets the attribute the stylesheet scales from, and mirrors the choice. */
export function applyTextSize(next: TextSize): TextSize {
  textSize = next
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.textSize = next
  }
  writeCached(next)
  return next
}

/** What the Settings form may offer, so the UI never imports the domain. */
export function textSizeChoices(): readonly TextSizeChoice[] {
  return TEXT_SIZE_CHOICES
}

export function currentTextSize(): TextSize {
  return textSize
}

export function describeCurrentTextSize(): string {
  return describeTextSize(textSize)
}

/** Applies the cached choice immediately, then corrects it from the database. */
export function startTextSize(): void {
  applyTextSize(readCached())

  void loadTextSize().then(
    (stored) => {
      applyTextSize(stored)
    },
    () => {
      // An unreadable setting leaves the cached choice on screen.
    },
  )
}

export async function loadTextSize(): Promise<TextSize> {
  const db = await getLocalDatabase()
  const stored = parseTextSize(await db.settings.get(TEXT_SIZE_KEY))
  writeCached(stored)
  return stored
}

export async function saveTextSize(value: string): Promise<TextSize> {
  if (!isTextSize(value)) {
    throw new Error(`Unknown text size: ${value}`)
  }

  const db = await getLocalDatabase()
  await db.settings.set(TEXT_SIZE_KEY, value)

  return applyTextSize(value)
}

export type { TextSize }
