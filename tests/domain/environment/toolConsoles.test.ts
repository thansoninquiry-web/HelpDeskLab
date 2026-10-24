import { describe, expect, it } from 'vitest'
import { CONSOLE_IDS, consoleEntries, findConsoleActionForCommand } from '../../../src/domain/environment/consoles'
import { deploymentConsoleEntries } from '../../../src/domain/environment/deployments'
import { createLarkspurWorld } from '../../../src/domain/environment/fixtures'
import { mailAdminConsoleEntries } from '../../../src/domain/environment/mailAdmin'
import { mailSecurityConsoleEntries } from '../../../src/domain/environment/mailSecurity'
import {
  DESKTOP_ACTIONS,
  focusedRemoteSession,
  remoteDesktopConsoleEntries,
  remoteDesktopView,
} from '../../../src/domain/environment/remoteDesktop'
import type { ConsoleEvidence } from '../../../src/domain/environment/console'
import { findScope } from '../../../src/domain/environment/dhcp'
import { sharesConsoleEntries } from '../../../src/domain/environment/shares'
import { applyCommand } from '../../../src/domain/environment/reducer'
import { TOOL_CATALOG } from '../../../src/domain/environment/tools'
import type { CommandResult, World } from '../../../src/domain/environment/types'

function text(result: CommandResult): string {
  return result.lines.map((entry) => entry.text).join('\n')
}

function deviceIn(world: World, id: string) {
  const device = world.devices.find((candidate) => candidate.id === id)
  if (!device) {
    throw new Error(`device not found: ${id}`)
  }
  return device
}

function stockIn(world: World, id: string) {
  const item = world.stock.find((candidate) => candidate.id === id)
  if (!item) {
    throw new Error(`stock not found: ${id}`)
  }
  return item
}

