// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { seedState } from '../../../src/modules/azure/data/seed'
import { runAzureCommand, type AzurePlan } from '../../../src/modules/azure/logic/commands'

function printed(plan: AzurePlan): string {
  if (plan.kind !== 'print') {
    throw new Error(`expected the shell to print, but it asked for a ${plan.kind}`)
  }
  return plan.response.lines.map((entry) => entry.text).join('\n')
}

describe('the Azure shell', () => {
  it('lists its commands and says where deletes live', () => {
    const output = printed(runAzureCommand(seedState(), 'help'))

    expect(output).toContain('az resource list')
    expect(output).toContain('az role assignment create')
    expect(output).toContain('Deleting a machine or a group is not here')
  })

  it('lists the subscription with a cost column', () => {
    const output = printed(runAzureCommand(seedState(), 'az resource list'))

    expect(output).toContain('Cost')
    expect(output).toContain('stharbourapps')
    expect(output).toContain('13 resources.')
  })

  it('reads a record, its findings and the read it records', () => {
    const plan = runAzureCommand(seedState(), 'az resource show --name stharbourapps')

    expect(plan.kind).toBe('read')
    if (plan.kind !== 'read') {
      return
    }

    const record = plan.record.map((entry) => entry.text).join('\n')
    expect(plan.resourceId).toBe('res-st-apps')
    expect(record).toContain('Public blob access')
    expect(record).toContain('enabled')
    expect(record).toContain('rg-harbour-prod')
    expect(record).toContain('Findings')
  })

  it('matches a name however it is typed, and takes the flag either way', () => {
    expect(runAzureCommand(seedState(), 'az resource show --name STHARBOURAPPS').kind).toBe('read')
    expect(runAzureCommand(seedState(), 'az resource show --name=stharbourapps').kind).toBe('read')
  })

  it('names the resources when a name misses', () => {
    const output = printed(runAzureCommand(seedState(), 'az resource show --name nothing-here'))

    expect(output).toContain('No resource named')
    expect(output).toContain('az resource list')
  })

  it('asks for the action the page would run, rather than running it itself', () => {
    expect(runAzureCommand(seedState(), 'az vm deallocate --name vm-app-01')).toEqual({
      kind: 'act',
      resourceId: 'res-vm-app-01',
      action: 'deallocate',
    })
  })

  it('turns a storage flag into the action that sets it', () => {
    expect(
      runAzureCommand(
        seedState(),
        'az storage account update --name stharbourapps --allow-blob-public-access false',
      ),
    ).toEqual({ kind: 'act', resourceId: 'res-st-apps', action: 'restrict-public-access' })

    expect(
      runAzureCommand(
        seedState(),
        'az storage account update --name stharbourlogs --min-tls-version TLS1_2',
      ),
    ).toEqual({ kind: 'act', resourceId: 'res-st-logs', action: 'require-tls' })
  })

  it('opens a port on the group the rule belongs to', () => {
    expect(
      runAzureCommand(seedState(), 'az network nsg rule create --nsg nsg-web-prod --port 443'),
    ).toEqual({
      kind: 'act',
      resourceId: 'res-nsg-web',
      action: 'open-port',
      port: 443,
    })
  })

  it('grants a role to the principal the id names', () => {
    expect(
      runAzureCommand(
        seedState(),
        'az role assignment create --name app-portal --assignee usr-contractor --role Owner',
      ),
    ).toEqual({
      kind: 'act',
      resourceId: 'res-app-portal',
      action: 'assign-role',
      principal: 'usr-contractor',
      role: 'Owner',
    })
  })

  it('refuses to delete from the shell', () => {
    const output = printed(runAzureCommand(seedState(), 'az vm delete --name vm-app-01'))

    expect(output).toContain('not available in the shell')
    expect(output).toContain('resource page')
  })

  it('says so when it does not know the command', () => {
    const output = printed(runAzureCommand(seedState(), 'az nonsense --name vm-app-01'))

    expect(output).toContain('Unrecognised command')
    expect(output).toContain('Type help')
  })
})
