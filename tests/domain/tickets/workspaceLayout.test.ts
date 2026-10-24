import { describe, expect, it } from 'vitest'
import {
  DEFAULT_WORKSPACE_LAYOUT,
  insertWorkspaceTool,
  isEmptyWorkspaceLayout,
  normalizeWorkspaceLayout,
  pinWorkspaceTool,
  reorderWorkspaceTools,
  workspaceInsertIndex,
  workspaceLayoutJson,
  type WorkspaceLayout,
} from '../../../src/domain/tickets/workspaceLayout'

const CONSOLES = ['directory', 'printer', 'mail-admin', 'shares']

describe('normalizeWorkspaceLayout', () => {
  it('keeps the pane, the console in front and the tabs beside it', () => {
    const layout = normalizeWorkspaceLayout(
      { pane: 'tools', tool: 'printer', tabs: ['directory', 'printer'] },
      CONSOLES,
    )

    expect(layout).toEqual({
      pane: 'tools',
      tool: 'printer',
      tabs: ['directory', 'printer'],
      pinned: [],
      ratio: null,
    })
  })

  it('drops a console this build no longer offers, front and tab together', () => {
    const layout = normalizeWorkspaceLayout(
      { pane: 'tools', tool: 'retired-tool', tabs: ['printer', 'retired-tool'] },
      CONSOLES,
    )

    expect(layout.tabs).toEqual(['printer'])
    expect(layout.tool).toBeNull()
  })

  it('never puts a console in front that is not open', () => {
    const layout = normalizeWorkspaceLayout(
      { pane: 'tools', tool: 'printer', tabs: ['directory'] },
      CONSOLES,
    )

    expect(layout.tabs).toEqual(['directory'])
    expect(layout.tool).toBeNull()
  })

  it('keeps a tab once however often it was stored', () => {
    const layout = normalizeWorkspaceLayout(
      { pane: 'tools', tool: 'printer', tabs: ['printer', 'directory', 'printer'] },
      CONSOLES,
    )

    expect(layout.tabs).toEqual(['printer', 'directory'])
  })

  it('cannot be grown past the consoles that exist', () => {
    const stored = Array.from({ length: 40 }, () => 'printer')
    const layout = normalizeWorkspaceLayout(
      { pane: 'tools', tool: 'printer', tabs: stored },
      CONSOLES,
    )

    expect(layout.tabs.length).toBeLessThanOrEqual(CONSOLES.length)
  })

  it('reads an unknown pane, and anything that is not a layout, as the terminal', () => {
    expect(normalizeWorkspaceLayout({ pane: 'elsewhere', tabs: [] }, CONSOLES).pane).toBe(
      'terminal',
    )
    for (const stored of [null, undefined, 'tools', 3, ['printer'], { pane: 7 }]) {
      expect(normalizeWorkspaceLayout(stored, CONSOLES).pane).toBe('terminal')
    }
  })

  it('reads anything that is not a layout as nothing remembered', () => {
    for (const stored of [null, undefined, 'tools', 3, ['printer']]) {
      expect(normalizeWorkspaceLayout(stored, CONSOLES)).toEqual(DEFAULT_WORKSPACE_LAYOUT)
    }
  })

  it('keeps the pinned group at the front of the strip, whatever the row says', () => {
    const layout = normalizeWorkspaceLayout(
      {
        pane: 'tools',
        tool: 'printer',
        tabs: ['directory', 'printer', 'mail-admin', 'shares'],
        pinned: ['mail-admin', 'directory'],
        ratio: null,
      },
      CONSOLES,
    )

    // The group keeps the order the pins were written in, and the rest follow.
    expect(layout.tabs).toEqual(['mail-admin', 'directory', 'printer', 'shares'])
    expect(layout.pinned).toEqual(['mail-admin', 'directory'])
  })

  it('drops a pin on a tab that is not open, and cannot pin one console twice', () => {
    expect(
      normalizeWorkspaceLayout({ tabs: ['printer'], pinned: ['directory'] }, CONSOLES).pinned,
    ).toEqual([])
    expect(
      normalizeWorkspaceLayout({ tabs: ['printer'], pinned: ['retired-tool'] }, CONSOLES).pinned,
    ).toEqual([])
    expect(
      normalizeWorkspaceLayout({ tabs: ['printer'], pinned: ['printer', 'printer'] }, CONSOLES)
        .pinned,
    ).toEqual(['printer'])
    expect(normalizeWorkspaceLayout({ tabs: ['printer'], pinned: 7 }, CONSOLES).pinned).toEqual([])
  })

  it('reads a pin written before the group existed as a group of one', () => {
    const layout = normalizeWorkspaceLayout(
      { pane: 'tools', tool: 'directory', tabs: ['directory', 'printer'], pinned: 'printer' },
      CONSOLES,
    )

    expect(layout.pinned).toEqual(['printer'])
    expect(layout.tabs).toEqual(['printer', 'directory'])
  })

  it('ignores tabs of the wrong type instead of failing the reopen', () => {
    const layout = normalizeWorkspaceLayout(
      { pane: 'tools', tool: 'printer', tabs: ['printer', 42, null, { id: 'printer' }] },
      CONSOLES,
    )

    expect(layout.tabs).toEqual(['printer'])
    expect(layout.tool).toBe('printer')
  })
})