describe('mail commands', () => {
  it('reads a mailbox, its forwarding, and its held mail', () => {
    const result = applyCommand(createLarkspurWorld(), 'get-mailbox tbrooks')
    const output = text(result)

    expect(result.ok).toBe(true)
    expect(output).toContain('theo.brooks.backup@example.net')
    expect(output).toContain('On hold         : False')
  })

  it('traces a message through the transport', () => {
    const result = applyCommand(createLarkspurWorld(), 'trace-message msg-1002')
    const output = text(result)

    expect(output).toContain('Action required: confirm your payment details')
    expect(output).toContain('State           : quarantined')
    expect(output).toContain('Phishing: display name impersonating the finance team')
    expect(output).toContain('Anti-phishing policy held the message.')
  })

  it('rejects a message id that is not in the tenant', () => {
    const result = applyCommand(createLarkspurWorld(), 'trace-message msg-9999')

    expect(result.ok).toBe(false)
    expect(text(result)).toMatch(/No message 'msg-9999' is recorded/)
  })

  it('lists every recorded message when no state is given', () => {
    const result = applyCommand(createLarkspurWorld(), 'get-messages')

    expect(result.ok).toBe(true)
    expect(text(result)).toContain('Messages        : 6')
    expect(text(result)).toContain('msg-1001')
    expect(text(result)).toContain('msg-1006')
  })

  it('narrows the list to one delivery state', () => {
    const result = applyCommand(createLarkspurWorld(), 'get-messages quarantined')
    const output = text(result)

    expect(result.ok).toBe(true)
    expect(output).toContain('Messages        : 2 (quarantined)')
    expect(output).toContain('msg-1002')
    expect(output).toContain('msg-1003')
    expect(output).not.toContain('msg-1001')
    expect(output).not.toContain('msg-1004')
  })

  it('rejects a state the tenant does not record', () => {
    const result = applyCommand(createLarkspurWorld(), 'get-messages lost')

    expect(result.ok).toBe(false)
    expect(text(result)).toMatch(/'lost' is not a delivery state/)
  })

  it('says so when no mail is recorded in the state asked for', () => {
    const world = createLarkspurWorld()
    world.mail.messages = world.mail.messages.filter((message) => message.state !== 'blocked')

    const result = applyCommand(world, 'get-messages blocked')

    expect(result.ok).toBe(true)
    expect(text(result)).toMatch(/No mail is recorded as blocked/)
  })

  it('takes at most one state', () => {
    const result = applyCommand(createLarkspurWorld(), 'get-messages delivered quarantined')

    expect(result.ok).toBe(false)
    expect(text(result)).toMatch(/get-messages \[delivered\|quarantined\|blocked\|deferred\]/)
  })

  it('does not change any message when listing them', () => {
    const world = createLarkspurWorld()
    const before = JSON.stringify(world.mail.messages)
    applyCommand(world, 'get-messages deferred')

    expect(JSON.stringify(world.mail.messages)).toBe(before)
  })

  it('releases a held message and records the effect', () => {
    const world = createLarkspurWorld()
    const result = applyCommand(world, 'release-quarantine msg-1002')

    expect(result.ok).toBe(true)
    expect(result.effects).toEqual([
      {
        type: 'mail_released',
        target: 'msg-1002',
        details: { from: 'accounts@larkspur-payments.example', to: 'dana.whitfield@larkspur.example' },
      },
    ])
    const message = result.world.mail.messages.find((candidate) => candidate.id === 'msg-1002')
    expect(message?.state).toBe('delivered')
    expect(message?.events.at(-1)?.text).toMatch(/Released from quarantine/)
    // The stored world is untouched; only the copy the command ran on changed.
    expect(world.mail.messages.find((candidate) => candidate.id === 'msg-1002')?.state).toBe(
      'quarantined',
    )
  })

  it('refuses to release mail that is not held', () => {
    const result = applyCommand(createLarkspurWorld(), 'release-quarantine msg-1001')

    expect(result.ok).toBe(false)
    expect(text(result)).toMatch(/not held in quarantine/)
  })

  it('blocks a sender and drops the mail it has held', () => {
    const result = applyCommand(createLarkspurWorld(), 'block-sender accounts@larkspur-payments.example')

    expect(result.ok).toBe(true)
    expect(result.effects).toEqual([
      { type: 'sender_blocked', target: 'accounts@larkspur-payments.example' },
    ])
    expect(result.world.mail.blockedSenders).toContain('accounts@larkspur-payments.example')
    const message = result.world.mail.messages.find((candidate) => candidate.id === 'msg-1002')
    expect(message?.state).toBe('blocked')
  })

  it('clears an external forward', () => {
    const result = applyCommand(createLarkspurWorld(), 'clear-forwarding tbrooks')

    expect(result.effects).toEqual([
      {
        type: 'forwarding_cleared',
        target: 'tbrooks',
        details: { previous: 'theo.brooks.backup@example.net' },
      },
    ])
    const mailbox = result.world.mail.mailboxes.find((candidate) => candidate.userId === 'u-theo')
    expect(mailbox?.forwarding).toBeNull()

    expect(applyCommand(createLarkspurWorld(), 'clear-forwarding dwhitfield').ok).toBe(true)
  })
})

