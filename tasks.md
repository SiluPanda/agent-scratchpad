# agent-scratchpad — Task Breakdown

## Phase 1: Project Setup and Scaffolding

- [x] **Install dev dependencies** — Add `typescript` (>=5.0), `vitest`, `eslint`, and `@types/node` as dev dependencies in `package.json`. Run `npm install` to generate `node_modules` and lock file. | Status: done
- [x] **Configure Vitest** — Add a `vitest.config.ts` file (or configure within `package.json`) so that `npm run test` discovers and runs `src/__tests__/**/*.test.ts` files. | Status: done
- [x] **Configure ESLint** — Add an ESLint config file appropriate for TypeScript. Ensure `npm run lint` works against `src/`. | Status: done
- [ ] **Create source file structure** — Create the following empty source files as outlined in the spec: `src/types.ts`, `src/errors.ts`, `src/ttl.ts`, `src/sweep.ts`, `src/namespace.ts`, `src/snapshot.ts`, `src/context.ts`, `src/persistence.ts`, `src/scratchpad.ts`. Update `src/index.ts` to re-export from these modules. | Status: not_done
- [ ] **Create test directory structure** — Create the test directory tree: `src/__tests__/core/`, `src/__tests__/ttl/`, `src/__tests__/tags/`, `src/__tests__/namespaces/`, `src/__tests__/snapshots/`, `src/__tests__/persistence/`, `src/__tests__/context/`, `src/__tests__/events/`, `src/__tests__/fixtures/`. | Status: not_done
- [ ] **Create test fixtures** — Create `src/__tests__/fixtures/entries.ts` (reusable test entry data), `src/__tests__/fixtures/mock-adapter.ts` (mock persistence adapter storing state in a variable), and `src/__tests__/fixtures/mock-time.ts` (mock time source using a controllable `now()` function). | Status: not_done
- [x] **Verify build pipeline** — Run `npm run build` (tsc) and confirm it compiles successfully with the empty/skeleton source files and produces output in `dist/`. | Status: done

---

## Phase 2: Type Definitions (`src/types.ts`)

- [x] **Define `ScratchpadEntry<T>` interface** — Include fields: `key` (string), `value` (T), `createdAt` (number), `updatedAt` (number), `accessedAt` (number), `ttl` (number | null), `slidingTtl` (boolean), `tags` (string[]). | Status: done
- [x] **Define `EntryOptions` interface** — Include optional fields: `ttl` (number | null), `slidingTtl` (boolean), `tags` (string[]). | Status: done
- [ ] **Define `ScratchpadOptions` interface** — Include optional fields: `defaultTtl` (number | null), `defaultSlidingTtl` (boolean), `sweepIntervalMs` (number | null), `persistence` (PersistenceAdapter), `autoSaveDebounceMs` (number), `now` (() => number). | Status: not_done
- [x] **Define `ScratchpadSnapshot` interface** — Include fields: `entries` (Record<string, ScratchpadEntry>), `timestamp` (number), `version` (literal 1). | Status: done
- [ ] **Define `ScratchpadStats` interface** — Include fields: `size`, `rawSize`, `namespaceCount`, `namespaces`, `entriesWithTtl`, `expiredPending`, `tagCounts`, `oldestEntryAt`, `newestEntryAt`. | Status: not_done
- [x] **Define `ToContextOptions` interface** — Include fields: `format` ('markdown' | 'xml' | 'json' | 'kv'), `filterTags` (string[]), `filterNamespace` (string), `maxTokens` (number), `tokenCounter` ((text: string) => number), `includeMetadata` (boolean), `header` (string). | Status: done
- [x] **Define `PersistenceAdapter` interface** — Include methods: `load(): Promise<ScratchpadSnapshot | null>`, `save(snapshot: ScratchpadSnapshot): Promise<void>`. | Status: done
- [x] **Define `ScratchpadEvents` interface** — Define event payloads: `set` ({key, entry, isUpdate}), `delete` ({key, entry}), `expire` ({key, entry}), `clear` ({count}). Define `ScratchpadEventName` and `ScratchpadEventHandler<E>` types. | Status: done
- [ ] **Define `SnapshotDiff` interface** — Include fields: `added` (string[]), `removed` (string[]), `updated` (string[]), `unchanged` (string[]). | Status: not_done
- [ ] **Define `Scratchpad` interface** — Full interface with all methods: `set`, `get`, `has`, `delete`, `clear`, `keys`, `entries`, `getEntry`, `find`, `findByTag`, `namespace`, `snapshot`, `restore`, `toContext`, `serialize`, `size`, `stats`, `on`, `destroy`, `save`, `load`. Ensure generics on `set<T>` and `get<T>`. | Status: not_done

---

## Phase 3: Error Classes (`src/errors.ts`)

- [x] **Implement `ScratchpadError` base class** — Extend `Error` with a `readonly code: string` property. Set the error name to `'ScratchpadError'`. | Status: done
- [x] **Implement `ScratchpadConfigError`** — Extend `ScratchpadError` with code `'SCRATCHPAD_CONFIG_ERROR'`. Used for invalid configuration in `createScratchpad()`. | Status: done
- [ ] **Implement `ScratchpadPersistenceError`** — Extend `ScratchpadError` with code `'SCRATCHPAD_PERSISTENCE_ERROR'`. Used when persistence adapter operations fail. | Status: not_done
- [x] **Implement `ScratchpadVersionError`** — Extend `ScratchpadError` with code `'SCRATCHPAD_VERSION_ERROR'` and a `readonly version: number` property. Used when a snapshot has an unsupported version. | Status: done

