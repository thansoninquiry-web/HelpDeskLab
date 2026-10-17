import { describe, expect, it } from 'vitest'
import { findCommand } from '../../../src/domain/environment/commands'
import { parseCommandLine, tokenize } from '../../../src/domain/environment/parser'

describe('parseCommandLine', () => {
  it('rejects empty input', () => {
    const result = parseCommandLine('   ')
    expect(result.ok).toBe(false)
  })

  it('keeps quoted arguments together', () => {
    const result = parseCommandLine('nslookup "SRV-DC01.larkspur.example." 10.20.4.10')
    expect(result).toEqual({
      ok: true,
      command: {
        name: 'nslookup',
        args: ['SRV-DC01.larkspur.example.', '10.20.4.10'],
        raw: 'nslookup "SRV-DC01.larkspur.example." 10.20.4.10',
      },
    })
  })

  it('reports an unterminated quote', () => {
    const result = parseCommandLine('ping "intranet.larkspur.example')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.message).toMatch(/quote/i)
    }
  })

  it('normalizes command names and drops .exe', () => {
    const result = parseCommandLine('IPCONFIG.EXE /all')
    expect(result.ok && result.command.name).toBe('ipconfig')
    expect(result.ok && result.command.args).toEqual(['/all'])
  })

  it('tokenizes single quotes', () => {
    const result = tokenize(`ping 'intranet.larkspur.example'`)
    expect(result).toEqual({ ok: true, tokens: ['ping', 'intranet.larkspur.example'] })
  })
})

describe('findCommand', () => {
  it('resolves names, aliases, and case differences', () => {
    expect(findCommand('ipconfig')?.name).toBe('ipconfig')
    expect(findCommand('TNC')?.name).toBe('test-netconnection')
    expect(findCommand('test-netconnection')?.name).toBe('test-netconnection')
    expect(findCommand('?')?.name).toBe('help')
    expect(findCommand('definitely-not-a-command')).toBeUndefined()
  })
})