describe('remote desktop commands', () => {
  it('reads a machine state from the desk', () => {
    const world = createLarkspurWorld()
    deviceIn(world, 'lt-4472').pendingReboot = true

    const result = applyCommand(world, 'get-remote-machine LT-4472')
    const output = text(result)

    expect(result.ok).toBe(true)
    expect(output).toContain('Pending restart : True')
    expect(output).toContain('Disk free')
    expect(output).toContain('Marcus Chen')
  })

  it('opens and ends a session, recording both', () => {
    const world = createLarkspurWorld()
    const connected = applyCommand(world, 'connect-remote LT-4472')

    expect(connected.ok).toBe(true)
    expect(connected.effects[0]?.type).toBe('remote_connected')
    const session = connected.world.remoteSessions.find((candidate) => candidate.machineId === 'lt-4472')
    expect(session).toMatchObject({ state: 'active', userId: 'u-marcus' })

    const ended = applyCommand(connected.world, 'end-remote-session LT-4472')
    expect(ended.effects).toEqual([{ type: 'remote_ended', target: 'LT-4472' }])
    expect(
      ended.world.remoteSessions.find((candidate) => candidate.machineId === 'lt-4472')?.state,
    ).toBe('disconnected')
  })

  it('keeps several sessions open and switches the desktop between them', () => {
    const world = createLarkspurWorld()
    // The fixture ships one live session; two more machines are connected to.
    const second = applyCommand(world, 'connect-remote LT-4472')
    const third = applyCommand(second.world, 'connect-remote LT-9901')

    expect(
      third.world.remoteSessions
        .filter((session) => session.state === 'active')
        .map((session) => session.machineId)
        .sort(),
    ).toEqual(['lt-4472', 'lt-8813', 'lt-9901'])
    // The machine connected to last is the desktop in front of the desk.
    expect(focusedRemoteSession(third.world)?.machineId).toBe('lt-9901')

    const back = applyCommand(third.world, 'use-remote-session LT-4472')

    expect(back.ok).toBe(true)
    expect(focusedRemoteSession(back.world)?.machineId).toBe('lt-4472')
    // Choosing a desktop opens nothing and changes no machine, so it reports no
    // evidence: it is a view change, not work on a machine.
    expect(back.effects).toEqual([])
    expect(back.world.remoteSessions.filter((session) => session.state === 'active')).toHaveLength(3)
    expect(remoteDesktopView(back.world)?.hostname).toBe('LT-4472')
  })

  it('will not switch to a machine with no session open', () => {
    const result = applyCommand(createLarkspurWorld(), 'use-remote-session LT-4472')

    expect(result.ok).toBe(false)
    expect(text(result)).toMatch(/No active remote session is open on LT-4472/)
    expect(text(result)).toMatch(/connect-remote LT-4472/)
  })

  it('says so when the desktop asked for is already in front', () => {
    const connected = applyCommand(createLarkspurWorld(), 'connect-remote LT-4472')
    const again = applyCommand(connected.world, 'use-remote-session LT-4472')

    expect(again.ok).toBe(true)
    expect(text(again)).toMatch(/already the desktop in front of you/)
  })

  it('brings another open session forward when the one in view is ended', () => {
    const connected = applyCommand(createLarkspurWorld(), 'connect-remote LT-4472')
    expect(focusedRemoteSession(connected.world)?.machineId).toBe('lt-4472')

    const ended = applyCommand(connected.world, 'end-remote-session LT-4472')

    // LT-8813's session was open all along, so it is the desktop now; ending the
    // last one leaves the console with nothing to show.
    expect(remoteDesktopView(ended.world)?.hostname).toBe('LT-8813')
    const only = applyCommand(ended.world, 'end-remote-session LT-8813')
    expect(remoteDesktopView(only.world)).toBeNull()
  })

  it('marks which open session is in view, in the list and on the row', () => {
    const world = applyCommand(createLarkspurWorld(), 'connect-remote LT-4472').world

    const listed = text(applyCommand(world, 'get-sessions'))
    expect(listed).toMatch(/LT-4472 · active · in view/)
    expect(listed).toMatch(/LT-8813 · active\n/)

    const rows = remoteDesktopConsoleEntries(world)
    const other = rows.find((row) => row.id === 'LT-8813')
    const inView = rows.find((row) => row.id === 'LT-4472')
    // The other live session is one click away…
    expect(other?.subtitle).toMatch(/Session active/)
    expect(other?.actions.map((action) => action.id)).toContain(DESKTOP_ACTIONS.switchDesktop)
    // …while the desktop already on screen offers no way to “switch” to itself.
    expect(inView?.actions.map((action) => action.id)).not.toContain(
      DESKTOP_ACTIONS.switchDesktop,
    )
    expect(inView?.facts.find((fact) => fact.label === 'Session')?.value).toMatch(/in view/)
  })

  it('will not open a session to the machine it is already on', () => {
    const result = applyCommand(createLarkspurWorld(), 'connect-remote LT-4471')

    expect(result.ok).toBe(false)
    expect(text(result)).toMatch(/already working at LT-4471/)
  })

  it('clears a pending restart', () => {
    const world = createLarkspurWorld()
    deviceIn(world, 'lt-4472').pendingReboot = true

    const result = applyCommand(world, 'reboot-remote LT-4472')

    expect(result.effects).toEqual([{ type: 'machine_rebooted', target: 'LT-4472' }])
    expect(deviceIn(result.world, 'lt-4472').pendingReboot).toBe(false)
    expect(deviceIn(result.world, 'lt-4472').lastUpdateDays).toBe(0)
  })

  it('refuses to restart a server from a user session', () => {
    const result = applyCommand(createLarkspurWorld(), 'reboot-remote SRV-DC01')

    expect(result.ok).toBe(false)
    expect(text(result)).toMatch(/is a server/)
  })
})