---

## Phase 4: TTL Logic (`src/ttl.ts`)

- [x] **Implement `isExpired(entry, now)` function** — For fixed TTL: check if `now - entry.createdAt >= entry.ttl`. For sliding TTL: check if `now - entry.accessedAt >= entry.ttl`. Return `false` if `entry.ttl` is `null`. | Status: done
- [x] **Implement `getExpiresAt(entry)` helper** — Calculate and return the absolute expiration timestamp for an entry based on its TTL mode. Return `null` if no TTL is set. Useful for debugging/stats. | Status: done
- [ ] **Handle edge case: TTL of 0** — Reject TTL of 0 or negative values with `ScratchpadConfigError` during validation (not in ttl.ts, but ensure the logic is consistent). | Status: not_done

---

## Phase 5: Core Scratchpad Implementation (`src/scratchpad.ts`)

### 5a: Factory and Configuration

- [x] **Implement `createScratchpad(options?)` factory function** — Accept `ScratchpadOptions`, validate configuration, create internal `Map<string, ScratchpadEntry>`, return a `Scratchpad` instance. | Status: done
- [ ] **Validate `defaultTtl`** — If not null, must be a positive number. Throw `ScratchpadConfigError` for zero or negative values. | Status: not_done
- [ ] **Validate `sweepIntervalMs`** — If not null, must be a positive number >= 100. Throw `ScratchpadConfigError` for values under 100. | Status: not_done
- [ ] **Validate `autoSaveDebounceMs`** — Must be a non-negative number. Throw `ScratchpadConfigError` for negative values. | Status: not_done
- [ ] **Validate `now`** — If provided, must be a function. Throw `ScratchpadConfigError` otherwise. | Status: not_done
- [ ] **Validate `persistence`** — If provided, must be an object with `load` and `save` functions. Throw `ScratchpadConfigError` otherwise. | Status: not_done
- [ ] **Apply default values** — `defaultTtl: null`, `defaultSlidingTtl: false`, `sweepIntervalMs: null`, `autoSaveDebounceMs: 1000`, `now: () => Date.now()`. | Status: not_done

### 5b: Core CRUD Operations

- [x] **Implement `set<T>(key, value, options?)`** — Create or update an entry in the internal Map. On create: set `createdAt`, `updatedAt`, `accessedAt` to `now()`. Inherit `defaultTtl` and `defaultSlidingTtl` if not overridden. On update: update `updatedAt`, `value`, and any provided options; preserve `createdAt`. Validate key is a non-empty string. | Status: done
- [x] **Implement `get<T>(key)`** — Retrieve value by key. Check expiration first; if expired, delete entry, fire `expire` event, return `undefined`. If live, update `accessedAt` to `now()` and return the value. Return `undefined` if key does not exist. | Status: done
- [x] **Implement `has(key)`** — Check if key exists and is not expired. If expired, remove entry and fire `expire` event, return `false`. | Status: done
- [x] **Implement `delete(key)`** — Remove entry by key. If entry existed, fire `delete` event and return `true`. Otherwise return `false`. | Status: done
- [x] **Implement `clear()`** — Remove all entries. Fire `clear` event with the count of removed entries. | Status: done
- [x] **Implement `keys()`** — Return array of all non-expired keys. Trigger lazy expiration for any expired entries encountered during iteration. | Status: done
- [x] **Implement `entries()`** — Return array of `[key, ScratchpadEntry]` tuples for all non-expired entries. Trigger lazy expiration for expired entries encountered. | Status: done
- [ ] **Implement `getEntry(key)`** — Return the full `ScratchpadEntry` with metadata by key, or `undefined` if not found or expired. Does NOT update `accessedAt` or reset sliding TTL. | Status: not_done
- [ ] **Implement `size` property** — Return count of non-expired entries. Trigger lazy expiration check during count. | Status: not_done

### 5c: Explicit `null` TTL override

- [x] **Handle `EntryOptions.ttl = null` to disable default TTL** — When caller passes `{ ttl: null }` explicitly, the entry should have no TTL even if the scratchpad has a `defaultTtl`. Distinguish between "ttl not provided" (inherit default) and "ttl explicitly set to null" (no expiration). | Status: done

### 5d: Query Operations

- [ ] **Implement `find(predicate)`** — Iterate all non-expired entries, return entries for which `predicate(entry)` returns `true`. Trigger lazy expiration. | Status: not_done
- [x] **Implement `findByTag(tag)`** — Iterate all non-expired entries, return entries whose `tags` array includes the given tag string (exact match). Trigger lazy expiration. | Status: done

### 5e: Stats

- [x] **Implement `stats()`** — Return a `ScratchpadStats` object: compute `size` (non-expired), `rawSize` (total including expired-not-yet-evicted), `namespaceCount`, `namespaces` (distinct namespace prefixes), `entriesWithTtl`, `expiredPending`, `tagCounts` (count per tag), `oldestEntryAt`, `newestEntryAt`. | Status: done

---

## Phase 6: Event System

