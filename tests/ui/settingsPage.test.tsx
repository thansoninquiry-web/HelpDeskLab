import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SettingsPage } from '../../src/ui/routes/SettingsPage'

vi.mock('../../src/app/persistenceService', () => ({
  getLocalDatabaseStatus: vi.fn().mockResolvedValue({
    engine: 'sqlite-wasm',
    storage: 'indexeddb',
    schemaVersion: 1,
    storedBytes: 20480,
    persistentStorage: true,
  }),
}))

describe('SettingsPage', () => {
  it('shows the live local database details', async () => {
    render(<SettingsPage />)

    expect(await screen.findByText('SQLite (WebAssembly) · schema v1')).toBeInTheDocument()
    expect(screen.getByText('IndexedDB snapshot')).toBeInTheDocument()
    expect(screen.getByText('20 KB')).toBeInTheDocument()
    expect(screen.getByText('Granted')).toBeInTheDocument()
  })
})