describe('computer deployment commands', () => {
  it('lists the booked runs and reads one', () => {
    const world = createLarkspurWorld()
    const queue = applyCommand(world, 'get-deployment-queue')

    expect(text(queue)).toContain('SHELF-DT-0102 · Queued')
    expect(text(queue)).toContain('SHELF-DT-0302 · Failed')

    const one = applyCommand(world, 'get-deployment SHELF-DT-0302')
    expect(text(one)).toContain('Failed applying the driver pack: 0x80070005')
    expect(text(one)).toContain('Shelf state     : needs-image')
  })

  it('runs the sequence and marks the machine ready', () => {
    const result = applyCommand(createLarkspurWorld(), 'start-deployment SHELF-DT-0102')

    expect(result.ok).toBe(true)
    expect(result.effects.map((effect) => effect.type)).toEqual([
      'deployment_started',
      'deployment_completed',
    ])
    expect(stockIn(result.world, 'SHELF-DT-0102').state).toBe('ready')
    const task = result.world.deploymentTasks.find((candidate) => candidate.assetTag === 'SHELF-DT-0102')
    expect(task).toMatchObject({ state: 'complete', attempts: 1 })
  })

  it('will not image a machine that is held or waiting on parts', () => {
    const held = createLarkspurWorld()
    stockIn(held, 'SHELF-DT-0102').state = 'quarantined'
    expect(applyCommand(held, 'start-deployment SHELF-DT-0102').ok).toBe(false)

    const parts = createLarkspurWorld()
    stockIn(parts, 'SHELF-DT-0102').state = 'awaiting-parts'
    expect(text(applyCommand(parts, 'start-deployment SHELF-DT-0102'))).toMatch(/waiting on parts/)
  })

  it('does nothing to a sequence that already finished', () => {
    const result = applyCommand(createLarkspurWorld(), 'start-deployment SHELF-LT-0203')

    expect(result.ok).toBe(true)
    expect(text(result)).toMatch(/already finished its sequence/)
    expect(result.effects).toEqual([])
  })
})