- [x] **Implement internal event emitter** — Create a lightweight event emitter (no external dependencies) supporting the four event types: `set`, `delete`, `expire`, `clear`. Store handlers in a `Map<string, Set<Function>>`. | Status: done
- [x] **Implement `on(event, handler)` method** — Register a handler for an event. Return an unsubscribe function that removes the handler when called. | Status: done
- [x] **Fire `set` event** — When `set()` is called, fire with `{ key, entry, isUpdate }`. `isUpdate` is `true` when the key already existed. | Status: done
- [x] **Fire `delete` event** — When `delete()` is called and the entry existed, fire with `{ key, entry }`. | Status: done
- [x] **Fire `expire` event** — When an entry is lazily or actively evicted due to TTL, fire with `{ key, entry }`. | Status: done
- [x] **Fire `clear` event** — When `clear()` is called, fire with `{ count }` (number of entries removed). | Status: done
- [x] **Unsubscription function** — Verify that calling the returned unsubscribe function prevents the handler from being called on subsequent events. | Status: done

---

## Phase 7: Namespace Implementation (`src/namespace.ts`)

- [x] **Implement `namespace(name)` method** — Return a `Scratchpad`-compatible wrapper that prefixes all keys with `name:`. The wrapper delegates all operations to the parent scratchpad's internal Map with key transformation. | Status: done
- [ ] **Validate namespace name** — Must be a non-empty string without `:` characters. Throw an error if invalid. | Status: not_done
- [x] **Implement key prefixing on `set`, `get`, `has`, `delete`, `getEntry`** — All single-key operations prepend the namespace prefix. | Status: done
- [x] **Implement `keys()` on namespace** — Return only keys starting with the namespace prefix, with the prefix stripped from each key. | Status: done
- [x] **Implement `entries()` on namespace** — Return only entries with the namespace prefix, stripping the prefix from keys. | Status: done
- [x] **Implement `clear()` on namespace** — Delete only entries with the namespace prefix. Fire `clear` event with count of removed entries. | Status: done
- [ ] **Implement `size` on namespace** — Count only non-expired entries within the namespace prefix. | Status: not_done
- [x] **Implement `findByTag()` and `find()` on namespace** — Search only within entries belonging to the namespace. | Status: done
- [x] **Implement nested namespaces** — `namespace(name)` on a namespace wrapper concatenates prefixes: `outer:inner:`. Support arbitrary nesting depth. | Status: done
- [x] **Implement `toContext()` on namespace** — Render only entries within the namespace. | Status: done
- [x] **Implement `snapshot()` and `restore()` on namespace** — Snapshot/restore scoped to the namespace entries (or delegate to the parent with appropriate filtering). | Status: done
- [x] **Namespace event key format** — Events fired from namespace operations include the full key (with prefix) so the root scratchpad's event listeners see the full key path. | Status: done
- [x] **Cross-namespace access** — Verify that the root scratchpad can access any entry by its full key including namespace prefix (e.g., `pad.get("agent1:result")`). | Status: done

---

## Phase 8: Snapshot and Diff Implementation (`src/snapshot.ts`)

- [x] **Implement `snapshot()` method** — Deep-copy all entries using `JSON.parse(JSON.stringify())`. Return a `ScratchpadSnapshot` with `entries`, `timestamp` (current `now()`), and `version: 1`. The snapshot must be immutable — mutations to the scratchpad after snapshot do not affect it. | Status: done
- [x] **Implement `restore(snapshot)` method** — Replace the scratchpad's entire state with the snapshot's entries. Fire `clear` event for the existing entries, then fire `set` events for each restored entry. | Status: done
- [x] **Validate snapshot version on restore** — Throw `ScratchpadVersionError` if the snapshot's `version` field is not `1`. | Status: done
- [x] **Implement `serialize()` method** — Equivalent to `snapshot()` but explicitly guarantees JSON-serializability. Return a `ScratchpadSnapshot` suitable for `JSON.stringify()`. | Status: done
- [x] **Implement `fromSnapshot(snapshot, options?)` static function** — Create a new scratchpad instance and restore the snapshot into it. Accept optional `ScratchpadOptions` for configuration. Validate snapshot version. | Status: done
- [ ] **Implement `diffSnapshots(before, after)` function** — Compare two snapshots. Return `SnapshotDiff` with `added` (keys in `after` but not `before`), `removed` (keys in `before` but not `after`), `updated` (keys in both but with different values), `unchanged` (keys in both with same values). Use `JSON.stringify()` for value comparison. | Status: not_done

---

## Phase 9: Context Rendering (`src/context.ts`)

### 9a: Format Implementations

- [x] **Implement Markdown format** — Render entries as a Markdown section with `## Working Memory` header (or custom header) and `- **key**: value` bullet points. Values should be JSON-stringified if not strings. | Status: done
- [x] **Implement XML format** — Render entries as `<working-memory><entry key="...">value</entry>...</working-memory>`. Values should be JSON-stringified if not strings. | Status: done
- [x] **Implement JSON format** — Render entries as a JSON object `{ "key1": value1, "key2": value2, ... }`. | Status: done
- [x] **Implement key-value (kv) format** — Render entries as `key: value` pairs, one per line. Values should be JSON-stringified if not strings. | Status: done

### 9b: Filtering

- [x] **Implement `filterTags` option** — When provided, only include entries that have at least one of the specified tags (OR logic). | Status: done
- [x] **Implement `filterNamespace` option** — When provided, only include entries within the specified namespace prefix. | Status: done
- [x] **Implement combined filtering** — When both `filterTags` and `filterNamespace` are provided, entries must satisfy both conditions (AND logic). | Status: done

### 9c: Token Budget