describe('pinWorkspaceTool', () => {
  const open: WorkspaceLayout = {
    pane: 'tools',
    tool: 'printer',
    tabs: ['directory', 'printer', 'mail-admin'],
    pinned: [],
    ratio: null,
  }

  it('moves a newly pinned tool to the front of the strip', () => {
    const pinned = pinWorkspaceTool(open, 'mail-admin')

    expect(pinned.pinned).toEqual(['mail-admin'])
    expect(pinned.tabs).toEqual(['mail-admin', 'directory', 'printer'])
  })

  it('holds several pins as a group, in the order they were pinned', () => {
    const first = pinWorkspaceTool(open, 'mail-admin')
    const second = pinWorkspaceTool(first, 'directory')

    // The second pin joins the end of the group rather than jumping ahead of it.
    expect(second.pinned).toEqual(['mail-admin', 'directory'])
    expect(second.tabs).toEqual(['mail-admin', 'directory', 'printer'])
  })

  it('leaves an unpinned tab where the group leaves it, not at the end', () => {
    const group = pinWorkspaceTool(pinWorkspaceTool(open, 'mail-admin'), 'directory')

    // mail-admin comes out of the group and stays where it was: the front of the
    // tabs that are free to drag, not the back of the strip.
    const released = pinWorkspaceTool(group, 'mail-admin')
    expect(released.pinned).toEqual(['directory'])
    expect(released.tabs).toEqual(['directory', 'mail-admin', 'printer'])

    // Releasing the last pin leaves the strip exactly where it was.
    const none = pinWorkspaceTool(released, 'directory')
    expect(none.pinned).toEqual([])
    expect(none.tabs).toEqual(['directory', 'mail-admin', 'printer'])
  })

  it('will not pin a tool that is not open', () => {
    expect(pinWorkspaceTool(open, 'shares')).toBe(open)
  })

  it('puts a tab back in the group when it is pinned again', () => {
    const group = pinWorkspaceTool(pinWorkspaceTool(open, 'mail-admin'), 'directory')
    const released = pinWorkspaceTool(group, 'directory')
    const again = pinWorkspaceTool(released, 'directory')

    // Pinning again joins the end of the group, which is now behind mail-admin.
    expect(again.pinned).toEqual(['mail-admin', 'directory'])
    expect(again.tabs.at(0)).toBe('mail-admin')
  })
})

