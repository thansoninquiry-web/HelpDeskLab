import type { LanguageTrack } from '../types'

/**
 * C# and .NET, on the runtime a support tool actually runs on.
 *
 * The lessons pick the four things that turn a working snippet into a bug: the
 * difference between a copied struct and a shared class, LINQ that runs later
 * than it looks, `async` that blocks, and disposal order.
 */
export const CSHARP_TRACK: LanguageTrack = {
  id: 'csharp',
  name: 'C# / .NET',
  runtime: '.NET 8, nullable reference types on',
  blurb:
    'The language behind most Windows management tooling: value and reference types, deferred LINQ, async that does not deadlock, and disposal.',
  canDo: [
    'Say whether an assignment copies a value or shares an object before you mutate it',
    'See when a LINQ query runs, and stop enumerating the same source twice',
    'Explain why a blocking wait on a Task can deadlock, and write the async version instead',
    'Release handles deterministically and in the right order',
  ],
  lessons: [
    {
      id: 'values-and-references',
      title: 'Values, references, and what `null` means now',
      summary:
        'A struct is copied on assignment and a class is shared; nullable reference types turn a runtime surprise into a compile-time warning.',
      minutes: 8,
      sections: [
        {
          heading: 'Copy or share',
          body: [
            'A `struct` (and every primitive, `DateTime`, `Guid`, `decimal`) is a value: assigning it copies its fields. A `class` is a reference: assigning it copies the reference, so two names see one object and a change through either is visible through both.',
            'The copy is shallow. A struct that holds a reference field copies the reference, not the object behind it, which is why a struct with mutable reference fields is a design smell.',
          ],
          code: {
            source: `struct Reading { public int Value; }
class Meter { public int Value; }

var reading = new Reading { Value = 3 };
var meter = new Meter { Value = 3 };

var readingCopy = reading;
var meterCopy = meter;

readingCopy.Value = 9;
meterCopy.Value = 9;

Console.WriteLine(reading.Value);  // 3 — the struct was copied
Console.WriteLine(meter.Value);    // 9 — both names share the object`,
            caption: 'The same assignment syntax, two different meanings.',
          },
        },
        {
          heading: 'Structs in a list',
          body: [
            'Because a struct is a value, reading one out of a `List<T>` gives a copy. Changing that copy changes nothing in the list — and the compiler does not warn, because assigning to a local is perfectly legal.',
            'Indexing into the list directly, `list[0].Value = 9`, does mutate the element in place. That works only for an array or a list indexer, not for a struct returned by a method or held in a `foreach` variable.',
          ],
          code: {
            source: `var readings = new List<Reading> { new() { Value = 3 } };

var copy = readings[0];
copy.Value = 9;                 // changes the copy only
Console.WriteLine(readings[0].Value);  // 3

readings[0].Value = 9;          // changes the element
Console.WriteLine(readings[0].Value);  // 9

foreach (var reading in readings) {
  reading.Value = 0;            // compile error: readonly iteration variable
}`,
            caption: 'The `foreach` error is the compiler being helpful; the copy above it is silent.',
          },
          note:
            'If the type needs identity, mutation, or a large number of fields, make it a class. A struct earns its place when it is small, immutable, and short-lived.',
        },
        {
          heading: 'Nullable reference types',
          body: [
            'With nullable reference types enabled, `string` means "not null" and `string?` means "maybe null". The compiler tracks both and warns on a dereference it cannot prove safe. The annotation is erased at run time — it is a contract for the compiler and the reader, not a guard.',
            'The operators that keep the contract readable are `?.` (call only if not null), `??` (fall back), `??=` (assign if null), and `!` (a promise that is not checked). Every `!` is a place where the promise can be wrong at run time, so it should be rare and local.',
          ],
          code: {
            source: `string? owner = FindOwner(deviceId);

// null-safe read with a fallback
var label = owner?.Trim() ?? "unassigned";

// a promise the compiler cannot check
var length = owner!.Length;   // NullReferenceException when null`,
          },
        },
      ],
      takeaway:
        'A struct is copied and a class is shared; `?` is a promise the compiler checks, and `!` is a promise only you check.',
    },
    {
      id: 'linq-is-deferred',
      title: 'LINQ describes a query; it does not run one',
      summary:
        'A query is built once and executed each time it is enumerated, which changes what a variable means after the source moves.',
      minutes: 8,
      sections: [
        {
          heading: 'The query is a plan',
          body: [
            '`Where`, `Select`, `OrderBy` and their relatives build a pipeline and return an `IEnumerable<T>`. Nothing is read until something enumerates it: a `foreach`, a `Count()`, a `ToList()`, a `First()`. The variable holds the instructions, not the rows.',
            'That is what lets one query be reused with different filters, and it is also what makes the answer depend on when it is asked. Add a row to the source between building the query and reading it, and the query sees the new row.',
          ],
          code: {
            source: `var devices = new List<string> { "desk-01", "desk-02" };

var offline = devices.Where(device => device.EndsWith("2"));

Console.WriteLine(offline.Count());   // 1
devices.Add("lab-02");
Console.WriteLine(offline.Count());   // 2 — the query ran again

var snapshot = offline.ToList();      // materialised now
devices.Add("spare-02");
Console.WriteLine(snapshot.Count);    // 2 — the list is fixed`,
            caption: '`ToList` is the line that turns a plan into an answer.',
          },
        },
        {
          heading: 'Enumerating a source twice',
          body: [
            'A field or parameter typed `IEnumerable<T>` promises only that it can be enumerated — not that doing so is free. A database query re-runs, a file is read again, a generator recomputes. Code that walks it for a count and then again to print it has done the work twice.',
            'Materialise once at the boundary where the type arrives: `var rows = source.ToList();` and then work with the list. The exception is a source that is genuinely cheap and in memory, where the extra list is pure allocation.',
          ],
          code: {
            source: `// two round trips to the database
if (rows.Any()) {
  foreach (var row in rows) { Render(row); }
}

// one
var loaded = rows.ToList();
if (loaded.Count > 0) {
  foreach (var row in loaded) { Render(row); }
}`,
            caption: '`Any()` is correct for the check; the problem is that the source is asked twice.',
          },
          note:
            '`Any()` beats `Count() > 0` for an unknown source: it stops at the first row, while `Count()` may walk everything.',
        },
        {
          heading: 'Ordering, grouping, and the methods that run immediately',
          body: [
            '`OrderBy` is stable — equal keys keep their relative order — and sorting is deferred like everything else. `GroupBy` is deferred too, and each group is itself deferred, so a group read after the source changed can disagree with the key it was filed under.',
            '`ToList`, `ToDictionary`, `Count`, `Sum`, `First`, `Single`, `Any`, `All` and `Max` run the query. `Single` throws when there is not exactly one match; `FirstOrDefault` returns `default` — which for a reference type is null, and for an int is zero, so "not found" and "found zero" look the same.',
          ],
          code: {
            source: `var byOwner = tickets
    .GroupBy(ticket => ticket.Owner)
    .Select(group => new { Owner = group.Key, Open = group.Count() })
    .OrderByDescending(entry => entry.Open)
    .ToList();   // one run, ordered, ready to render`,
          },
        },
      ],
      takeaway:
        'A LINQ variable is a plan; it runs on every enumeration. Materialise once with `ToList` where the source is expensive or may change.',
    },
    {
      id: 'async-without-blocking',
      title: 'async and await without the deadlock',
      summary:
        '`await` releases the thread instead of blocking it; `.Result` takes it back, which is how a UI or legacy request thread deadlocks.',
      minutes: 9,
      sections: [
        {
          heading: 'What `await` actually does',
          body: [
            'An `async` method runs synchronously until the first `await` that has not already completed. At that point it returns a `Task` to its caller, and the rest of the method is a continuation that runs when the awaited work finishes. No thread is created and none is held while waiting.',
            'The consequence is that `async` is a signature change that spreads: if a method calls an async one, it should be async too. Blocking on the task in between — `.Result`, `.Wait()` — is what turns the design back into a thread held hostage.',
          ],
          code: {
            source: `public async Task<Device> ReadAsync(string id, CancellationToken cancel) {
  var json = await _client.GetStringAsync($"/devices/{id}", cancel);
  return JsonSerializer.Deserialize<Device>(json)!;
}`,
            caption: 'The cancellation token travels with the call so the work can stop, not just the waiting.',
          },
        },
        {
          heading: 'Why `.Result` can deadlock',
          body: [
            'A UI application and older ASP.NET request handling run on a `SynchronizationContext` that only lets one continuation run at a time on that thread. If that thread blocks on `.Result`, the continuation that would complete the task is queued behind it and can never run: the thread waits for a result that needs the thread.',
            '`await` avoids it because the awaiting method gives the thread back instead of occupying it. ASP.NET Core has no such context, so the common deadlock disappears there — but blocking still ties up a pool thread and still hides exceptions inside an `AggregateException`, which is reason enough not to do it.',
          ],
          code: {
            source: `// can deadlock on a UI or legacy request thread
var device = ReadAsync(id, cancel).Result;

// the same call, awaited
var device = await ReadAsync(id, cancel);`,
          },
          note:
            'The exception rule: `async void` is only for event handlers. Its exceptions cannot be awaited or caught by the caller and go to the synchronization context instead. Everything else returns `Task` or `ValueTask`.',
        },
        {
          heading: 'Many calls, and the ones that fail',
          body: [
            'Awaiting in a loop serialises the work: each call waits for the one before it. `Task.WhenAll` starts them together and completes when all are done; `Task.WhenAny` is for taking the first answer, such as a race against a timeout.',
            'When several tasks fail, `WhenAll` rethrows the first exception and the rest remain on the task’s `Exception` as an aggregate. Read them deliberately, or a partial failure looks like a single one.',
          ],
          code: {
            source: `var tasks = ids.Select(id => ReadAsync(id, cancel));
var devices = await Task.WhenAll(tasks);

// every failure, not just the first
var all = await Task.WhenAll(tasks.Select(async task => {
  try { await task; return (Exception?)null; }
  catch (Exception error) { return error; }
}));`,
          },
        },
      ],
      takeaway:
        'Let `async` travel up the call stack; never block on a task from a thread that has a synchronization context.',
    },
    {
      id: 'disposal-and-using',
      title: '`using`, disposal, and the order handles close',
      summary:
        'Deterministic cleanup is a language feature: `using` closes in reverse order on every path, and async disposal has its own form.',
      minutes: 7,
      sections: [
        {
          heading: 'What `using` compiles to',
          body: [
            '`using var stream = File.OpenRead(path);` is a `try`/`finally` whose `finally` calls `Dispose`. The compiler emits it, so the call happens on `return`, on `throw`, and on falling out of scope — no path is forgotten.',
            'A `using` declaration disposes at the end of the enclosing block, which can be much later than the line that acquired it. A `using` statement with braces is clearer when the handle should be released early.',
          ],
          code: {
            source: `using var input = File.OpenRead(source);
using var output = File.Create(target);
input.CopyTo(output);
// output disposes first, then input, including when CopyTo throws`,
            caption: 'Reverse order, because each is nested inside the previous one.',
          },
        },
        {
          heading: 'Dispose, finalizer, and the class that owns a handle',
          body: [
            '`IDisposable.Dispose` releases unmanaged resources or unsubscribes handlers. The finalizer is the fallback for a class that directly owns an unmanaged handle, and it runs at an unpredictable time — which is exactly why relying on it is not cleanup.',
            'The standard shape is a `protected virtual void Dispose(bool disposing)` that releases managed references only when `disposing` is true, and suppresses the finalizer with `GC.SuppressFinalize`. Most classes that only hold other `IDisposable`s need none of that: they just call `Dispose` on their fields.',
          ],
          code: {
            source: `public sealed class Session : IDisposable {
  private readonly HttpClient _client = new();
  private bool _disposed;

  public void Dispose() {
    if (_disposed) return;
    _disposed = true;
    _client.Dispose();
  }
}`,
            caption: 'Idempotent: a second `Dispose` is legal and must do nothing.',
          },
          note:
            'If disposal awaits, implement `IAsyncDisposable` and use `await using`. Blocking on an async dispose in a sync method reintroduces the deadlock lesson.',
        },
        {
          heading: 'The order is the point',
          body: [
            'A wrapper must be disposed after the thing it wraps. In the example above, closing the output stream before the source is exactly the order that lets a copy finish; disposing a reader before its stream makes the reader throw.',
            'When a class holds several disposables, dispose them in the reverse order of creation. If the order is not obvious from the constructor, the class is probably holding too much.',
          ],
          code: {
            source: `using var response = await client.GetAsync(url, cancel);
using var body = await response.Content.ReadAsStreamAsync(cancel);
using var reader = new StreamReader(body);
var text = await reader.ReadToEndAsync(cancel);`,
          },
        },
      ],
      takeaway:
        '`using` is compiled `finally`: it runs in reverse order on every exit path. Implement `IAsyncDisposable` when cleanup must wait.',
    },
  ],
  practice: [
    {
      id: 'deferred-query',
      title: 'A query read after the source changed',
      topic: 'LINQ',
      level: 'warm-up',
      question: 'What are the two printed counts?',
      code: `var devices = new List<string> { "desk-01", "desk-02" };

var offline = devices.Where(d => d.EndsWith("2"));

Console.WriteLine(offline.Count());
devices.Add("lab-02");
Console.WriteLine(offline.Count());`,
      choices: [
        {
          id: 'one-two',
          label: '1, then 2',
          note: '`Where` returns a plan. Each `Count()` walks the current source, so the second one sees the added device.',
          correct: true,
        },
        {
          id: 'one-one',
          label: '1, then 1',
          note: 'That would be true if the query had been materialised with `ToList()` before the add.',
          correct: false,
        },
        {
          id: 'two-two',
          label: '2, then 2',
          note: 'The query was built when the list had two entries, and the first count runs then, so it is 1.',
          correct: false,
        },
      ],
      rule: 'A LINQ variable holds a plan, and the plan runs on every enumeration. Materialise it if the answer must be fixed.',
      reference: `var snapshot = devices.Where(d => d.EndsWith("2")).ToList();`,
    },
    {
      id: 'double-enumeration',
      title: 'Asking a source twice',
      topic: 'LINQ',
      level: 'core',
      question: 'A method takes `IEnumerable<Order> orders`. What does this code cost?',
      code: `if (orders.Any()) {
  foreach (var order in orders) {
    Render(order);
  }
}`,
      choices: [
        {
          id: 'twice',
          label: 'The source is enumerated twice — two queries, or two file reads',
          note: '`Any()` enumerates until the first item and returns; the loop starts again from the beginning. An `IEnumerable` promises sequence, not a cached result.',
          correct: true,
        },
        {
          id: 'once',
          label: 'The source is enumerated once, because `Any()` caches the first item',
          note: 'Nothing in `IEnumerable` caches. The first item is discarded when `Any()` returns.',
          correct: false,
        },
        {
          id: 'count',
          label: 'It never enumerates, because `Any()` checks a count property',
          note: '`Any()` calls `GetEnumerator` and `MoveNext` once. It has no count to read.',
          correct: false,
        },
      ],
      rule: '`IEnumerable` is a sequence you can walk, not a result you hold. Walk it once — `ToList` at the boundary — when the source is expensive.',
      reference: `var loaded = orders.ToList();
if (loaded.Count > 0) {
  foreach (var order in loaded) { Render(order); }
}`,
    },
    {
      id: 'blocking-task',
      title: 'Waiting on a task from the wrong place',
      topic: 'async',
      level: 'sharp',
      question: 'This runs on a UI thread. What is the risk?',
      code: `var json = client.GetStringAsync(url).Result;
var device = JsonSerializer.Deserialize<Device>(json);`,
      choices: [
        {
          id: 'deadlock',
          label: 'It can deadlock: the continuation needs the thread that `.Result` is blocking',
          note: 'On a context that resumes continuations on one thread, the blocked thread is the one the continuation is queued to. Awaiting gives the thread back; blocking keeps it.',
          correct: true,
        },
        {
          id: 'faster',
          label: 'It is faster, because no state machine is generated',
          note: 'It blocks a thread for the whole network call — the opposite of faster under any concurrency.',
          correct: false,
        },
        {
          id: 'throws',
          label: 'It always throws `AggregateException`',
          note: 'It throws that only when the task faulted, and it wraps the real exception, which is a separate problem.',
          correct: false,
        },
      ],
      rule: 'Never block on a task from a thread with a synchronization context. Make the method `async` and `await` it.',
      reference: `var json = await client.GetStringAsync(url);
var device = JsonSerializer.Deserialize<Device>(json);`,
    },
    {
      id: 'struct-copy',
      title: 'A change that never lands',
      topic: 'value types',
      level: 'core',
      question: 'What is printed?',
      code: `struct Reading { public int Value; }

var readings = new List<Reading> { new() { Value = 3 } };
var copy = readings[0];
copy.Value = 9;

Console.WriteLine(readings[0].Value);`,
      choices: [
        {
          id: 'three',
          label: '3',
          note: 'Indexing a list of structs returns a copy. The assignment changed the copy, not the element.',
          correct: true,
        },
        {
          id: 'nine',
          label: '9',
          note: 'That is the answer for a class, or for assigning through the indexer: `readings[0].Value = 9`.',
          correct: false,
        },
        {
          id: 'compile',
          label: 'It does not compile',
          note: 'Assigning to a local copy is legal, which is what makes the bug quiet.',
          correct: false,
        },
      ],
      rule: 'A struct read out of a collection is a copy. Mutate through the collection, or make the type a class.',
      reference: `readings[0].Value = 9;   // mutates the element itself`,
    },
    {
      id: 'record-equality',
      title: 'Two records that are equal',
      topic: 'value types',
      level: 'core',
      question: 'What does this print?',
      code: `record Desk(string Site, int Floor);
class Room { public string Site = ""; public int Floor; }

var a = new Desk("north", 2);
var b = new Desk("north", 2);
Console.WriteLine(a == b);

var c = new Room { Site = "north", Floor = 2 };
var d = new Room { Site = "north", Floor = 2 };
Console.WriteLine(c == d);`,
      choices: [
        {
          id: 'true-false',
          label: 'True, then false',
          note: 'A record generates value equality and `==` for its members; a class inherits reference equality, so two separate instances are not equal.',
          correct: true,
        },
        {
          id: 'false-false',
          label: 'False, then false',
          note: 'The record compares its values, so two north/2 records are equal.',
          correct: false,
        },
        {
          id: 'true-true',
          label: 'True, then true',
          note: 'The class has no value equality. Two `Room` objects hold the same data and are still different objects.',
          correct: false,
        },
      ],
      rule: '`record` and `record struct` give value equality for free; a plain `class` compares references unless you override `Equals` and `GetHashCode`.',
      reference: `// a plain class needs both to behave the same way
public override bool Equals(object? other) =>
    other is Room room && room.Site == Site && room.Floor == Floor;
public override int GetHashCode() => HashCode.Combine(Site, Floor);`,
    },
  ],
}