describe('console projections for the new tools', () => {
  const world = createLarkspurWorld()

  it('lists every mailbox, with a trace action and forwarding only where it is set', () => {
    const entries = mailAdminConsoleEntries(world)

    expect(entries).toHaveLength(world.users.length)
    expect(new Set(entries.map((entry) => entry.id)).size).toBe(entries.length)

    const forwarded = entries.find((entry) => entry.id === 'tbrooks')
    expect(forwarded?.actions.map((action) => action.id)).toContain('clear-forwarding')

    const plain = entries.find((entry) => entry.id === 'dwhitfield')
    expect(plain?.actions.map((action) => action.id)).toEqual(['read-mailbox', 'trace-message'])
    expect(plain?.groups[0]?.items.some((item) => item.startsWith('msg-1002'))).toBe(true)
  })

  it('lists the held mail and offers release or a block', () => {
    const entries = mailSecurityConsoleEntries(world)

    expect(entries.map((entry) => entry.id)).toEqual(['msg-1002', 'msg-1003', 'msg-1004'])
    const quarantined = entries[0]
    expect(quarantined?.actions.map((action) => action.id)).toEqual([
      'trace-message',
      'release',
      'block-sender',
    ])
    // The block action names the sender on the record, so it runs in one press.
    expect(
      quarantined?.actions.find((action) => action.id === 'block-sender')?.command('msg-1002'),
    ).toBe('block-sender accounts@larkspur-payments.example')

    // The blocked message is already blocked, so only a release would remain —
    // and it is not held, so all it can log is the trace.
    expect(entries[2]?.actions.map((action) => action.id)).toEqual(['trace-message'])
    expect(entries[2]?.note?.length ?? 0).toBeGreaterThan(0)
  })

  it('reaches every user machine but not the servers or the one the desk is on', () => {
    const entries = remoteDesktopConsoleEntries(world)

    expect(entries.map((entry) => entry.id)).not.toContain('LT-4471')
    expect(entries.map((entry) => entry.id)).not.toContain('SRV-DC01')
    expect(entries.map((entry) => entry.id)).toContain('LT-4472')

    const active = entries.find((entry) => entry.id === 'LT-8813')
    expect(active?.subtitle).toContain('Session active')
    expect(active?.actions.map((action) => action.id)).toEqual([
      'read-machine',
      'end-session',
      'reboot',
      'check-updates',
      'cleanup',
      'flush-dns',
      'renew-lease',
      'sign-out',
      'default-printer',
      'clear-queue',
      'restart-spooler',
    ])

    // A disconnected machine offers no desktop controls until it is connected.
    const disconnected = entries.find((entry) => entry.id === 'LT-9901')
    expect(disconnected?.actions.map((action) => action.id)).toEqual([
      'read-machine',
      'connect',
      'reboot',
    ])
  })

  it('lists the deployment queue with the sequence that can be run', () => {
    const entries = deploymentConsoleEntries(world)

    expect(entries.map((entry) => entry.id)).toEqual([
      'SHELF-DT-0302',
      'SHELF-DT-0102',
      'SHELF-LT-0203',
    ])
    expect(entries[1]?.actions.map((action) => action.id)).toEqual(['read-deployment', 'start'])
    expect(entries[2]?.actions.map((action) => action.id)).toEqual(['read-deployment'])
  })

  it('runs their console actions through the same commands the terminal runs', () => {
    expect(findConsoleActionForCommand(world, 'get-mailbox tbrooks')).toMatchObject({
      consoleId: 'mail-admin',
      actionId: 'read-mailbox',
    })
    expect(findConsoleActionForCommand(world, 'trace-message msg-1002')).toMatchObject({
      consoleId: 'mail-admin',
      actionId: 'trace-message',
      args: ['msg-1002'],
    })
    expect(findConsoleActionForCommand(world, 'clear-forwarding tbrooks')).toMatchObject({
      consoleId: 'mail-admin',
      actionId: 'clear-forwarding',
    })
    expect(findConsoleActionForCommand(world, 'release-quarantine msg-1003')).toMatchObject({
      consoleId: 'mail-security',
      actionId: 'release',
    })
    expect(findConsoleActionForCommand(world, 'block-sender accounts@larkspur-payments.example')).toMatchObject({
      consoleId: 'mail-security',
      actionId: 'block-sender',
    })
    expect(findConsoleActionForCommand(world, 'get-remote-machine LT-4472')).toMatchObject({
      consoleId: 'remote-desktop',
      actionId: 'read-machine',
    })
    expect(findConsoleActionForCommand(world, 'get-deployment SHELF-DT-0302')).toMatchObject({
      consoleId: 'computer-deployment',
      actionId: 'read-deployment',
    })
    expect(findConsoleActionForCommand(world, 'connect-remote LT-4472')).toMatchObject({
      consoleId: 'remote-desktop',
      actionId: 'connect',
    })
    expect(findConsoleActionForCommand(world, 'start-deployment SHELF-DT-0102')).toMatchObject({
      consoleId: 'computer-deployment',
      actionId: 'start',
    })
    expect(findConsoleActionForCommand(world, 'remote-cleanup LT-8813')).toMatchObject({
      consoleId: 'remote-desktop',
      actionId: 'cleanup',
    })
    expect(
      findConsoleActionForCommand(world, 'remote-set-default-printer LT-8813 PRN-DEPOT-01'),
    ).toMatchObject({
      consoleId: 'remote-desktop',
      actionId: 'default-printer',
      args: ['PRN-DEPOT-01'],
    })
  })
})

