/**
 * The names the interface gives the scenario families. Kept in one place so a
 * lesson and the queue it links to call the same tickets the same thing.
 */
const FAMILY_LABELS: Readonly<Record<string, string>> = {
  'PWD-01': 'Accounts',
  'NET-01': 'Network',
  'DHCP-01': 'DHCP',
  'M365-01': 'Microsoft 365',
  'FS-01': 'File shares',
  'PRN-01': 'Printing',
  'MAIL-01': 'Mailboxes',
  'MAILSEC-01': 'Mail security',
  'RDP-01': 'Remote desktop',
  'DEP-01': 'Computer deployment',
}

export function familyLabel(family: string): string {
  return FAMILY_LABELS[family] ?? family
}