- [x] **Implement `maxTokens` truncation** — Render entries from newest to oldest (by `updatedAt`). Accumulate token count using the `tokenCounter` function. Stop rendering when the next entry would exceed the budget. | Status: done
- [ ] **Require `tokenCounter` when `maxTokens` is set** — If `maxTokens` is provided but `tokenCounter` is not, throw an error or use a sensible default. | Status: not_done

### 9d: Metadata Inclusion

- [ ] **Implement `includeMetadata` option** — When true, append metadata (tags, timestamps, TTL) to each entry in the rendered output. Format depends on the output format (e.g., italicized line for Markdown, attributes for XML). | Status: not_done

### 9e: Empty Scratchpad

- [x] **Handle empty scratchpad** — Return an empty/minimal string when there are no entries to render (empty Markdown section, empty XML tags, empty JSON object, empty string for kv). | Status: done

### 9f: Custom Header

- [x] **Implement `header` option** — Allow customizing the header text. Default is `'Working Memory'` for Markdown format, undefined for others. | Status: done

---

## Phase 10: Persistence (`src/persistence.ts`)

### 10a: File Persistence Adapter

- [ ] **Implement `filePersistence(filePath)` function** — Return a `PersistenceAdapter` that reads/writes a JSON file. `load()` reads the file with `fs.readFile()` and `JSON.parse()`. Returns `null` if the file does not exist. `save()` writes with atomic write pattern (write to a temp file, then rename). | Status: not_done
- [ ] **Handle file-not-found on load** — Return `null` (not throw) when the file does not exist yet. | Status: not_done
- [ ] **Handle corrupt file on load** — Wrap `JSON.parse()` in try/catch and throw `ScratchpadPersistenceError` with a descriptive message if parsing fails. | Status: not_done
- [ ] **Atomic write on save** — Write to a temporary file (e.g., `filePath + '.tmp'`) first, then rename to the target path to avoid partial writes. | Status: not_done

### 10b: Auto-Save

- [ ] **Implement debounced auto-save** — When a persistence adapter is configured, schedule a save after `set()`, `delete()`, and `clear()` calls. Use `setTimeout()` with `autoSaveDebounceMs` delay. Reset the timer if another change occurs during the debounce window. | Status: not_done
- [ ] **Handle auto-save errors gracefully** — Catch errors from `adapter.save()` in the auto-save path and log via `console.error`. Do not throw or disrupt in-memory operation. | Status: not_done

### 10c: Manual Save/Load

- [x] **Implement `pad.save()` method** — Serialize current state and call `adapter.save()`. No-op if no persistence adapter is configured. Throw `ScratchpadPersistenceError` if save fails. | Status: done
- [x] **Implement `pad.load()` method** — Call `adapter.load()`. If a snapshot is returned, restore it (replacing current state). No-op if no adapter is configured. Throw `ScratchpadPersistenceError` if load fails. Throw `ScratchpadVersionError` if loaded snapshot has unsupported version. | Status: done

---

## Phase 11: Active Expiration Sweep (`src/sweep.ts`)

- [ ] **Implement sweep logic** — When `sweepIntervalMs` is configured, use `setInterval()` to periodically scan entries for expiration. Sample entries in batches (default batch size: 20). If more than 25% of sampled entries are expired, immediately run another batch until the rate drops below the threshold. | Status: not_done
- [x] **Fire `expire` events during sweep** — Each expired entry removed by the sweep should trigger an `expire` event. | Status: done
- [x] **Clear sweep interval on `destroy()`** — Stop the interval timer when the scratchpad is destroyed. | Status: done

---

## Phase 12: Lifecycle (`destroy()`)

- [x] **Implement `destroy()` method** — Clear the sweep interval (if active). Flush any pending debounced auto-save (call `adapter.save()` immediately). Remove all event handlers. Return a `Promise<void>`. | Status: done
- [ ] **Prevent use after destroy** — Optionally mark the scratchpad as destroyed and throw or no-op on subsequent method calls. (The spec says "should not be used after destroy()" — decide whether to enforce this with a guard or leave it as a contract.) | Status: not_done

---

## Phase 13: Public API Exports (`src/index.ts`)

- [x] **Export `createScratchpad`** — The primary factory function. | Status: done
- [x] **Export `fromSnapshot`** — Static function to create a scratchpad from a serialized snapshot. | Status: done
- [ ] **Export `filePersistence`** — Built-in file system persistence adapter factory. | Status: not_done
- [ ] **Export `diffSnapshots`** — Snapshot comparison utility. | Status: not_done
- [ ] **Export all type interfaces** — Export `ScratchpadEntry`, `EntryOptions`, `ScratchpadOptions`, `ScratchpadSnapshot`, `ScratchpadStats`, `ToContextOptions`, `PersistenceAdapter`, `ScratchpadEvents`, `ScratchpadEventName`, `ScratchpadEventHandler`, `SnapshotDiff`, `Scratchpad`. | Status: not_done
- [ ] **Export error classes** — Export `ScratchpadError`, `ScratchpadConfigError`, `ScratchpadPersistenceError`, `ScratchpadVersionError`. | Status: not_done

---

## Phase 14: Unit Tests — Core Operations

