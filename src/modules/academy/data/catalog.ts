import type { AcademyArea, ChangeId, ReadId } from '../types'

/**
 * The reads and changes the school desk can make, named once.
 *
 * A scenario chooses from these lists rather than writing its own buttons, so a
 * cable swap is the same change in every room and the reference path, the action
 * list and the debrief cannot describe it three ways.
 */

export const READS: Readonly<Record<ReadId, { label: string; detail: string; where: 'room' | 'machine' | 'console' }>> = {
  'room-schedule': {
    label: 'Read the room timetable',
    detail: 'Which class is in the room, and when the next one starts.',
    where: 'console',
  },
  'projector-status': {
    label: 'Read the projector status page',
    detail: 'Input, lamp hours, filter state and the last fault it logged.',
    where: 'room',
  },
  'hdmi-handshake': {
    label: 'Check the cable and the input light',
    detail: 'Which cable is in which port, and whether the source sees a display.',
    where: 'room',
  },
  'lamp-hours': {
    label: 'Read the lamp hours and filter state',
    detail: 'How far through its rated life the lamp is, and how blocked the filter is.',
    where: 'room',
  },
  'account-status': {
    label: 'Read the account in the directory',
    detail: 'Locked or not, when the password expires, and what the last sign-in said.',
    where: 'console',
  },
  'image-report': {
    label: "Read the imaging agent's report",
    detail: 'Which image the machine last applied, and whether it verified.',
    where: 'machine',
  },
  'lab-console': {
    label: 'Read the lab management console',
    detail: 'Image version, the machines that failed to apply it, and the rollout log.',
    where: 'console',
  },
  'device-manager': {
    label: 'Open Device Manager on the machine',
    detail: 'Which devices are missing a driver or reporting an error.',
    where: 'machine',
  },
  'audio-devices': {
    label: 'Read the audio devices',
    detail: 'The default output, its level, and whether it is muted.',
    where: 'machine',
  },
  'print-queue': {
    label: 'Read the print queue',
    detail: 'What is stuck, which printer it is aimed at, and why it stopped.',
    where: 'console',
  },
  'printer-config': {
    label: 'Read the printer settings',
    detail: 'Address, tray, scan destination and the account it signs in with.',
    where: 'console',
  },
  'filter-log': {
    label: 'Read the web filter block log',
    detail: 'The category the site is filed under, and who requested the block.',
    where: 'console',
  },
  'drive-mapping': {
    label: 'Check the mapped drives and the logon script',
    detail: 'Which drives the session has, and what the script tried to map.',
    where: 'machine',
  },
  'wifi-clients': {
    label: "Read the access point's client list",
    detail: 'How many clients are associated, on which band, and the airtime.',
    where: 'console',
  },
  'ap-status': {
    label: 'Read the access point status and its switch port',
    detail: 'Up or down, power draw and the port it is patched into.',
    where: 'console',
  },
  'rssi-survey': {
    label: 'Walk the room and read the signal',
    detail: 'Signal strength at the teacher desk, the back row and the door.',
    where: 'room',
  },
  'dhcp-scope': {
    label: 'Read the DHCP scope',
    detail: 'Addresses in use, leases left, and how long a lease lasts.',
    where: 'console',
  },
  'switch-port': {
    label: "Read the switch port's VLAN and link",
    detail: 'Which VLAN the port is in, its speed, and whether it is up.',
    where: 'console',
  },
  'cart-status': {
    label: "Read the cart's charge controller",
    detail: 'Which bays are charging, the timer setting, and the supply voltage.',
    where: 'room',
  },
  'inventory-record': {
    label: 'Read the asset record',
    detail: 'The tag, the room it is assigned to, and whether it is on loan.',
    where: 'console',
  },
  'screen-condition': {
    label: 'Inspect the panel and the hinge',
    detail: 'Cracks, pressure marks, and whether the lid closes square.',
    where: 'room',
  },
  'charger-test': {
    label: 'Test the charger and the port',
    detail: 'The voltage at the barrel, and whether the machine charges from it.',
    where: 'room',
  },
  'disk-health': {
    label: "Read the drive's SMART report",
    detail: "Reallocated sectors and the drive's own health verdict.",
    where: 'machine',
  },
  'login-timing': {
    label: 'Time a login on the machine',
    detail: 'How long from the password to the desktop, and what it waits on.',
    where: 'machine',
  },
  'loan-record': {
    label: 'Read the loan record',
    detail: 'Who the machine is booked to, when it is due back, and what went out with it.',
    where: 'console',
  },
}

