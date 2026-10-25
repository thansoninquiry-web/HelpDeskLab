import {
  isPortOpenToInternet,
  roleOver,
} from '../logic/diagnostics'
import type { AzureResource, AzureState, ResourceAction } from '../types'

/**
 * The nine tickets this console can hand out.
 *
 * Each names a resource, the actions the reference answer takes, and a check
 * that reads the estate afterwards. The check is the definition of "done": a
 * learner who reaches the same end state another way still closes the ticket,
 * which is the point of verifying state rather than keystrokes.
 */
export type AzureTicketCategory = 'compute' | 'cost' | 'network' | 'security'

export interface AzureTicketTemplate {
  id: string
  title: string
  difficulty: 1 | 2 | 3
  category: AzureTicketCategory
  /** The seeded resource the request is about. */
  resourceId: string
  subject: string
  body: string
  /** The reference path, in order. */
  expectedActions: readonly ResourceAction[]
  /** What has to be true afterwards. */
  verify(resource: AzureResource, state: AzureState): boolean
  /** One line naming the end state, shown wherever the ticket is summarised. */
  resolution: string
  /** Why the path is the right one, in the debrief's own words. */
  explanation: string
  hints: readonly string[]
}

export const AZURE_TICKET_TEMPLATES: readonly AzureTicketTemplate[] = [
  {
    id: 'tpl-vm-stopped',
    title: 'Finance box is down after the weekend',
    difficulty: 1,
    category: 'compute',
    resourceId: 'res-vm-fin-01',
    subject: 'vm-fin-01 is not responding and month-end is tomorrow',
    body:
      'The finance reporting machine has been unreachable since Saturday. Nobody can log in and the nightly export did not run. The console says the machine is still there, so I do not think anything was deleted. Please get it back before the close.',
    expectedActions: ['start'],
    verify: (resource) =>
      resource.properties.kind === 'vm' && resource.properties.power === 'running',
    resolution: 'The virtual machine is running again.',
    explanation:
      'A deallocated machine is not broken; it has been switched off at the platform level. Starting it is the whole fix, and it keeps the disks, the network settings and the machine name. Deleting and rebuilding is slower, loses the local state on the OS disk, and is how a small outage becomes an afternoon.',
    hints: [
      'Open the machine and read its power state before changing anything.',
      'Deallocated means switched off at the platform, not a crashed guest.',
      'Start the machine and re-read the record to confirm it is running.',
    ],
  },
  {
    id: 'tpl-vm-idle-cost',
    title: 'Development machine has been running since Friday',
    difficulty: 1,
    category: 'cost',
    resourceId: 'res-vm-dev-04',
    subject: 'Cost alert: vm-dev-04 has been up all weekend',
    body:
      'Spend is over the monthly budget again and the dashboard points at the dev machine. Its tag says business hours, but it has been running since Friday evening and nobody has logged into it. We still need it on Monday.',
    expectedActions: ['deallocate'],
    verify: (resource) =>
      resource.properties.kind === 'vm' && resource.properties.power === 'deallocated',
    resolution: 'The machine is deallocated, so it bills no compute until Monday.',
    explanation:
      'A machine that is merely shut down in the guest still holds its allocation and bills for it. Deallocating releases the compute and stops the meter while keeping the disks, so Monday starts where Friday left off. Deleting the machine would also stop the bill, and would also delete the machine.',
    hints: [
      'Read the record: the tag says business hours, the power state says otherwise.',
      'A shutdown inside the guest is not a deallocation.',
      'Deallocate it. The disks and the machine survive; only the compute is released.',
    ],
  },
  {
    id: 'tpl-app-throttled',
    title: 'Portal times out every lunchtime',
    difficulty: 2,
    category: 'compute',
    resourceId: 'res-app-portal',
    subject: 'app-portal is slow at lunch and returns 503s',
    body:
      'Between twelve and two the staff portal takes about ten seconds a page and sometimes returns a 503. It is fine first thing and fine after three. The code has not changed and there are no errors in the application log, just the gateway timing out.',
    expectedActions: ['scale-up'],
    verify: (resource) =>
      resource.properties.kind === 'webapp' && resource.properties.planSku !== 'Free',
    resolution: 'The app is on a paid plan with no daily CPU quota.',
    explanation:
      'A Free plan has a daily CPU quota; when the lunchtime crowd uses it up the site is throttled rather than broken, which is why the application log is clean while the gateway times out. Moving to a paid plan removes the quota. Restarting the app would reset the symptoms and leave the ticket open tomorrow.',
    hints: [
      'Read the App Service record, not just the request log.',
      'A clean application log beside a gateway timeout points at the platform, not the code.',
      'The plan’s quota is the limit being hit. Move it to a paid plan.',
    ],
  },
  {
    id: 'tpl-storage-public',
    title: 'Blob links work without signing in',
    difficulty: 2,
    category: 'security',
    resourceId: 'res-st-apps',
    subject: 'Security review: anonymous blob reads on stharbourapps',
    body:
      'A reviewer sent us a screenshot: they opened one of our invoice blobs in a private browser window, with no account, and it downloaded. The account holds customer documents. We cannot break the portal, which reads the same container.',
    expectedActions: ['restrict-public-access'],
    verify: (resource) =>
      resource.properties.kind === 'storage' && !resource.properties.publicBlobAccess,
    resolution: 'Anonymous blob access is off; reads need a signed request.',
    explanation:
      'Public blob access is an account-level switch that makes anonymous reads possible; the portal can keep working with a managed identity or a shared access signature. Turning the switch off is the fix. Rotating keys does not close anonymous reads, and deleting the account would take the customer documents with it.',
    hints: [
      'Read the storage record and find which setting allows an anonymous read.',
      'Keys are not the problem here: no key was used.',
      'Turn off public blob access. The portal needs a signed request afterwards.',
    ],
  },
  {
    id: 'tpl-storage-soft-delete',
    title: 'Backup was overwritten and cannot be restored',
    difficulty: 2,
    category: 'security',
    resourceId: 'res-st-backups',
    subject: 'A bad job overwrote last night’s backup',
    body:
      'A misconfigured job wrote an empty file over the nightly backup, and the console offers no restore point. The account is fine otherwise. We need the next mistake to be recoverable rather than to change how the job runs.',
    expectedActions: ['enable-soft-delete'],
    verify: (resource) =>
      resource.properties.kind === 'storage' && resource.properties.softDeleteDays > 0,
    resolution: 'Deleted or overwritten blobs are retained for 30 days.',
    explanation:
      'Soft delete keeps a deleted or overwritten blob for a retention period so it can be brought back, and it is a property of the account rather than of the job that broke it. Turning it on protects the next write, not the one that already happened: the lost backup stays lost, and the ticket should say so.',
    hints: [
      'Read the account’s data-protection settings.',
      'The job is already fixed; the account has no retention at all.',
      'Turn on soft delete. It protects future writes, not the file already lost.',
    ],
  },
  {
    id: 'tpl-storage-tls',
    title: 'Security scan flags TLS 1.0 on a storage account',
    difficulty: 1,
    category: 'security',
    resourceId: 'res-st-logs',
    subject: 'Scanner: stharbourlogs accepts TLS 1.0',
    body:
      'The quarterly scan lists the log storage account as accepting TLS 1.0. Nothing else on the account was flagged, and the log shipper already supports TLS 1.2. We need the finding cleared without changing where the logs go.',
    expectedActions: ['require-tls'],
    verify: (resource) =>
      resource.properties.kind === 'storage' && resource.properties.tlsMin === '1.2',
    resolution: 'The account refuses anything older than TLS 1.2.',
    explanation:
      'The minimum TLS version is a single account setting, and raising it is the whole fix when every client can already speak 1.2. It refuses old clients rather than quietly negotiating down, so the change should be made with the client list in hand — here the log shipper is already compliant.',
    hints: [
      'Read the account record and find the protocol setting.',
      'The finding is about the minimum accepted version, not about a certificate.',
      'Require TLS 1.2 and confirm the shipper still connects.',
    ],
  },
  {
    id: 'tpl-rbac-owner',
    title: 'Contractor holds Owner on the production group',
    difficulty: 3,
    category: 'security',
    resourceId: 'res-vm-app-01',
    subject: 'Access review: Rowan Vale is Owner on rg-harbour-prod',
    body:
      'The access review picked up a contractor with Owner on the production resource group. Rowan deploys the portal and needs to keep doing that, but should not be able to grant access or delete the group. Their engagement ends next month.',
    expectedActions: ['assign-role'],
    verify: (_resource, state) =>
      roleOver(state, 'rg-harbour-prod', 'usr-contractor') === 'Contributor',
    resolution: 'Rowan Vale holds Contributor on the production group, not Owner.',
    explanation:
      'Contributor can deploy and manage resources; Owner can also grant access and delete anything, which is the part a contractor should not have. Changing the assignment keeps the work possible and shrinks the blast radius. Removing access entirely would stop the deployments the ticket says must continue.',
    hints: [
      'Read the record and find the role that is wider than the job.',
      'The ticket keeps the deployment work: the role needs to shrink, not disappear.',
      'Change Rowan’s assignment on the group to Contributor.',
    ],
  },
  {
    id: 'tpl-nsg-blocks-https',
    title: 'Portal is unreachable over HTTPS',
    difficulty: 2,
    category: 'network',
    resourceId: 'res-nsg-web',
    subject: 'app-portal works on http:// and times out on https://',
    body:
      'Since the network group was tightened yesterday, the portal loads over plain HTTP and hangs on HTTPS. The app itself is healthy and the certificate is fine. Nobody changed the app; the only change was to the security group in front of it.',
    expectedActions: ['open-port'],
    verify: (resource, state) => isPortOpenToInternet(state.nsgRules, resource.id, 443),
    resolution: 'Inbound HTTPS is allowed to the portal from the internet.',
    explanation:
      'A network security group ends with an implicit deny, so removing the old 443 rule silently closed HTTPS while leaving HTTP working. Opening 443 restores the path without touching the application. Replacing the whole group with a permissive one would also work and would reopen everything else it was tightened to close.',
    hints: [
      'Read the network group’s inbound rules and look for what is missing.',
      'The app answers; the packet never arrives.',
      'Open 443 inbound from the internet, leaving the rest of the rules alone.',
    ],
  },
  {
    id: 'tpl-nsg-open-rdp',
    title: 'RDP is open to the internet',
    difficulty: 2,
    category: 'network',
    resourceId: 'res-nsg-jump',
    subject: 'Scanner: 3389 open to the world on nsg-jump-prod',
    body:
      'The scan found RDP reachable from the internet on the jump host group. Staff connect through the VPN, and the rule was added for a contractor who has since left. Nobody needs to reach 3389 from outside the office network.',
    expectedActions: ['close-port'],
    verify: (resource, state) => !isPortOpenToInternet(state.nsgRules, resource.id, 3389),
    resolution: 'RDP is no longer reachable from the internet.',
    explanation:
      'An allow rule for 3389 from the internet is a standing invitation, and the VPN already covers the people who need it. Removing the rule puts the default deny back. Narrowing the source and leaving the rule is a second-best answer; the ticket says nobody needs it from outside.',
    hints: [
      'Read the inbound rules and find the port that should not be there.',
      'The people who need RDP already use the VPN.',
      'Close 3389 from the internet, leaving the other rules in place.',
    ],
  },
]