- [x] **Test `set()` and `get()` with string values** — Verify round-trip of string values. | Status: done
- [ ] **Test `set()` and `get()` with number values** — Verify round-trip of numeric values. | Status: not_done
- [ ] **Test `set()` and `get()` with object values** — Verify round-trip of plain objects. | Status: not_done
- [ ] **Test `set()` and `get()` with array values** — Verify round-trip of arrays. | Status: not_done
- [ ] **Test `set()` and `get()` with null value** — Verify null is stored and returned correctly. | Status: not_done
- [ ] **Test `set()` and `get()` with nested objects** — Verify deeply nested structures. | Status: not_done
- [x] **Test `get()` returns `undefined` for missing keys** — Verify non-existent key returns undefined. | Status: done
- [x] **Test `has()` returns true for existing keys** — Verify `has()` correctness. | Status: done
- [x] **Test `has()` returns false for missing keys** — Verify `has()` with non-existent key. | Status: done
- [x] **Test `delete()` removes entries** — Set a key, delete it, verify `get()` returns undefined. | Status: done
- [x] **Test `delete()` returns true when entry existed** — Verify return value. | Status: done
- [x] **Test `delete()` returns false when entry did not exist** — Verify return value for non-existent key. | Status: done
- [x] **Test `clear()` removes all entries** — Set multiple entries, call `clear()`, verify all are gone. | Status: done
- [ ] **Test `keys()` returns all live keys** — Set entries, verify keys list. | Status: not_done
- [ ] **Test `entries()` returns all live entries** — Set entries, verify entries list with correct metadata. | Status: not_done
- [ ] **Test `size` property** — Verify it reflects the number of live entries. | Status: not_done
- [ ] **Test `set()` rejects empty string key** — Verify that `set("", value)` throws or is handled. | Status: not_done
- [x] **Test update behavior** — Call `set()` twice with the same key. Verify `value` is updated, `updatedAt` changes, `createdAt` is preserved. | Status: done
- [ ] **Test `getEntry()` returns full metadata** — Verify all metadata fields (`createdAt`, `updatedAt`, `accessedAt`, `ttl`, `slidingTtl`, `tags`) are present and correct. | Status: not_done
- [ ] **Test `getEntry()` does NOT update `accessedAt`** — Verify that `getEntry()` is a read-only metadata access that does not reset sliding TTL. | Status: not_done
- [ ] **Test `get()` updates `accessedAt`** — Verify that `get()` updates the `accessedAt` timestamp. | Status: not_done
- [ ] **Test values stored by reference** — Verify that mutating an object after `set()` is reflected in `get()` (no deep cloning). | Status: not_done

---

## Phase 15: Unit Tests — TTL and Expiration

- [x] **Test fixed TTL: entry accessible before expiry** — Use mock `now()`, set entry with TTL, advance time less than TTL, verify `get()` returns value. | Status: done
- [x] **Test fixed TTL: entry expired after TTL elapses** — Advance time past TTL, verify `get()` returns `undefined`. | Status: done
- [x] **Test fixed TTL: accessing does not extend lifetime** — Set entry with fixed TTL, call `get()` partway through, advance past original TTL, verify expiration. | Status: done
- [x] **Test sliding TTL: entry stays alive with access** — Set entry with sliding TTL, call `get()` before TTL elapses, verify TTL resets. Advance past original TTL but not past last access + TTL, verify still alive. | Status: done
- [x] **Test sliding TTL: entry expires when not accessed** — Set entry with sliding TTL, do not access it, advance past TTL, verify expiration. | Status: done
- [x] **Test default TTL inheritance** — Create scratchpad with `defaultTtl`, set entries without specifying TTL, verify they expire after the default duration. | Status: done
- [ ] **Test per-entry TTL overrides default** — Create scratchpad with `defaultTtl`, set entry with its own `ttl`, verify the entry uses its own TTL. | Status: not_done
- [x] **Test explicit `null` TTL disables default** — Create scratchpad with `defaultTtl`, set entry with `{ ttl: null }`, verify the entry never expires. | Status: done
- [ ] **Test `has()` returns false for expired entries** — Verify lazy expiration via `has()`. | Status: not_done
- [ ] **Test `keys()` excludes expired entries** — Verify lazy expiration during `keys()` iteration. | Status: not_done
- [ ] **Test `entries()` excludes expired entries** — Verify lazy expiration during `entries()` iteration. | Status: not_done
- [ ] **Test `find()` excludes expired entries** — Verify lazy expiration during `find()`. | Status: not_done
- [x] **Test `findByTag()` excludes expired entries** — Verify lazy expiration during `findByTag()`. | Status: done
- [x] **Test `expire` event fires on lazy expiration** — Register an `expire` handler, access an expired entry, verify the handler is called with the correct payload. | Status: done
- [ ] **Test `size` excludes expired entries** — Verify `size` counts only non-expired entries. | Status: not_done
- [ ] **Test very short TTL (1ms)** — Verify entries with 1ms TTL expire almost immediately. | Status: not_done
- [ ] **Test `defaultSlidingTtl` option** — Create scratchpad with `defaultSlidingTtl: true`, verify entries inherit sliding TTL mode by default. | Status: not_done

---

## Phase 16: Unit Tests — Tags and Querying

- [ ] **Test setting entries with tags** — Set entries with `{ tags: ["tool-result", "search"] }`, verify tags are stored on the entry. | Status: not_done
- [x] **Test `findByTag()` returns matching entries** — Set entries with various tags, call `findByTag("tool-result")`, verify correct entries are returned. | Status: done
- [x] **Test `findByTag()` with no matches** — Call `findByTag()` with a tag that no entry has, verify empty array is returned. | Status: done
- [ ] **Test entry with multiple tags** — Set an entry with multiple tags, verify `findByTag()` matches on any of them. | Status: not_done
- [ ] **Test entry with no tags** — Set an entry without tags, verify `findByTag()` does not return it. | Status: not_done
- [ ] **Test tag matching is exact** — Verify that `findByTag("tool")` does not match an entry tagged `"tool-result"` (not substring matching). | Status: not_done
- [ ] **Test `find()` with custom predicate** — Use `find()` with a predicate that checks value properties, verify correct entries are returned. | Status: not_done
- [ ] **Test tags are updated on re-set** — Call `set()` with new tags on an existing key, verify tags are replaced. | Status: not_done