describe('reorderWorkspaceTools', () => {
  const open: WorkspaceLayout = {
    pane: 'tools',
    tool: 'directory',
    tabs: ['directory', 'printer', 'mail-admin'],
    pinned: [],
    ratio: null,
  }

  it('moves a tab to the place it was dropped on', () => {
    expect(reorderWorkspaceTools(open, 0, 2).tabs).toEqual(['printer', 'mail-admin', 'directory'])
    expect(reorderWorkspaceTools(open, 2, 1).tabs).toEqual(['directory', 'mail-admin', 'printer'])
  })

  it('changes nothing for a drop on the tab\u2019s own place, or off the end of the strip', () => {
    expect(reorderWorkspaceTools(open, 1, 1)).toBe(open)
    expect(reorderWorkspaceTools(open, 3, 0)).toBe(open)
    expect(reorderWorkspaceTools(open, -1, 0)).toBe(open)
  })

  it('keeps a group of pinned tabs in front, whichever way a tab is dragged past it', () => {
    const group = pinWorkspaceTool(pinWorkspaceTool(open, 'mail-admin'), 'directory')
    expect(group.tabs).toEqual(['mail-admin', 'directory', 'printer'])

    // A tab dragged at the group lands behind all of it rather than inside it.
    expect(reorderWorkspaceTools(group, 2, 0).tabs).toEqual([
      'mail-admin',
      'directory',
      'printer',
    ])
    // Dropped between the two pinned tabs, or dragged far past them, is the same
    // place: the floor is the first slot after the group.
    expect(reorderWorkspaceTools(group, 2, 1).tabs).toEqual(['mail-admin', 'directory', 'printer'])
    expect(reorderWorkspaceTools(group, 2, -4).tabs).toEqual(['mail-admin', 'directory', 'printer'])
    // Neither pinned tab moves.
    expect(reorderWorkspaceTools(group, 0, 2)).toBe(group)
    expect(reorderWorkspaceTools(group, 1, 2)).toBe(group)
  })

  it('still lets the free tabs change places among themselves under a group', () => {
    const group = pinWorkspaceTool(pinWorkspaceTool(open, 'mail-admin'), 'directory')
    const wider: WorkspaceLayout = {
      ...group,
      tabs: [...group.tabs, 'shares'],
    }

    const moved = reorderWorkspaceTools(wider, 2, 3)
    expect(moved.tabs).toEqual(['mail-admin', 'directory', 'shares', 'printer'])
    expect(reorderWorkspaceTools(moved, 3, 2).tabs).toEqual(wider.tabs)
  })
})

describe('insertWorkspaceTool', () => {
  const open: WorkspaceLayout = {
    pane: 'tools',
    tool: 'directory',
    tabs: ['directory', 'printer', 'mail-admin'],
    pinned: [],
    ratio: null,
  }

  it('opens a tool at the place it was dropped', () => {
    expect(insertWorkspaceTool(open, 'shares', 0).tabs).toEqual([
      'shares',
      'directory',
      'printer',
      'mail-admin',
    ])
    expect(insertWorkspaceTool(open, 'shares', 1).tabs).toEqual([
      'directory',
      'shares',
      'printer',
      'mail-admin',
    ])
    expect(insertWorkspaceTool(open, 'shares', 3).tabs).toEqual([
      'directory',
      'printer',
      'mail-admin',
      'shares',
    ])
  })

  it('treats a place past the end as the end, and a place before the start as the start', () => {
    expect(insertWorkspaceTool(open, 'shares', 9).tabs.at(-1)).toBe('shares')
    expect(insertWorkspaceTool(open, 'shares', -3).tabs[0]).toBe('shares')
    expect(insertWorkspaceTool(open, 'shares', Number.NaN).tabs).toEqual([
      'shares',
      'directory',
      'printer',
      'mail-admin',
    ])
  })

  it('moves a tool that is already open instead of opening it twice', () => {
    expect(insertWorkspaceTool(open, 'mail-admin', 0).tabs).toEqual([
      'mail-admin',
      'directory',
      'printer',
    ])
    // Dropping it where it already is changes nothing at all.
    expect(insertWorkspaceTool(open, 'printer', 1)).toBe(open)
    expect(insertWorkspaceTool(open, 'directory', 0)).toBe(open)
  })

  it('never lands ahead of the pinned group, and never moves one of it', () => {
    const group = pinWorkspaceTool(pinWorkspaceTool(open, 'mail-admin'), 'directory')
    expect(group.tabs).toEqual(['mail-admin', 'directory', 'printer'])

    // Dropped on the group or at the very start, a tool lands after all of it.
    expect(insertWorkspaceTool(group, 'shares', 0).tabs).toEqual([
      'mail-admin',
      'directory',
      'shares',
      'printer',
    ])
    expect(insertWorkspaceTool(group, 'shares', -1).tabs.slice(0, 2)).toEqual([
      'mail-admin',
      'directory',
    ])
    // A pinned tab is held by its own drop.
    expect(insertWorkspaceTool(group, 'directory', 3)).toBe(group)
    // A free tool still moves, within the space the group leaves.
    const wider: WorkspaceLayout = { ...group, tabs: [...group.tabs, 'shares'] }
    expect(insertWorkspaceTool(wider, 'shares', 2).tabs).toEqual([
      'mail-admin',
      'directory',
      'shares',
      'printer',
    ])
  })

  it('answers the place it would land at with the place it will land at', () => {
    const group = pinWorkspaceTool(pinWorkspaceTool(open, 'mail-admin'), 'directory')

    expect(workspaceInsertIndex(group, 'shares', 0)).toBe(2)
    expect(workspaceInsertIndex(group, 'shares', 8)).toBe(3)
    expect(workspaceInsertIndex(group, 'printer', 0)).toBe(2)
    expect(workspaceInsertIndex(group, 'mail-admin', 2)).toBe(0)
    expect(workspaceInsertIndex(open, 'mail-admin', 0)).toBe(0)
    expect(workspaceInsertIndex(open, 'mail-admin', 2)).toBe(2)
  })
})

