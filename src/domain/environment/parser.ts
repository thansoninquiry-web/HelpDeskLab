export interface ParsedCommand {
  name: string
  args: string[]
  raw: string
}

export type ParseResult =
  | { ok: true; command: ParsedCommand }
  | { ok: false; message: string }

type TokenizeResult =
  | { ok: true; tokens: string[] }
  | { ok: false; message: string }

export function tokenize(input: string): TokenizeResult {
  const tokens: string[] = []
  let current = ''
  let quote: '"' | "'" | null = null
  let inToken = false

  for (const character of input) {
    if (quote) {
      if (character === quote) {
        quote = null
      } else {
        current += character
      }
      continue
    }

    if (character === '"' || character === "'") {
      quote = character
      inToken = true
      continue
    }

    if (/\s/.test(character)) {
      if (inToken) {
        tokens.push(current)
        current = ''
        inToken = false
      }
      continue
    }

    current += character
    inToken = true
  }

  if (quote) {
    return { ok: false, message: 'The command contains an unterminated quote.' }
  }

  if (inToken) {
    tokens.push(current)
  }

  return { ok: true, tokens }
}

export function parseCommandLine(input: string): ParseResult {
  const raw = input.trim()
  if (raw.length === 0) {
    return { ok: false, message: 'Enter a command. Type "help" for available tools.' }
  }

  const tokenized = tokenize(raw)
  if (!tokenized.ok) {
    return tokenized
  }

  const [head, ...args] = tokenized.tokens
  if (!head) {
    return { ok: false, message: 'Enter a command. Type "help" for available tools.' }
  }

  return {
    ok: true,
    command: {
      name: head.toLowerCase().replace(/\.exe$/, ''),
      args,
      raw,
    },
  }
}
