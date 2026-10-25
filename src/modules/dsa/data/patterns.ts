import type { DsaPatternGroup } from '../types'

/**
 * The sheet on the wall, in the app's words.
 *
 * The learner's own cheat sheet lists the cue first — "the input is sorted",
 * "the input is a binary tree" — and then the techniques that cue licenses, each
 * with its cost. That shape is the whole point: recognition before technique.
 * This file keeps the sheet's structure and rewrites the lines as sentences the
 * lab can teach from, with a link to the problem that drills each one where the
 * bank has it.
 *
 * The costs are copied with the sheet's own caveats intact: quickselect is
 * O(n) on average and O(n squared) in the worst case, quicksort likewise, and a
 * binary search tree is only O(log n) while it stays balanced. A sheet that hides
 * those is the reason people lose interviews.
 */
export const DSA_PATTERN_GROUPS: readonly DsaPatternGroup[] = [
  {
    id: 'input-shape',
    title: 'What the input is',
    entries: [
      {
        id: 'sorted-input',
        cue: 'The input is sorted',
        why: 'Order is information you did not pay for: it turns a scan into a search or a one-pass walk.',
        tools: [
          {
            name: 'Binary search',
            time: 'O(log n)',
            space: 'O(1)',
            note: 'Halve the range on each comparison. Works on anything with a monotone predicate, not only exact matches.',
            problemId: 'rotated-log',
          },
          {
            name: 'Two pointers',
            time: 'O(n)',
            note: 'One pointer at each end, moving the one the comparison rules out. The cheapest answer when the whole input has to be considered.',
            problemId: 'pair-sum-sorted',
          },
        ],
      },
      {
        id: 'binary-tree',
        cue: 'The input is a binary tree',
        why: 'There is no index arithmetic, only children, so the traversal is the algorithm.',
        tools: [
          {
            name: 'Depth-first search',
            time: 'O(n)',
            space: 'O(height)',
            note: 'Preorder, inorder or postorder depending on when the node itself is handled. Recursion is the short form; an explicit stack is the safe one.',
            problemId: 'tree-right-view',
          },
          {
            name: 'Breadth-first search',
            time: 'O(n)',
            space: 'O(width)',
            note: 'Level order. The answer is per level — widest level, rightmost node, level averages — when the queue already knows the boundary.',
            problemId: 'tree-right-view',
          },
        ],
      },
      {
        id: 'bst',
        cue: 'The input is a binary search tree',
        why: 'Ordering is built into the structure, so a descent can discard half the tree per comparison.',
        tools: [
          {
            name: 'Descend with Left < Cur < Right',
            time: 'O(log n)',
            space: 'O(1)',
            note: 'Follow the comparison to one child and never look back. O(log n) only while the tree is balanced; a skewed one degrades to O(n).',
            problemId: 'bst-floor',
          },
          {
            name: 'Inorder traversal',
            time: 'O(n)',
            note: 'Visits the nodes in ascending order, which is the answer when the question is about the whole ordering rather than one value.',
          },
        ],
      },
      {
        id: 'graph-grid',
        cue: 'The input is a matrix or a graph',
        why: 'The shape is arbitrary connections, so marking what has been visited is what stops the work repeating.',
        tools: [
          {
            name: 'Depth-first search',
            time: 'O(V + E)',
            space: 'O(V)',
            note: 'Recursion or an explicit stack. Natural for flood fills, connected components and cycle detection.',
            problemId: 'cluster-count',
          },
          {
            name: 'Breadth-first search',
            time: 'O(V + E)',
            space: 'O(V)',
            note: 'A queue, one ring at a time. The default when distance matters, because the first visit is the shortest one.',
            problemId: 'grid-exit',
          },
        ],
      },
      {
        id: 'linked-list',
        cue: 'The input is a linked list',
        why: 'You cannot index into it, and the head can move, so pointer bookkeeping is the problem.',
        tools: [
          {
            name: 'A dummy node',
            time: 'O(1)',
            space: 'O(1)',
            note: 'A node before the head removes every "is this the first node" branch from an insert or delete.',
          },
          {
            name: 'Two pointers',
            time: 'O(n)',
            note: 'One pointer ahead of the other finds the middle or the nth-from-last node in a single pass.',
            problemId: 'loop-badges',
          },
          {
            name: 'Fast and slow pointers',
            time: 'O(n)',
            space: 'O(1)',
            note: 'A cycle makes the two meet; no extra set is needed. The same trick finds the middle and the duplicate in an array of indices.',
            problemId: 'loop-badges',
          },
        ],
      },
      {
        id: 'nested-pairs',
        cue: 'The input is a sequence of nested open and close pairs',
        why: 'The most recent opener must close next, which is a last-in-first-out problem even when the characters have nothing to do with code.',
        tools: [
          {
            name: 'A stack',
            time: 'O(n)',
            space: 'O(n)',
            note: 'Push an opener, pop and compare on a closer, and require an empty stack at the end. Counting per kind proves nothing about the order.',
            problemId: 'balanced-route',
          },
        ],
      },
      {
        id: 'string-building',
        cue: 'You are concatenating strings in a loop',
        why: 'Strings are immutable in most languages, so every + copies what came before.',
        tools: [
          {
            name: 'Build a list, join once',
            time: 'O(n)',
            note: 'A StringBuilder in Java or C#, String.join in Python, an array and join in JavaScript. Append to the list and pay once.',
          },
        ],
      },
    ],
  },
  {
    id: 'what-you-need',
    title: 'What the question asks for',
    entries: [
      {
        id: 'shortest-path',
        cue: 'You need the shortest path or distance',
        why: 'The word "shortest" decides the traversal, and whether edge weights exist decides the algorithm.',
        tools: [
          {
            name: 'Breadth-first search',
            time: 'O(V + E)',
            note: 'Correct exactly when every edge costs the same. The first time a node is reached is the shortest way to it.',
            problemId: 'grid-exit',
          },
          {
            name: 'Dijkstra',
            time: 'O(E log V)',
            space: 'O(V)',
            note: 'Weighted edges and no negative weights. Relax the cheapest unsettled node each step with a priority queue. Not drilled here yet.',
          },
        ],
      },
      {
        id: 'kth-element',
        cue: 'You need the top or least kth element',
        why: 'You do not need the whole ordering, only one rank or a small group, and that is what makes it cheaper than sorting.',
        tools: [
          {
            name: 'Quickselect',
            time: 'O(n) average, O(n squared) worst',
            space: 'O(1)',
            note: 'Partition around a pivot and follow only the side holding the rank. Fast in practice, with a worst case an interviewer will ask about.',
          },
          {
            name: 'A heap of size k',
            time: 'O(n log k)',
            space: 'O(k)',
            note: 'Keep the k best values seen so far. The bounded worst case, and the answer when the input arrives as a stream.',
            problemId: 'kth-largest',
          },
        ],
      },
      {
        id: 'sorting',
        cue: 'You need the input sorted',
        why: 'The built-in sort is the default; the interesting answer is why you would not use it.',
        tools: [
          {
            name: 'Built-in sort',
            time: 'O(n log n)',
            note: 'Written and tuned for you. Reach for it unless the question is specifically about the algorithm or its extra space.',
            problemId: 'merge-queues',
          },
          {
            name: 'Sort the events into one timeline',
            time: 'O(n log n)',
            note: 'Sorting starts and ends into one order turns overlapping intervals into a single sweep, which is how a peak count becomes linear after the sort.',
            problemId: 'busiest-desk',
          },
          {
            name: 'Merge sort',
            time: 'O(n log n)',
            space: 'O(n)',
            note: 'Stable and predictable; the sort to name when stability matters or the data does not fit in memory.',
          },
          {
            name: 'Quicksort',
            time: 'O(n log n) average, O(n squared) worst',
            space: 'O(log n)',
            note: 'In place and cache friendly. The worst case is why production sorts use it with guards or fall back to another algorithm.',
          },
        ],
      },
      {
        id: 'common-strings',
        cue: 'The question is about common strings or prefixes',
        why: 'Comparing strings repeatedly is the cost to remove; a keyed structure does the comparing once.',
        tools: [
          {
            name: 'A map keyed by the string',
            time: 'O(1) average per lookup',
            space: 'O(n)',
            note: 'Counts, groupings and membership in one pass. A sorted key or a tuple key makes anagrams and canonical forms cheap.',
            problemId: 'unique-run',
          },
          {
            name: 'A trie',
            time: 'O(length of the prefix)',
            space: 'O(total characters)',
            note: 'Shared prefixes stored once. The structure for autocomplete, prefix counts and word-search grids. Not drilled here yet.',
          },
        ],
      },
      {
        id: 'permutations',
        cue: 'The answer is permutations, combinations or subsets',
        why: 'The output size is exponential, so the work per arrangement is what you can control.',
        tools: [
          {
            name: 'Backtracking',
            time: 'O(n times n!) for permutations, O(2 to the n) for subsets',
            space: 'O(n) for the current path',
            note: 'Choose, recurse, un-choose. Prune as early as the constraints allow; sorting the input first also makes the output deterministic.',
            problemId: 'seat-orders',
          },
        ],
      },
      {
        id: 'stream-extremes',
        cue: 'You need the smallest, largest or median of a stream',
        why: 'A stream cannot be re-read, so the answer has to be maintained rather than recomputed.',
        tools: [
          {
            name: 'Two heaps',
            time: 'O(log n) per insert, O(1) to read',
            space: 'O(n)',
            note: 'A max-heap for the lower half and a min-heap for the upper. The median is the top of one or the average of both tops. Not drilled here yet.',
          },
        ],
      },
    ],
  },
  {
    id: 'constraints',
    title: 'What the constraints forbid',
    entries: [
      {
        id: 'recompute',
        cue: 'You are recomputing the same input',
        why: 'Overlapping subproblems are the signal for memoisation, and the table is the same idea written upwards.',
        tools: [
          {
            name: 'Memoisation',
            time: 'number of states times the work per state',
            space: 'O(states)',
            note: 'Cache the answer for each distinct input. The recursion tree collapses from exponential to the number of states.',
            problemId: 'memo-climb',
          },
          {
            name: 'Dynamic programming',
            time: 'number of states times the choices per state',
            space: 'O(states)',
            note: 'Fill the table from the base case upwards. Usually the same answer without the call stack.',
            problemId: 'fewest-coins',
          },
        ],
      },
      {
        id: 'no-recursion',
        cue: 'Recursion is banned or too deep',
        why: 'The call stack is memory too, and a hidden bound is still a bound.',
        tools: [
          {
            name: 'An explicit stack',
            time: 'same as the recursion',
            space: 'O(depth) on the heap instead',
            note: 'Push the work that the recursive call would have done. The traversal is the same; only where the stack lives changes.',
            problemId: 'tree-right-view',
          },
          {
            name: 'Pointers instead of a stack',
            time: 'same as the recursion',
            space: 'O(1)',
            note: 'Fast and slow pointers replace a visited set for cycle and middle questions.',
            problemId: 'loop-badges',
          },
        ],
      },
      {
        id: 'in-place',
        cue: 'It must be solved in place',
        why: 'Constant extra space means the input array is the only writable storage, so it has to hold two facts at once.',
        tools: [
          {
            name: 'Swap corresponding values',
            time: 'O(n)',
            space: 'O(1)',
            note: 'Put each value where its index says it belongs; the first mismatch is the answer.',
            problemId: 'missing-badge',
          },
          {
            name: 'Store two values in one number',
            time: 'O(n)',
            space: 'O(1)',
            note: 'Encode the old and new value in one slot — a sign, a quotient and remainder, an offset — then decode on a second pass. Used by rotate-image and set-matrix-zeroes.',
          },
        ],
      },
      {
        id: 'max-min-options',
        cue: 'You need the best subarray, subset or sequence of choices',
        why: 'The answer to a prefix depends on the best answer to a shorter prefix, which is a table or a rolling variable.',
        tools: [
          {
            name: 'Dynamic programming',
            time: 'states times choices',
            space: 'as much as the states need, often one row',
            note: 'Define the state, the transition and the base case before writing anything. Most array DP collapses to a couple of rolling variables.',
            problemId: 'fewest-coins',
          },
        ],
      },
      {
        id: 'membership',
        cue: 'You need membership checks or counts',
        why: 'A linear scan per question is the cost a set removes.',
        tools: [
          {
            name: 'A map or set',
            time: 'O(1) average per operation',
            space: 'O(n)',
            note: 'Counts, deduplication and "have I seen this". The price is memory, which is why the in-place questions rule it out.',
            problemId: 'unique-run',
          },
        ],
      },
      {
        id: 'deque',
        cue: 'You need both ends of a queue, or the maximum of a moving window',
        why: 'A monotonic deque keeps the candidates in order and drops the ones that can never win again.',
        tools: [
          {
            name: 'A deque',
            time: 'O(n)',
            space: 'O(k)',
            note: 'Stores indices, not values: the front is the current window maximum and the back is where smaller values are evicted. Replaces a stack, a queue or a linked list when both ends move.',
            problemId: 'window-peaks',
          },
        ],
      },
    ],
  },
]

export function findPatternEntry(id: string): (typeof DSA_PATTERN_GROUPS)[number]['entries'][number] | undefined {
  for (const group of DSA_PATTERN_GROUPS) {
    const entry = group.entries.find((candidate) => candidate.id === id)
    if (entry) return entry
  }
  return undefined
}