---

## Phase 17: Unit Tests — Events

- [x] **Test `set` event fires on create** — Register handler, call `set()`, verify handler called with `isUpdate: false`. | Status: done
- [x] **Test `set` event fires on update** — Set a key, register handler, call `set()` again on same key, verify handler called with `isUpdate: true`. | Status: done
- [x] **Test `delete` event fires** — Register handler, set a key, delete it, verify handler called with the entry. | Status: done
- [ ] **Test `delete` event does NOT fire for non-existent key** — Register handler, delete a key that doesn't exist, verify handler is NOT called. | Status: not_done
- [x] **Test `expire` event fires** — Register handler, set entry with TTL, advance time past TTL, access the entry, verify handler is called. | Status: done
- [x] **Test `clear` event fires** — Register handler, set entries, call `clear()`, verify handler called with correct count. | Status: done
- [x] **Test unsubscribe function** — Register handler, get unsubscribe function, call it, fire event, verify handler is NOT called. | Status: done
- [ ] **Test multiple handlers on same event** — Register two handlers for `set`, call `set()`, verify both are called. | Status: not_done

---

## Phase 18: Unit Tests — Namespaces

- [x] **Test namespace creation and key prefixing** — Create namespace, set a key, verify it is stored as `namespace:key` in the root. | Status: done
- [x] **Test namespace `get()` reads prefixed key** — Set via namespace, get via namespace, verify correct value. | Status: done
- [ ] **Test namespace isolation** — Set same key in two different namespaces, verify they do not conflict. | Status: not_done
- [x] **Test namespace `keys()` returns only namespace keys** — Set entries in root and namespace, verify namespace `keys()` only returns namespace entries. | Status: done
- [x] **Test namespace `keys()` strips prefix** — Verify keys returned by `ns.keys()` do not include the namespace prefix. | Status: done
- [ ] **Test namespace `entries()` returns only namespace entries** — Verify scoping and prefix stripping. | Status: not_done
- [ ] **Test namespace `clear()` only removes namespace entries** — Set entries in root and namespace, clear namespace, verify root entries survive. | Status: not_done
- [ ] **Test namespace `size`** — Verify it counts only namespace entries. | Status: not_done
- [x] **Test namespace `has()` and `delete()`** — Verify they operate only on prefixed keys. | Status: done
- [ ] **Test namespace `findByTag()`** — Verify it searches only within the namespace. | Status: not_done
- [x] **Test nested namespaces** — Create `pad.namespace("a").namespace("b")`, set a key, verify stored as `a:b:key` in root. | Status: done
- [x] **Test cross-namespace access from root** — Set via `pad.namespace("agent1")`, read via `pad.get("agent1:key")`, verify it works. | Status: done
- [ ] **Test namespace name validation** — Verify that namespace names with `:` are rejected. Verify empty string is rejected. | Status: not_done
- [ ] **Test namespace events include full key** — Set via namespace, listen on root for `set` event, verify the event key includes the namespace prefix. | Status: not_done

---

## Phase 19: Integration Tests — Snapshots

- [x] **Test snapshot captures all entries** — Set entries, take snapshot, verify snapshot contains all entries with correct values and metadata. | Status: done
- [ ] **Test snapshot is a deep copy** — Take snapshot, modify scratchpad, verify snapshot is unchanged. | Status: not_done
- [x] **Test restore replaces state** — Set entries, snapshot, modify, restore, verify state matches snapshot. | Status: done
- [ ] **Test restore fires events** — Verify `clear` event followed by `set` events for each restored entry. | Status: not_done
- [x] **Test restore with version validation** — Attempt to restore a snapshot with `version: 2`, verify `ScratchpadVersionError` is thrown. | Status: done
- [ ] **Test empty snapshot** — Take snapshot of empty scratchpad, restore it, verify scratchpad is empty. | Status: not_done
- [ ] **Test snapshot with namespaced entries** — Set entries in namespaces, take snapshot, verify entries are captured with full prefixed keys. | Status: not_done
- [x] **Test `fromSnapshot()` creates new scratchpad from snapshot** — Take snapshot, create new scratchpad with `fromSnapshot()`, verify entries match. | Status: done
- [ ] **Test `diffSnapshots()` detects added entries** — Take snapshot, add entries, take second snapshot, diff, verify `added` list. | Status: not_done
- [ ] **Test `diffSnapshots()` detects removed entries** — Take snapshot, delete entries, take second snapshot, diff, verify `removed` list. | Status: not_done
- [ ] **Test `diffSnapshots()` detects updated entries** — Take snapshot, update values, take second snapshot, diff, verify `updated` list. | Status: not_done
- [ ] **Test `diffSnapshots()` detects unchanged entries** — Take snapshot, make some changes, take second snapshot, diff, verify `unchanged` list. | Status: not_done

---

## Phase 20: Integration Tests — Persistence