export const CHANGES: Readonly<
  Record<ChangeId, { label: string; detail: string; kind: 'fix' | 'neutral' | 'harmful' }>
> = {
  'reseat-hdmi': {
    label: 'Reseat the HDMI cable',
    detail: 'Push the cable home at both ends and check the source light.',
    kind: 'fix',
  },
  'replace-hdmi': {
    label: 'Replace the HDMI cable',
    detail: 'Fit a known-good cable from the kit.',
    kind: 'fix',
  },
  'select-input': {
    label: 'Select the right input',
    detail: 'Put the projector on the source the laptop is actually plugged into.',
    kind: 'fix',
  },
  'power-cycle-projector': {
    label: 'Power-cycle the projector',
    detail: 'Shut it down properly, wait for the fan, and bring it back.',
    kind: 'fix',
  },
  'clean-filter': {
    label: 'Clean the projector filter',
    detail: 'Vacuum the filter and clear the over-temperature warning.',
    kind: 'fix',
  },
  'replace-lamp': {
    label: 'Fit a new lamp',
    detail: 'Replace the lamp module and reset the lamp hours.',
    kind: 'fix',
  },
  'unlock-account': {
    label: 'Unlock the account',
    detail: 'Clear the lockout now that the person is at the desk in front of you.',
    kind: 'fix',
  },
  'reset-password': {
    label: 'Reset the password',
    detail: 'Set a temporary password and require a change at the next sign-in.',
    kind: 'fix',
  },
  'reimage-machine': {
    label: 'Reimage the machine',
    detail: 'Apply the golden image and let it verify before the room is used.',
    kind: 'fix',
  },
  'rollback-image': {
    label: 'Roll the lab image back',
    detail: 'Return the lab to the last image that passed its rollout.',
    kind: 'fix',
  },
  'rebuild-profile': {
    label: "Rebuild the user's profile",
    detail: 'Create a clean profile and copy back the documents the user needs.',
    kind: 'fix',
  },
  'reinstall-driver': {
    label: 'Reinstall the device driver',
    detail: 'Remove the device and let the signed driver install again.',
    kind: 'fix',
  },
  'set-default-audio': {
    label: 'Set the correct default output',
    detail: 'Point playback at the room speakers rather than the laptop.',
    kind: 'fix',
  },
  'unmute-output': {
    label: 'Unmute the output',
    detail: 'Bring the level up and clear the mute on the room amplifier.',
    kind: 'fix',
  },
  'clear-jam': {
    label: 'Clear the paper jam',
    detail: 'Open the trays and the rear door and pull the sheet in the direction of travel.',
    kind: 'fix',
  },
  'reload-paper': {
    label: 'Reload the tray',
    detail: 'Fan the stock and load the tray the job is asking for.',
    kind: 'fix',
  },
  'restart-spooler': {
    label: 'Restart the Print Spooler',
    detail: 'Restart the service so the queue can move again.',
    kind: 'fix',
  },
  'set-default-printer': {
    label: 'Set the correct default printer',
    detail: 'Point the room at its own printer rather than the office multifunction.',
    kind: 'fix',
  },
  'clear-queue': {
    label: 'Clear the stuck queue',
    detail: 'Remove the held jobs so the printer can start again.',
    kind: 'fix',
  },
  'test-print': {
    label: 'Send a test page',
    detail: 'Print one page from the machine that reported the fault.',
    kind: 'fix',
  },
  'fix-scan-settings': {
    label: 'Correct the scan-to-email settings',
    detail: 'Point the scan profile at the right account and test it.',
    kind: 'fix',
  },
  'recategorise-site': {
    label: 'Ask the filter team to recategorise the site',
    detail: 'Raise the request with the category and the reason the lesson needs it.',
    kind: 'fix',
  },
  'pause-filter-for-testing': {
    label: 'Pause the filter for the testing window',
    detail: 'Use the assessment exception, scoped to the lab and the window.',
    kind: 'fix',
  },
  'remap-drive': {
    label: 'Remap the shared drive',
    detail: 'Map the drive in the user session and confirm it survives a sign-out.',
    kind: 'fix',
  },
  'reboot-ap': {
    label: 'Reboot the access point',
    detail: 'Restart it from the controller and watch it rejoin.',
    kind: 'fix',
  },
  'replace-ap': {
    label: 'Fit a replacement access point',
    detail: 'Swap the unit and adopt it on the controller.',
    kind: 'fix',
  },
  'enable-poe-port': {
    label: 'Enable the switch port',
    detail: 'Turn the port back on so the access point has power and link.',
    kind: 'fix',
  },
  'enable-switch-port': {
    label: 'Enable the switch port',
    detail: 'Bring the disabled port back up and confirm the link light.',
    kind: 'fix',
  },
  'enable-5ghz': {
    label: 'Turn on the 5 GHz band',
    detail: 'Enable the second radio so half the room can leave 2.4 GHz.',
    kind: 'fix',
  },
  'add-lab-ap': {
    label: 'Add a second access point to the lab',
    detail: 'Fit and adopt a second unit so 28 machines are not sharing one radio.',
    kind: 'fix',
  },
  'move-ap': {
    label: 'Move the access point',
    detail: 'Re-site it into the corridor so the room is covered from the doorway.',
    kind: 'fix',
  },
  'set-static-ip': {
    label: 'Set the address by hand',
    detail: 'Pin an address on the machine instead of asking DHCP for one.',
    kind: 'neutral',
  },
  'correct-vlan': {
    label: 'Move the port back to the staff VLAN',
    detail: 'Correct the switch port and confirm the machine picks up its own scope.',
    kind: 'fix',
  },
  'widen-dhcp-scope': {
    label: 'Widen the DHCP scope',
    detail: 'Add the range the cart needs and shorten the lease for the day.',
    kind: 'fix',
  },
  'reserve-address': {
    label: 'Reserve the cart addresses',
    detail: 'Reserve one address per bay so the cart always lands in its own range.',
    kind: 'fix',
  },
  'charge-cart': {
    label: 'Plug the cart in and reset its timer',
    detail: 'Put the cart on a live outlet and set the timer to charge overnight.',
    kind: 'fix',
  },
  'replace-cart-psu': {
    label: "Replace the cart's power supply",
    detail: 'Swap the failed supply and confirm every bay charges.',
    kind: 'fix',
  },
  'swap-keyboard': {
    label: 'Swap the keyboard',
    detail: 'Fit a known-good keyboard and test every key the class uses.',
    kind: 'fix',
  },
  'image-and-stage': {
    label: 'Image and stage the machines',
    detail: 'Apply the image, tag the machine and test it on the room drop.',
    kind: 'fix',
  },
  'tag-asset': {
    label: 'Tag the asset',
    detail: 'Fix the tag where it can be read and record the number against the room.',
    kind: 'fix',
  },
  'record-inventory': {
    label: 'Update the inventory record',
    detail: 'Room, state and loan status, in the record the office actually reads.',
    kind: 'fix',
  },
  'check-out-loaner': {
    label: 'Book the loaner out',
    detail: 'Record the student, the machine and the return date before it leaves.',
    kind: 'fix',
  },
  'check-in-loaner': {
    label: 'Book the loaner back in',
    detail: 'Close the loan and put the machine into repair or back on the shelf.',
    kind: 'fix',
  },
  'hand-over-charger': {
    label: 'Hand over the charger and the case',
    detail: 'A loaner without its charger comes back dead, or not at all.',
    kind: 'fix',
  },
  'book-return': {
    label: 'Book the return date',
    detail: 'Agree the day the machine comes back, and put it on the ticket.',
    kind: 'fix',
  },
  'replace-projector': {
    label: 'Replace the projector',
    detail: 'Swap the whole unit for a spare from the store.',
    kind: 'harmful',
  },
  'order-new-lab': {
    label: 'Order a new lab',
    detail: 'Raise a purchase request for replacement machines.',
    kind: 'harmful',
  },
  'disable-filter': {
    label: 'Disable the web filter',
    detail: 'Turn filtering off for the site, or for the whole school.',
    kind: 'harmful',
  },
  'share-admin-password': {
    label: 'Share the admin password',
    detail: 'Give the caller the administrator credential so they can fix it themselves.',
    kind: 'harmful',
  },
  'move-student-vlan': {
    label: 'Move the machine to the student VLAN',
    detail: 'Put a staff machine on the student network to get it online.',
    kind: 'harmful',
  },
  'give-admin-rights': {
    label: 'Give the teacher local admin',
    detail: 'Make the teacher an administrator on the machine.',
    kind: 'harmful',
  },
  'wipe-lab': {
    label: 'Wipe every machine in the lab',
    detail: 'Reset the whole room rather than the machines that failed.',
    kind: 'harmful',
  },
}

