import type { DsaProblem } from '../types'

/**
 * The practice bank.
 *
 * Every problem is original and set in the lab's own world, so nothing here is
 * copied from a judge or a sheet. Each one carries the decision the interview
 * actually turns on: the cue in the statement, the approach and cost that cue
 * points at, and the edge case that approach gets wrong when it is written from
 * memory. `approaches` is the answer key — two real implementations, not
 * sketches — and `checks` is what proves the key still runs.
 */
export const DSA_PROBLEMS: readonly DsaProblem[] = [
  {
    id: 'pair-sum-sorted',
    title: 'Two entries that meet the target',
    difficulty: 'easy',
    topics: ['arrays', 'two pointers', 'binary search'],
    summary:
      'A sorted ledger export and a target: find the two entries that add up to it, and say what the sort buys.',
    statement: [
      'Finance sends you a ledger export sorted by amount, smallest first. Two entries in it add up to a target the reconciliation needs, and the export guarantees exactly one such pair.',
      'Return the indices of those two entries, smaller index first. The amounts can be negative, and the same amount can appear twice at different indices.',
    ],
    examples: [
      {
        input: 'amounts = [1, 3, 4, 7, 9], target = 11',
        output: '[2, 3]',
        explanation: '4 + 7 = 11, and indices 2 and 3 are the pair.',
      },
      {
        input: 'amounts = [2, 2], target = 4',
        output: '[0, 1]',
        explanation: 'Two equal entries are still two different rows.',
      },
      {
        input: 'amounts = [2, 7, 11, 15], target = 9',
        output: '[0, 1]',
      },
    ],
    constraints: [
      '2 <= amounts.length <= 100,000',
      '-1,000,000 <= amount <= 1,000,000',
      'The export is sorted ascending and holds exactly one qualifying pair',
      'Aim for O(1) extra space',
    ],
    cues: [
      'The input is sorted — order is information you did not have to pay for.',
      'The answer is a pair, not a count.',
      'Exactly one pair qualifies, so a search can stop the moment it finds it.',
    ],
    patterns: [
      {
        id: 'two-pointers',
        label: 'Two pointers from both ends — O(n) time, O(1) space',
        note: 'The sort is the whole point: a sum that is too small can only be fixed by moving the left pointer up, and a sum that is too large only by moving the right one down. Each entry is touched once.',
        correct: true,
      },
      {
        id: 'binary-search',
        label: 'Binary-search the partner of every entry — O(n log n) time, O(1) space',
        note: 'Correct, and a fair answer when the export is only sorted once. It does n searches over a tail that shrinks by one each time, which is the work the second pointer avoids.',
        correct: false,
      },
      {
        id: 'hash-map',
        label: 'Hash map of amounts already seen — O(n) time, O(n) space',
        note: 'The right answer for an unsorted ledger. Here it buys nothing: the sort has already put the partner where a pointer can reach it, and the map costs memory the brief asked you to keep.',
        correct: false,
      },
      {
        id: 'nested-loops',
        label: 'Check every pair — O(n squared) time, O(1) space',
        note: 'Correct, and unusable: a 100,000-row export is ten billion comparisons against the brief\'s one pass.',
        correct: false,
      },
    ],
    edges: [
      {
        id: 'duplicates',
        label: 'The same amount twice, at two indices',
        note: 'Two equal rows are a valid pair. A walk that skips duplicates, or a search that excludes its own index without allowing the partner to be equal, misses [2, 2].',
        correct: true,
      },
      {
        id: 'negative',
        label: 'Negative amounts in the ledger',
        note: 'Negatives need no special case: the comparison against the target is the same arithmetic whatever the signs are.',
        correct: false,
      },
      {
        id: 'unsorted',
        label: 'An export that arrives out of order',
        note: 'The constraints promise the opposite. If that promise were broken the right response would be to sort first, not to patch the walk.',
        correct: false,
      },
    ],
    hints: [
      'What does the sorted order let you conclude from one comparison of two ends?',
      'If the smallest remaining amount plus the largest remaining amount is too small, which of the two can you rule out entirely?',
    ],
    approaches: [
      {
        name: 'Walk in from both ends',
        time: 'O(n)',
        space: 'O(1)',
        idea: 'Keep one pointer at each end. Each comparison either finds the pair or rules out one of the two entries, so the pointers meet after n steps.',
        code: `function pairIndices(amounts, target) {
  let left = 0
  let right = amounts.length - 1
  while (left < right) {
    const sum = amounts[left] + amounts[right]
    if (sum === target) return [left, right]
    if (sum < target) left += 1
    else right -= 1
  }
  return []
}`,
        tradeoff:
          'The shortest answer that uses the sort, and the one to reach for in a live interview.',
      },
      {
        name: 'Binary-search each entry',
        time: 'O(n log n)',
        space: 'O(1)',
        idea: 'For each entry, the partner it needs is a fixed value. The array is sorted, so a binary search finds it — and only the tail to the right needs searching.',
        code: `function pairIndices(amounts, target) {
  for (let i = 0; i < amounts.length; i += 1) {
    const wanted = target - amounts[i]
    let low = i + 1
    let high = amounts.length - 1
    while (low <= high) {
      const mid = (low + high) >> 1
      if (amounts[mid] === wanted) return [i, mid]
      if (amounts[mid] < wanted) low = mid + 1
      else high = mid - 1
    }
  }
  return []
}`,
        tradeoff:
          'Worth choosing when the ledger is sorted for you but a streaming feed can also be searched for a single partner on demand.',
      },
    ],
    starter: `function pairIndices(amounts, target) {
  // amounts is sorted ascending. Return [lowerIndex, higherIndex].
}`,
    checks: [
      { args: [[1, 3, 4, 7, 9], 11], expected: [2, 3] },
      { args: [[2, 7, 11, 15], 9], expected: [0, 1] },
      { args: [[2, 2], 4], expected: [0, 1] },
    ],
  },
  {
    id: 'unique-run',
    title: 'The longest stretch without a repeat',
    difficulty: 'medium',
    topics: ['arrays', 'sliding window', 'hashing'],
    summary:
      'Session ids in arrival order, and the longest contiguous stretch in which every id appears once.',
    statement: [
      'The access log stores session ids in the order the requests arrived. A support lead wants the longest stretch of consecutive requests in which every id is distinct, which is how long one user can look like many without a cookie being reused.',
      'Return the length of that stretch. The order of the log matters: a run is contiguous, not a set.',
    ],
    examples: [
      {
        input: "ids = ['a', 'b', 'a', 'c', 'b', 'd']",
        output: '4',
        explanation: "The stretch ['a', 'c', 'b', 'd'] is contiguous and has no repeat.",
      },
      {
        input: "ids = ['a', 'a']",
        output: '1',
        explanation: 'Any single entry is a run of one.',
      },
      {
        input: 'ids = []',
        output: '0',
      },
    ],
    constraints: [
      '0 <= ids.length <= 200,000',
      'Ids are strings of up to 16 characters',
      'A run is contiguous; sorting the log first answers a different question',
    ],
    cues: [
      'The answer is a contiguous stretch, so the window can only widen and slide.',
      'Distinct means a repeat is the only reason to move the left edge.',
      'The log can be huge, so a rescan per starting point is the cost to avoid.',
    ],
    patterns: [
      {
        id: 'sliding-window',
        label: 'Sliding window with an id-to-index map — O(n) time, O(distinct) space',
        note: 'Widen the right edge one entry at a time. When the new id was seen inside the window, pull the left edge just past that copy — and never backwards, which is the one line that separates this from a wrong answer.',
        correct: true,
      },
      {
        id: 'brute-force',
        label: 'Try every start and grow until a repeat — O(n squared) time, O(n) space',
        note: 'Correct and simple. It repeats the same work for every start, which a log of 200,000 requests will not forgive.',
        correct: false,
      },
      {
        id: 'sort-scan',
        label: 'Sort the ids, then scan adjacent runs — O(n log n) time, O(n) space',
        note: 'The trap. Sorting destroys arrival order, so the run it finds is a set of distinct ids, not a contiguous stretch.',
        correct: false,
      },
      {
        id: 'count-map',
        label: 'Count every id once and take the number of distinct ones — O(n) time, O(n) space',
        note: 'Counts distinct ids across the whole log. The longest contiguous run is usually much shorter.',
        correct: false,
      },
    ],
    edges: [
      {
        id: 'stale-repeat',
        label: 'A repeat whose earlier copy is already behind the window',
        note: 'Jumping the left edge to that old index plus one can drag the window backwards if the copy is outside it. The move is max(left, lastSeen + 1), not lastSeen + 1.',
        correct: true,
      },
      {
        id: 'empty-log',
        label: 'An empty log',
        note: 'Easy to get right — the loop body never runs — but worth an early return so the boundary is stated rather than implied.',
        correct: false,
      },
      {
        id: 'long-id',
        label: 'A 16-character id',
        note: 'The constraint bounds the key length; the algorithm does not care how long a key is.',
        correct: false,
      },
    ],
    hints: [
      'If the window is valid and the next id repeats one already inside it, what is the smallest move that restores validity?',
      'Why can the left edge never move backwards once it has passed a repeated copy?',
    ],
    approaches: [
      {
        name: 'Slide a window with the last index of each id',
        time: 'O(n)',
        space: 'O(distinct)',
        idea: 'Remember where each id was last seen. On a repeat, jump the left edge past that place — but only forwards — then measure the window.',
        code: `function longestUniqueRun(ids) {
  const lastSeen = new Map()
  let left = 0
  let best = 0
  for (let right = 0; right < ids.length; right += 1) {
    const id = ids[right]
    if (lastSeen.has(id)) {
      left = Math.max(left, lastSeen.get(id) + 1)
    }
    lastSeen.set(id, right)
    best = Math.max(best, right - left + 1)
  }
  return best
}`,
        tradeoff:
          'One pass with one map lookup per entry. The max is the whole difference between this and the buggy version.',
      },
      {
        name: 'Slide a window with a set',
        time: 'O(n)',
        space: 'O(distinct)',
        idea: 'Keep a set of what is in the window and shrink from the left until the new id can join. Simpler to reason about, and it touches each entry at most twice.',
        code: `function longestUniqueRun(ids) {
  const window = new Set()
  let left = 0
  let best = 0
  for (let right = 0; right < ids.length; right += 1) {
    while (window.has(ids[right])) {
      window.delete(ids[left])
      left += 1
    }
    window.add(ids[right])
    best = Math.max(best, right - left + 1)
  }
  return best
}`,
        tradeoff:
          'Prefer this when the shrinking is easier to explain than the jump; the cost is the same order.',
      },
    ],
    starter: `function longestUniqueRun(ids) {
  // Return the length of the longest contiguous run with no repeated id.
}`,
    checks: [
      { args: [['a', 'b', 'a', 'c', 'b', 'd']], expected: 4 },
      { args: [['a', 'a']], expected: 1 },
      { args: [[]], expected: 0 },
      { args: [['x', 'y', 'z']], expected: 3 },
    ],
  },
  {
    id: 'rotated-log',
    title: 'Finding a record id in a rotated index',
    difficulty: 'medium',
    topics: ['binary search', 'arrays'],
    summary:
      'An ascending index was rotated at an unknown pivot. Find a record id in logarithmic time, or say it is absent.',
    statement: [
      'An index file is written in ascending order, then the storage layer rotated it at some pivot it no longer records. The result is two ascending runs joined at the seam.',
      'Given the rotated values and a target, return the index of the target, or -1 if it is not present. Every value in the file is distinct.',
    ],
    examples: [
      {
        input: 'values = [4, 5, 6, 7, 0, 1, 2], target = 0',
        output: '4',
      },
      {
        input: 'values = [4, 5, 6, 7, 0, 1, 2], target = 3',
        output: '-1',
      },
      {
        input: 'values = [1], target = 1',
        output: '0',
      },
    ],
    constraints: [
      '1 <= values.length <= 100,000',
      'All values are distinct integers',
      'The values were rotated from an ascending order, possibly by zero places',
      'Aim for O(log n) time',
    ],
    cues: [
      'The file is two sorted runs, not one.',
      'At any midpoint, at least one half is genuinely sorted.',
      'A rotation by zero places is still a rotation.',
    ],
    patterns: [
      {
        id: 'modified-binary-search',
        label: 'One binary search that tests which half is sorted — O(log n) time, O(1) space',
        note: 'At each step, compare the midpoint with the left edge to learn which side is ordered. If the target lies inside that ordered side, search it; otherwise search the other. One pass, no second structure.',
        correct: true,
      },
      {
        id: 'linear',
        label: 'Read the file from the start — O(n) time, O(1) space',
        note: 'Correct, and it throws away the only thing the file still guarantees. On 100,000 records it is the answer a reviewer will ask you to replace.',
        correct: false,
      },
      {
        id: 'sort-copy',
        label: 'Sort a copy, then binary-search it — O(n log n) time, O(n) space',
        note: 'Correct values, wrong indices: sorting the copy loses where the record actually sits, which is the question.',
        correct: false,
      },
      {
        id: 'plain-binary-search',
        label: 'Binary-search the values as if they were sorted — O(log n) time, O(1) space',
        note: 'Fast and wrong. A rotated array is not ordered, and the search can walk past the seam into the half that cannot contain the target.',
        correct: false,
      },
    ],
    edges: [
      {
        id: 'no-rotation',
        label: 'A rotation by zero places',
        note: 'When the left edge is the smallest value, every half comparison can still be answered, but a search that assumes a real seam can discard the only half holding the target. Treat the left half as sorted in that case.',
        correct: true,
      },
      {
        id: 'absent-target',
        label: 'A target that is in no entry',
        note: 'A correct search converges and returns -1; no special case is needed beyond the loop condition.',
        correct: false,
      },
      {
        id: 'single-record',
        label: 'A one-record file',
        note: 'The loop handles it in one comparison. It is worth a test, not a branch.',
        correct: false,
      },
    ],
    hints: [
      'Compare the midpoint with the left edge: what does that tell you about the half you are standing in?',
      'Once you know which half is sorted, what two comparisons decide whether the target can be in it?',
    ],
    approaches: [
      {
        name: 'One search, decide the sorted half',
        time: 'O(log n)',
        space: 'O(1)',
        idea: 'Check which half of the current range is ascending; if the target falls inside that half, go there, and otherwise go to the other.',
        code: `function findRotatedIndex(values, target) {
  let low = 0
  let high = values.length - 1
  while (low <= high) {
    const mid = (low + high) >> 1
    if (values[mid] === target) return mid
    if (values[low] <= values[mid]) {
      if (values[low] <= target && target < values[mid]) high = mid - 1
      else low = mid + 1
    } else if (values[mid] < target && target <= values[high]) {
      low = mid + 1
    } else {
      high = mid - 1
    }
  }
  return -1
}`,
        tradeoff:
          'One pass and constant space, at the cost of four comparisons per step. The version to memorise the shape of.',
      },
      {
        name: 'Find the seam, then search',
        time: 'O(log n)',
        space: 'O(1)',
        idea: 'Locate the smallest value first — that is the pivot. Then choose the one sorted run that can hold the target and binary-search it.',
        code: `function findRotatedIndex(values, target) {
  let low = 0
  let high = values.length - 1
  while (low < high) {
    const mid = (low + high) >> 1
    if (values[mid] > values[high]) low = mid + 1
    else high = mid
  }
  const pivot = low
  let start = 0
  let end = values.length - 1
  if (target >= values[pivot] && target <= values[end]) start = pivot
  else end = pivot - 1
  while (start <= end) {
    const mid = (start + end) >> 1
    if (values[mid] === target) return mid
    if (values[mid] < target) start = mid + 1
    else end = mid - 1
  }
  return -1
}`,
        tradeoff:
          'Easier to explain and to test in two parts. It does two passes, so it is the same order with a larger constant.',
      },
    ],
    starter: `function findRotatedIndex(values, target) {
  // values is ascending but rotated at an unknown pivot. Return the index or -1.
}`,
    checks: [
      { args: [[4, 5, 6, 7, 0, 1, 2], 0], expected: 4 },
      { args: [[4, 5, 6, 7, 0, 1, 2], 3], expected: -1 },
      { args: [[1], 1], expected: 0 },
      { args: [[1], 0], expected: -1 },
    ],
  },
  {
    id: 'balanced-route',
    title: 'Balanced change windows',
    difficulty: 'easy',
    topics: ['strings', 'stack'],
    summary:
      'A change window is written with three kinds of brackets. Say whether every one is opened and closed in the right order.',
    statement: [
      'The change calendar exports windows as strings of brackets: parentheses for a normal change, square brackets for a standard change, braces for an emergency one. A window is valid when every opener is closed by the matching kind, in the correct nesting order.',
      'Return true when the string is balanced, false otherwise. An empty string is balanced.',
    ],
    examples: [
      {
        input: 'text = "{[()]}"',
        output: 'true',
      },
      {
        input: 'text = "([)]"',
        output: 'false',
        explanation: 'The pair order crosses: the square bracket closes before the parenthesis inside it.',
      },
      {
        input: 'text = ""',
        output: 'true',
      },
    ],
    constraints: [
      '0 <= text.length <= 100,000',
      'Only the six bracket characters appear',
      'Crossing pairs are invalid even when the counts match',
    ],
    cues: [
      'The most recent opener is the one that must close next — that is a stack.',
      'Counts per kind prove nothing about order.',
      'Both an unexpected closer and a leftover opener are failures.',
    ],
    patterns: [
      {
        id: 'stack',
        label: 'Push openers, match on closers — O(n) time, O(n) space',
        note: 'The last opener is the first that must close, which is exactly what a stack gives. On a closer, pop and compare kind; at the end the stack must be empty.',
        correct: true,
      },
      {
        id: 'counts',
        label: 'Count each kind and require equal numbers — O(n) time, O(1) space',
        note: 'The classic wrong answer: "([)]" has equal counts and is not balanced. Order is the question, not arithmetic.',
        correct: false,
      },
      {
        id: 'strip-pairs',
        label: 'Repeatedly remove "()", "[]" and "{}" — O(n squared) time, O(n) space',
        note: 'Correct, and each pass only removes what was already adjacent. A 100,000-character window becomes a very long wait.',
        correct: false,
      },
      {
        id: 'regex',
        label: 'Strip balanced pairs with one regular expression — O(n) time, O(n) space',
        note: 'A nested grammar is not a regular language. Any pattern that appears to work fails on some depth or nesting order.',
        correct: false,
      },
    ],
    edges: [
      {
        id: 'empty-stack-closer',
        label: 'A closer arriving when the stack is empty',
        note: 'Popping an empty stack yields undefined, and comparing that to the expected opener happens to return false — but only by accident. Check the stack deliberately, so the reason is in the code.',
        correct: true,
      },
      {
        id: 'leftover-opener',
        label: 'An opener still on the stack at the end',
        note: 'The final "is the stack empty" check covers it. It is the other half of the same mistake and needs no separate branch.',
        correct: false,
      },
      {
        id: 'nested-depth',
        label: 'A window nested a thousand levels deep',
        note: 'A stack grows with depth, which is expected. Depth is a memory question for the input size, not a correctness one.',
        correct: false,
      },
    ],
    hints: [
      'Which opener must the next closer match, and which data structure puts that one first?',
      'What should happen when a closer arrives and there is nothing to close?',
    ],
    approaches: [
      {
        name: 'A stack of openers',
        time: 'O(n)',
        space: 'O(n)',
        idea: 'Push openers. On a closer, pop and check the kind; at the end, require an empty stack.',
        code: `function isBalanced(text) {
  const openers = { ')': '(', ']': '[', '}': '{' }
  const stack = []
  for (const char of text) {
    if (char === '(' || char === '[' || char === '{') {
      stack.push(char)
    } else if (char in openers) {
      if (stack.pop() !== openers[char]) return false
    }
  }
  return stack.length === 0
}`,
        tradeoff:
          'The shortest version, and the one whose shape generalises to any bracket alphabet.',
      },
      {
        name: 'A stack of expected closers',
        time: 'O(n)',
        space: 'O(n)',
        idea: 'Push the closer that each opener expects, then require the next closer to equal the top. The final emptiness check is the same.',
        code: `function isBalanced(text) {
  const closers = { '(': ')', '[': ']', '{': '}' }
  const expected = []
  for (const char of text) {
    if (char in closers) {
      expected.push(closers[char])
    } else if (char === ')' || char === ']' || char === '}') {
      if (expected.pop() !== char) return false
    }
  }
  return expected.length === 0
}`,
        tradeoff:
          'Slightly more to read, but the comparison at the closer is a plain equality against one character.',
      },
    ],
    starter: `function isBalanced(text) {
  // Return true when every bracket is closed by its own kind, in order.
}`,
    checks: [
      { args: ['{[()]}'], expected: true },
      { args: ['([)]'], expected: false },
      { args: [''], expected: true },
      { args: ['('], expected: false },
    ],
  },
  {
    id: 'merge-queues',
    title: 'Merging two sorted call queues',
    difficulty: 'easy',
    topics: ['arrays', 'two pointers', 'sorting'],
    summary:
      'Two queues arrive already ordered by priority. Merge them into one without losing the order or the duplicate priorities.',
    statement: [
      'The overnight queue and the day queue each arrive ordered by priority, lowest first. The floor wants one queue, still ordered, with duplicate priorities kept as separate calls.',
      'Return a new array containing every entry from both queues in ascending order. Do not sort the result after concatenating if you can merge it in one pass.',
    ],
    examples: [
      {
        input: 'left = [1, 4, 7], right = [2, 3, 9]',
        output: '[1, 2, 3, 4, 7, 9]',
      },
      {
        input: 'left = [1], right = [1]',
        output: '[1, 1]',
        explanation: 'Equal priorities are both kept; the stable choice is to take from the left queue first.',
      },
      {
        input: 'left = [], right = [5, 6]',
        output: '[5, 6]',
      },
    ],
    constraints: [
      '0 <= left.length, right.length <= 100,000',
      'Both inputs are sorted ascending',
      'Duplicates are kept',
    ],
    cues: [
      'Both inputs are already sorted, so each step only needs the two front entries.',
      'One queue can run out before the other, and the remainder is already ordered.',
      'The output is a new array, so there is no in-place trick to reach for.',
    ],
    patterns: [
      {
        id: 'merge',
        label: 'Merge with two pointers — O(n + m) time, O(n + m) space',
        note: 'Compare the two fronts, take the smaller, then copy the leftover tail once. Every entry is read once and written once.',
        correct: true,
      },
      {
        id: 'concat-sort',
        label: 'Concatenate and sort — O((n + m) log(n + m)) time, O(n + m) space',
        note: 'Correct and shorter to type. It re-sorts work that was already done, which is exactly what the brief asked you to avoid.',
        correct: false,
      },
      {
        id: 'insert',
        label: 'Insert each entry of one queue into the other — O(n times m) time, O(n + m) space',
        note: 'Correct, and each insertion shifts the tail. The merge does the same job without moving anything twice.',
        correct: false,
      },
      {
        id: 'binary-insert',
        label: 'Binary-search the insertion point for each entry — O(n log m + shifts) time',
        note: 'The search is cheap but the insertion still shifts memory. The running time is hidden in the shifts, not in the search.',
        correct: false,
      },
    ],
    edges: [
      {
        id: 'one-empty',
        label: 'One queue arriving empty',
        note: 'The compare loop must not read past either end. Copying each leftover tail handles both the empty case and the longer-queue case in one place.',
        correct: true,
      },
      {
        id: 'equal-values',
        label: 'Equal priorities in both queues',
        note: 'The order between them is a stability choice, and either is accepted here. It does not change the complexity.',
        correct: false,
      },
      {
        id: 'negative',
        label: 'Negative priorities',
        note: 'A numeric comparison handles negatives without a special case. Do not sort by string.',
        correct: false,
      },
    ],
    hints: [
      'What is the only pair of entries you need to compare at each step?',
      'What has to happen to the queue that did not run out?',
    ],
    approaches: [
      {
        name: 'Two pointers, then copy the tail',
        time: 'O(n + m)',
        space: 'O(n + m)',
        idea: 'Advance through both queues, taking the smaller front each time; when one runs out, append the rest of the other.',
        code: `function mergeQueues(left, right) {
  const merged = []
  let i = 0
  let j = 0
  while (i < left.length && j < right.length) {
    if (left[i] <= right[j]) {
      merged.push(left[i])
      i += 1
    } else {
      merged.push(right[j])
      j += 1
    }
  }
  while (i < left.length) {
    merged.push(left[i])
    i += 1
  }
  while (j < right.length) {
    merged.push(right[j])
    j += 1
  }
  return merged
}`,
        tradeoff:
          'The intended answer: one pass, and the leftover handling doubles as the empty-input handling.',
      },
      {
        name: 'Concatenate and sort',
        time: 'O((n + m) log(n + m))',
        space: 'O(n + m)',
        idea: 'Join the arrays and let the runtime sort them. Fine for small queues and easy to audit.',
        code: `function mergeQueues(left, right) {
  return [...left, ...right].sort((a, b) => a - b)
}`,
        tradeoff:
          'Readable, but it discards the order it was given. Use it only when the sizes are small and clarity matters more than the pass count.',
      },
    ],
    starter: `function mergeQueues(left, right) {
  // Both inputs are sorted ascending. Return one sorted array.
}`,
    checks: [
      { args: [[1, 4, 7], [2, 3, 9]], expected: [1, 2, 3, 4, 7, 9] },
      { args: [[1], [1]], expected: [1, 1] },
      { args: [[], [1]], expected: [1] },
      { args: [[5, 6], []], expected: [5, 6] },
    ],
  },
  {
    id: 'busiest-desk',
    title: 'The busiest hour at the service desk',
    difficulty: 'medium',
    topics: ['sorting', 'intervals', 'sweep line'],
    summary:
      'Appointments as half-open [start, end) slots: how many people can be waiting at the desk at the same moment?',
    statement: [
      'The booking system stores each desk appointment as [start, end) in minutes from midnight. A slot that ends at 10:00 frees the desk at 10:00, so the next one starting then does not overlap it.',
      'Return the largest number of appointments happening at the same time. A single appointment is a maximum of one; no appointments is zero.',
    ],
    examples: [
      {
        input: 'slots = [[9, 11], [10, 12], [11, 13]]',
        output: '2',
        explanation: 'At 11:00 the first ends as the third begins, so the peak stays at two.',
      },
      {
        input: 'slots = [[9, 10], [10, 11]]',
        output: '1',
        explanation: 'Touching, not overlapping.',
      },
      {
        input: 'slots = [[9, 12], [9, 12], [9, 12]]',
        output: '3',
      },
    ],
    constraints: [
      '0 <= slots.length <= 200,000',
      '0 <= start < end <= 1440',
      'Slots are half-open: end is not busy',
    ],
    cues: [
      'Only starts and ends change the count; the minutes in between do not.',
      'A start and an end at the same minute is not an overlap — the end must be processed first.',
      'Sorting is the natural cost here; the input size asks for n log n, not n squared.',
    ],
    patterns: [
      {
        id: 'sweep',
        label: 'Sort the events and sweep once — O(n log n) time, O(n) space',
        note: 'Turn each slot into a +1 at its start and a -1 at its end, sort by time with ends before starts, and keep the running maximum. One pass after the sort.',
        correct: true,
      },
      {
        id: 'all-pairs',
        label: 'Compare every pair and count overlaps — O(n squared) time, O(1) space',
        note: 'Answers the wrong question unless crossing counts are reasoned carefully, and 200,000 appointments makes it far too slow.',
        correct: false,
      },
      {
        id: 'minute-buckets',
        label: 'Count bookings for each of the 1,440 minutes — O(n + 1440) time, O(1440) space',
        note: 'Correct for this constraint set and genuinely constant-sized, but the brief asks for the general interval answer; state the tradeoff if you take it.',
        correct: false,
      },
      {
        id: 'sort-by-end',
        label: 'Sort by end time and count how many start before it — O(n log n) time, O(n) space',
        note: 'Finds how many earlier bookings are still open at one chosen end, not the peak across every minute.',
        correct: false,
      },
    ],
    edges: [
      {
        id: 'touching',
        label: 'One slot ending exactly when another starts',
        note: 'The half-open rule is the whole problem. Sort the end event before the start event at the same minute, or the peak comes out one too high.',
        correct: true,
      },
      {
        id: 'empty',
        label: 'No appointments',
        note: 'The running maximum starts at zero, so the empty list needs no branch.',
        correct: false,
      },
      {
        id: 'whole-day',
        label: 'A slot spanning the whole day',
        note: 'The range is bounded at 1,440 minutes; a long slot is just two events like any other.',
        correct: false,
      },
    ],
    hints: [
      'What actually changes the number of people at the desk — every minute, or two specific moments per appointment?',
      'If one appointment ends at 11:00 and another starts at 11:00, which event should be processed first to avoid overstating the peak?',
    ],
    approaches: [
      {
        name: 'Sweep the sorted events',
        time: 'O(n log n)',
        space: 'O(n)',
        idea: 'Emit +1 at every start and -1 at every end, sort by time with ends first, then run the count and remember its peak.',
        code: `function busiestCount(slots) {
  const events = []
  for (const [start, end] of slots) {
    events.push([start, 1])
    events.push([end, -1])
  }
  events.sort((a, b) => (a[0] === b[0] ? a[1] - b[1] : a[0] - b[0]))
  let current = 0
  let best = 0
  for (const [, delta] of events) {
    current += delta
    best = Math.max(best, current)
  }
  return best
}`,
        tradeoff:
          'The general answer, and the one whose tie rule reads directly from the half-open definition.',
      },
      {
        name: 'Sort starts and ends separately',
        time: 'O(n log n)',
        space: 'O(n)',
        idea: 'Two sorted lists. Walk them together: a start before the next end raises the count, otherwise an end lowers it.',
        code: `function busiestCount(slots) {
  const starts = slots.map(([start]) => start).sort((a, b) => a - b)
  const ends = slots.map(([, end]) => end).sort((a, b) => a - b)
  let i = 0
  let j = 0
  let current = 0
  let best = 0
  while (i < starts.length) {
    if (starts[i] < ends[j]) {
      current += 1
      best = Math.max(best, current)
      i += 1
    } else {
      current -= 1
      j += 1
    }
  }
  return best
}`,
        tradeoff:
          'Avoids building an event array and makes the end-first rule implicit in the comparison. Slightly harder to adapt if events carry more than a time.',
      },
    ],
    starter: `function busiestCount(slots) {
  // slots are [start, end) in minutes. Return the peak number in progress.
}`,
    checks: [
      { args: [[[9, 11], [10, 12], [11, 13]]], expected: 2 },
      { args: [[[9, 10], [10, 11]]], expected: 1 },
      { args: [[[9, 12], [9, 12], [9, 12]]], expected: 3 },
      { args: [[]], expected: 0 },
    ],
  },
  {
    id: 'grid-exit',
    title: 'Escaping the server room',
    difficulty: 'medium',
    topics: ['graphs', 'breadth-first search', 'grids'],
    summary:
      'A floor plan of free tiles and racks: the fewest steps from the door to the far corner, or no way out at all.',
    statement: [
      'A server room is a grid where 0 is floor and 1 is a rack. You start in the top-left tile and need the bottom-right tile, moving up, down, left or right one tile at a time.',
      'Return the fewest moves needed, or -1 when the exit cannot be reached. The start and the exit must both be floor tiles.',
    ],
    examples: [
      {
        input: 'grid = [[0,0,0],[1,1,0],[0,0,0]]',
        output: '4',
        explanation: 'Right, right, down, down.',
      },
      {
        input: 'grid = [[0,1],[1,0]]',
        output: '-1',
      },
      {
        input: 'grid = [[0]]',
        output: '0',
        explanation: 'Already standing on the exit.',
      },
    ],
    constraints: [
      '1 <= rows, cols <= 500',
      'grid[r][c] is 0 or 1',
      'Moves are four-directional, one tile per step',
      'Aim for O(rows times cols) time',
    ],
    cues: [
      'Every move costs the same, which is what makes breadth-first search correct.',
      'The answer is a shortest path, so depth-first search needs extra care not to report a longer route.',
      'The exit may be the start; the grid may have no floor at all.',
    ],
    patterns: [
      {
        id: 'bfs',
        label: 'Breadth-first search from the door — O(rows times cols) time, O(rows times cols) space',
        note: 'Explore in rings: everything one step away, then two, and so on. The first time the exit is reached, the ring number is the shortest distance by construction.',
        correct: true,
      },
      {
        id: 'dfs-min',
        label: 'Depth-first search, keeping the best distance found — O(rows times cols) time with memo',
        note: 'Works only when each tile is not re-explored at a worse distance. Written plainly it backtracks over exponentially many routes and reports the last route, not the shortest.',
        correct: false,
      },
      {
        id: 'dijkstra',
        label: 'Dijkstra with a priority queue — O(rows times cols log(rows times cols)) time',
        note: 'Correct but oversized: every edge weighs one, so a plain queue is all the ordering needed.',
        correct: false,
      },
      {
        id: 'greedy',
        label: 'Always step towards the exit unless blocked — O(rows + cols) time, O(1) space',
        note: 'Fails on any room with a concave wall. This is the answer that looks right on the whiteboard and dies on the third grid.',
        correct: false,
      },
    ],
    edges: [
      {
        id: 'start-is-exit',
        label: 'A 1 by 1 grid, where the start is the exit',
        note: 'Distance zero is the honest answer. A search that only checks for the exit after expanding a neighbour returns -1 instead.',
        correct: true,
      },
      {
        id: 'no-route',
        label: 'A grid walled off from the exit',
        note: 'Breadth-first search simply empties its queue and falls through to -1 — the same code path as any other exhaustion.',
        correct: false,
      },
      {
        id: 'blocked-start',
        label: 'A rack on the start tile',
        note: 'The statement excludes it. If it did not, the answer would be -1 and the check belongs before the search, not inside it.',
        correct: false,
      },
    ],
    hints: [
      'Which traversal visits tiles in order of distance from the start?',
      'When you reach the exit, what does the number of steps taken so far tell you about every other route?',
    ],
    approaches: [
      {
        name: 'Breadth-first search, distance in the queue',
        time: 'O(rows times cols)',
        space: 'O(rows times cols)',
        idea: 'Queue the start with zero steps. Pop, expand unvisited floor neighbours with one more step, and return as soon as the exit is expanded.',
        code: `function shortestExit(grid) {
  const rows = grid.length
  const cols = grid[0].length
  if (rows === 1 && cols === 1) return grid[0][0] === 1 ? -1 : 0
  if (grid[0][0] === 1 || grid[rows - 1][cols - 1] === 1) return -1
  const seen = grid.map((row) => row.map(() => false))
  seen[0][0] = true
  const queue = [[0, 0, 0]]
  let head = 0
  while (head < queue.length) {
    const [row, col, steps] = queue[head]
    head += 1
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nextRow = row + dr
      const nextCol = col + dc
      if (nextRow < 0 || nextRow >= rows || nextCol < 0 || nextCol >= cols) continue
      if (grid[nextRow][nextCol] === 1 || seen[nextRow][nextCol]) continue
      if (nextRow === rows - 1 && nextCol === cols - 1) return steps + 1
      seen[nextRow][nextCol] = true
      queue.push([nextRow, nextCol, steps + 1])
    }
  }
  return -1
}`,
        tradeoff:
          'The clearest version: distance travels with the tile, and the head pointer avoids shifting the queue.',
      },
      {
        name: 'Breadth-first search, ring by ring',
        time: 'O(rows times cols)',
        space: 'O(rows times cols)',
        idea: 'Hold the current ring of tiles and build the next one. The ring count is the distance, so the queue never carries a number.',
        code: `function shortestExit(grid) {
  const rows = grid.length
  const cols = grid[0].length
  if (grid[0][0] === 1 || grid[rows - 1][cols - 1] === 1) return -1
  const seen = grid.map((row) => row.map(() => false))
  seen[0][0] = true
  let ring = [[0, 0]]
  let steps = 0
  while (ring.length > 0) {
    if (ring.some(([row, col]) => row === rows - 1 && col === cols - 1)) return steps
    const next = []
    for (const [row, col] of ring) {
      for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nextRow = row + dr
        const nextCol = col + dc
        if (nextRow < 0 || nextRow >= rows || nextCol < 0 || nextCol >= cols) continue
        if (grid[nextRow][nextCol] === 1 || seen[nextRow][nextCol]) continue
        seen[nextRow][nextCol] = true
        next.push([nextRow, nextCol])
      }
    }
    ring = next
    steps += 1
  }
  return -1
}`,
        tradeoff:
          'Reads like the definition of breadth-first search, and the 1 by 1 grid falls out of the first ring check.',
      },
    ],
    starter: `function shortestExit(grid) {
  // 0 is floor, 1 is a rack. Start top-left, exit bottom-right, four moves.
}`,
    checks: [
      { args: [[[0, 0, 0], [1, 1, 0], [0, 0, 0]]], expected: 4 },
      { args: [[[0, 1], [1, 0]]], expected: -1 },
      { args: [[[0]]], expected: 0 },
      { args: [[[0, 0], [0, 0]]], expected: 2 },
    ],
  },
  {
    id: 'cluster-count',
    title: 'Counting clusters of offline racks',
    difficulty: 'medium',
    topics: ['graphs', 'depth-first search', 'grids'],
    summary:
      'A monitoring grid marks offline racks. Count the groups that are connected up, down, left or right.',
    statement: [
      'The monitoring wall shows a grid where 1 is an offline rack and 0 is a healthy one. Racks count as one cluster when they touch up, down, left or right; a diagonal touch does not connect them.',
      'Return the number of separate clusters on the wall.',
    ],
    examples: [
      {
        input: 'grid = [[1,1,0],[0,1,0],[0,0,1]]',
        output: '2',
        explanation: 'The three connected racks are one cluster; the corner rack is the second.',
      },
      {
        input: 'grid = [[0,0],[0,0]]',
        output: '0',
      },
      {
        input: 'grid = [[1,0],[0,1]]',
        output: '2',
        explanation: 'Diagonals do not connect.',
      },
    ],
    constraints: [
      '1 <= rows, cols <= 500',
      'grid[r][c] is 0 or 1',
      'Connectivity is four-directional',
    ],
    cues: [
      'Each offline rack belongs to exactly one cluster, so marking tiles visited is what prevents double counting.',
      'The grid can be deep, so a recursive flood fill may need an explicit stack.',
      'Diagonal neighbours are the trap.',
    ],
    patterns: [
      {
        id: 'flood-fill',
        label: 'Flood fill each unvisited offline rack — O(rows times cols) time, O(rows times cols) space',
        note: 'Scan for a 1, count it as a new cluster, then sink or mark every tile connected to it. Each tile is visited a constant number of times.',
        correct: true,
      },
      {
        id: 'count-ones',
        label: 'Count the offline racks — O(rows times cols) time, O(1) space',
        note: 'Counts tiles, not groups. Three adjacent racks and three separate ones give the same number.',
        correct: false,
      },
      {
        id: 'per-tile-search',
        label: 'Search from every offline rack without marking tiles — O((rows times cols) squared) time',
        note: 'Recounts the same cluster once per tile in it, which is both slow and wrong unless the results are deduplicated.',
        correct: false,
      },
      {
        id: 'sort-rows',
        label: 'Sort each row and compare with the row above — O(rows times cols log cols) time',
        note: 'Sorting destroys the column positions that define adjacency. Two racks in the same row are not connected by being next to each other after a sort.',
        correct: false,
      },
    ],
    edges: [
      {
        id: 'diagonal',
        label: 'Two offline racks touching only at a corner',
        note: 'They are two clusters. A flood fill that walks all eight directions merges them and undercounts.',
        correct: true,
      },
      {
        id: 'all-healthy',
        label: 'A wall with no offline racks',
        note: 'The scan never starts a fill, so the count stays zero with no special case.',
        correct: false,
      },
      {
        id: 'one-rack',
        label: 'A single offline rack',
        note: 'One tile, one cluster. The general code handles it; it is a test rather than a branch.',
        correct: false,
      },
    ],
    hints: [
      'What stops the same offline rack being counted again from its neighbour?',
      'Which four neighbours define a cluster, and what would adding the diagonals do to the count?',
    ],
    approaches: [
      {
        name: 'Flood fill with a stack',
        time: 'O(rows times cols)',
        space: 'O(rows times cols)',
        idea: 'Scan every tile. On an unvisited 1, raise the count and mark everything connected with an explicit stack.',
        code: `function countClusters(grid) {
  const rows = grid.length
  const cols = grid[0].length
  const seen = grid.map((row) => row.map(() => false))
  let clusters = 0
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      if (grid[row][col] !== 1 || seen[row][col]) continue
      clusters += 1
      const stack = [[row, col]]
      seen[row][col] = true
      while (stack.length > 0) {
        const [currentRow, currentCol] = stack.pop()
        for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nextRow = currentRow + dr
          const nextCol = currentCol + dc
          if (nextRow < 0 || nextRow >= rows || nextCol < 0 || nextCol >= cols) continue
          if (grid[nextRow][nextCol] !== 1 || seen[nextRow][nextCol]) continue
          seen[nextRow][nextCol] = true
          stack.push([nextRow, nextCol])
        }
      }
    }
  }
  return clusters
}`,
        tradeoff:
          'Explicit stack, so a 500 by 500 block of offline racks does not overflow the call stack.',
      },
      {
        name: 'Flood fill in place',
        time: 'O(rows times cols)',
        space: 'O(1) extra',
        idea: 'Sink each cluster by writing 0 over its tiles as they are visited, so no separate seen grid is needed at the cost of mutating the input.',
        code: `function countClusters(grid) {
  const rows = grid.length
  const cols = grid[0].length
  let clusters = 0
  const sink = (row, col) => {
    if (row < 0 || row >= rows || col < 0 || col >= cols || grid[row][col] !== 1) return
    grid[row][col] = 0
    sink(row - 1, col)
    sink(row + 1, col)
    sink(row, col - 1)
    sink(row, col + 1)
  }
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      if (grid[row][col] === 1) {
        clusters += 1
        sink(row, col)
      }
    }
  }
  return clusters
}`,
        tradeoff:
          'The shortest answer when the caller does not need the grid afterwards. Recursion depth is the risk on a large cluster.',
      },
    ],
    starter: `function countClusters(grid) {
  // 1 is an offline rack. Count four-directionally connected groups.
}`,
    checks: [
      { args: [[[1, 1, 0], [0, 1, 0], [0, 0, 1]]], expected: 2 },
      { args: [[[0, 0], [0, 0]]], expected: 0 },
      { args: [[[1, 0], [0, 1]]], expected: 2 },
      { args: [[[1]]], expected: 1 },
    ],
  },
  {
    id: 'fewest-coins',
    title: 'The fewest vouchers for a total',
    difficulty: 'medium',
    topics: ['dynamic programming', 'greedy'],
    summary:
      'Voucher denominations and a total: the smallest number of vouchers that adds up, or -1 when it cannot be done.',
    statement: [
      'The refund desk holds vouchers in a handful of denominations, with as many of each as it needs. A customer is owed a total and wants the fewest vouchers that make exactly that amount.',
      'Return the smallest number of vouchers, or -1 when the total cannot be made exactly. A total of zero takes no vouchers.',
    ],
    examples: [
      {
        input: 'denominations = [1, 2, 5], total = 11',
        output: '3',
        explanation: '5 + 5 + 1.',
      },
      {
        input: 'denominations = [2], total = 3',
        output: '-1',
      },
      {
        input: 'denominations = [7], total = 0',
        output: '0',
      },
    ],
    constraints: [
      '1 <= denominations.length <= 20',
      '1 <= denomination <= 10,000',
      '0 <= total <= 10,000',
      'Aim for O(total times denominations) time',
    ],
    cues: [
      'A locally best choice is not always globally best: with [1, 3, 4] and 6, the greedy 4 leaves 2 and needs three vouchers where 3 + 3 needs two.',
      'The answer for every smaller total is useful to the answer for this one — that is a table.',
      'Unreachable totals have to be represented, not left as zero.',
    ],
    patterns: [
      {
        id: 'dp',
        label: 'Bottom-up table over every total — O(total times denominations) time, O(total) space',
        note: 'Start from zero vouchers for zero, then fill each total from the totals a denomination below it. Unreachable stays at infinity so the answer can be -1 rather than a wrong number.',
        correct: true,
      },
      {
        id: 'greedy',
        label: 'Take the largest denomination that fits, repeatedly — O(total divided by smallest) time, O(1) space',
        note: 'The trap. It is optimal only for some denomination sets; [1, 3, 4] with 6 breaks it immediately.',
        correct: false,
      },
      {
        id: 'recursion',
        label: 'Try every voucher recursively, taking the minimum — exponential time without memo',
        note: 'Correct once a memo is added, and that memo is the table above. Written plainly it recomputes the same totals many times.',
        correct: false,
      },
      {
        id: 'sort-backtrack',
        label: 'Sort the denominations and backtrack from the total — O(total squared) time',
        note: 'Depth-first search over sums can visit far more states than the table, and needs pruning to stay competitive.',
        correct: false,
      },
    ],
    edges: [
      {
        id: 'zero-total',
        label: 'A total of zero',
        note: 'The base row of the table must be zero vouchers, not infinity. Get that wrong and every answer built on it is wrong.',
        correct: true,
      },
      {
        id: 'unreachable',
        label: 'A total no combination can make',
        note: 'Reachable by the infinity sentinel, so the final check turns it into -1 without a separate search.',
        correct: false,
      },
      {
        id: 'coin-larger',
        label: 'A denomination larger than the total',
        note: 'The table simply never reads it for that total. No branch is needed.',
        correct: false,
      },
    ],
    hints: [
      'What is the answer for a total of zero, and what does every other cell build on?',
      'If the table starts at zero for every total, what goes wrong for a total that cannot be made?',
    ],
    approaches: [
      {
        name: 'Bottom-up table',
        time: 'O(total times denominations)',
        space: 'O(total)',
        idea: 'Fill totals from 1 upwards, each time taking one voucher off and reading the best answer for the remainder.',
        code: `function fewestVouchers(denominations, total) {
  const best = new Array(total + 1).fill(Infinity)
  best[0] = 0
  for (let amount = 1; amount <= total; amount += 1) {
    for (const coin of denominations) {
      if (coin <= amount) {
        best[amount] = Math.min(best[amount], best[amount - coin] + 1)
      }
    }
  }
  return best[total] === Infinity ? -1 : best[total]
}`,
        tradeoff:
          'One row of memory, no recursion, and the unreachable case falls out of the sentinel. The answer to start from.',
      },
      {
        name: 'Memoised top-down',
        time: 'O(total times denominations)',
        space: 'O(total)',
        idea: 'Ask for the best answer for the total, recurse into each smaller remainder, and memoise what comes back.',
        code: `function fewestVouchers(denominations, total) {
  const memo = new Map()
  const fewest = (remaining) => {
    if (remaining === 0) return 0
    if (remaining < 0) return Infinity
    if (memo.has(remaining)) return memo.get(remaining)
    let best = Infinity
    for (const coin of denominations) {
      best = Math.min(best, fewest(remaining - coin) + 1)
    }
    memo.set(remaining, best)
    return best
  }
  const result = fewest(total)
  return result === Infinity ? -1 : result
}`,
        tradeoff:
          'Reads more like the recursive definition and is easier to adapt when the state is more than one number. Recursion depth follows the total.',
      },
    ],
    starter: `function fewestVouchers(denominations, total) {
  // Unlimited vouchers of each denomination. Return the fewest or -1.
}`,
    checks: [
      { args: [[1, 2, 5], 11], expected: 3 },
      { args: [[2], 3], expected: -1 },
      { args: [[7], 0], expected: 0 },
      { args: [[3, 4], 6], expected: 2 },
    ],
  },
  {
    id: 'missing-badge',
    title: 'The smallest badge number nobody has',
    difficulty: 'hard',
    topics: ['arrays', 'in-place', 'hashing'],
    summary:
      'Unsorted badge numbers, negatives, duplicates — the smallest positive number not on the list, in linear time and constant extra space.',
    statement: [
      'The badge drawer holds a list of numbers, unsorted, with duplicates and negatives left over from old systems. New badges start at 1 and go up.',
      'Return the smallest positive integer that does not appear in the list. Do it in O(n) time and O(1) extra space, so sorting and a hash set are both out.',
    ],
    examples: [
      {
        input: 'badges = [3, 4, -1, 1]',
        output: '2',
      },
      {
        input: 'badges = [1, 2, 0]',
        output: '3',
        explanation: '1 and 2 are taken, so the next badge is 3.',
      },
      {
        input: 'badges = [7, 8, 9]',
        output: '1',
      },
    ],
    constraints: [
      '0 <= badges.length <= 100,000',
      '-1,000,000 <= badge <= 1,000,000',
      'O(n) time and O(1) extra space',
      'Duplicates and negatives may appear',
    ],
    cues: [
      'With n numbers, the answer is at most n + 1 — anything larger is impossible.',
      'Only values from 1 to n can affect the answer, so the array itself can act as the hash table.',
      'Constant extra space means the input array is the only writable storage.',
    ],
    patterns: [
      {
        id: 'cyclic-placement',
        label: 'Put each value at its own index, then scan — O(n) time, O(1) extra space',
        note: 'Swap value v to index v - 1 when it is in range and not already there. After one pass, the first index whose value is not its number plus one is the answer.',
        correct: true,
      },
      {
        id: 'sort-scan',
        label: 'Sort, then scan for the first gap — O(n log n) time, O(1) extra space',
        note: 'Simple and correct, and it breaks the stated time budget. In an interview, this is the answer to offer as a comparison, not the one to submit.',
        correct: false,
      },
      {
        id: 'hash-set',
        label: 'Put every positive value in a set, then count up — O(n) time, O(n) space',
        note: 'The natural O(n) answer and the one the space constraint rules out. Say so explicitly rather than presenting it as compliant.',
        correct: false,
      },
      {
        id: 'count-scan',
        label: 'For each candidate, scan the whole array for it — O(n squared) time, O(1) space',
        note: 'Correct and far too slow: 100,000 numbers means ten billion comparisons.',
        correct: false,
      },
    ],
    edges: [
      {
        id: 'all-present',
        label: 'Every value from 1 to n already present',
        note: 'The scan finds no gap, so the answer is n + 1 — one past the end of the array, which is the case that catches a loop written only over the array.',
        correct: true,
      },
      {
        id: 'negatives',
        label: 'Negative values and zero',
        note: 'They are skipped by the range check; they never occupy an index and never affect the answer.',
        correct: false,
      },
      {
        id: 'duplicates',
        label: 'The same badge twice',
        note: 'The placement condition must refuse to move a value already at its index, or duplicates swap forever.',
        correct: false,
      },
    ],
    hints: [
      'With n numbers, how large can the answer be?',
      'If every value in 1..n could sit at the index its own number names, what would a single scan of indices prove?',
    ],
    approaches: [
      {
        name: 'Place each value at its own index',
        time: 'O(n)',
        space: 'O(1) extra',
        idea: 'For each position, keep swapping the value into the index it names while that index is in range and holds something else. Then the first mismatch is the missing badge.',
        code: `function smallestMissingBadge(badges) {
  const n = badges.length
  for (let i = 0; i < n; i += 1) {
    while (badges[i] > 0 && badges[i] <= n && badges[badges[i] - 1] !== badges[i]) {
      const target = badges[i] - 1
      const swap = badges[target]
      badges[target] = badges[i]
      badges[i] = swap
    }
  }
  for (let i = 0; i < n; i += 1) {
    if (badges[i] !== i + 1) return i + 1
  }
  return n + 1
}`,
        tradeoff:
          'Meets both budgets, at the cost of mutating the caller\'s array and a while loop whose termination is the part to explain.',
      },
      {
        name: 'A set of the values',
        time: 'O(n)',
        space: 'O(n)',
        idea: 'Collect the positive values, then walk upwards from 1 until a candidate is absent. The clearest answer when space is not constrained.',
        code: `function smallestMissingBadge(badges) {
  const present = new Set(badges.filter((badge) => badge > 0))
  let candidate = 1
  while (present.has(candidate)) candidate += 1
  return candidate
}`,
        tradeoff:
          'Readable and obviously correct. It fails the O(1) space requirement, so it belongs in the discussion of trade-offs, not the final answer.',
      },
    ],
    starter: `function smallestMissingBadge(badges) {
  // O(n) time, O(1) extra space. badges may contain negatives and duplicates.
}`,
    checks: [
      { args: [[3, 4, -1, 1]], expected: 2 },
      { args: [[1, 2, 0]], expected: 3 },
      { args: [[7, 8, 9]], expected: 1 },
      { args: [[1, 2, 3]], expected: 4 },
    ],
  },
  {
    id: 'tree-right-view',
    title: 'The rightmost rack on every level',
    difficulty: 'medium',
    topics: ['trees', 'breadth-first search', 'depth-first search'],
    summary:
      'A cabinet wired as a binary tree, stored level by level: read the rightmost rack on each level as you look from the aisle.',
    statement: [
      'The cabinet map stores racks in level order: index 0 is the root, and the children of index i sit at 2i + 1 and 2i + 2. A missing slot is null.',
      'Standing in the aisle you can only see the rightmost rack on each level. Return those values from the top down.',
    ],
    examples: [
      {
        input: 'levels = [1, 2, 3, null, 5, null, 4]',
        output: '[1, 3, 4]',
        explanation: 'Level one is the root, level two ends at 3, and level three ends at 4.',
      },
      {
        input: 'levels = [1, 2]',
        output: '[1, 2]',
      },
      {
        input: 'levels = []',
        output: '[]',
      },
    ],
    constraints: [
      '1 <= levels.length <= 100,000 when the tree is not empty',
      'A slot is a value or null, and null slots have no children',
      'The array is level order, not a sorted list',
    ],
    cues: [
      'The answer is one value per level, and breadth-first search already knows where a level ends.',
      'A level can end in a null slot, which is not a rack.',
      'Depth-first search also works, but only if it tracks the depth itself.',
    ],
    patterns: [
      {
        id: 'bfs-levels',
        label: 'Breadth-first search, one level at a time — O(n) time, O(width) space',
        note: 'Hold the current level, collect the next one, and take the last real value from each. The level boundary is the queue, so no extra bookkeeping is needed.',
        correct: true,
      },
      {
        id: 'dfs-depth',
        label: 'Depth-first search with a depth map — O(n) time, O(height + levels) space',
        note: 'Correct: visit right children first and overwrite each depth. It is a fair answer, but it adds a map for something the queue already knows.',
        correct: false,
      },
      {
        id: 'binary-search',
        label: 'Binary search the last level — O(log n) time',
        note: 'Level-order slots are not ordered by value, so there is nothing to halve. The index arithmetic is not a sorted array.',
        correct: false,
      },
      {
        id: 'array-length',
        label: 'Derive each level from the array length — O(1) time',
        note: 'The length counts slots, not levels, and trailing slots may be null. It answers a different question.',
        correct: false,
      },
    ],
    edges: [
      {
        id: 'trailing-null',
        label: 'A level whose last slot is empty',
        note: 'The rightmost slot of a level can be null, and the visible rack is the last real value before it. Taking the slot instead of the value drops that level.',
        correct: true,
      },
      {
        id: 'empty-tree',
        label: 'An empty cabinet',
        note: 'The answer is an empty list. Worth a guard, but it is a boundary rather than a trap.',
        correct: false,
      },
      {
        id: 'single-node',
        label: 'A cabinet with one rack',
        note: 'One level, one value. The general loop handles it without a branch.',
        correct: false,
      },
    ],
    hints: [
      'Which traversal can tell you where one level ends and the next begins without counting anything?',
      'What is the rightmost thing on a level that has a null at its end?',
    ],
    approaches: [
      {
        name: 'Breadth-first search, one level at a time',
        time: 'O(n)',
        space: 'O(width)',
        idea: 'Queue the current level with the root, read each level, and build the next from the slots that actually hold a value.',
        code: `function rightSide(levels) {
  if (levels.length === 0) return []
  const view = []
  let level = [0]
  while (level.length > 0) {
    let last = null
    const next = []
    for (const index of level) {
      const value = levels[index]
      if (value === null || value === undefined) continue
      last = value
      const left = index * 2 + 1
      const right = index * 2 + 2
      if (left < levels.length) next.push(left)
      if (right < levels.length) next.push(right)
    }
    if (last !== null) view.push(last)
    level = next
  }
  return view
}`,
        tradeoff:
          'The direct answer: the level is the queue, so the last real value is the one the eye sees.',
      },
      {
        name: 'Depth-first search, overwrite at each depth',
        time: 'O(n)',
        space: 'O(height)',
        idea: 'Walk left before right and write each value at its depth. The right child is written after the left one, so the last write for a depth is the rightmost node at that depth.',
        code: `function rightSide(levels) {
  const view = []
  const walk = (index, depth) => {
    if (index >= levels.length) return
    const value = levels[index]
    if (value === null || value === undefined) return
    view[depth] = value
    walk(index * 2 + 1, depth + 1)
    walk(index * 2 + 2, depth + 1)
  }
  walk(0, 0)
  return view
}`,
        tradeoff:
          'Less memory on a wide, shallow tree, and the depth is explicit. The output array doubles as the depth map.',
      },
    ],
    starter: `function rightSide(levels) {
  // levels is a level-order tree with nulls. Return each level's rightmost value.
}`,
    checks: [
      { args: [[1, 2, 3, null, 5, null, 4]], expected: [1, 3, 4] },
      { args: [[1, 2]], expected: [1, 2] },
      { args: [[1]], expected: [1] },
      { args: [[]], expected: [] },
    ],
  },
  {
    id: 'bst-floor',
    title: 'The best quote under the budget',
    difficulty: 'medium',
    topics: ['binary search tree', 'trees', 'binary search'],
    summary:
      'A balanced search tree of quotes, and a budget: the largest quote that does not exceed it, found by descending once.',
    statement: [
      'Quotes are stored in a balanced binary search tree, written in level order: every left child is smaller than its parent and every right child is larger. Each slot is a number or null.',
      'Given a budget, return the largest quote that is less than or equal to it, or null when every quote is over budget.',
    ],
    examples: [
      {
        input: 'levels = [10, 5, 15, 3, 7, 12, 20], budget = 8',
        output: '7',
        explanation: '7 is under budget; the next quote up, 10, is over it.',
      },
      {
        input: 'levels = [10, 5, 15, 3, 7, 12, 20], budget = 5',
        output: '5',
      },
      {
        input: 'levels = [10, 5, 15, 3, 7, 12, 20], budget = 2',
        output: 'null',
      },
    ],
    constraints: [
      'The tree is balanced and holds up to 100,000 quotes',
      'All values are distinct',
      'A missing slot is null and has no children',
      'Aim for O(log n) time',
    ],
    cues: [
      'The ordering is in the structure, so one comparison can discard a whole subtree.',
      'A quote under budget is a candidate, but a larger one may still be to its right.',
      'Inorder traversal would give every quote in order, at the cost of reading all of them.',
    ],
    patterns: [
      {
        id: 'descend',
        label: 'Descend once, keeping the best so far — O(log n) time, O(1) space',
        note: 'If the node is over budget, the answer can only be to the left. If it is under, remember it and look right for something better. One path, top to bottom.',
        correct: true,
      },
      {
        id: 'inorder',
        label: 'Inorder traversal, keeping the last value under budget — O(n) time, O(height) space',
        note: 'Correct and simple, and it reads every quote to answer a question about one. The descent exists precisely to avoid that.',
        correct: false,
      },
      {
        id: 'binary-search-array',
        label: 'Binary-search the level-order array — O(log n) time',
        note: 'Level order is not sorted order: the parent sits before both children. Halving the array walks into the wrong subtree.',
        correct: false,
      },
      {
        id: 'sort-values',
        label: 'Collect the values, sort them and scan — O(n log n) time, O(n) space',
        note: 'Correct, and it throws away the structure that made the answer cheap. This is the answer that gets the job done and loses the interview.',
        correct: false,
      },
    ],
    edges: [
      {
        id: 'below-all',
        label: 'A budget smaller than every quote',
        note: 'The descent keeps going left and never records a candidate, so the answer is null. Starting the best value at 0 would invent a quote that does not exist.',
        correct: true,
      },
      {
        id: 'exact-match',
        label: 'A budget equal to a quote',
        note: 'The equal case can return immediately, or be handled by the under-budget branch. Either way it is one comparison, not an edge that needs its own rule.',
        correct: false,
      },
      {
        id: 'skewed',
        label: 'A tree that has become a chain',
        note: 'The constraint promises a balanced tree. If that promise broke, the descent would still be correct but would cost O(n), which is worth saying out loud in an interview.',
        correct: false,
      },
    ],
    hints: [
      'If the current quote is over budget, which subtree can still contain the answer?',
      'If it is under budget, why is it still worth looking to the right?',
    ],
    approaches: [
      {
        name: 'One descent, best so far',
        time: 'O(log n)',
        space: 'O(1)',
        idea: 'Compare at each node: over budget goes left, under budget records the node and goes right.',
        code: `function largestUnder(levels, limit) {
  let index = 0
  let best = null
  while (index < levels.length) {
    const value = levels[index]
    if (value === null || value === undefined) break
    if (value === limit) return value
    if (value < limit) {
      best = value
      index = index * 2 + 2
    } else {
      index = index * 2 + 1
    }
  }
  return best
}`,
        tradeoff:
          'The answer the structure was built for: one path, constant space, no traversal.',
      },
      {
        name: 'Inorder, last one under budget',
        time: 'O(n)',
        space: 'O(height)',
        idea: 'Walk the tree in order and keep the last value that fits. The ordering does the work, but every node is read.',
        code: `function largestUnder(levels, limit) {
  let best = null
  const walk = (index) => {
    if (index >= levels.length) return
    const value = levels[index]
    if (value === null || value === undefined) return
    walk(index * 2 + 1)
    if (value <= limit) best = value
    walk(index * 2 + 2)
  }
  walk(0)
  return best
}`,
        tradeoff:
          'Worth choosing when the question is really about the sorted order — the predecessor and the successor, or a range — rather than one value.',
      },
    ],
    starter: `function largestUnder(levels, limit) {
  // levels is a balanced BST in level order. Return the largest value <= limit.
}`,
    checks: [
      { args: [[10, 5, 15, 3, 7, 12, 20], 8], expected: 7 },
      { args: [[10, 5, 15, 3, 7, 12, 20], 5], expected: 5 },
      { args: [[10, 5, 15, 3, 7, 12, 20], 2], expected: null },
      { args: [[10, 5, 15, 3, 7, 12, 20], 30], expected: 20 },
    ],
  },
  {
    id: 'kth-largest',
    title: 'The kth busiest day in the log',
    difficulty: 'medium',
    topics: ['heaps', 'selection', 'arrays'],
    summary:
      'A million log entries and a small k: the kth largest count, without sorting the whole log and without a worst case you cannot promise.',
    statement: [
      'The audit log counts events per day and hands you one entry per event. The capacity review needs the kth largest daily count, counting duplicates separately.',
      'Return that count. The log is large, k is small, and the worst case has to be bounded — an average case is not enough for a nightly job.',
    ],
    examples: [
      {
        input: 'values = [3, 2, 1, 5, 6, 4], k = 2',
        output: '5',
        explanation: 'The counts in order are 6, 5, 4, 3, 2, 1, so the second is 5.',
      },
      {
        input: 'values = [3, 2, 3, 1, 2, 4, 5, 5, 6], k = 4',
        output: '4',
        explanation: 'Duplicates count separately: 6, 5, 5, 4.',
      },
      {
        input: 'values = [1], k = 1',
        output: '1',
      },
    ],
    constraints: [
      '1 <= values.length <= 1,000,000',
      '1 <= k <= values.length',
      'Duplicates count as separate entries',
      'The worst case must be bounded, and k is small',
    ],
    cues: [
      'Only k values matter at any moment, so the whole input never needs to be held in order.',
      'The kth largest counts duplicates separately — a set would change the answer.',
      'Quickselect is faster on average and has a quadratic worst case, which the brief rules out.',
    ],
    patterns: [
      {
        id: 'heap-k',
        label: 'A min-heap of size k — O(n log k) time, O(k) space',
        note: 'Keep the k largest values seen so far, evicting the smallest when the heap grows past k. Bounded in the worst case, and the heap never holds more than k values.',
        correct: true,
      },
      {
        id: 'sort-all',
        label: 'Sort the whole log and index it — O(n log n) time, O(n) space',
        note: 'Correct and simple. It sorts a million entries to read one of them, and the brief asked for a small k to be exploited.',
        correct: false,
      },
      {
        id: 'quickselect',
        label: 'Quickselect around a random pivot — O(n) average, O(n squared) worst',
        note: 'The fastest answer on average, and the one the brief rules out: a nightly job cannot accept a quadratic tail, however unlikely.',
        correct: false,
      },
      {
        id: 'repeated-max',
        label: 'Find the maximum k times, removing each — O(n times k) time',
        note: 'Correct, and it rescans the whole input k times. For a million entries and even a modest k it is the slowest option here.',
        correct: false,
      },
    ],
    edges: [
      {
        id: 'duplicates',
        label: 'The same count appearing several times',
        note: 'Duplicates count separately, so [3, 2, 3] with k = 2 answers 3, not 2. A set would collapse them and undercount the rank.',
        correct: true,
      },
      {
        id: 'single',
        label: 'A log with one entry',
        note: 'k is 1 and the answer is that entry. The heap handles it; it is a test rather than a branch.',
        correct: false,
      },
      {
        id: 'negative',
        label: 'Negative counts',
        note: 'Comparisons treat negatives like any other number. Only a radix-style sort would need special handling.',
        correct: false,
      },
    ],
    hints: [
      'How many values do you actually need to remember at once?',
      'If the heap holds the k largest so far, which end should be easy to evict?',
    ],
    approaches: [
      {
        name: 'A min-heap of size k',
        time: 'O(n log k)',
        space: 'O(k)',
        idea: 'Push each value, and once the heap has k + 1 values, drop the smallest. What is left has the kth largest at its root.',
        code: `function kthLargest(values, k) {
  const heap = []
  const push = (value) => {
    heap.push(value)
    let i = heap.length - 1
    while (i > 0) {
      const parent = (i - 1) >> 1
      if (heap[parent] <= heap[i]) break
      const swap = heap[parent]
      heap[parent] = heap[i]
      heap[i] = swap
      i = parent
    }
  }
  const pop = () => {
    const top = heap[0]
    const last = heap.pop()
    if (heap.length > 0 && last !== undefined) {
      heap[0] = last
      let i = 0
      while (true) {
        const left = i * 2 + 1
        const right = left + 1
        let smallest = i
        if (left < heap.length && heap[left] < heap[smallest]) smallest = left
        if (right < heap.length && heap[right] < heap[smallest]) smallest = right
        if (smallest === i) break
        const swap = heap[smallest]
        heap[smallest] = heap[i]
        heap[i] = swap
        i = smallest
      }
    }
    return top
  }
  for (const value of values) {
    push(value)
    if (heap.length > k) pop()
  }
  return heap[0]
}`,
        tradeoff:
          'The bounded answer: k values in memory, a logarithmic insertion, and no bad tail.',
      },
      {
        name: 'Sort and index',
        time: 'O(n log n)',
        space: 'O(n)',
        idea: 'Sort descending and take the value at k - 1. Short enough to be the answer in a script that runs once.',
        code: `function kthLargest(values, k) {
  const sorted = [...values].sort((left, right) => right - left)
  return sorted[k - 1]
}`,
        tradeoff:
          'Reach for this when the input is small or a one-off. It is the answer a reviewer will accept and an interviewer will ask you to improve.',
      },
    ],
    starter: `function kthLargest(values, k) {
  // Return the kth largest value, counting duplicates separately.
}`,
    checks: [
      { args: [[3, 2, 1, 5, 6, 4], 2], expected: 5 },
      { args: [[3, 2, 3, 1, 2, 4, 5, 5, 6], 4], expected: 4 },
      { args: [[1], 1], expected: 1 },
      { args: [[3, 2, 3], 2], expected: 3 },
    ],
  },
  {
    id: 'seat-orders',
    title: 'Every order the seats can be filled',
    difficulty: 'medium',
    topics: ['backtracking', 'recursion', 'permutations'],
    summary:
      'A row of seats and a list of names: every ordering, with the output reading lexicographically so two runs agree.',
    statement: [
      'The seating chart takes a list of distinct names and needs every possible order for the row, one array per ordering.',
      'Return all of them in lexicographic order. The names may arrive in any order, but the output must not depend on that order.',
    ],
    examples: [
      {
        input: "labels = ['a', 'b']",
        output: "[['a', 'b'], ['b', 'a']]",
      },
      {
        input: "labels = ['a', 'b', 'c']",
        output: '[6 orderings, beginning with [\'a\', \'b\', \'c\']]',
      },
      {
        input: 'labels = []',
        output: '[[]]',
        explanation: 'One ordering of nothing: the empty row.',
      },
    ],
    constraints: [
      '0 <= labels.length <= 8',
      'Every label is distinct',
      'Output is lexicographic and independent of input order',
    ],
    cues: [
      'The output count is n factorial, so the interesting cost is per arrangement.',
      'Choose, recurse, un-choose is the shape that keeps one partial row in memory.',
      'Sorting the input first is what makes the output deterministic.',
    ],
    patterns: [
      {
        id: 'backtracking',
        label: 'Backtracking over a sorted input — O(n times n!) time, O(n) space',
        note: 'Take an unused label, recurse, then put it back. With the labels sorted and chosen in order, the output is already lexicographic and only one row is held at a time.',
        correct: true,
      },
      {
        id: 'swap',
        label: 'Swap labels in place and recurse — O(n times n!) time, O(1) extra space',
        note: 'Generates every ordering, but not in lexicographic order, so the result would have to be sorted afterwards — n! arrays compared, which is the cost the brief is trying to avoid.',
        correct: false,
      },
      {
        id: 'generate-sort',
        label: 'Generate every ordering, then sort the output — O(n! log n!) time',
        note: 'Correct, and it pays a second, larger cost after the generation. Sorting the input once is the cheap version of the same idea.',
        correct: false,
      },
      {
        id: 'search',
        label: 'Binary-search each label into position — O(n log n) time',
        note: 'A search finds one position in an ordered list. It cannot enumerate orderings: the answer is combinatorial, not a lookup.',
        correct: false,
      },
    ],
    edges: [
      {
        id: 'empty',
        label: 'An empty list of names',
        note: 'The one ordering of nothing is a single empty row, [[]] — not []. Returning [] takes the count from 1 to 0 and breaks every combination that builds on it.',
        correct: true,
      },
      {
        id: 'duplicates',
        label: 'The same name twice',
        note: 'The constraints exclude it. If it arrived, the recursive form would emit duplicate rows and would need a skip-equal-siblings rule.',
        correct: false,
      },
      {
        id: 'sorted-input',
        label: 'Names that already arrive sorted',
        note: 'The sort is a no-op; it is the guarantee that makes the output deterministic, not a special case.',
        correct: false,
      },
    ],
    hints: [
      'If you choose one label and then solve the rest, what has to be undone before the next choice?',
      'Why does sorting the input make the output order predictable?',
    ],
    approaches: [
      {
        name: 'Backtracking with a used map',
        time: 'O(n times n!)',
        space: 'O(n)',
        idea: 'Sort the labels, mark each as used while it sits in the current row, and emit the row when it is full.',
        code: `function permutations(labels) {
  const values = [...labels].sort((left, right) => (left < right ? -1 : 1))
  const used = values.map(() => false)
  const current = []
  const result = []
  const walk = () => {
    if (current.length === values.length) {
      result.push([...current])
      return
    }
    for (let i = 0; i < values.length; i += 1) {
      if (used[i]) continue
      used[i] = true
      current.push(values[i])
      walk()
      current.pop()
      used[i] = false
    }
  }
  walk()
  return result
}`,
        tradeoff:
          'The shape to learn: the same choose/recurse/un-choose pattern handles subsets, combinations and constraint puzzles.',
      },
      {
        name: 'Next permutation, no recursion',
        time: 'O(n times n!)',
        space: 'O(1) extra',
        idea: 'Emit the sorted row, then transform it into the next lexicographic row in place until there is no next.',
        code: `function permutations(labels) {
  const values = [...labels].sort((left, right) => (left < right ? -1 : 1))
  const result = []
  const swap = (i, j) => {
    const held = values[i]
    values[i] = values[j]
    values[j] = held
  }
  while (true) {
    result.push([...values])
    let pivot = values.length - 2
    while (pivot >= 0 && values[pivot] >= values[pivot + 1]) pivot -= 1
    if (pivot < 0) break
    let larger = values.length - 1
    while (values[larger] <= values[pivot]) larger -= 1
    swap(pivot, larger)
    for (let left = pivot + 1, right = values.length - 1; left < right; left += 1, right -= 1) {
      swap(left, right)
    }
  }
  return result
}`,
        tradeoff:
          'No recursion and no used map, which matters when the row is long and the call stack is a real limit.',
      },
    ],
    starter: `function permutations(labels) {
  // Return every ordering, lexicographically.
}`,
    checks: [
      {
        args: [['a', 'b']],
        expected: [
          ['a', 'b'],
          ['b', 'a'],
        ],
      },
      { args: [['a']], expected: [['a']] },
      { args: [[]], expected: [[]] },
      {
        args: [['a', 'b', 'c']],
        expected: [
          ['a', 'b', 'c'],
          ['a', 'c', 'b'],
          ['b', 'a', 'c'],
          ['b', 'c', 'a'],
          ['c', 'a', 'b'],
          ['c', 'b', 'a'],
        ],
      },
    ],
  },
  {
    id: 'memo-climb',
    title: 'Counting ways up the rack ladder',
    difficulty: 'easy',
    topics: ['dynamic programming', 'memoisation', 'recursion'],
    summary:
      'A ladder of n rungs and a set of allowed step sizes: how many distinct routes, once the repeated work is cached?',
    statement: [
      'A rack ladder allows certain step sizes. Starting on the floor, count the distinct sequences of steps that land exactly on rung n, in any order of step sizes.',
      'Return the number of routes. A target of 0 is one route — the empty climb — and an unreachable target is 0.',
    ],
    examples: [
      {
        input: 'steps = [1, 2], target = 3',
        output: '3',
        explanation: '1+1+1, 1+2, 2+1.',
      },
      {
        input: 'steps = [1, 2], target = 0',
        output: '1',
      },
      {
        input: 'steps = [2], target = 3',
        output: '0',
      },
    ],
    constraints: [
      '1 <= steps.length <= 10',
      '1 <= step <= 100',
      '0 <= target <= 1,000',
      'The answer fits in a double for these bounds',
    ],
    cues: [
      'The routes to rung n are built from the routes to lower rungs — the same subtargets recur.',
      'Without a cache, every route is recomputed from scratch, which is exponential.',
      'Target 0 has one route, and it is the base case everything else stands on.',
    ],
    patterns: [
      {
        id: 'memoise',
        label: 'Memoised recursion over the target — O(target times steps) time, O(target) space',
        note: 'Ask for the routes to a remaining height, cache each distinct height, and the tree collapses to one answer per height. The first answer to reach for.',
        correct: true,
      },
      {
        id: 'plain-recursion',
        label: 'Plain recursion over the step choices — exponential time',
        note: 'Correct and unusable above a small target: the same subtarget is recomputed once per route that reaches it.',
        correct: false,
      },
      {
        id: 'greedy',
        label: 'Take the largest step that fits — O(target) time, O(1) space',
        note: 'Counts one route, not every route. The question asks how many, so a greedy walk answers a different problem.',
        correct: false,
      },
      {
        id: 'binary-search',
        label: 'Binary-search the reachable heights — O(steps log target) time',
        note: 'The set of reachable heights is not contiguous and not searched; it is built by adding steps, which is what the recurrence does.',
        correct: false,
      },
    ],
    edges: [
      {
        id: 'zero',
        label: 'A target of zero',
        note: 'One route: do nothing. If the base case is 0 instead of 1, every count built on it is 0 — the most common wrong answer to this question.',
        correct: true,
      },
      {
        id: 'unreachable',
        label: 'A target no combination can reach',
        note: 'The recursion simply sums to 0. No branch is needed beyond the ones that fall below zero.',
        correct: false,
      },
      {
        id: 'duplicate-steps',
        label: 'The same step size twice',
        note: 'The constraints exclude it. If it arrived, the recurrence would count identical routes more than once and the steps would need deduplicating.',
        correct: false,
      },
    ],
    hints: [
      'Which smaller questions does the answer for rung n depend on?',
      'What should the answer be for rung zero, and what happens to every count if it is wrong?',
    ],
    approaches: [
      {
        name: 'Memoised recursion',
        time: 'O(target times steps)',
        space: 'O(target)',
        idea: 'Count routes to the remaining height, caching each height so it is solved once however many routes reach it.',
        code: `function climbWays(steps, target) {
  const unique = [...new Set(steps)]
  const memo = new Map([[0, 1]])
  const ways = (remaining) => {
    if (remaining < 0) return 0
    if (memo.has(remaining)) return memo.get(remaining)
    let total = 0
    for (const step of unique) {
      total += ways(remaining - step)
    }
    memo.set(remaining, total)
    return total
  }
  return ways(target)
}`,
        tradeoff:
          'The readable version, and the one to write when the state is richer than a single number.',
      },
      {
        name: 'Bottom-up table',
        time: 'O(target times steps)',
        space: 'O(target)',
        idea: 'Fill routes from rung 1 upwards, each time adding the answers for the rungs a step below.',
        code: `function climbWays(steps, target) {
  const unique = [...new Set(steps)]
  const ways = new Array(target + 1).fill(0)
  ways[0] = 1
  for (let height = 1; height <= target; height += 1) {
    for (const step of unique) {
      if (step <= height) ways[height] += ways[height - step]
    }
  }
  return ways[target]
}`,
        tradeoff:
          'No call stack, and the same states in the same order. Prefer it when the target is deep enough to threaten recursion depth.',
      },
    ],
    starter: `function climbWays(steps, target) {
  // Count distinct step sequences that land exactly on the target.
}`,
    checks: [
      { args: [[1, 2], 3], expected: 3 },
      { args: [[1, 2], 0], expected: 1 },
      { args: [[2], 3], expected: 0 },
      { args: [[1, 3, 4], 5], expected: 6 },
    ],
  },
  {
    id: 'window-peaks',
    title: 'The peak in every shift window',
    difficulty: 'hard',
    topics: ['deque', 'sliding window', 'arrays'],
    summary:
      'A staff rota in shifts: the busiest level in every window of k, tracked with a deque instead of rescanning the window.',
    statement: [
      'A rota records the staffing level for every hour. For each window of k consecutive hours, report the peak level in that window.',
      'Return the peaks in order, left to right. If k is larger than the rota, there is no full window and the answer is empty.',
    ],
    examples: [
      {
        input: 'values = [1, 3, -1, -3, 5, 3, 6, 7], k = 3',
        output: '[3, 3, 5, 5, 6, 7]',
      },
      {
        input: 'values = [1], k = 1',
        output: '[1]',
      },
      {
        input: 'values = [9, 8], k = 3',
        output: '[]',
      },
    ],
    constraints: [
      '1 <= values.length <= 200,000',
      '1 <= k <= values.length unless stated otherwise',
      'Aim for O(n) time',
    ],
    cues: [
      'Windows overlap by k - 1 hours, so almost all the work of one window is reused by the next.',
      'A value that is smaller than a later value can never be a peak again — it can be dropped now.',
      'Values leave the window from the left and enter from the right: that is a deque.',
    ],
    patterns: [
      {
        id: 'deque',
        label: 'A monotonic deque of indices — O(n) time, O(k) space',
        note: 'Keep indices whose values are decreasing. Evict from the front when an index falls out of the window and from the back when a smaller value is beaten by the new one. The front is the peak.',
        correct: true,
      },
      {
        id: 'rescan',
        label: 'Rescan each window — O(n times k) time, O(1) space',
        note: 'Correct and simple, and it redoes k - 1 comparisons per window. On 200,000 hours with a wide window it is the answer that times out.',
        correct: false,
      },
      {
        id: 'sort-window',
        label: 'Sort each window and take the last — O(n times k log k) time',
        note: 'Correct, and more work than the rescan it replaces. Sorting the window also throws away the order that made the next window cheap.',
        correct: false,
      },
      {
        id: 'prefix-max',
        label: 'Build a prefix maximum and read it at each window end — O(n) time',
        note: 'A prefix maximum keeps the best value seen so far, not the best value still inside the window. Once the peak leaves, it stays in the prefix.',
        correct: false,
      },
    ],
    edges: [
      {
        id: 'short-input',
        label: 'k larger than the whole rota',
        note: 'There is no full window, so the answer is empty rather than the maximum of everything. Returning that maximum is a whole-window answer to a different question.',
        correct: true,
      },
      {
        id: 'duplicates',
        label: 'Two hours with the same level inside one window',
        note: 'The eviction compares with <=, so the older equal value is dropped and the newer index survives. No special case is needed, but the comparison is the whole reason it stays correct.',
        correct: false,
      },
      {
        id: 'k-one',
        label: 'A window of one hour',
        note: 'Every window is one value, which the general loop emits without a branch.',
        correct: false,
      },
    ],
    hints: [
      'When a new value arrives, which earlier values can never be a peak again?',
      'Which end of the structure holds the peak, and which end do new values arrive at?',
    ],
    approaches: [
      {
        name: 'A monotonic deque of indices',
        time: 'O(n)',
        space: 'O(k)',
        idea: 'Drop indices that have left the window from the front, drop beaten values from the back, and read the front once the first window is full.',
        code: `function windowMax(values, k) {
  if (k <= 0 || values.length < k) return []
  const result = []
  const deque = []
  for (let i = 0; i < values.length; i += 1) {
    while (deque.length > 0 && deque[0] <= i - k) deque.shift()
    while (deque.length > 0 && values[deque[deque.length - 1]] <= values[i]) deque.pop()
    deque.push(i)
    if (i >= k - 1) result.push(values[deque[0]])
  }
  return result
}`,
        tradeoff:
          'The linear answer, with the window\'s peak always at the front. The deque holds indices so it can tell when a value leaves the window.',
      },
      {
        name: 'Rescan every window',
        time: 'O(n times k)',
        space: 'O(1)',
        idea: 'For each start, walk the k values and keep the largest. Short, obvious and quadratic in the window width.',
        code: `function windowMax(values, k) {
  const result = []
  for (let start = 0; start + k <= values.length; start += 1) {
    let best = values[start]
    for (let i = start + 1; i < start + k; i += 1) {
      if (values[i] > best) best = values[i]
    }
    result.push(best)
  }
  return result
}`,
        tradeoff:
          'Use it when k is tiny or the input is short: it is easier to get right, and the cost only shows on wide windows.',
      },
    ],
    starter: `function windowMax(values, k) {
  // Return the maximum of every k-wide window, left to right.
}`,
    checks: [
      { args: [[1, 3, -1, -3, 5, 3, 6, 7], 3], expected: [3, 3, 5, 5, 6, 7] },
      { args: [[1], 1], expected: [1] },
      { args: [[9, 8], 3], expected: [] },
      { args: [[1, 2, 3], 1], expected: [1, 2, 3] },
    ],
  },
  {
    id: 'loop-badges',
    title: 'A chain of badge references that loops',
    difficulty: 'medium',
    topics: ['linked list', 'two pointers', 'cycle detection'],
    summary:
      'Each badge points at the next one, and one of them may point back into the chain: say whether the chain loops, with constant space.',
    statement: [
      'The badge register stores, for each badge index, the index of the badge it points at, or -1 at the end of the chain. A broken import can make a chain point back into itself.',
      'Starting from the head index, return true when the chain loops and false when it ends at -1. The register is read-only and the extra space must be constant.',
    ],
    examples: [
      {
        input: 'next = [1, 2, 3, 1], head = 0',
        output: 'true',
        explanation: '0 → 1 → 2 → 3 → 1, so the chain loops from 1 onwards.',
      },
      {
        input: 'next = [1, 2, -1], head = 0',
        output: 'false',
      },
      {
        input: 'next = [0], head = 0',
        output: 'true',
        explanation: 'A badge pointing at itself is a loop of one.',
      },
    ],
    constraints: [
      '0 <= next.length <= 100,000',
      'Each entry is an index in the array or -1',
      'head is an index or -1 for an empty chain',
      'O(1) extra space, and the register must not be modified',
    ],
    cues: [
      'A loop is a repeat visit, but remembering visits costs O(n) space.',
      'Two walkers at different speeds must meet inside a loop and cannot meet without one.',
      'A chain that ends at -1 is the normal exit, not an error.',
    ],
    patterns: [
      {
        id: 'fast-slow',
        label: 'Fast and slow pointers — O(n) time, O(1) space',
        note: 'Move one pointer a step and the other two. In a loop they meet; without one the fast pointer reaches -1. No visits are remembered, so the register stays read-only.',
        correct: true,
      },
      {
        id: 'visited-set',
        label: 'Remember every visited index in a set — O(n) time, O(n) space',
        note: 'The obvious answer and the one the space constraint rules out. Worth saying aloud as the trade-off, not writing as the solution.',
        correct: false,
      },
      {
        id: 'mark-visited',
        label: 'Mark visited entries in the array — O(n) time, O(1) space',
        note: 'Fast and constant-space, but it writes to the register the brief says is read-only. It also destroys the input for anyone who needs it next.',
        correct: false,
      },
      {
        id: 'recursive',
        label: 'Walk recursively until the index repeats or ends — recursion depth O(n)',
        note: 'Correct, and it needs somewhere to remember the repeat — the call stack only grows, so this is the set with a worse memory story.',
        correct: false,
      },
    ],
    edges: [
      {
        id: 'ends',
        label: 'A chain that ends at -1',
        note: 'The loop has to stop on the end marker without reading next[-1] on the fast pointer\'s second step. That guard is the difference between false and a crash.',
        correct: true,
      },
      {
        id: 'self-loop',
        label: 'A badge pointing at itself',
        note: 'The first pair of moves lands both pointers on it. No extra rule is needed.',
        correct: false,
      },
      {
        id: 'empty',
        label: 'An empty chain, head = -1',
        note: 'The loop is never entered and the answer is false. A boundary worth a test, not a branch.',
        correct: false,
      },
    ],
    hints: [
      'What can two walkers at different speeds prove that one walker cannot, without remembering anything?',
      'Where does the fast pointer land on a chain with no loop, and what must the loop condition check before reading there?',
    ],
    approaches: [
      {
        name: 'Fast and slow pointers',
        time: 'O(n)',
        space: 'O(1)',
        idea: 'Advance one step and two steps at a time. A loop forces a meeting; an end stops the faster pointer first.',
        code: `function hasLoop(next, head) {
  let slow = head
  let fast = head
  while (fast !== -1 && next[fast] !== -1) {
    slow = next[slow]
    fast = next[next[fast]]
    if (slow === fast) return true
  }
  return false
}`,
        tradeoff:
          'The trick to know by heart: two speeds, no memory, and a loop cannot avoid a meeting.',
      },
      {
        name: 'Remember visited indices',
        time: 'O(n)',
        space: 'O(n)',
        idea: 'Walk once, keeping a set of indices. A repeat is a loop; reaching -1 is not.',
        code: `function hasLoop(next, head) {
  const seen = new Set()
  let current = head
  while (current !== -1) {
    if (seen.has(current)) return true
    seen.add(current)
    current = next[current]
  }
  return false
}`,
        tradeoff:
          'The version to write when space is free and the intent has to be obvious. It is also the one interviewers ask you to improve.',
      },
    ],
    starter: `function hasLoop(next, head) {
  // next[i] is the index after i, or -1. Detect a cycle with O(1) extra space.
}`,
    checks: [
      { args: [[1, 2, 3, 1], 0], expected: true },
      { args: [[1, 2, -1], 0], expected: false },
      { args: [[-1], 0], expected: false },
      { args: [[0], 0], expected: true },
    ],
  },
]

/** Lookup by the slug in the URL. */
export function findDsaProblem(id: string): DsaProblem | undefined {
  return DSA_PROBLEMS.find((problem) => problem.id === id)
}

export const DSA_DIFFICULTIES = ['easy', 'medium', 'hard'] as const
