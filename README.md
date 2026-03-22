# agent-scratchpad

Lightweight key-value scratchpad for AI agent working memory.

[![npm version](https://img.shields.io/npm/v/agent-scratchpad.svg)](https://www.npmjs.com/package/agent-scratchpad)
[![npm downloads](https://img.shields.io/npm/dt/agent-scratchpad.svg)](https://www.npmjs.com/package/agent-scratchpad)
[![license](https://img.shields.io/npm/l/agent-scratchpad.svg)](https://github.com/SiluPanda/agent-scratchpad/blob/master/LICENSE)
[![node](https://img.shields.io/node/v/agent-scratchpad.svg)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)

`agent-scratchpad` is a zero-dependency, in-process key-value store purpose-built for AI agent reasoning loops. Agents executing multi-step workflows (ReAct, Plan-and-Execute, Chain-of-Thought with tool use) need a place to write down intermediate state between steps -- tool outputs, extracted entities, partial computations, decision rationale, and task decomposition state. This package provides that working memory with typed entries, automatic TTL-based expiration, hierarchical namespaces, tag-based querying, point-in-time snapshots, event-driven change observation, pluggable persistence, and a `toContext()` method that renders scratchpad contents directly into LLM prompts. It works with any agent framework or custom agent loop.

## Installation

```bash
npm install agent-scratchpad
```

## Quick Start

```typescript
import { createScratchpad } from 'agent-scratchpad';

const pad = createScratchpad();

// Store intermediate results
pad.set('step', 'analyze');
pad.set('user', { id: 42, name: 'Alice' });

console.log(pad.get('step'));   // 'analyze'
console.log(pad.has('user'));   // true
console.log(pad.keys());       // ['step', 'user']

// Render contents for an LLM prompt
const context = pad.toContext({ format: 'markdown' });
```

## Features

- **Zero runtime dependencies** -- all logic uses built-in JavaScript APIs
- **TypeScript-first** -- full generic type safety on `get<T>()` and `set<T>()`
- **TTL expiration** -- fixed or sliding time-to-live with lazy and active sweep modes
- **Hierarchical namespaces** -- scope entries per agent, task, or step with `pad.namespace('name')`
- **Tag-based querying** -- label entries and retrieve them with `findByTag()`
- **Snapshots** -- capture and restore full scratchpad state for backtracking and debugging
- **Context rendering** -- format entries as Markdown, XML, JSON, or key-value pairs for LLM prompts
- **Event system** -- observe `set`, `delete`, `expire`, and `clear` events
- **Pluggable persistence** -- save and load scratchpad state via a simple adapter interface
- **Framework-agnostic** -- works with LangChain, Vercel AI SDK, AutoGen, CrewAI, or any custom loop

## API Reference

### `createScratchpad(options?)`

Creates a new `Scratchpad` instance.

```typescript
import { createScratchpad } from 'agent-scratchpad';

const pad = createScratchpad({
  defaultTtl: 60_000,
  defaultSlidingTtl: false,
  sweepIntervalMs: 10_000,
  now: () => Date.now(),
  persistence: adapter,
});
```

**Parameters:**

| Option | Type | Default | Description |
|---|---|---|---|
| `defaultTtl` | `number \| null` | `null` | Default TTL in milliseconds applied to entries that do not specify their own. `null` means no expiration. |
| `defaultSlidingTtl` | `boolean` | `false` | Whether the default TTL mode is sliding (resets on access) or fixed (from creation). |
| `sweepIntervalMs` | `number \| null` | `null` | Interval in milliseconds for proactive background sweep of expired entries. `null` disables active sweep. |
| `now` | `() => number` | `Date.now` | Custom time source. Useful for deterministic testing. |
| `persistence` | `PersistenceAdapter` | `undefined` | Optional adapter for saving and loading scratchpad state. |

**Returns:** `Scratchpad`

---

### `fromSnapshot(snapshot, options?)`

Creates a new `Scratchpad` pre-populated from a previously captured snapshot.

```typescript
import { fromSnapshot } from 'agent-scratchpad';

const pad = fromSnapshot(snap, { defaultTtl: 30_000 });
```

**Parameters:**

- `snapshot` (`ScratchpadSnapshot`) -- A snapshot object previously obtained from `pad.snapshot()` or `pad.serialize()`.
- `options` (`ScratchpadOptions`, optional) -- Configuration options passed to the underlying `createScratchpad()` call.

**Returns:** `Scratchpad`

---

### Scratchpad Methods

#### `set<T>(key, value, options?)`

Stores a value under the given key. If the key already exists, updates the value and `updatedAt` timestamp while preserving `createdAt`.

```typescript
pad.set('result', { score: 0.95 });
pad.set('cache', 'value', { ttl: 5_000, tags: ['temporary'] });
pad.set('session', token, { ttl: 30_000, slidingTtl: true });
```

**Parameters:**

- `key` (`string`) -- The entry key.
- `value` (`T`) -- The value to store.
- `options` (`EntryOptions`, optional) -- Per-entry configuration.

| Option | Type | Default | Description |
|---|---|---|---|
| `ttl` | `number \| null` | Inherits `defaultTtl` | TTL in milliseconds. `null` disables expiration for this entry. |
| `slidingTtl` | `boolean` | Inherits `defaultSlidingTtl` | Whether TTL resets on each `get()` access. |
| `tags` | `string[]` | `[]` | String labels for categorizing the entry. |

**Returns:** `void`

#### `get<T>(key)`

Retrieves the value for a key. If the entry has expired, it is removed, an `expire` event fires, and `undefined` is returned. On a successful read, `accessedAt` is updated (which resets the sliding TTL window if applicable).

```typescript
const user = pad.get<{ id: number; name: string }>('user');
```

**Parameters:**

- `key` (`string`) -- The entry key.

**Returns:** `T | undefined`

#### `has(key)`

Checks whether a key exists and is not expired. Expired entries are removed and trigger an `expire` event.

```typescript
if (pad.has('apiResponse')) {
  // entry is live
}
```

**Parameters:**

- `key` (`string`) -- The entry key.

**Returns:** `boolean`

#### `delete(key)`

Removes an entry by key. Fires a `delete` event if the entry existed.

```typescript
const removed = pad.delete('staleData'); // true if it existed
```

**Parameters:**

- `key` (`string`) -- The entry key.

**Returns:** `boolean` -- `true` if the entry existed and was removed, `false` otherwise.

#### `clear()`

Removes all entries from the scratchpad. Fires a `clear` event with the count of removed entries.

```typescript
pad.clear();
```

**Returns:** `void`

#### `keys()`

Returns an array of all non-expired keys. Expired entries encountered during iteration are excluded.

```typescript
const allKeys = pad.keys(); // ['step', 'user', 'result']
```

**Returns:** `string[]`

#### `entries()`

Returns an array of `[key, ScratchpadEntry]` tuples for all non-expired entries.

```typescript
for (const [key, entry] of pad.entries()) {
  console.log(key, entry.value, entry.tags);
}
```

**Returns:** `[string, ScratchpadEntry][]`

#### `findByTag(tag)`

Returns all non-expired entries whose `tags` array includes the given tag (exact match).

```typescript
pad.set('london', 'UK capital', { tags: ['geo', 'important'] });
pad.set('paris', 'France capital', { tags: ['geo'] });

const geoEntries = pad.findByTag('geo'); // both entries
```

**Parameters:**

- `tag` (`string`) -- The tag to search for.

**Returns:** `ScratchpadEntry[]`

#### `namespace(name)`

Returns a scoped view of the scratchpad where all operations are prefixed with `name:`. Namespaces share the underlying storage with the parent -- they are views, not copies. Namespaces can be nested.

```typescript
const memory = pad.namespace('memory');
memory.set('fact', 'The sky is blue');
memory.get('fact');           // 'The sky is blue'
pad.get('memory:fact');       // 'The sky is blue'

// Nested namespaces compose prefixes
const deep = pad.namespace('a').namespace('b');
deep.set('key', 'val');
pad.get('a:b:key');           // 'val'

// Namespace-scoped operations
memory.keys();                // ['fact'] (prefix stripped)
memory.clear();               // removes only memory:* entries
```

**Parameters:**

- `name` (`string`) -- The namespace prefix.

**Returns:** `Scratchpad` -- A namespace-scoped scratchpad instance with the same full API.

#### `snapshot()`

Captures the full scratchpad state at the current point in time. The returned snapshot is a plain object suitable for serialization.

```typescript
const snap = pad.snapshot();
// { entries: { ... }, timestamp: 1710000000000, version: 1 }
```

**Returns:** `ScratchpadSnapshot`

#### `restore(snapshot)`

Replaces the entire scratchpad state with the contents of a snapshot. Clears all existing entries before restoring. Throws `ScratchpadVersionError` if the snapshot version is not supported.

```typescript
pad.restore(snap);
```

**Parameters:**

- `snapshot` (`ScratchpadSnapshot`) -- A snapshot previously obtained from `snapshot()` or `serialize()`.

**Returns:** `void`

**Throws:** `ScratchpadVersionError` if `snapshot.version` is not `1`.

#### `serialize()`

Alias for `snapshot()`. Returns the same `ScratchpadSnapshot` structure.

```typescript
const data = pad.serialize();
```

**Returns:** `ScratchpadSnapshot`

#### `toContext(options?)`

Renders scratchpad contents as a formatted string suitable for injection into an LLM prompt. Supports filtering by tags or namespace, multiple output formats, token budget limits, and custom headers.

```typescript
pad.set('name', 'Alice');
pad.set('role', 'admin');

pad.toContext();
// 'name: Alice\nrole: admin'

pad.toContext({ format: 'markdown' });
// '## name\nAlice\n\n## role\nadmin'

pad.toContext({ format: 'json' });
// '{"name":"Alice","role":"admin"}'

pad.toContext({ format: 'xml' });
// '<entry key="name">Alice</entry>\n<entry key="role">admin</entry>'
```

**Parameters:**

| Option | Type | Default | Description |
|---|---|---|---|
| `format` | `'kv' \| 'markdown' \| 'xml' \| 'json'` | `'kv'` | Output format. |
| `filterTags` | `string[]` | `undefined` | Only include entries that have at least one of the specified tags. |
| `filterNamespace` | `string` | `undefined` | Only include entries whose key starts with the given namespace prefix. |
| `maxTokens` | `number` | `undefined` | Truncate output to fit within this token budget. |
| `tokenCounter` | `(text: string) => number` | `text.length` | Function to count tokens. Used with `maxTokens`. |
| `includeMetadata` | `boolean` | `undefined` | Reserved for future use. |
| `header` | `string` | `undefined` | Text prepended to the output before the formatted entries. |

**Returns:** `string`

#### `stats()`

Returns aggregate statistics about the scratchpad's current state.

```typescript
const st = pad.stats();
// {
//   size: 3,             // live (non-expired) entry count
//   rawSize: 4,          // total entries including expired-not-yet-swept
//   namespaceCount: 2,
//   namespaces: ['ctx', 'mem'],
//   entriesWithTtl: 1,
//   tagCounts: { geo: 2, important: 1 },
//   oldestEntryAt: 1710000000000,
//   newestEntryAt: 1710000001000,
// }
```

**Returns:** `ScratchpadStats`

| Field | Type | Description |
|---|---|---|
| `size` | `number` | Count of non-expired entries. |
| `rawSize` | `number` | Total entries in the store, including expired entries not yet swept. |
| `namespaceCount` | `number` | Number of distinct namespace prefixes. |
| `namespaces` | `string[]` | List of distinct namespace prefixes. |
| `entriesWithTtl` | `number` | Count of entries that have a TTL set. |
| `tagCounts` | `Record<string, number>` | Count of entries per tag. |
| `oldestEntryAt` | `number \| null` | `createdAt` of the oldest live entry, or `null` if empty. |
| `newestEntryAt` | `number \| null` | `createdAt` of the newest live entry, or `null` if empty. |

#### `on(event, handler)`

Registers an event handler. Returns an unsubscribe function.

```typescript
const unsub = pad.on('set', ({ key, entry, isUpdate }) => {
  console.log(isUpdate ? 'updated' : 'created', key);
});

pad.on('delete', ({ key, entry }) => {
  console.log('deleted', key);
});

pad.on('expire', ({ key, entry }) => {
  console.log('expired', key);
});

pad.on('clear', ({ count }) => {
  console.log('cleared', count, 'entries');
});

// Stop listening
unsub();
```

**Parameters:**

- `event` (`ScratchpadEventName`) -- One of `'set'`, `'delete'`, `'expire'`, `'clear'`.
- `handler` (`ScratchpadEventHandler<K>`) -- Callback receiving the event payload.

**Event Payloads:**

| Event | Payload |
|---|---|
| `set` | `{ key: string; entry: ScratchpadEntry; isUpdate: boolean }` |
| `delete` | `{ key: string; entry: ScratchpadEntry }` |
| `expire` | `{ key: string; entry: ScratchpadEntry }` |
| `clear` | `{ count: number }` |

**Returns:** `() => void` -- Call to unsubscribe.

#### `save()`

Persists the current scratchpad state using the configured `PersistenceAdapter`. No-op if no adapter was provided.

```typescript
await pad.save();
```

**Returns:** `Promise<void>`

#### `load()`

Loads scratchpad state from the configured `PersistenceAdapter` and restores it. No-op if no adapter was provided or the adapter returns `null`.

```typescript
await pad.load();
```

**Returns:** `Promise<void>`

#### `destroy()`

Cleans up resources. Stops the background sweep timer if one is running.

```typescript
await pad.destroy();
```

**Returns:** `Promise<void>`

---

### TTL Utility Functions

#### `isExpired(entry, now)`

Determines whether a scratchpad entry has expired based on its TTL configuration.

```typescript
import { isExpired } from 'agent-scratchpad';

const expired = isExpired(entry, Date.now());
```

**Parameters:**

- `entry` (`ScratchpadEntry`) -- The entry to check.
- `now` (`number`) -- Current timestamp in milliseconds.

**Returns:** `boolean` -- `true` if the entry's TTL has elapsed.

**Logic:**
- Returns `false` if `entry.ttl` is `null`.
- For fixed TTL (`slidingTtl: false`): expired when `now >= entry.createdAt + entry.ttl`.
- For sliding TTL (`slidingTtl: true`): expired when `now >= entry.accessedAt + entry.ttl`.

#### `expiresAt(entry)`

Calculates the absolute expiration timestamp for an entry.

```typescript
import { expiresAt } from 'agent-scratchpad';

const expiry = expiresAt(entry); // number | null
```

**Parameters:**

- `entry` (`ScratchpadEntry`) -- The entry to inspect.

**Returns:** `number | null` -- The Unix timestamp (ms) when the entry expires, or `null` if it has no TTL.

---

### Types

#### `ScratchpadEntry<T>`

```typescript
interface ScratchpadEntry<T = unknown> {
  key: string;
  value: T;
  createdAt: number;    // Unix ms when first created
  updatedAt: number;    // Unix ms when value last updated
  accessedAt: number;   // Unix ms when last read via get()
  ttl: number | null;   // TTL in ms, null = no expiration
  slidingTtl: boolean;  // true = TTL resets on access
  tags: string[];       // string labels for categorization
}
```

#### `EntryOptions`

```typescript
interface EntryOptions {
  ttl?: number | null;
  slidingTtl?: boolean;
  tags?: string[];
}
```

#### `ScratchpadOptions`

```typescript
interface ScratchpadOptions {
  defaultTtl?: number | null;
  defaultSlidingTtl?: boolean;
  sweepIntervalMs?: number | null;
  now?: () => number;
  persistence?: PersistenceAdapter;
}
```

#### `ScratchpadSnapshot`

```typescript
interface ScratchpadSnapshot {
  entries: Record<string, ScratchpadEntry>;
  timestamp: number;
  version: 1;
}
```

#### `ScratchpadStats`

```typescript
interface ScratchpadStats {
  size: number;
  rawSize: number;
  namespaceCount: number;
  namespaces: string[];
  entriesWithTtl: number;
  tagCounts: Record<string, number>;
  oldestEntryAt: number | null;
  newestEntryAt: number | null;
}
```

#### `ToContextOptions`

```typescript
interface ToContextOptions {
  format?: 'markdown' | 'xml' | 'json' | 'kv';
  filterTags?: string[];
  filterNamespace?: string;
  maxTokens?: number;
  tokenCounter?: (text: string) => number;
  includeMetadata?: boolean;
  header?: string;
}
```

#### `PersistenceAdapter`

```typescript
interface PersistenceAdapter {
  load(): Promise<ScratchpadSnapshot | null>;
  save(snap: ScratchpadSnapshot): Promise<void>;
}
```

#### `ScratchpadEvents`

```typescript
interface ScratchpadEvents {
  set: { key: string; entry: ScratchpadEntry; isUpdate: boolean };
  delete: { key: string; entry: ScratchpadEntry };
  expire: { key: string; entry: ScratchpadEntry };
  clear: { count: number };
}
```

#### `ScratchpadEventName`

```typescript
type ScratchpadEventName = 'set' | 'delete' | 'expire' | 'clear';
```

#### `ScratchpadEventHandler<K>`

```typescript
type ScratchpadEventHandler<K extends ScratchpadEventName> = (
  data: ScratchpadEvents[K]
) => void;
```

---

## Error Handling

`agent-scratchpad` exports three error classes, all extending a common base.

### `ScratchpadError`

Base class for all scratchpad errors. Extends `Error` with a `code` property.

```typescript
import { ScratchpadError } from 'agent-scratchpad';

try {
  pad.restore(badSnapshot);
} catch (err) {
  if (err instanceof ScratchpadError) {
    console.error(err.code);    // e.g. 'SCRATCHPAD_VERSION_ERROR'
    console.error(err.message); // human-readable description
  }
}
```

| Property | Type | Description |
|---|---|---|
| `code` | `string` | Machine-readable error code. |
| `message` | `string` | Human-readable error description. |
| `name` | `string` | Always `'ScratchpadError'`. |

### `ScratchpadConfigError`

Thrown when invalid configuration is provided to `createScratchpad()`.

- **Code:** `SCRATCHPAD_CONFIG_ERROR`

### `ScratchpadVersionError`

Thrown when `restore()` encounters a snapshot with an unsupported version number.

- **Code:** `SCRATCHPAD_VERSION_ERROR`
- **Additional property:** `version` (`number`) -- The unsupported version that was encountered.

```typescript
import { ScratchpadVersionError } from 'agent-scratchpad';

try {
  pad.restore(snap);
} catch (err) {
  if (err instanceof ScratchpadVersionError) {
    console.error(`Unsupported version: ${err.version}`);
  }
}
```

---

## Advanced Usage

### Agent Working Memory in a ReAct Loop

```typescript
import { createScratchpad } from 'agent-scratchpad';

const pad = createScratchpad({ defaultTtl: 300_000 }); // 5-minute default

// Step 1: Store tool output
pad.set('search:result', apiResponse, { tags: ['tool-result', 'search'] });

// Step 2: Extract and store entities
pad.set('entities:user', { name: 'Alice', id: 42 }, { tags: ['entity'] });
pad.set('entities:order', { orderId: '#12345' }, { tags: ['entity'] });

// Step 3: Inject scratchpad into prompt
const agentContext = pad.toContext({
  format: 'markdown',
  header: '## Agent Working Memory',
  filterTags: ['entity'],
});
// Produces:
// ## Agent Working Memory
// ## entities:user
// [object Object]
// ...
```

### Namespace Isolation for Multi-Agent Systems

```typescript
const pad = createScratchpad();

const agent1 = pad.namespace('agent1');
const agent2 = pad.namespace('agent2');

agent1.set('plan', 'Research the topic');
agent2.set('plan', 'Draft the response');

// Each agent sees only its own entries
agent1.keys(); // ['plan']
agent2.keys(); // ['plan']

// Parent sees all entries with prefixed keys
pad.keys(); // ['agent1:plan', 'agent2:plan']

// Clear one agent without affecting the other
agent1.clear();
agent2.keys(); // ['plan'] -- unaffected
```

### Sliding TTL for Session-Like Data

```typescript
const pad = createScratchpad();

// Session token stays alive as long as the agent keeps accessing it
pad.set('session', { token: 'abc123' }, { ttl: 30_000, slidingTtl: true });

// Each access resets the 30-second expiration window
pad.get('session'); // resets timer
pad.get('session'); // resets timer again

// If 30 seconds pass without access, the entry expires
```

### Background Sweep with Event Logging

```typescript
const pad = createScratchpad({ sweepIntervalMs: 10_000 });

pad.on('expire', ({ key, entry }) => {
  console.log(`Expired: ${key} (created ${new Date(entry.createdAt).toISOString()})`);
});

pad.set('temp', 'data', { ttl: 15_000 });

// The sweep timer runs every 10 seconds and removes expired entries.
// The expire event fires for each entry removed by the sweep.

// Stop the sweep timer when done
await pad.destroy();
```

### Persistence with a File-Based Adapter

```typescript
import { createScratchpad, PersistenceAdapter, ScratchpadSnapshot } from 'agent-scratchpad';
import fs from 'fs/promises';

const fileAdapter: PersistenceAdapter = {
  async load() {
    try {
      const data = await fs.readFile('scratchpad.json', 'utf8');
      return JSON.parse(data) as ScratchpadSnapshot;
    } catch {
      return null;
    }
  },
  async save(snap) {
    await fs.writeFile('scratchpad.json', JSON.stringify(snap, null, 2));
  },
};

const pad = createScratchpad({ persistence: fileAdapter });

// Restore previous state on startup
await pad.load();

// Work with the scratchpad
pad.set('progress', 'step-3');

// Persist state before shutdown
await pad.save();
```

### Snapshot-Based Backtracking

```typescript
const pad = createScratchpad();

pad.set('approach', 'strategy-A');
pad.set('findings', ['result-1']);

// Save state before trying something risky
const checkpoint = pad.snapshot();

pad.set('approach', 'strategy-B');
pad.set('findings', ['result-1', 'result-2-failed']);

// Strategy B failed -- roll back
pad.restore(checkpoint);
pad.get('approach'); // 'strategy-A'
```

### Token-Budget-Aware Context Rendering

```typescript
import { createScratchpad } from 'agent-scratchpad';

const pad = createScratchpad();
pad.set('summary', 'A long summary of findings...');
pad.set('details', 'Extensive details that may not fit...');

// Use a custom token counter (e.g., tiktoken)
const context = pad.toContext({
  format: 'kv',
  maxTokens: 500,
  tokenCounter: (text) => Math.ceil(text.length / 4), // rough estimate
  header: '## Working Memory',
});
```

### Deterministic Testing with Custom Time

```typescript
import { createScratchpad } from 'agent-scratchpad';

let now = 0;
const pad = createScratchpad({ now: () => now });

pad.set('key', 'value', { ttl: 100 });

now = 50;
pad.get('key');   // 'value' -- still alive

now = 100;
pad.get('key');   // undefined -- expired exactly at 100ms
```

---

## TypeScript

`agent-scratchpad` is written in TypeScript and ships with full type declarations. All exported functions, interfaces, and types are available for import:

```typescript
import {
  createScratchpad,
  fromSnapshot,
  toContext,
  isExpired,
  expiresAt,
  ScratchpadError,
  ScratchpadConfigError,
  ScratchpadVersionError,
} from 'agent-scratchpad';

import type {
  Scratchpad,
  ScratchpadEntry,
  ScratchpadOptions,
  ScratchpadSnapshot,
  ScratchpadStats,
  ToContextOptions,
  EntryOptions,
  ScratchpadEventName,
  ScratchpadEventHandler,
  ScratchpadEvents,
  PersistenceAdapter,
} from 'agent-scratchpad';
```

Generic type parameters on `get<T>()` and `set<T>()` provide type-safe value access without casts:

```typescript
interface User {
  id: number;
  name: string;
}

pad.set<User>('user', { id: 1, name: 'Alice' });
const user = pad.get<User>('user');
// user is User | undefined
```

## License

MIT