export function isHarmful(change: ChangeId): boolean {
  return CHANGES[change].kind === 'harmful'
}

/** The kit each kind of visit needs, from the store cupboard. */
export const VISIT_KITS: Readonly<
  Record<AcademyArea, { label: string; tools: readonly string[]; parts: readonly string[]; watch: string }>
> = {
  classroom: {
    label: 'Classroom visit',
    tools: ['Step stool', 'Torx and Phillips drivers', 'Cable tester', 'Label printer'],
    parts: ['HDMI cable, 5 m', 'VGA/HDMI adapter', 'Projector lamp', 'Spare wireless keyboard'],
    watch: 'The bell. Work at the teacher desk first and leave the room usable before the next class.',
  },
  lab: {
    label: 'Lab visit',
    tools: ['Imaging USB', 'Patch cables, 2 m', 'Keyboard and mouse', 'Lab console access'],
    parts: ['Known-good monitor', 'Spare PSU', 'Asset tags'],
    watch: 'Power the bench off before opening a case, and never work inside a machine still on the cart.',
  },
  office: {
    label: 'Front office visit',
    tools: ['Printer keys', 'Toner vacuum', 'Network cable tester'],
    parts: ['Toner cartridge', 'Tray 2 paper, A4', 'Scan profile sheet'],
    watch: 'The office is a public counter. Do not read pupil or payroll records on screen while a visitor is there.',
  },
  network: {
    label: 'Network visit',
    tools: ['Ladder or step stool', 'PoE injector', 'Cable tester', 'Label printer'],
    parts: ['Access point', 'Patch leads', 'Mounting bracket'],
    watch: 'Never work on a ladder alone. Ask the site team to hold the base and clear the corridor.',
  },
  assets: {
    label: 'Assets and loaners',
    tools: ['Label printer', 'Loan form', 'Cleaning kit'],
    parts: ['Chargers', 'Cases', 'Asset tags'],
    watch: 'A loaner is a data-bearing device: record who has it before it leaves the building.',
  },
}

/** Lifting and safety basics, one list for every visit. */
export const SAFETY_BASICS: readonly string[] = [
  'Power the machine down and unplug it before opening a case or moving a cart.',
  'Two people for a cart, a projector or anything above shoulder height.',
  'Bend the knees, keep the load close, and never twist while carrying.',
  'Use the step stool for ceiling mounts; do not stand on a chair or a desk.',
  'Keep cables out of walkways and tape down anything that crosses a door.',
  'If a room smells of burning or the case is hot, stop and escalate to the site team.',
]

/** What a visit note has to contain, in the words the debrief uses. */
export const VISIT_NOTE_PARTS: readonly string[] = [
  'the room or the machine',
  'what was wrong',
  'what was changed',
  'what the teacher should watch for',
]
