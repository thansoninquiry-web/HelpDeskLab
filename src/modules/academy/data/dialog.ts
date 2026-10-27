import type { DialogNode, WalkUp } from '../types'

/**
 * Two-step caller dialogs and the mid-ticket walk-up, written once.
 *
 * A caller conversation in this pack is short on purpose: greet and ask the one
 * question that narrows the fault, then say what happens next without jargon and
 * without promising what the desk cannot deliver. The three tones are the lesson:
 * a plain answer, an answer in technician's language, and an answer that brushes
 * the caller off.
 */

interface StepInput {
  prompt: string
  gloss?: string
  best: string
  bestGloss?: string
  jargon: string
  brusque: string
}

function step(id: string, input: StepInput): DialogNode {
  return {
    id,
    prompt: input.prompt,
    ...(input.gloss ? { gloss: input.gloss } : {}),
    options: [
      {
        id: 'plain',
        say: input.best,
        ...(input.bestGloss ? { gloss: input.bestGloss } : {}),
        tone: 'plain',
        best: true,
      },
      { id: 'jargon', say: input.jargon, tone: 'jargon' },
      { id: 'brusque', say: input.brusque, tone: 'brusque' },
    ],
  }
}

/** The standard two-step conversation: narrow the fault, then set the expectation. */
export function twoStep(first: StepInput, second: StepInput): DialogNode[] {
  return [step('open', first), step('close', second)]
}

/** The same shape, with the caller's own line in Spanish and an English gloss. */
export function walkUp(input: WalkUp): WalkUp {
  return input
}