describe('workspaceLayoutJson', () => {
  it('round-trips a group of pins through storage unchanged', () => {
    const layout = {
      pane: 'tools' as const,
      tool: 'printer',
      tabs: ['mail-admin', 'printer', 'directory'],
      pinned: ['mail-admin', 'printer'],
      ratio: null,
    }

    expect(normalizeWorkspaceLayout(workspaceLayoutJson(layout), CONSOLES)).toEqual(layout)
  })

  it('carries the width the ticket was worked at, and no width as no width', () => {
    const sized = { ...DEFAULT_WORKSPACE_LAYOUT, ratio: 0.62 }

    expect(workspaceLayoutJson(sized)).toEqual({
      pane: 'terminal',
      tool: null,
      tabs: [],
      pinned: [],
      ratio: 0.62,
    })
    expect(normalizeWorkspaceLayout(workspaceLayoutJson(sized), CONSOLES)).toEqual(sized)
  })

  it('reads a stored width inside the bounds rather than failing', () => {
    const stored = (ratio: unknown) =>
      normalizeWorkspaceLayout(
        { pane: 'terminal', tool: null, tabs: [], pinned: [], ratio },
        CONSOLES,
      ).ratio

    expect(stored(0.62)).toBe(0.62)
    // A width written by another build, or by hand, is read where the pointer could
    // have put it instead of keeping the ticket from opening.
    expect(stored(0.9)).toBe(0.75)
    expect(stored(0.1)).toBe(0.25)
    // No width on the row -- every row written before this existed -- is the
    // device's own preference, which is not the same as a stored half. A width
    // that is not a number is the same as none, like the split's other settings.
    expect(stored(undefined)).toBeNull()
    expect(stored({ ratio: 0.9 })).toBeNull()
    expect(stored('wide')).toBeNull()
    expect(normalizeWorkspaceLayout(null, CONSOLES).ratio).toBeNull()
  })

  it('keeps an empty workspace as an empty one rather than inventing a tool', () => {
    expect(workspaceLayoutJson(DEFAULT_WORKSPACE_LAYOUT)).toEqual({
      pane: 'terminal',
      tool: null,
      tabs: [],
      pinned: [],
      ratio: null,
    })
  })
})

describe('isEmptyWorkspaceLayout', () => {
  it('treats the workspace the learner has not moved in as nothing worth storing', () => {
    expect(isEmptyWorkspaceLayout(DEFAULT_WORKSPACE_LAYOUT)).toBe(true)
    expect(normalizeWorkspaceLayout(null, CONSOLES)).toEqual(DEFAULT_WORKSPACE_LAYOUT)
  })

  it('keeps a chosen pane, an open console, an open tab or a pin', () => {
    const empty = { pane: 'terminal' as const, tool: null, tabs: [] as string[], ratio: null }

    expect(isEmptyWorkspaceLayout({ ...empty, pinned: [] })).toBe(true)
    expect(
      isEmptyWorkspaceLayout({ pane: 'tools', tool: null, tabs: [], pinned: [], ratio: null }),
    ).toBe(false)
    // A width is a shape the desk was left in, so it is worth storing on its own.
    expect(isEmptyWorkspaceLayout({ ...empty, pinned: [], ratio: 0.62 })).toBe(false)
    expect(isEmptyWorkspaceLayout({ ...empty, tabs: ['printer'], pinned: [] })).toBe(false)
    expect(isEmptyWorkspaceLayout({ ...empty, tabs: ['printer'], pinned: ['printer'] })).toBe(
      false,
    )
  })
})