describe('fake desktop projection and commands', () => {
  it('projects the active session, its user, and the site printers', () => {
    const world = createLarkspurWorld()
    const view = remoteDesktopView(world)

    expect(view).toMatchObject({
      entryId: 'LT-8813',
      hostname: 'LT-8813',
      userName: 'Theo Brooks',
      userAccount: 'tbrooks',
      signedIn: true,
      siteName: 'Larkspur Depot',
      ipMode: 'static',
      spoolerStatus: 'running',
      diskFreePercent: 38,
      lastUpdateDays: 30,
      pendingReboot: false,
    })
    expect(view?.printers.map((printer) => printer.name)).toEqual(['PRN-DEPOT-01'])
    expect(view?.printers[0]).toMatchObject({ isDefault: true, status: 'online', jobs: [] })
  })

  it('has no desktop when no session is active', () => {
    const world = createLarkspurWorld()
    for (const session of world.remoteSessions) {
      session.state = 'disconnected'
    }

    expect(remoteDesktopView(world)).toBeNull()
  })

  it('refuses desktop commands without an active session', () => {
    const result = applyCommand(createLarkspurWorld(), 'remote-flush-dns LT-4472')

    expect(result.ok).toBe(false)
    expect(text(result)).toMatch(/No active remote session is open on LT-4472/)
  })

  it('flushes DNS and frees disk space on the connected machine', () => {
    const world = createLarkspurWorld()

    const flushed = applyCommand(world, 'remote-flush-dns LT-8813')
    expect(flushed.effects).toEqual([{ type: 'dns_cache_flushed', target: 'LT-8813' }])

    const cleaned = applyCommand(flushed.world, 'remote-cleanup LT-8813')
    expect(cleaned.effects).toEqual([
      { type: 'disk_cleaned', target: 'LT-8813', details: { before: 38, after: 53 } },
    ])
    expect(deviceIn(cleaned.world, 'lt-8813').diskFreePercent).toBe(53)
  })

  it('installs updates, then asks for the restart they need', () => {
    const installed = applyCommand(createLarkspurWorld(), 'remote-check-updates LT-8813')

    expect(installed.effects).toEqual([
      {
        type: 'updates_installed',
        target: 'LT-8813',
        details: { installed: 5, pendingRestart: true },
      },
    ])
    expect(deviceIn(installed.world, 'lt-8813')).toMatchObject({
      lastUpdateDays: 0,
      pendingReboot: true,
    })

    const again = applyCommand(installed.world, 'remote-check-updates LT-8813')
    expect(again.ok).toBe(true)
    expect(text(again)).toMatch(/restart is still pending/)
    expect(again.effects).toEqual([])
  })

  it('renews a DHCP lease but refuses a static adapter', () => {
    const world = createLarkspurWorld()
    const staticResult = applyCommand(world, 'remote-renew-lease LT-8813')
    expect(staticResult.ok).toBe(false)
    expect(text(staticResult)).toMatch(/static address/)

    const connected = applyCommand(world, 'connect-remote LT-4472')
    const renewed = applyCommand(connected.world, 'remote-renew-lease LT-4472')
    expect(renewed.ok).toBe(true)
    expect(renewed.effects).toEqual([
      {
        type: 'lease_renewed',
        target: 'LT-4472',
        details: { address: '10.20.4.58', server: '10.20.4.12' },
      },
    ])
    expect(deviceIn(renewed.world, 'lt-4472').dhcpLease).toMatchObject({
      server: '10.20.4.12',
      obtainedAt: renewed.world.clock,
    })
  })

  it('signs the user out without ending the support session', () => {
    const result = applyCommand(createLarkspurWorld(), 'remote-sign-out LT-8813')

    expect(result.effects).toEqual([
      { type: 'user_signed_out', target: 'LT-8813', details: { user: 'Theo Brooks' } },
    ])
    expect(deviceIn(result.world, 'lt-8813').loggedInUserId).toBeNull()
    expect(
      result.world.remoteSessions.find((session) => session.machineId === 'lt-8813')?.state,
    ).toBe('active')
  })

  it('sets a default printer and clears a queue from the desktop', () => {
    const connected = applyCommand(createLarkspurWorld(), 'connect-remote LT-4472')

    const changed = applyCommand(connected.world, 'remote-set-default-printer LT-4472 PRN-FIN-01')
    expect(changed.effects).toEqual([
      { type: 'default_printer_changed', target: 'PRN-FIN-01' },
    ])
    expect(deviceIn(changed.world, 'lt-4472').defaultPrinterId).toBe('prn-fin-01')

    const cleared = applyCommand(changed.world, 'remote-clear-printqueue LT-4472 PRN-FIN-01')
    expect(cleared.effects).toEqual([
      {
        type: 'print_queue_cleared',
        target: 'PRN-FIN-01',
        details: { printer: 'PRN-FIN-01', clearedJobs: 1, broughtOnline: false },
      },
    ])
    expect(cleared.world.printers.find((printer) => printer.name === 'PRN-FIN-01')?.jobs).toEqual([])
  })

  it('refuses to clear a queue while the spooler is stopped, then restarts it', () => {
    const world = createLarkspurWorld()
    const device = deviceIn(world, 'lt-8813')
    device.spoolerStatus = 'stopped'

    const refused = applyCommand(world, 'remote-clear-printqueue LT-8813 PRN-DEPOT-01')
    expect(refused.ok).toBe(false)
    expect(text(refused)).toMatch(/Print Spooler on LT-8813 is stopped/)

    const restarted = applyCommand(world, 'remote-restart-spooler LT-8813')
    expect(restarted.effects).toEqual([
      { type: 'spooler_restarted', target: 'LT-8813' },
    ])
    expect(deviceIn(restarted.world, 'lt-8813').spoolerStatus).toBe('running')
  })
})