- [ ] **Test mock adapter save/load round-trip** — Use mock adapter, set entries, save, clear, load, verify entries restored. | Status: not_done
- [ ] **Test auto-save triggers after `set()`** — Configure persistence with short debounce, set an entry, wait for debounce, verify `adapter.save()` was called. | Status: not_done
- [ ] **Test auto-save debouncing** — Set multiple entries rapidly, verify `adapter.save()` is called only once after the debounce window. | Status: not_done
- [ ] **Test auto-save triggers after `delete()`** — Delete an entry, verify auto-save is triggered. | Status: not_done
- [ ] **Test auto-save triggers after `clear()`** — Clear the scratchpad, verify auto-save is triggered. | Status: not_done
- [x] **Test `pad.save()` calls adapter** — Call `save()` explicitly, verify `adapter.save()` is called with correct snapshot. | Status: done
- [x] **Test `pad.load()` replaces state** — Load into a non-empty scratchpad, verify state is replaced with loaded data. | Status: done
- [ ] **Test `pad.save()` throws `ScratchpadPersistenceError` on failure** — Mock adapter save to reject, verify error is thrown. | Status: not_done
- [ ] **Test `pad.load()` throws `ScratchpadPersistenceError` on failure** — Mock adapter load to reject, verify error is thrown. | Status: not_done
- [ ] **Test `pad.load()` throws `ScratchpadVersionError` for unsupported version** — Mock adapter returns snapshot with version 99, verify error. | Status: not_done
- [ ] **Test file persistence adapter: save and load** — Use `filePersistence()` with a temp file path, save entries, load them back, verify correctness. | Status: not_done
- [ ] **Test file persistence adapter: file not found on load** — Attempt to load from non-existent file, verify `null` is returned. | Status: not_done
- [ ] **Test file persistence adapter: corrupt file on load** — Write invalid JSON to the file, attempt load, verify `ScratchpadPersistenceError` is thrown. | Status: not_done
- [ ] **Test file persistence adapter: atomic write** — Verify save writes to a temp file then renames (check that partial writes don't corrupt the file). | Status: not_done
- [ ] **Test auto-save error handling** — Configure adapter.save to reject, trigger auto-save, verify error is logged via console.error and scratchpad continues operating. | Status: not_done
- [x] **Test save/load are no-ops without adapter** — Create scratchpad without persistence, call `save()` and `load()`, verify no errors. | Status: done

---

## Phase 21: Integration Tests — Context Rendering

- [x] **Test Markdown format output** — Create entries, render with `format: 'markdown'`, verify output matches expected Markdown structure with header and bullet points. | Status: done
- [x] **Test XML format output** — Create entries, render with `format: 'xml'`, verify output matches expected XML structure. | Status: done
- [x] **Test JSON format output** — Create entries, render with `format: 'json'`, verify output is valid JSON with correct key-value pairs. | Status: done
- [x] **Test key-value format output** — Create entries, render with `format: 'kv'`, verify output has `key: value` lines. | Status: done
- [ ] **Test default format is Markdown** — Call `toContext()` without specifying format, verify Markdown output. | Status: not_done
- [x] **Test `filterTags` filtering** — Create entries with different tags, render with `filterTags`, verify only matching entries appear. | Status: done
- [x] **Test `filterNamespace` filtering** — Create entries in different namespaces, render with `filterNamespace`, verify only matching entries appear. | Status: done
- [ ] **Test combined `filterTags` and `filterNamespace`** — Verify AND logic: entries must match both the tag and namespace filters. | Status: not_done
- [x] **Test `maxTokens` truncation** — Create many entries, render with a small `maxTokens` and a `tokenCounter`, verify output is truncated and newest entries are prioritized. | Status: done
- [ ] **Test `includeMetadata` option** — Render with `includeMetadata: true`, verify timestamps and tags appear in output. | Status: not_done
- [ ] **Test empty scratchpad rendering** — Call `toContext()` on empty scratchpad, verify minimal/empty output for each format. | Status: not_done
- [x] **Test custom header** — Render with `header: 'Agent State'`, verify the custom header appears instead of default. | Status: done
- [ ] **Test value serialization in output** — Verify objects and arrays are JSON-stringified in the rendered output. Verify strings are rendered correctly. | Status: not_done

---

## Phase 22: Integration Tests — Active Expiration Sweep

- [x] **Test sweep removes expired entries** — Configure `sweepIntervalMs`, set entries with TTL, advance mock time past TTL, trigger sweep, verify entries are removed. | Status: done
- [x] **Test sweep fires `expire` events** — Register `expire` handler, trigger sweep that removes expired entries, verify events fire. | Status: done
- [ ] **Test sweep batch sampling** — Create many entries with mixed TTL states, trigger sweep, verify that it samples in batches and re-runs if > 25% are expired. | Status: not_done
- [x] **Test sweep interval is cleared on `destroy()`** — Configure sweep, destroy the scratchpad, verify `setInterval` is cleared (no more sweeps occur). | Status: done
- [ ] **Test sweep does not affect non-expired entries** — Create mix of expired and non-expired entries, sweep, verify non-expired entries survive. | Status: not_done

---

## Phase 23: Integration Tests — Full Lifecycle

- [ ] **Test `scratchpad.test.ts` full lifecycle** — Create scratchpad, set entries with tags and TTLs, query entries, create namespaces, take snapshots, modify state, restore, render to context, serialize, destroy. Verify correct behavior at each step. | Status: not_done
- [x] **Test `stats()` returns correct statistics** — Create entries with various tags, TTLs, namespaces. Call `stats()` and verify all fields: `size`, `rawSize`, `namespaceCount`, `namespaces`, `entriesWithTtl`, `expiredPending`, `tagCounts`, `oldestEntryAt`, `newestEntryAt`. | Status: done

---

## Phase 24: Edge Case Tests

- [ ] **Test operations on empty scratchpad** — Call `get()`, `delete()`, `keys()`, `entries()`, `findByTag()`, `size`, `stats()` on a fresh empty scratchpad. Verify no errors and correct return values. | Status: not_done
- [ ] **Test keys with special characters** — Use keys with spaces, unicode, dots, slashes (but not `:`). Verify correct behavior. | Status: not_done
- [ ] **Test very large values** — Store a large object (e.g., 1MB JSON), verify get/set works correctly. | Status: not_done
- [ ] **Test scratchpad with many entries (performance)** — Set 10,000 entries, call `keys()`, `entries()`, `snapshot()`, `toContext()`. Verify operations complete in reasonable time (e.g., < 1 second). | Status: not_done
- [ ] **Test rapid set/get sequences** — Rapidly set and get the same key many times, verify final state is correct. | Status: not_done
- [ ] **Test `destroy()` followed by attempted use** — Destroy the scratchpad, then attempt `set()`, `get()`, etc. Verify appropriate behavior (error or no-op). | Status: not_done
- [ ] **Test snapshot of scratchpad with expired-but-not-evicted entries** — Set entries with TTL, advance time past TTL (but do not access them to trigger lazy eviction), take a snapshot. Verify snapshot behavior (should it include or exclude them?). | Status: not_done
- [ ] **Test `clear()` on already-empty scratchpad** — Verify `clear` event fires with `count: 0` or does not fire. | Status: not_done
- [ ] **Test configuration edge case: all defaults** — Call `createScratchpad()` with no options, verify all defaults are applied correctly. | Status: not_done
- [ ] **Test configuration edge case: all options specified** — Provide every option, verify they are all respected. | Status: not_done

---

## Phase 25: Configuration Validation Tests

- [ ] **Test `defaultTtl` of 0 throws `ScratchpadConfigError`** — Verify zero is rejected. | Status: not_done
- [ ] **Test `defaultTtl` of negative value throws `ScratchpadConfigError`** — Verify negative is rejected. | Status: not_done
- [ ] **Test `sweepIntervalMs` under 100 throws `ScratchpadConfigError`** — Verify values like 50 or 99 are rejected. | Status: not_done
- [ ] **Test `sweepIntervalMs` of 0 disables sweeps** — Verify 0 is treated as "disabled" (same as null). | Status: not_done
- [ ] **Test `autoSaveDebounceMs` negative throws `ScratchpadConfigError`** — Verify negative values are rejected. | Status: not_done
- [ ] **Test `now` as non-function throws `ScratchpadConfigError`** — Pass a number or string, verify error. | Status: not_done
- [ ] **Test `persistence` with missing `load` or `save` throws `ScratchpadConfigError`** — Pass partial adapter objects, verify error. | Status: not_done

---

## Phase 26: TypeScript Type Safety

- [ ] **Verify generic type inference on `set<T>()` and `get<T>()`** — Write tests (compile-time or runtime) that verify type narrowing works correctly. E.g., `pad.get<string>("key")` returns `string | undefined`. | Status: not_done
- [ ] **Verify all exported types compile correctly** — Import all exported types in a test file and verify TypeScript compilation succeeds. | Status: not_done
- [ ] **Verify Scratchpad interface completeness** — Ensure the implementation satisfies the `Scratchpad` interface (all methods and properties are present). | Status: not_done

---

## Phase 27: Documentation

- [ ] **Write README.md** — Include: package description, installation command, quick start example, full API reference, framework integration examples (LangChain, Vercel AI SDK, custom loops), configuration options table, persistence setup, context rendering examples. | Status: not_done
- [ ] **Add JSDoc comments to all public API functions and types** — Ensure `createScratchpad`, `fromSnapshot`, `filePersistence`, `diffSnapshots`, and all `Scratchpad` methods have JSDoc comments matching the spec. | Status: not_done
- [ ] **Add inline code comments for non-obvious logic** — Document the lazy expiration check, sweep batch algorithm, namespace key transformation, and auto-save debounce logic. | Status: not_done

---

## Phase 28: Build, Lint, and CI

- [x] **Verify `npm run build` succeeds** — Ensure `tsc` compiles all source files to `dist/` with declarations and source maps. | Status: done
- [ ] **Verify `npm run lint` passes** — Ensure all source files pass ESLint checks with zero warnings/errors. | Status: not_done
- [ ] **Verify `npm run test` passes** — Ensure all tests pass via `vitest run`. | Status: not_done
- [x] **Verify `dist/` output** — Confirm `dist/index.js`, `dist/index.d.ts` exist and export the expected public API. | Status: done
- [x] **Verify `package.json` metadata** — Confirm `main`, `types`, `files`, `engines`, `publishConfig`, and all scripts are correct. | Status: done

---

## Phase 29: Version Bump and Publishing Prep

- [ ] **Bump version in `package.json`** — Set version to `1.0.0` (or appropriate version based on completeness). Follow semver. | Status: not_done
- [ ] **Final pre-publish check** — Run `npm run build && npm run lint && npm run test` and verify all pass. | Status: not_done
- [x] **Verify `prepublishOnly` script** — Confirm that `npm publish` triggers `npm run build` via the existing `prepublishOnly` script. | Status: done
