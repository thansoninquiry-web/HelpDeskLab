import type { OutputLine } from './types'

export function line(text = ''): OutputLine {
  return { text }
}

export function lines(texts: readonly string[]): OutputLine[] {
  return texts.map((text) => ({ text }))
}

export function errorLine(text: string): OutputLine {
  return { text, kind: 'error' }
}

export function successLine(text: string): OutputLine {
  return { text, kind: 'success' }
}

export function mutedLine(text: string): OutputLine {
  return { text, kind: 'muted' }
}
