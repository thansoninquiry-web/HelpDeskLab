import type { LanguageTrack } from '../types'

/**
 * Python, as CPython executes it.
 *
 * The lessons are arranged around the four traps a reader from another language
 * falls into: names are bindings, defaults are evaluated once, closures see the
 * last value, and a container cannot be resized while it is being iterated.
 */
export const PYTHON_TRACK: LanguageTrack = {
  id: 'python',
  name: 'Python',
  runtime: 'CPython 3.12',
  blurb:
    'The automation language of the trade: bindings and mutability, comprehensions and closures, dicts and sets, and errors handled honestly.',
  canDo: [
    'Explain why a mutable default argument remembers the last call',
    'Tell `is` from `==` and know which one belongs in a null check',
    'Predict what a closure over a loop variable returns, and fix it',
    'Change a dict safely while walking it, and read a traceback from the innermost frame out',
  ],
  lessons: [
    {
      id: 'names-and-mutability',
      title: 'Names, objects, and the argument that outlives the call',
      summary:
        'Assignment binds a name to an object rather than copying it, defaults are evaluated once at definition, and `is` is not `==`.',
      minutes: 9,
      sections: [
        {
          heading: 'A name is a label, not a box',
          body: [
            '`a = [1, 2]` creates a list object and binds the name `a` to it. `b = a` binds the same object to a second name. There is no copy, so a change through either name is visible through both — and `a is b` is true because they are the same object.',
            '`b = a[:]`, `list(a)`, `a.copy()` and `copy.deepcopy(a)` each make a new object. The shallow ones copy the outer container only: a nested list is still shared, which is the mistake the last practice item in this track turns on.',
          ],
          code: {
            source: `a = [1, 2]
b = a
b.append(3)
print(a)        # [1, 2, 3] — one object, two names
print(a is b)   # True

c = a[:]        # a new outer list
c.append(4)
print(a)        # [1, 2, 3] — unchanged`,
            caption: 'Slicing copies the container; it does not copy what the container holds.',
          },
        },
        {
          heading: 'Default arguments are evaluated once',
          body: [
            'A default value is evaluated when the `def` line runs, not on each call. A list or dict default is therefore created once and shared by every call that omits the argument, which turns a fresh empty list into an accumulating one.',
            'The fix costs one line and is the idiom to recognise: default to `None` and build the container inside.',
          ],
          code: {
            source: `def add_note(note, notes=[]):
    notes.append(note)
    return notes

print(add_note("fan noisy"))   # ['fan noisy']
print(add_note("screen dim"))  # ['fan noisy', 'screen dim'] — same list!

def add_note(note, notes=None):
    if notes is None:
        notes = []
    notes.append(note)
    return notes`,
            caption: 'The second version is the same function with a sentinel default.',
          },
          note:
            'The same rule applies to any expression in a default — `time.time()` in a signature is a fixed timestamp, not the time of the call.',
        },
        {
          heading: '`is` asks identity; `==` asks equality',
          body: [
            '`==` calls `__eq__` and compares values. `is` compares object identity, which for small integers and interned strings happens to look like value equality — an implementation detail you should never build on.',
            '`is` belongs in exactly one common place: `if value is None`. It is also right for a sentinel object of your own (`MISSING = object()`), and for `is True` only when you really mean that exact object.',
          ],
          code: {
            source: `a = 1000
b = 1000
print(a == b)   # True
print(a is b)   # False in CPython — two objects

print([1] == [1])   # True
print([1] is [1])   # False

value = None
if value is None:   # the check that cannot be fooled by __eq__
    ...`,
          },
        },
      ],
      takeaway:
        'Assignment binds a name to one object. Default arguments are made once, so default to `None`; use `is` for identity and `==` for value.',
    },
    {
      id: 'truthiness-and-closures',
      title: 'Truthiness, comprehensions, and closures that bite',
      summary:
        'Empty containers are falsy, comprehensions build eagerly, generators do not, and a lambda in a loop sees the last value of the loop variable.',
      minutes: 8,
      sections: [
        {
          heading: 'What counts as true',
          body: [
            'Every object decides its own truth: `0`, `0.0`, `""`, `[]`, `{}`, `set()` and `None` are falsy, and so is any object whose `__len__` returns zero or whose `__bool__` returns False. Everything else is truthy, including a string `"0"` — the reason a form value needs converting before it is trusted.',
            '`and` and `or` return an operand rather than a bool, which is how `name = raw or "unassigned"` works. `or` falls through on any falsy left side, so a legitimate `0` becomes the default too.',
          ],
          code: {
            source: `port = raw_port or 443      # 0 would silently become 443
port = raw_port if raw_port is not None else 443

print(bool("0"))     # True — a non-empty string
print(bool(0))       # False`,
          },
        },
        {
          heading: 'Comprehensions and generators',
          body: [
            'A list comprehension builds the whole list immediately. A generator expression with round brackets builds one item at a time and can be walked only once — the second `for` over it finds nothing, because a generator is an iterator, not a collection.',
            'For a large file, the generator is the memory-friendly form: `sum(1 for line in handle if line.startswith("ERROR"))` reads one line at a time. For a value that will be read repeatedly or has a length, build the list.',
          ],
          code: {
            source: `rows = [row.upper() for row in header]
squares = (n * n for n in range(3))

print(list(squares))   # [0, 1, 4]
print(list(squares))   # [] — the generator is spent`,
          },
        },
        {
          heading: 'Closures capture the name, not the value',
          body: [
            'A function body looks names up when it runs, not when it is defined. A lambda created inside a loop therefore sees the final value of the loop variable — by then the loop is over — and every lambda in the list returns the same thing.',
            'Bind the value at definition time with a default argument, or use a factory function whose parameter makes a fresh binding per call.',
          ],
          code: {
            source: `functions = [lambda: i for i in range(3)]
print([f() for f in functions])   # [2, 2, 2]

functions = [lambda i=i: i for i in range(3)]
print([f() for f in functions])   # [0, 1, 2]

def make(i):
    return lambda: i
functions = [make(i) for i in range(3)]`,
            caption: 'The default argument is evaluated per lambda; the free variable is shared.',
          },
          note:
            'Keywords that matter here: `nonlocal` lets a nested function rebind an outer local. Reading an outer name needs no declaration.',
        },
      ],
      takeaway:
        'Truth comes from the object, `or` can swallow a real zero, a generator is spent once, and a closure sees the name’s last value.',
    },
    {
      id: 'dicts-and-iteration',
      title: 'Dicts, sets, and changing a container while walking it',
      summary:
        'Dicts keep insertion order, sets answer membership, and mutating a container during iteration raises `RuntimeError`.',
      minutes: 7,
      sections: [
        {
          heading: 'The right container for the question',
          body: [
            'A `dict` maps keys to values and keeps insertion order since 3.7. A `set` answers membership in constant average time. A `list` answers position and keeps duplicates — using one for membership turns every check into a scan.',
            '`dict.get(key, default)` avoids a `KeyError`; `setdefault(key, default)` inserts when missing; `collections.Counter` counts; `collections.defaultdict(list)` creates the container on first access.',
          ],
          code: {
            source: `from collections import Counter, defaultdict

counts = Counter()
for line in lines:
    counts[line.split()[0]] += 1

by_site = defaultdict(list)
for device in devices:
    by_site[device.site].append(device.name)`,
          },
        },
        {
          heading: 'Never change the size while iterating',
          body: [
            'CPython raises `RuntimeError: dictionary changed size during iteration` when a dict grows or shrinks under a live iterator. Changing a value for an existing key is allowed; adding or deleting is not.',
            'Iterate a snapshot — `list(counts)` or `counts.copy()` — or build a new dict with a comprehension, which reads the original and writes a replacement.',
          ],
          code: {
            source: `# RuntimeError
for key in counts:
    if counts[key] == 0:
        del counts[key]

# safe: iterate a list of the keys
for key in list(counts):
    if counts[key] == 0:
        del counts[key]

# also safe: build the next dict
counts = {key: value for key, value in counts.items() if value > 0}`,
            caption: 'The comprehension is usually the clearest of the three.',
          },
        },
        {
          heading: 'Keys must be hashable',
          body: [
            'A dict key or a set member must be hashable: immutable in practice, with a hash that does not change. Strings, numbers, tuples of those, and frozen dataclasses qualify. A list or a dict does not, and a mutable object used as a key breaks lookups after it changes — the same bug as Java’s mutated key.',
            'Equality and hashing are paired here too: two objects that compare equal must hash equal, or a dict stores both.',
          ],
          code: {
            source: `key = ("north", 2)       # a tuple of immutables: fine
seen.add(key)

seen.add(["north", 2])   # TypeError: unhashable type: 'list'`,
          },
        },
      ],
      takeaway:
        'Use a set for membership and a dict for lookup; never resize a container while iterating it — take a snapshot first.',
    },
    {
      id: 'errors-and-resources',
      title: 'Errors, context managers, and files that close',
      summary:
        'Catch the narrowest exception that you can handle, keep the original error with `from`, and let `with` close the file.',
      minutes: 8,
      sections: [
        {
          heading: 'Ask for forgiveness, but narrowly',
          body: [
            'Python style favours trying the operation and handling the failure (`try`/`except`) over checking first (`if`), because the check can race with the world and duplicates the rules. What the style does not license is a bare `except` that catches everything, including `KeyboardInterrupt`.',
            'Catch the type you expect. `except (ValueError, KeyError)` is explicit; `except Exception` at the top of a program is for logging before re-raising, not for continuing.',
          ],
          code: {
            source: `try:
    port = int(raw)
except ValueError:
    port = 443
    log.warning("bad port %r, using %d", raw, port)

# the catch-all that hides bugs
try:
    sync()
except:
    pass`,
            caption: 'The second block turns a failure into silence, which is worse than a crash.',
          },
        },
        {
          heading: 'Keep the cause',
          body: [
            '`raise` on its own re-raises the current exception with its traceback. `raise NewError(...) from cause` records the original as `__cause__`, and the traceback prints "The above exception was the direct cause". Without `from`, the context is still shown in most cases, but the explicit form is the one to write.',
            '`try`/`except`/`else`/`finally`: `else` runs only when no exception was raised, and `finally` always runs. Code that belongs after the risky statement goes in `else`, so the `try` block stays small enough to see what it protects.',
          ],
          code: {
            source: `try:
    text = path.read_text()
except OSError as cause:
    raise ConfigError(f"cannot read {path}") from cause

try:
    row = parse(text)
except ValueError:
    log.warning("skipping a bad row")
else:
    rows.append(row)
finally:
    processed += 1`,
          },
        },
        {
          heading: '`with` is the only file cleanup you need',
          body: [
            'A context manager runs `__enter__` on the way in and `__exit__` on the way out, including on an exception, and nested `with` blocks exit in reverse order. A file, a lock, a database transaction and a temporary directory are all used this way.',
            'Opening a file without `with` and forgetting `close` leaves the handle to the garbage collector, which is not a cleanup strategy on Windows — the file stays locked until the process exits.',
          ],
          code: {
            source: `with open(log_path, encoding="utf-8") as handle:
    for line in handle:
        if "ERROR" in line:
            errors.append(line.rstrip())

with lock, open(target, "w", encoding="utf-8") as out:
    out.write(payload)
# target closes first, then the lock releases`,
            caption: 'Nested managers exit in reverse order, on every path.',
          },
          note:
            '`Path.read_text()` and `Path.write_text()` open and close in one call — the shortest correct form for a whole-file read. For a large file, iterate the handle instead of reading it all.',
        },
      ],
      takeaway:
        'Catch the narrow exception you can handle, raise `from` the cause, and let `with` close the resource on every path.',
    },
  ],
  practice: [
    {
      id: 'mutable-default',
      title: 'A default that remembers',
      topic: 'functions',
      level: 'warm-up',
      question: 'What does this print?',
      code: `def add_note(note, notes=[]):
    notes.append(note)
    return notes

print(add_note("fan noisy"))
print(add_note("screen dim"))`,
      choices: [
        {
          id: 'accumulates',
          label: "['fan noisy'], then ['fan noisy', 'screen dim']",
          note: 'The default list is created once, when the `def` runs, and every call without an argument appends to that same list.',
          correct: true,
        },
        {
          id: 'fresh',
          label: "['fan noisy'], then ['screen dim']",
          note: 'That is what a default of `None` with a fresh list inside would produce. A literal default is evaluated once only.',
          correct: false,
        },
        {
          id: 'error',
          label: 'It raises `TypeError` on the second call',
          note: 'Appending to an existing list is valid; there is no error to raise.',
          correct: false,
        },
      ],
      rule: 'Defaults are evaluated once, at definition. Use `None` as the sentinel and create the container inside the function.',
      reference: `def add_note(note, notes=None):
    notes = [] if notes is None else notes
    notes.append(note)
    return notes`,
    },
    {
      id: 'identity-or-equality',
      title: '`is` against `==`',
      topic: 'objects',
      level: 'core',
      question: 'Which comparison is the right one for this check?',
      code: `value = read_setting("retention")   # may be None

if value ??? None:
    value = 30`,
      choices: [
        {
          id: 'is',
          label: '`value is None`',
          note: '`None` is one object, and `is` cannot be fooled by a value type that defines `__eq__` to compare itself to `None`.',
          correct: true,
        },
        {
          id: 'eq',
          label: '`value == None`',
          note: 'It works for ordinary values, but `==` is a method call on the object and an unusual `__eq__` can answer true for `None`.',
          correct: false,
        },
        {
          id: 'truthy',
          label: '`if not value:`',
          note: 'That also catches `0`, `""` and `[]`, so a legitimate retention of 0 becomes 30.',
          correct: false,
        },
      ],
      rule: '`is` compares identity and belongs in a `None` check. `==` compares value; truthiness catches every falsy value, including real zeros.',
      reference: `if value is None:
    value = 30`,
    },
    {
      id: 'closure-late-binding',
      title: 'Three lambdas, one answer',
      topic: 'closures',
      level: 'sharp',
      question: 'What does this print?',
      code: `functions = [lambda: i for i in range(3)]
print([f() for f in functions])`,
      choices: [
        {
          id: 'all-two',
          label: '[2, 2, 2]',
          note: 'Each lambda looks up `i` when it is called. By then the comprehension has finished and `i` is 2 — one binding, shared by all three.',
          correct: true,
        },
        {
          id: 'zero-one-two',
          label: '[0, 1, 2]',
          note: 'That needs the value bound per lambda, as in `lambda i=i: i`.',
          correct: false,
        },
        {
          id: 'error',
          label: 'It raises `NameError`',
          note: 'A comprehension has its own scope in Python 3, but the lambdas close over the name and can still read its final value.',
          correct: false,
        },
      ],
      rule: 'A closure captures the name, not the value at definition time. Bind it with a default argument or a factory function.',
      reference: `functions = [lambda i=i: i for i in range(3)]   # [0, 1, 2]`,
    },
    {
      id: 'dict-while-iterating',
      title: 'Deleting while walking',
      topic: 'dicts',
      level: 'core',
      question: 'What happens?',
      code: `counts = {"fan": 0, "screen": 2}

for key in counts:
    if counts[key] == 0:
        del counts[key]`,
      choices: [
        {
          id: 'runtime',
          label: '`RuntimeError: dictionary changed size during iteration`',
          note: 'CPython checks the dict’s size on each step of the iterator. A delete changes it, so the next step raises.',
          correct: true,
        },
        {
          id: 'works',
          label: 'It removes `fan` and finishes normally',
          note: 'Deleting is exactly what is not allowed under a live iterator; assigning a new value would be fine.',
          correct: false,
        },
        {
          id: 'silent',
          label: 'It silently skips an entry',
          note: 'That is the behaviour of a list index loop. A dict raises instead.',
          correct: false,
        },
      ],
      rule: 'Iterate a snapshot (`list(counts)`) or build a new dict; never add or delete keys while iterating.',
      reference: `counts = {key: value for key, value in counts.items() if value > 0}`,
    },
    {
      id: 'generator-spent',
      title: 'A generator read twice',
      topic: 'iterators',
      level: 'sharp',
      question: 'What are the two printed lists?',
      code: `squares = (n * n for n in range(3))

print(list(squares))
print(list(squares))`,
      choices: [
        {
          id: 'then-empty',
          label: '[0, 1, 4], then []',
          note: 'A generator is a one-pass iterator. The first `list` consumes it, and the second finds it exhausted.',
          correct: true,
        },
        {
          id: 'both',
          label: '[0, 1, 4], then [0, 1, 4]',
          note: 'That is a list comprehension. Round brackets build a generator, which cannot be replayed.',
          correct: false,
        },
        {
          id: 'error',
          label: '[0, 1, 4], then `RuntimeError`',
          note: 'An exhausted generator is not an error; it simply yields nothing.',
          correct: false,
        },
      ],
      rule: 'A generator is spent once. Use square brackets if the values are needed again, or materialise with `list(...)` before the first read.',
      reference: `squares = [n * n for n in range(3)]`,
    },
  ],
}