describe('values an action offers', () => {
  const world = createLarkspurWorld()

  /** Every declared input on every console, with the action that owns it. */
  function declaredInputs(evidence: ConsoleEvidence = []) {
    return CONSOLE_IDS.flatMap((consoleId) =>
      consoleEntries(world, consoleId, evidence).flatMap((entry) =>
        entry.actions.flatMap((action) =>
          (action.args ?? []).map((argument) => ({ consoleId, entry, action, argument })),
        ),
      ),
    )
  }

  /** The lines a command really printed, in the shape the console reads back. */
  function evidenceFor(useWorld: World, ...commands: string[]): ConsoleEvidence {
    return commands.map((command) => ({
      command,
      lines: applyCommand(useWorld, command).lines.map((entry) => ({ text: entry.text })),
    }))
  }

  function releaseLeaseAction(evidence: ConsoleEvidence) {
    return consoleEntries(world, 'server-room', evidence)
      .find((entry) => entry.id === 'hq')
      ?.actions.find((action) => action.id === 'site-release-lease')
  }

  it('offers only values the action would accept, and never a list longer than the row', () => {
    const inputs = [...declaredInputs(), ...declaredInputs(evidenceFor(world, 'get-dhcp-scope hq'))]

    for (const input of inputs) {
      const choices = input.argument.choices ?? []
      const label = `${input.consoleId}/${input.entry.id}/${input.action.id}/${input.argument.id}`
      expect(choices.length, label).toBeLessThanOrEqual(12)
      expect(new Set(choices).size, label).toBe(choices.length)
      for (const choice of choices) {
        expect(input.argument.validate(choice), `${label} → ${choice}`).toBe(true)
        expect(choice.trim()).toBe(choice)
      }
    }
  })

  it('offers nothing for a lease until a scope check has named an address', () => {
    expect(releaseLeaseAction([])?.args?.[0]?.choices).toEqual([])

    // An unrelated command names no addresses, so there is still nothing to offer.
    expect(releaseLeaseAction(evidenceFor(world, 'ipconfig /all'))?.args?.[0]?.choices).toEqual([])

    // A check on another site says nothing about this one's pool.
    expect(
      releaseLeaseAction(evidenceFor(world, 'get-dhcp-scope depot'))?.args?.[0]?.choices,
    ).toEqual([])
  })

  it('offers the leases the scope check printed, without saying which is safe', () => {
    const action = releaseLeaseAction(evidenceFor(world, 'get-dhcp-scope hq'))
    const choices = action?.args?.[0]?.choices ?? []
    const scope = findScope(world, 'hq')
    expect(scope).toBeDefined()

    // The lease table, in the order the report printed it.
    const ordered = [...(scope?.leases ?? [])].sort((left, right) => {
      if (left.state !== right.state) {
        return left.state === 'stale' ? -1 : 1
      }
      return left.address.localeCompare(right.address, undefined, { numeric: true })
    })
    expect(choices).toEqual(ordered.map((lease) => lease.address))

    // An excluded address is held by nobody, so it is not a lease to release.
    for (const excluded of scope?.exclusions ?? []) {
      expect(choices).not.toContain(excluded)
    }

    // The values are offered; the state column that says which lease is stale is
    // still only in the command's output.
    expect(action?.detail).not.toMatch(/stale|safe|in use/i)
    expect(action?.args?.[0]?.hint).not.toMatch(/stale|safe|in use/i)
  })

  it('keeps the collected addresses in the chips, not in the records', () => {
    const evidence = evidenceFor(world, 'get-dhcp-scope hq')
    const scope = findScope(world, 'hq')

    for (const entry of consoleEntries(world, 'server-room', evidence)) {
      const record = JSON.stringify({
        subtitle: entry.subtitle,
        facts: entry.facts,
        groups: entry.groups,
      })
      for (const lease of scope?.leases ?? []) {
        expect(record).not.toContain(lease.address)
      }
    }
  })

  it('reads only the latest report for a site, so a retest supersedes an old look', () => {
    const addressRow = (address: string) => ({ text: `${address.padEnd(16)}LT-0001           active` })
    const evidence: ConsoleEvidence = [
      {
        command: 'get-dhcp-scope hq',
        lines: [{ text: 'Exclusions  : (none)' }, addressRow('10.20.4.90'), addressRow('10.20.4.91')],
      },
      {
        command: 'get-dhcp-scope hq',
        lines: [{ text: 'Exclusions  : (none)' }, addressRow('10.20.4.91')],
      },
    ]

    expect(releaseLeaseAction(evidence)?.args?.[0]?.choices).toEqual(['10.20.4.91'])
  })

  it('leaves the File Shares console without candidates for either input', () => {
    const entries = sharesConsoleEntries(world)
    const accounts = new Set(world.users.map((user) => user.samAccountName))
    const groups = new Set(world.groups.map((group) => group.name))

    for (const entry of entries) {
      for (const action of entry.actions) {
        for (const argument of action.args ?? []) {
          // Who can reach a share is what these checks are for: offering the
          // directory or the group list here would hand the answer over.
          expect(argument.choices ?? []).toEqual([])
        }
      }
    }

    expect(JSON.stringify(entries)).not.toContain('LARKSPUR\\')
    for (const name of [...accounts, ...groups]) {
      expect(JSON.stringify(entries)).not.toContain(name)
    }
  })

  it('offers the message ids the mailbox listed, and none to a mailbox with no mail', () => {
    const mailboxes = mailAdminConsoleEntries(world)
    const mailbox = mailboxes.find((entry) => entry.id === 'dwhitfield')
    const messages = mailbox?.groups[0]?.items.map((item) => item.split(' · ')[0]) ?? []
    const trace = mailbox?.actions.find((action) => action.id === 'trace-message')
    expect(messages.length).toBeGreaterThan(0)
    // The ids, in the order the rows above them are listed.
    expect(trace?.args?.[0]?.choices).toEqual(messages)

    // A mailbox that has taken no mail lists no rows, so it offers no ids: the
    // rest of the tenant is not this mailbox's evidence.
    const quiet = mailboxes.find((entry) => entry.groups[0]?.items.length === 0)
    expect(quiet).toBeDefined()
    expect(quiet?.actions.find((action) => action.id === 'trace-message')?.args?.[0]?.choices)
      .toEqual([])
  })

  it('offers the printers the machine can reach, without marking the stuck queue', () => {
    const machine = remoteDesktopConsoleEntries(world).find(
      (entry) => entry.id === deviceIn(world, 'lt-8813').hostname,
    )
    const reachable = world.printers
      .filter((printer) => printer.siteId === deviceIn(world, 'lt-8813').siteId)
      .map((printer) => printer.name)
      .sort((left, right) => left.localeCompare(right))
    const queues = machine?.actions.find((action) => action.id === DESKTOP_ACTIONS.clearQueue)

    expect(reachable.length).toBeGreaterThan(0)
    expect(queues?.args?.[0]?.choices).toEqual(reachable)
    expect(queues?.args?.[0]?.hint).not.toMatch(/default|stuck|jammed/i)

    // A site with more than one printer is a real decision: every printer at the
    // site is offered, not only the one holding jobs.
    const twoPrinters = createLarkspurWorld()
    const depotPrinter = twoPrinters.printers.find((printer) => printer.siteId === 'depot')
    expect(depotPrinter).toBeDefined()
    twoPrinters.printers.push({
      ...(depotPrinter as NonNullable<typeof depotPrinter>),
      id: 'prn-depot-02',
      name: 'PRN-DEPOT-02',
      shareName: 'PRN-DEPOT-02',
      jobs: [],
    })
    const choices = remoteDesktopConsoleEntries(twoPrinters)
      .find((entry) => entry.id === deviceIn(twoPrinters, 'lt-8813').hostname)
      ?.actions.find((action) => action.id === DESKTOP_ACTIONS.clearQueue)?.args?.[0]?.choices
    expect(choices).toEqual(['PRN-DEPOT-01', 'PRN-DEPOT-02'])
  })
})

describe('tool catalog', () => {
  it('puts every registered console on the shelf exactly once', () => {
    const ids = TOOL_CATALOG.map((tool) => tool.id)

    expect(ids.length).toBe(new Set(ids).size)
    expect([...ids].sort()).toEqual([...CONSOLE_IDS].sort())
  })

  it('opens every console the shelf lists', () => {
    const world = createLarkspurWorld()

    for (const consoleId of CONSOLE_IDS) {
      expect(consoleEntries(world, consoleId).length).toBeGreaterThan(0)
    }
  })
})
