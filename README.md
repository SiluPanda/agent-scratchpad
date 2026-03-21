# agent-scratchpad

Lightweight key-value scratchpad for agent reasoning. Zero external runtime dependencies.

## Install

```bash
npm install agent-scratchpad
```

## Quick Start

```typescript
import { createScratchpad } from 'agent-scratchpad';

const pad = createScratchpad();

pad.set('step', 'analyze');
pad.set('user', { id: 42, name: 'Alice' });

console.log(pad.get('step')); // 'analyze'
console.log(pad.has('user')); // true
```

## TTL

Entries can expire automatically. Use `options.now` to control time in tests.

```typescript
const pad = createScratchpad({ defaultTtl: 60_000 }); // 1 minute default

pad.set('cache', 'value', { ttl: 5_000 }); // expires in 5s
pad.set('permanent', 'value', { ttl: null }); // never expires
```

### Sliding TTL

With `slidingTtl: true`, the expiry window resets each time the entry is accessed.

```typescript
pad.set('session', token, { ttl: 30_000, slidingTtl: true });
pad.get('session'); // resets the 30s window
```

### Sweep interval

Use `sweepIntervalMs` to proactively remove expired entries in the background.

```typescript
const pad = createScratchpad({ sweepIntervalMs: 10_000 }); // sweep every 10s
// Call pad.destroy() to stop the sweep timer
await pad.destroy();
```

## Namespaces

Namespace calls transparently prefix all keys with `name:`. Namespaces can be nested.

```typescript
const memory = pad.namespace('memory');
memory.set('fact', 'Paris is in France');
pad.get('memory:fact'); // 'Paris is in France'

const nested = pad.namespace('a').namespace('b');
nested.set('key', 'val');
pad.get('a:b:key'); // 'val'
```

## Tags

Tag entries and retrieve them by tag.

```typescript
pad.set('city', 'London', { tags: ['geo', 'important'] });
pad.set('country', 'UK', { tags: ['geo'] });

pad.findByTag('geo'); // both entries
pad.findByTag('important'); // only 'city'
```

## toContext()

Format scratchpad contents as a context string for LLM prompts.

```typescript
pad.set('name', 'Alice');
pad.set('role', 'admin');

pad.toContext();                         // 'name: Alice\nrole: admin'
pad.toContext({ format: 'markdown' });   // '## name\nAlice\n\n## role\nadmin'
pad.toContext({ format: 'json' });       // '{"name":"Alice","role":"admin"}'
pad.toContext({ format: 'xml' });        // '<entry key="name">Alice</entry>...'

// Filter by tags or namespace
pad.toContext({ filterTags: ['important'] });
pad.toContext({ filterNamespace: 'ctx' });

// Limit output length
pad.toContext({ maxTokens: 500, tokenCounter: (s) => s.length });

// Add a header
pad.toContext({ header: '## Agent Memory', format: 'kv' });
```

## Snapshot / Restore

```typescript
const snap = pad.snapshot(); // { entries, timestamp, version: 1 }
pad.restore(snap);

// Or use fromSnapshot helper
import { fromSnapshot } from 'agent-scratchpad';
const pad2 = fromSnapshot(snap);
```

## Events

```typescript
const unsub = pad.on('set', ({ key, entry, isUpdate }) => {
  console.log(isUpdate ? 'updated' : 'created', key);
});

pad.on('delete', ({ key }) => console.log('deleted', key));
pad.on('expire', ({ key }) => console.log('expired', key));
pad.on('clear', ({ count }) => console.log('cleared', count, 'entries'));

unsub(); // remove listener
```

## Stats

```typescript
const st = pad.stats();
// {
//   size: 3,           live (non-expired) entry count
//   rawSize: 3,        total entries including expired-not-yet-swept
//   namespaceCount: 2,
//   namespaces: ['ctx', 'mem'],
//   entriesWithTtl: 1,
//   tagCounts: { geo: 2 },
//   oldestEntryAt: 1710000000000,
//   newestEntryAt: 1710000001000,
// }
```

## Persistence

Provide a `PersistenceAdapter` to save and load snapshots.

```typescript
import { createScratchpad, PersistenceAdapter, ScratchpadSnapshot } from 'agent-scratchpad';
import fs from 'fs/promises';

const adapter: PersistenceAdapter = {
  async load() {
    try {
      return JSON.parse(await fs.readFile('pad.json', 'utf8')) as ScratchpadSnapshot;
    } catch { return null; }
  },
  async save(snap) {
    await fs.writeFile('pad.json', JSON.stringify(snap));
  },
};

const pad = createScratchpad({ persistence: adapter });
await pad.load();
// ... use pad ...
await pad.save();
```

## License

MIT
