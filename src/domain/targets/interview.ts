import type { InterviewQuestion, SkillId } from './types'

interface QuestionTemplate {
  prompt: string
  tests: string
}

/**
 * Original templates, two per skill. The panel is generated locally from the
 * skills a listing matched; there is no model call and no randomness.
 */
const BANKS: Record<SkillId, readonly QuestionTemplate[]> = {
  'password-accounts': [
    {
      prompt: 'A user says they are locked out but insists their password is correct. Walk me through your first five minutes.',
      tests: 'Whether you separate lockout from expiry or a bad password, and whether you verify identity before changing anything.',
    },
    {
      prompt: 'How do you reset a password for someone who is not at their desk and cannot use self-service?',
      tests: 'Identity proofing, an approved delivery channel, and what you tell the user about their next sign-in.',
    },
  ],
  'active-directory': [
    {
      prompt: 'What is the difference between a security group and a distribution group, and when would each matter at the service desk?',
      tests: 'Whether you understand that only one of them grants access, and that group membership is an authorisation decision.',
    },
    {
      prompt: 'A user moved teams and now sees a folder they should not. What do you check and who do you involve?',
      tests: 'Least privilege, effective access, and knowing when a permission change belongs to the data owner.',
    },
  ],
  networking: [
    {
      prompt: 'One user cannot reach the intranet; the person beside them can. How do you narrow that down?',
      tests: 'Scoping the fault to link, address, name resolution, or application instead of guessing.',
    },
    {
      prompt: 'How would you explain the difference between an IP address, a subnet mask, and a default gateway to a new colleague?',
      tests: 'Plain-language fundamentals and whether your explanation would help someone diagnose a real fault.',
    },
  ],
  dns: [
    {
      prompt: 'A browser says the site cannot be found but chat still works. What does that tell you and what do you test first?',
      tests: 'Recognising name resolution as a distinct layer and choosing a lookup test over a reboot.',
    },
    {
      prompt: 'When would you change DNS settings on one device versus escalate a server or scope problem?',
      tests: 'Blast-radius thinking: fixing the many versus patching the one.',
    },
  ],
  dhcp: [
    {
      prompt: 'A laptop has a 169.254 address. What happened, and what are your next two commands?',
      tests: 'APIPA recognition, scope awareness, and whether you renew before investigating the scope.',
    },
    {
      prompt: 'The site scope is full of stale leases. How do you decide which leases are safe to clear?',
      tests: 'Distinguishing stale from active leases and knowing the cost of deleting the wrong one.',
    },
  ],
  vpn: [
    {
      prompt: 'A user works from home and cannot connect to the VPN. What do you check before touching their machine?',
      tests: 'Triaging home internet, credentials, and the VPN service itself rather than assuming the laptop is at fault.',
    },
    {
      prompt: 'What would you ask a user to confirm the VPN is connected but the internal service is still unreachable?',
      tests: 'Reading tunnel status and testing an internal address by name and by IP.',
    },
  ],
  printing: [
    {
      prompt: 'Nothing prints for one user. How do you tell a printer problem from a queue problem from a spooler problem?',
      tests: 'Working down device, queue, and service in a deliberate order.',
    },
    {
      prompt: 'A job is stuck at "printing" and blocks everything behind it. What do you clear, and what do you warn the user about?',
      tests: 'Ordering the fix and setting expectations about lost or duplicated jobs.',
    },
  ],
  'm365-email': [
    {
      prompt: 'A user gets "we could not verify your account" on every device. What do you check in the sign-in log?',
      tests: 'Reading the error code and separating MFA method problems from conditional access or a block.',
    },
    {
      prompt: 'What identity checks do you complete before resetting someone’s MFA methods?',
      tests: 'Whether you treat an MFA reset as an account-access change, because it is one.',
    },
  ],
  hardware: [
    {
      prompt: 'A new starter’s laptop will not power on out of the box. What is your triage order?',
      tests: 'Power, cabling, and warranty process before anyone starts reimaging.',
    },
    {
      prompt: 'How do you hand over a rebuilt machine so the user can work on day one?',
      tests: 'Testing before handover, asset records, and what the user needs to know about their profile and data.',
    },
  ],
  'remote-support': [
    {
      prompt: 'How do you keep a remote session productive when the user cannot see what you are doing?',
      tests: 'Narrating actions, asking the user to confirm symptoms, and avoiding silent changes.',
    },
    {
      prompt: 'What do you do when a remote tool will not connect but the user needs help now?',
      tests: 'Fallback options, safety of guided instructions, and when to escalate instead of improvising.',
    },
  ],
  ticketing: [
    {
      prompt: 'What belongs in a handoff note when you escalate a ticket?',
      tests: 'The report, the evidence, and the specific next action, rather than a summary of what you tried.',
    },
    {
      prompt: 'How do you write a ticket note that helps the next person without repeating your whole session?',
      tests: 'Signal over chronology: the fault, the evidence, the change, and the current state.',
    },
  ],
  'customer-service': [
    {
      prompt: 'A user is frustrated and talks over you. How do you take control of the call without escalating the tension?',
      tests: 'Acknowledgement, structure, and setting a concrete next step instead of matching their tone.',
    },
    {
      prompt: 'Tell me about a time you had to say no to a request. How did you make it stick?',
      tests: 'Boundaries, policy awareness, and offering an alternative rather than a flat refusal.',
    },
  ],
}

/** Two questions per matched skill, in the order the skills were detected. */
export function interviewQuestions(
  skills: readonly SkillId[],
  perSkill = 2,
): InterviewQuestion[] {
  const questions: InterviewQuestion[] = []
  const seen = new Set<string>()

  for (const skill of skills) {
    const bank = BANKS[skill]
    if (!bank) {
      continue
    }
    for (const [index, template] of bank.entries()) {
      if (index >= perSkill) {
        break
      }
      const id = `${skill}-${index + 1}`
      if (seen.has(id)) {
        continue
      }
      seen.add(id)
      questions.push({
        id,
        skill,
        question: template.prompt,
        tests: template.tests,
      })
    }
  }

  return questions
}
