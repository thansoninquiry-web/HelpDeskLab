import type { LanguageTrack } from '../types'

/**
 * Java, as the language actually behaves on a current JDK.
 *
 * The four lessons are the ones a new Java reader gets wrong first: wrappers and
 * `==`, string building, the iterator contract, and what closes when. The
 * snippets are complete enough to paste into `jshell`, which is the honest way
 * to check any of them.
 */
export const JAVA_TRACK: LanguageTrack = {
  id: 'java',
  name: 'Java',
  runtime: 'JDK 21, no framework',
  blurb:
    'The language underneath most enterprise service desks: objects and wrappers, text, collections, and resources that close themselves.',
  canDo: [
    'Read a stack trace and say which of your classes threw and why',
    'Tell a value comparison from a reference comparison before it reaches production',
    'Choose a collection by the question being asked, and change it without breaking its iterator',
    'Write a method that closes its files and streams on every path, including the failure',
  ],
  lessons: [
    {
      id: 'wrappers-and-equality',
      title: 'Primitives, wrappers, and the equality trap',
      summary:
        'Why `==` is right for an `int` and wrong for an `Integer`, and where an unboxed `null` turns into a crash.',
      minutes: 8,
      sections: [
        {
          heading: 'Two families of type',
          body: [
            'Java has eight primitive types — `int`, `long`, `boolean`, `char`, and four more — which hold a value directly and cannot be null. Everything else is a reference to an object, and a reference can be null.',
            'Collections and generics only work with object types, so the language bridges the two with wrappers: `int` becomes `Integer`, `long` becomes `Long`. Converting is automatic (autoboxing) in both directions, and that convenience hides a reference where the reader expects a value.',
          ],
          code: {
            source: `int count = 3;          // a value
Integer boxed = count;  // autoboxed: a reference to an Integer
int again = boxed;      // unboxed: reads .intValue() for you

Integer nothing = null;
int crash = nothing;    // NullPointerException at run time`,
            caption: 'Boxing happens silently, including the third line when there is nothing to unbox.',
          },
        },
        {
          heading: '`==` asks about identity, `.equals` asks about value',
          body: [
            'On primitives `==` compares values, which is what everyone expects. On references it compares which object is which — two `Integer` objects holding 128 are still two objects.',
            'The one exception trips people up: the language requires boxed values from -128 to 127 to be cached, so small wrappers are the same object. The code below therefore prints `true` and `false` for two comparisons that look identical.',
          ],
          code: {
            source: `Integer smallA = 127;
Integer smallB = 127;
Integer bigA = 128;
Integer bigB = 128;

System.out.println(smallA == smallB);      // true  — same cached object
System.out.println(bigA == bigB);          // false — two objects
System.out.println(bigA.equals(bigB));     // true  — same value`,
            caption: 'The cache is an optimisation; writing code that depends on it is a bug waiting for a value of 128.',
          },
          note:
            'Compare wrappers with `equals` — or unbox both to primitives first. `Objects.equals(a, b)` is the null-safe version when either side may be null.',
        },
        {
          heading: 'Where the trap hides in normal code',
          body: [
            'Two overloads that look the same take different arguments: `List.remove(int index)` and `List.remove(Object value)`. Passing a literal `1` picks the index overload, so a list of ids loses its second element rather than the id 1.',
            'A `Map` lookup is safer because keys are compared with `equals`, but a map keyed by `Long` will not answer a lookup with an `Integer`, however equal the numbers look. And a wrapper in a `Map` that is read into an `int` will throw on a missing key if the value is null.',
          ],
          code: {
            source: `List<Integer> ids = new ArrayList<>(List.of(10, 20, 30));
ids.remove(1);                     // removes index 1 → [10, 30]
ids.remove(Integer.valueOf(10));   // removes the value 10 → [30]

Map<Long, String> owners = new HashMap<>();
owners.put(7L, "workshop");
owners.get(7);                     // null — Integer is not Long`,
            caption: 'The overload is chosen at compile time from the argument’s type.',
          },
        },
      ],
      takeaway:
        'Use `==` for primitives and `.equals` for anything that is an object; autocached small wrappers are a coincidence, not a rule.',
    },
    {
      id: 'strings-and-building',
      title: 'Strings are immutable, so build text deliberately',
      summary:
        'Concatenation in a loop is quadratic, `==` on strings is identity, and a builder is the tool for text assembled from parts.',
      minutes: 7,
      sections: [
        {
          heading: 'A `String` never changes',
          body: [
            'Every method that appears to change a string returns a new one. `trim()`, `replace()`, `toUpperCase()` and `substring()` all leave the original untouched, which is why ignoring the return value is the most common string bug in a code review.',
            'Immutability is also why a string is safe to share between threads and to use as a map key, and why the compiler can pool literals: two identical literals are usually the same object. That pooling is exactly why `==` appears to work in a test and fails on data read from a file.',
          ],
          code: {
            source: `String host = "desk-01";
String shouted = host.toUpperCase();   // a new string
System.out.println(host);              // desk-01, unchanged

String a = "desk-01";
String b = new String("desk-01");
System.out.println(a == b);            // false — different objects
System.out.println(a.equals(b));       // true  — same text`,
          },
        },
        {
          heading: 'Joining in a loop',
          body: [
            '`text += part` inside a loop copies the whole string on every pass, so n parts cost roughly n squared characters copied. The compiler inserts a builder for a single expression, not across iterations, so a loop that looks like one statement is still repeated copying.',
            '`StringBuilder` keeps a growable buffer and appends in place. When the order is known and the parts are fixed, `String.join` or `String.format` reads better and does the same work.',
          ],
          code: {
            source: `// quadratic: every pass copies what came before
String report = "";
for (String line : lines) {
  report += line + "\\n";
}

// linear: one buffer, appended to
StringBuilder report = new StringBuilder();
for (String line : lines) {
  report.append(line).append('\\n');
}
String finished = report.toString();`,
            caption: 'Both are correct; only the first is a performance problem at scale.',
          },
          note:
            'For a log line with a handful of values, `"%s: %d items".formatted(name, count)` is clearer than either, and costs nothing worth measuring.',
        },
        {
          heading: 'Comparing and switching on text',
          body: [
            'Use `equals` for content and `equalsIgnoreCase` when case is not meaningful. `compareTo` orders strings lexicographically, which puts `"10"` before `"9"` — a fact that matters the first time an id is sorted as text.',
            '`switch` on a string compares with `equals` and throws `NullPointerException` on a null selector, so a null check belongs before the switch rather than in every case.',
          ],
          code: {
            source: `switch (state.toLowerCase()) {
  case "new" -> queue.add(ticket);
  case "closed" -> archive(ticket);
  default -> log.warn("unknown state: " + state);
}`,
          },
        },
      ],
      takeaway:
        'A string method returns a new string; use `.equals` to compare text and a `StringBuilder` to assemble it in a loop.',
    },
    {
      id: 'collections-and-iterators',
      title: 'Collections: pick by the question, then respect the iterator',
      summary:
        'List, Set and Map answer different questions; a for-each loop is an iterator, and changing the collection under it throws.',
      minutes: 9,
      sections: [
        {
          heading: 'Choose the interface from the question',
          body: [
            'A `List` answers "what is at position n" and keeps duplicates. A `Set` answers "is this present" and keeps each value once. A `Map` answers "what is the value for this key". Reaching for a list when the code only asks membership turns every check into a scan.',
            '`ArrayList` is the default list: cheap to append, cheap to read by index, expensive to insert at the front. `LinkedList` is rarely the right choice now — it is slower to iterate in practice — and `ArrayDeque` is the queue.',
          ],
          code: {
            source: `List<String> queue = new ArrayList<>();      // ordered, duplicates
Set<String> seen = new HashSet<>();           // membership, no duplicates
Map<String, Integer> counts = new HashMap<>(); // lookup by key

counts.merge("printer", 1, Integer::sum);      // insert or increment
if (!seen.add(ticketId)) {                     // false when already there
  log.info("duplicate: " + ticketId);
}`,
          },
        },
        {
          heading: 'Hash keys need `equals` and `hashCode` together',
          body: [
            'A `HashMap` finds a key by its hash, then confirms with `equals`. A class that overrides one and not the other breaks in a quiet way: two objects that look equal hash to different buckets, so both are stored and a lookup finds neither reliably.',
            'A key that is mutated after insertion is the same bug from the other side — its hash changes, so it can no longer be found. Keys should be immutable, which is why `String` and boxed primitives are the usual ones.',
          ],
          code: {
            source: `record Desk(String site, int floor) {}   // equals/hashCode for free

Map<Desk, String> owner = new HashMap<>();
owner.put(new Desk("north", 2), "Priya");
owner.get(new Desk("north", 2));   // "Priya" — equal keys, equal hash`,
            caption: 'A `record` generates value equality; a plain class inherits identity equality.',
          },
          note:
            '`HashMap` has no iteration order. Use `LinkedHashMap` to keep insertion order or `TreeMap` to keep keys sorted; both cost something, so ask for them deliberately.',
        },
        {
          heading: 'Never change a collection inside its own for-each',
          body: [
            'A for-each loop is an `Iterator` with a check on every step: if the collection’s modification count moved since the iterator was made, the next step throws `ConcurrentModificationException`. That is a contract check, not a threading problem, and it fires on one thread too.',
            'Removing through the iterator itself is allowed. Since Java 8 the clearer form is `removeIf`, which does the iterator bookkeeping for you, and `Map` has `entrySet().removeIf(...)` for the same job.',
          ],
          code: {
            source: `// throws on the second stale ticket
for (String id : stale) {
  stale.remove(id);
}

// safe: the iterator does the removing
stale.removeIf(id -> id.startsWith("old-"));

// safe: iterate a copy, change the original
for (String id : List.copyOf(stale)) {
  stale.remove(id);
}`,
            caption: 'The copy is deliberate: it costs memory and buys a simple loop.',
          },
        },
        {
          heading: 'The immutable factories',
          body: [
            '`List.of`, `Set.of` and `Map.of` return immutable collections: adding to one throws `UnsupportedOperationException`. `Arrays.asList` is different — fixed size, but `set` works and the array is shared with the original.',
            'Neither is a defensive copy of mutable elements. `List.copyOf` is the one to reach for when a method takes a collection from a caller and must not see later changes.',
          ],
        },
      ],
      takeaway:
        'Pick the collection by the question, give keys value equality, and change a collection through `removeIf` rather than under its iterator.',
    },
    {
      id: 'exceptions-and-resources',
      title: 'Exceptions, and things that close on the way out',
      summary:
        'Checked and unchecked, try-with-resources close order, suppressed exceptions, and the `finally` that swallows a failure.',
      minutes: 9,
      sections: [
        {
          heading: 'Checked or unchecked',
          body: [
            'A checked exception (`IOException`, `SQLException`) is part of the method signature: callers must handle it or declare it. An unchecked one (`NullPointerException`, `IllegalArgumentException`) is a programming error that the compiler does not track.',
            'The rule of thumb that survives review: throw `IllegalArgumentException` for a caller’s bad argument, `IllegalStateException` when the object is not ready, and a checked exception only when the caller can genuinely do something about it. Wrapping in `RuntimeException` to avoid a signature is how a useful error becomes an unattributed crash.',
          ],
          code: {
            source: `public String readConfig(Path path) {
  try {
    return Files.readString(path);
  } catch (IOException cause) {
    throw new UncheckedIOException("cannot read " + path, cause);
  }
}`,
            caption: 'Keep the cause: the stack trace of the failure is the reason the method was wrapped.',
          },
        },
        {
          heading: 'try-with-resources closes in reverse order',
          body: [
            'Anything that implements `AutoCloseable` declared in the `try` header is closed when the block ends, whether it ends normally, by `return`, or by an exception. Two resources close in the opposite order to their declaration: the last opened is the first closed.',
            'If the body throws and a `close` also throws, the body’s exception is rethrown and the close failure is attached to it as suppressed — which is why `printStackTrace` shows both but a naive log line shows only one. `getSuppressed()` is how you find the rest.',
          ],
          code: {
            source: `try (var in = Files.newInputStream(source);
     var out = Files.newOutputStream(target)) {
  in.transferTo(out);
}
// out closes first, then in, including when transferTo throws`,
            caption: 'The generated `finally` calls `close`, so no manual cleanup is needed.',
          },
          note:
            'Do not close a resource twice or close something you did not open — a servlet’s input stream belongs to the container. `try`-with-resources is for what this method acquired.',
        },
        {
          heading: '`finally` runs, and can erase the real error',
          body: [
            'A `return` or `throw` inside `finally` replaces whatever the method was about to do, including an exception from the body. The same applies to `close` failures that are not attached as suppressed.',
            'Use `finally` for cleanup that cannot fail, and prefer a `try`-with-resources block to a hand-written one. An empty `catch` is worse still: it turns a crash into a silent wrong answer, which is the harder bug to find.',
          ],
          code: {
            source: `// the exception from work() is discarded
try {
  work();
} finally {
  return "done";
}

// the exception keeps its cause and adds context
try {
  work();
} catch (TimeoutException cause) {
  throw new IllegalStateException("device did not answer", cause);
}`,
            caption: 'Both forms compile; only the second keeps the evidence.',
          },
        },
      ],
      takeaway:
        'Declare a resource in the `try` header and let the runtime close it in reverse order; never let `finally` return.',
    },
  ],
  practice: [
    {
      id: 'boxing-comparison',
      title: 'Two wrappers that look equal',
      topic: 'wrappers',
      level: 'warm-up',
      question: 'What does this print?',
      code: `Integer a = 100;
Integer b = 100;
Integer c = 1000;
Integer d = 1000;

System.out.println(a == b);
System.out.println(c == d);
System.out.println(c.equals(d));`,
      choices: [
        {
          id: 'true-false-true',
          label: 'true, false, true',
          note: 'The first pair is inside the wrapper cache, so both names point at one object. The second pair is outside it, so `==` compares two objects while `equals` compares the values.',
          correct: true,
        },
        {
          id: 'false-false-true',
          label: 'false, false, true',
          note: '`==` on wrappers is identity, but the language requires the small-value cache, so 100 is one object and compares equal.',
          correct: false,
        },
        {
          id: 'true-true-true',
          label: 'true, true, true',
          note: 'This is the answer that makes the cache look like a rule. It stops at 127.',
          correct: false,
        },
        {
          id: 'true-false-false',
          label: 'true, false, false',
          note: 'The last line is `equals`, which compares the values, so 1000 equals 1000.',
          correct: false,
        },
      ],
      rule: '`==` on wrappers asks whether two names point at one object. Small values are cached; values are not. Compare with `equals`, or unbox first.',
      reference: `System.out.println(Objects.equals(c, d));  // true, and null-safe`,
    },
    {
      id: 'remove-overload',
      title: 'Removing the wrong thing from a list',
      topic: 'collections',
      level: 'core',
      question: 'What is in `ids` after these three lines?',
      code: `List<Integer> ids = new ArrayList<>(List.of(10, 20, 30, 1));
ids.remove(1);
System.out.println(ids);`,
      choices: [
        {
          id: 'index',
          label: '[10, 30, 1]',
          note: 'The literal `1` is an `int`, so the compile-time choice is `remove(int index)` and the element at index 1 — the 20 — is removed.',
          correct: true,
        },
        {
          id: 'value',
          label: '[10, 20, 30]',
          note: 'That is `remove(Integer.valueOf(1))`, which needs the argument to be an object. It removes the value 1, not the index.',
          correct: false,
        },
        {
          id: 'both',
          label: '[30, 1]',
          note: 'Only one overload runs. Nothing in the call removes two elements.',
          correct: false,
        },
      ],
      rule: '`List.remove(int)` removes by position and `List.remove(Object)` removes by value. An `int` argument always picks the position overload.',
      reference: `ids.remove(Integer.valueOf(1));  // by value
ids.remove(int index);             // by position, when that is what you mean`,
    },
    {
      id: 'iterator-shift',
      title: 'Removing during a for-each',
      topic: 'iterators',
      level: 'core',
      question: 'What happens when this loop runs on a list of three stale ids?',
      code: `List<String> stale = new ArrayList<>(List.of("old-1", "old-2", "old-3"));

for (String id : stale) {
  if (id.startsWith("old-")) {
    stale.remove(id);
  }
}`,
      choices: [
        {
          id: 'cme',
          label: 'It throws `ConcurrentModificationException` on the next step',
          note: 'The iterator records the collection’s modification count and checks it on every step. A direct `remove` changes it, so the following `next()` fails the check.',
          correct: true,
        },
        {
          id: 'one-left',
          label: 'It removes every other id and leaves one behind',
          note: 'That is the behaviour of the old indexed-loop mistake. A for-each fails loudly instead of skipping.',
          correct: false,
        },
        {
          id: 'clean',
          label: 'It empties the list normally',
          note: 'Removing through `iterator.remove()` would; removing through the collection while the loop is running does not.',
          correct: false,
        },
      ],
      rule: 'A for-each loop is an iterator with a modification check. Use `removeIf`, the iterator’s own `remove`, or iterate a copy.',
      reference: `stale.removeIf(id -> id.startsWith("old-"));`,
    },
    {
      id: 'close-order',
      title: 'Which resource closes first',
      topic: 'resources',
      level: 'sharp',
      question: 'In what order do the `close` calls run, and where does a failing body’s exception end up?',
      code: `try (var first = new Probe("first");
     var second = new Probe("second")) {
  work();
} catch (Exception cause) {
  log.error(cause.getMessage());
}`,
      choices: [
        {
          id: 'reverse-suppressed',
          label: 'second, then first; the body’s exception is the one caught',
          note: 'Resources close in reverse declaration order. If a `close` also throws, its failure is attached to the body’s exception as suppressed rather than replacing it.',
          correct: true,
        },
        {
          id: 'declared-order',
          label: 'first, then second; the body’s exception is the one caught',
          note: 'The generated `finally` closes in the opposite order, like nested blocks unwinding.',
          correct: false,
        },
        {
          id: 'close-wins',
          label: 'second, then first; a failure in `close` replaces the body’s exception',
          note: 'That is the behaviour try-with-resources exists to avoid — the original failure is kept and the close failure is suppressed.',
          correct: false,
        },
      ],
      rule: 'Resources close in reverse order of declaration, on every exit path. A close failure is suppressed, not thrown over the body’s exception.',
      reference: `try (var first = new Probe("first");
     var second = new Probe("second")) {
  work();
}
// second.close(), then first.close()`,
    },
    {
      id: 'map-key-equality',
      title: 'A key class without value equality',
      topic: 'collections',
      level: 'sharp',
      question: 'What does this print?',
      code: `class Site {
  final String name;
  Site(String name) { this.name = name; }
}

Map<Site, String> owners = new HashMap<>();
owners.put(new Site("north"), "Priya");
owners.put(new Site("north"), "Sam");

System.out.println(owners.size());
System.out.println(owners.get(new Site("north")));`,
      choices: [
        {
          id: 'two-null',
          label: '2, then null',
          note: 'A plain class inherits identity `equals` and `hashCode`, so the three `Site` objects are three different keys. Nothing matches on lookup.',
          correct: true,
        },
        {
          id: 'one-sam',
          label: '1, then Sam',
          note: 'That is the answer for a `record` or a class that overrides both `equals` and `hashCode`. This one overrides neither.',
          correct: false,
        },
        {
          id: 'two-error',
          label: 'It throws while inserting the second key',
          note: 'A map accepts any object as a key. It does not check that equal-looking objects agree.',
          correct: false,
        },
      ],
      rule: 'A map finds a key by hash, then confirms with `equals`. Override both, or make the key a `record`, or every instance becomes its own key.',
      reference: `record Site(String name) {}   // value equality, usable as a key`,
    },
  ],
}
