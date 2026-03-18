# agent-scratchpad -- Specification

## 1. Overview

`agent-scratchpad` is a lightweight, in-process key-value scratchpad for agent reasoning. It provides typed, namespaced entries with automatic TTL-based expiration, event-driven change observation, point-in-time snapshots, and optional persistence -- all in a framework-agnostic package with zero runtime dependencies. Agents use it as short-term working memory during multi-step execution: storing intermediate results, tool outputs, extracted entities, partial computations, decision rationale, and task decomposition state. The scratchpad is created at the start of an agent run, consulted and updated at each step, and discarded or persisted when the run completes.

The gap this package fills is specific and well-defined. AI agents executing multi-step reasoning loops -- ReAct (Thought-Action-Observation), Plan-and-Execute, Chain-of-Thought with tool use -- need a place to write down intermediate state between steps. In cognitive science, this is called working memory: the mental scratchpad where you hold the phone number you just looked up while you dial it, or the intermediate sum while you compute a total. In agent systems, working memory holds things like "the user's order number is #12345" (extracted from a tool call result), "I already tried approach A and it failed" (decision history), and "the remaining subtasks are X, Y, Z" (task decomposition state). This state is distinct from conversation history (which `sliding-context` manages) and from long-term memory (which vector databases and memory stores handle). It is ephemeral, structured, and needed only during the current execution.

The existing ecosystem handles this poorly. LangChain's `agent_scratchpad` is the closest prior art -- it is a formatted string of (action, observation) pairs that is injected into the prompt template on each iteration of the agent loop. It is tightly coupled to LangChain's `AgentExecutor`, `AgentAction` type, and prompt formatting conventions. It stores only action/observation pairs in a flat list, offers no TTL, no typed values, no namespacing, no querying by tag, no snapshots, and no persistence. Extracting a specific intermediate result requires parsing the formatted string. Developers who want structured working memory without adopting LangChain's agent abstraction have no standalone option.

AutoGPT takes a different approach: it uses a ~4000-word short-term memory buffer and saves important information to files. BabyAGI stores task results as vector embeddings in Pinecone for retrieval. CrewAI passes structured task outputs between agents through a deterministic pipeline. OpenSearch provides `WriteToScratchPadTool` and `ReadFromScratchPadTool` for agents to store notes during execution, but these are OpenSearch-specific tools, not a reusable library. The Vercel AI SDK provides `prepareStep` hooks for context management but leaves state management to the developer. None of these offer a standalone, framework-agnostic, typed key-value scratchpad with TTL, namespaces, and snapshots that works with any agent framework or custom agent loop.

`agent-scratchpad` provides exactly this. It is a `Map`-like data structure with agent-specific features: entries carry metadata (timestamps, TTL, tags), namespaces scope entries per-agent or per-task, TTL automatically expires stale entries, snapshots enable backtracking and debugging, and a `toContext()` method renders scratchpad contents into a string suitable for injection into an LLM prompt. The package composes with other packages in this monorepo: `context-budget` can allocate a token budget for the scratchpad section, `sliding-context` manages the conversation history alongside it, and `memory-dedup` deduplicates entries that accumulate across steps.

---

## 2. Goals and Non-Goals

### Goals

- Provide a `createScratchpad(options?)` function that returns a `Scratchpad` instance -- a typed key-value store designed for agent working memory during multi-step execution.
- Support TypeScript generics for type-safe `get<T>()` and `set<T>()` operations, so callers can store and retrieve structured data without casting.
- Provide automatic TTL-based expiration with configurable default TTL, per-entry TTL, and sliding TTL (refresh on access) to prevent stale entries from consuming memory and polluting agent context.
- Support hierarchical namespaces (`pad.namespace("agent1").namespace("task2")`) for scoping entries per-agent, per-task, or per-step, with namespace-level TTL defaults and namespace-level clear.
- Support tagging entries with string labels (e.g., `"tool-result"`, `"intermediate"`, `"decision"`) and querying entries by tag via `findByTag()`.
- Provide point-in-time snapshots (`snapshot()`) and state restoration (`restore(snapshot)`) for backtracking during agent reasoning, parallel exploration of alternatives, and debugging.
- Provide a `toContext()` method that renders scratchpad contents as a formatted string (Markdown, XML, JSON, or key-value pairs) suitable for injection into an LLM prompt, with filtering by tags or namespaces and optional token budget awareness.
- Provide event emission (`on("set", handler)`, `on("delete", handler)`, `on("expire", handler)`, `on("clear", handler)`) for observability, logging, and reactive integration.
- Provide `serialize()` and `deserialize()` for optional persistence, with a pluggable adapter interface (`{ load(): Promise<State>, save(state: State): Promise<void> }`) for custom storage backends.
- Keep runtime dependencies at zero. All scratchpad logic uses built-in JavaScript APIs.
- Be framework-agnostic. Work with LangChain, LangGraph, Vercel AI SDK, AutoGen, CrewAI, custom agent loops, or any other framework.

### Non-Goals

- **Not a long-term memory store.** This package provides ephemeral working memory for a single agent execution or session. It does not provide semantic search, vector embeddings, or persistent knowledge bases that span across sessions. Use a vector database, `embed-cache`, or `@knowall-ai/mcp-neo4j-agent-memory` for long-term agent memory.
- **Not a conversation history manager.** This package stores structured key-value entries, not chat messages. It does not manage message ordering, summarization, or sliding window eviction. Use `sliding-context` for conversation history management.
- **Not a token counter or context allocator.** This package does not count tokens or allocate context budgets. The `toContext()` method accepts an optional `maxTokens` parameter and uses a caller-provided token counter to truncate output, but budget allocation logic belongs in `context-budget`.
- **Not a cache.** While `agent-scratchpad` shares superficial similarities with in-memory caches like `lru-cache`, `node-cache`, and `keyv`, it is designed for agent working memory, not HTTP response caching or database query caching. It does not implement LRU eviction, cache-aside patterns, or multi-tier caching. It provides agent-specific features (namespaces scoped to agents/tasks, tags for categorization, snapshots for backtracking, context rendering for LLM prompts) that caches do not.
- **Not a database.** This package stores data in process memory. It does not provide ACID transactions, replication, queries beyond tag/key lookup, or horizontal scaling. Optional persistence is a convenience for saving state between agent runs, not a database feature.
- **Not an agent framework.** This package does not orchestrate agent loops, manage tool execution, or make LLM calls. It provides working memory that agents use during execution, but the execution logic belongs to the agent framework.
- **Not a message queue or pub/sub system.** The event emission feature (`on("set", handler)`) is for local observability within a single process, not for cross-process communication. Use Redis Pub/Sub, NATS, or similar for distributed event systems.

---

## 3. Target Users and Use Cases

### Agent Framework Authors

Teams building custom agent frameworks who need a working memory primitive. The framework creates a scratchpad at the start of each agent run, passes it to the agent loop, and the agent stores intermediate state (tool results, extracted entities, plan updates) between steps. The scratchpad is discarded when the run completes, or serialized for debugging. A typical integration: the framework calls `createScratchpad({ defaultTtl: 300_000 })` before entering the ReAct loop and passes the scratchpad instance to each `think()` and `act()` step.

### LangChain/LangGraph Users

Developers using LangChain or LangGraph who find the built-in `agent_scratchpad` (a formatted string of action/observation pairs) insufficient for complex multi-step reasoning. They need structured access to intermediate results: "what was the API response three steps ago?", "which entities have I extracted so far?", "what decisions have I made and why?". `agent-scratchpad` provides typed, queryable access to these entries without replacing LangChain's agent executor -- it supplements it as additional working memory.

### Multi-Step Data Extraction Pipelines

Developers building pipelines where an agent processes a document in multiple passes: first extracting entities, then resolving references, then validating relationships, then generating a structured output. Each pass produces intermediate results that subsequent passes consume. The scratchpad stores extracted entities (tagged `"entity"`), resolved references (tagged `"reference"`), and validation results (tagged `"validation"`). The pipeline queries the scratchpad by tag at each step to retrieve the inputs it needs.

### Tool Result Caching During Agent Execution

Agents that call expensive tools (API lookups, database queries, web searches) and may need the results again later in the same execution. Instead of re-calling the tool, the agent stores the result in the scratchpad with a TTL matching the expected freshness window. On subsequent steps, the agent checks the scratchpad before calling the tool. This is not a general-purpose cache -- the TTL is short (minutes, not hours), the scope is a single agent run, and the entries carry metadata (which tool, what arguments, when called) that the agent can reason about.

### Parallel Task Tracking

Agents that decompose a task into subtasks and track their status. The scratchpad stores each subtask as a namespaced entry: `pad.namespace("subtasks").set("research", { status: "in-progress", findings: [...] })`. The agent queries the subtask namespace to determine which subtasks are complete, which are blocked, and what to do next. The `toContext()` method renders the subtask status as a summary for the LLM prompt.

### Debugging and Replay

Developers debugging agent behavior by capturing snapshots at each step and replaying the agent's reasoning. The snapshot captures the full scratchpad state -- every entry, its metadata, and its value. Comparing snapshots between steps reveals what the agent added, removed, or updated at each step. Restoring a snapshot resets the scratchpad to a previous state for re-execution with different parameters.

### Agent State Persistence Across Interruptions

Long-running agents that may be interrupted (server restart, timeout, user disconnect) and need to resume from where they left off. The scratchpad's serialize/deserialize capability allows the agent to save its working memory to any storage backend (filesystem, Redis, database) and restore it when execution resumes. The persistence adapter auto-saves on changes (debounced) so that minimal state is lost on interruption.

---

## 4. Core Concepts

### Scratchpad

The scratchpad is the top-level container. It is a typed key-value store where keys are strings and values are any JSON-serializable type. Each key-value pair is stored as an entry with associated metadata. The scratchpad provides `Map`-like operations (`get`, `set`, `has`, `delete`, `clear`, `keys`, `entries`) plus agent-specific operations (`findByTag`, `namespace`, `snapshot`, `restore`, `toContext`). A scratchpad is created per agent execution and is not shared across concurrent executions unless the caller explicitly arranges it.

### Entry

An entry is a single key-value pair with metadata. The value is the data the agent stored. The metadata includes:

- **`createdAt`**: Timestamp (Unix milliseconds) when the entry was first created.
- **`updatedAt`**: Timestamp when the entry's value was last updated. Equals `createdAt` on first write.
- **`accessedAt`**: Timestamp when the entry was last read via `get()`. Equals `createdAt` on first write. Used for sliding TTL.
- **`ttl`**: Time-to-live in milliseconds. If set, the entry expires `ttl` milliseconds after `createdAt` (fixed TTL) or after `accessedAt` (sliding TTL). `null` means no expiration.
- **`tags`**: An array of string labels categorizing the entry (e.g., `["tool-result", "search"]`). Used for querying with `findByTag()`.

### Namespace

A namespace is a scoped view of the scratchpad. It provides the same API as a scratchpad but all operations are scoped to a key prefix. `pad.namespace("agent1").set("result", value)` stores the entry with the internal key `"agent1:result"`. Namespaces can be nested: `pad.namespace("agent1").namespace("task2")` uses the prefix `"agent1:task2:"`. Namespaces share the underlying storage with the parent scratchpad -- they are views, not copies. Clearing a namespace clears only entries with that namespace's prefix.

### TTL (Time-to-Live)

TTL controls automatic expiration of entries. Each entry can have its own TTL, or entries can inherit the scratchpad's default TTL. Two TTL modes are supported:

- **Fixed TTL**: The entry expires `ttl` milliseconds after creation. Accessing the entry does not extend its lifetime. Use this for data with a known freshness window (e.g., "this API response is valid for 5 minutes").
- **Sliding TTL**: The entry expires `ttl` milliseconds after the last access. Each `get()` call resets the expiration timer. Use this for data that should be kept as long as the agent is actively using it but cleaned up when the agent moves on.

Expiration is lazy by default: expired entries are checked and removed when accessed. An optional background sweep can be enabled for proactive cleanup.

### Snapshot

A snapshot is a frozen copy of the scratchpad's complete state at a point in time. It captures all entries (keys, values, metadata) and the scratchpad's configuration. Snapshots are immutable -- modifying the scratchpad after taking a snapshot does not affect the snapshot. Restoring a snapshot replaces the scratchpad's entire state with the snapshot's state.

### Context Rendering

The scratchpad's contents can be rendered as a formatted string for injection into an LLM prompt. The `toContext()` method iterates over entries (optionally filtered by tags or namespace), formats each entry according to a configurable format (Markdown, XML tags, JSON, or plain key-value pairs), and returns the combined string. This bridges the gap between structured working memory and the unstructured text that LLMs consume.

### Entry Lifecycle

An entry progresses through these states:

```
created ──→ active ──→ expired ──→ evicted
              ↑            │
              └── accessed ─┘ (sliding TTL resets expiration)
```

1. **Created**: A `set()` call creates the entry with `createdAt`, `updatedAt`, and `accessedAt` all set to `Date.now()`. The `set` event fires.
2. **Active**: The entry is live and accessible via `get()`. Each `get()` updates `accessedAt` (and resets the sliding TTL timer if applicable). Each `set()` to the same key updates `updatedAt` and the value.
3. **Expired**: The entry's TTL has elapsed (since `createdAt` for fixed TTL, since `accessedAt` for sliding TTL). On the next access attempt (`get()`, `has()`, iteration), the entry is detected as expired, removed, and the `expire` event fires. The `get()` call returns `undefined`.
4. **Evicted**: The entry has been removed from the store, either by expiration, explicit `delete()`, or `clear()`. It no longer exists in the scratchpad.

---

## 5. Data Model

### ScratchpadEntry

Each entry in the scratchpad is stored with this structure:

```typescript
interface ScratchpadEntry<T = unknown> {
  /** The entry's key. */
  key: string;

  /** The stored value. Must be JSON-serializable for persistence. */
  value: T;

  /** Unix timestamp (ms) when the entry was first created. */
  createdAt: number;

  /** Unix timestamp (ms) when the entry's value was last updated. */
  updatedAt: number;

  /** Unix timestamp (ms) when the entry was last read via get(). */
  accessedAt: number;

  /**
   * Time-to-live in milliseconds.
   * null means the entry never expires.
   */
  ttl: number | null;

  /**
   * Whether TTL is sliding (resets on access) or fixed (from creation).
   * Default: false (fixed).
   */
  slidingTtl: boolean;

  /**
   * String labels for categorizing the entry.
   * Used for querying with findByTag().
   */
  tags: string[];
}
```

### Key Constraints

Keys are non-empty strings. Namespace separators (`:`) in keys are reserved for internal use by the namespace mechanism. Callers should not use `:` in keys they pass to `set()` -- doing so does not cause an error but may conflict with namespace-scoped keys. Keys are case-sensitive.

### Value Constraints

Values must be JSON-serializable if persistence or snapshot serialization is used. The scratchpad stores values by reference in memory (no deep cloning on `set()` or `get()`). If the caller mutates a stored object after `set()`, the scratchpad's stored value reflects the mutation. If immutability is required, the caller should clone the value before `set()` or after `get()`.

### Namespace Key Prefixing

Namespaces use `:` as a separator. When `pad.namespace("agent1")` is created, all operations on the namespace view use the prefix `"agent1:"`:

- `ns.set("result", value)` stores as `"agent1:result"` in the parent.
- `ns.get("result")` reads from `"agent1:result"` in the parent.
- `ns.keys()` returns only keys starting with `"agent1:"`, with the prefix stripped.
- `ns.clear()` deletes only keys starting with `"agent1:"`.

Nested namespaces concatenate prefixes: `pad.namespace("agent1").namespace("task2").set("x", 1)` stores as `"agent1:task2:x"`.

### Tags

Tags are lowercase string labels. An entry can have zero or more tags. Tags are set at creation time via `EntryOptions.tags` and can be updated by calling `set()` with new options. `findByTag("tool-result")` returns all non-expired entries that include `"tool-result"` in their tags array. Tag matching is exact (not substring or regex).

---

## 6. TTL and Expiration

### Per-Entry TTL

Each entry can specify its own TTL via `EntryOptions.ttl`:

```typescript
pad.set("api-response", data, { ttl: 300_000 }); // Expires in 5 minutes
pad.set("permanent-fact", data); // No TTL, lives until explicit delete or clear
```

### Default TTL

The scratchpad can be configured with a default TTL that applies to all entries that do not specify their own:

```typescript
const pad = createScratchpad({ defaultTtl: 600_000 }); // 10-minute default
pad.set("a", 1); // Inherits 10-minute TTL
pad.set("b", 2, { ttl: 60_000 }); // Overrides with 1-minute TTL
pad.set("c", 3, { ttl: null }); // Explicitly no TTL
```

### Fixed vs. Sliding TTL

**Fixed TTL** (default): The entry expires `ttl` milliseconds after `createdAt`. Accessing the entry does not extend its lifetime. This is appropriate for data with an inherent freshness window -- an API response that is valid for 5 minutes should expire in 5 minutes regardless of how often the agent reads it.

**Sliding TTL**: The entry expires `ttl` milliseconds after `accessedAt`. Each `get()` call resets the timer. This is appropriate for data that should be kept as long as the agent is actively using it -- intermediate reasoning state that the agent references repeatedly should stay alive while in use but expire if the agent moves on to a different task.

```typescript
pad.set("active-plan", plan, { ttl: 120_000, slidingTtl: true });
// As long as the agent reads "active-plan" within 2 minutes of each access, it stays alive.
// If the agent doesn't access it for 2 minutes, it expires.
```

### Lazy Expiration

By default, expiration is lazy: expired entries are checked and removed only when they are accessed. When `get(key)` is called, the scratchpad checks whether the entry's TTL has elapsed. If it has, the entry is deleted, the `expire` event fires, and `get()` returns `undefined`. Similarly, `has(key)` returns `false` for expired entries, and iteration methods (`keys()`, `entries()`, `find()`) skip expired entries and clean them up.

This approach is modeled on Redis's passive expiration strategy. It has zero overhead when entries are not accessed -- no timers, no background threads, no CPU cost for entries that expire unobserved.

### Active Expiration (Optional)

For applications that need proactive cleanup (e.g., to free memory or to trigger `expire` events promptly), the scratchpad supports an optional sweep interval:

```typescript
const pad = createScratchpad({
  defaultTtl: 60_000,
  sweepIntervalMs: 30_000, // Sweep every 30 seconds
});
```

When `sweepIntervalMs` is set, the scratchpad uses `setInterval()` to periodically scan all entries and remove expired ones. The sweep fires `expire` events for each removed entry. The interval is cleared when `pad.destroy()` is called.

The sweep does not scan all entries on every tick -- it samples entries in batches (similar to Redis's active expiration algorithm) to bound per-sweep CPU cost. If more than 25% of sampled entries are expired, the sweep immediately runs another batch, continuing until the expiration rate drops below the threshold.

### Manual Expiration

Entries can be explicitly deleted at any time:

```typescript
pad.delete("key"); // Removes immediately, fires 'delete' event
```

### TTL Strategies by Use Case

| Use Case | Recommended TTL | Mode |
|---|---|---|
| Tool call results (API responses, search results) | 1-5 minutes | Fixed |
| Intermediate computation results | 5-10 minutes | Fixed |
| Active reasoning state (current plan, current hypothesis) | 2-5 minutes | Sliding |
| Extracted entities and facts | 10-30 minutes or no TTL | Fixed |
| Task decomposition state | No TTL (lives for the run) | -- |
| Decision rationale and history | No TTL (lives for the run) | -- |

---

## 7. API Surface

### Installation

```bash
npm install agent-scratchpad
```

### Primary Function: `createScratchpad`

```typescript
import { createScratchpad } from 'agent-scratchpad';

const pad = createScratchpad({
  defaultTtl: 300_000,  // 5-minute default TTL
});

pad.set("order-id", "12345", { tags: ["entity", "user-input"] });
pad.set("search-results", results, { ttl: 60_000, tags: ["tool-result"] });

const orderId = pad.get<string>("order-id"); // "12345"
const toolResults = pad.findByTag("tool-result"); // entries tagged "tool-result"

const context = pad.toContext(); // Formatted string for LLM prompt injection
```

### Type Definitions

```typescript
// ── Entry Types ──────────────────────────────────────────────────────

/** A single entry in the scratchpad with metadata. */
interface ScratchpadEntry<T = unknown> {
  /** The entry's key. */
  key: string;

  /** The stored value. */
  value: T;

  /** Unix timestamp (ms) when the entry was first created. */
  createdAt: number;

  /** Unix timestamp (ms) when the entry's value was last updated via set(). */
  updatedAt: number;

  /** Unix timestamp (ms) when the entry was last read via get(). */
  accessedAt: number;

  /**
   * Time-to-live in milliseconds.
   * null means the entry never expires.
   */
  ttl: number | null;

  /**
   * Whether TTL resets on each access (sliding) or is fixed from creation.
   * Default: false (fixed).
   */
  slidingTtl: boolean;

  /** String labels for categorizing the entry. */
  tags: string[];
}

// ── Entry Options ────────────────────────────────────────────────────

/** Options when setting an entry. */
interface EntryOptions {
  /**
   * Time-to-live in milliseconds for this entry.
   * Overrides the scratchpad's defaultTtl.
   * Pass null to explicitly disable TTL for this entry.
   * Default: inherits from scratchpad's defaultTtl.
   */
  ttl?: number | null;

  /**
   * Whether the TTL is sliding (resets on each get()) or fixed (from creation).
   * Default: false (fixed).
   */
  slidingTtl?: boolean;

  /**
   * Tags to associate with this entry.
   * Default: [].
   */
  tags?: string[];
}

// ── Scratchpad Options ───────────────────────────────────────────────

/** Configuration for creating a Scratchpad. */
interface ScratchpadOptions {
  /**
   * Default time-to-live in milliseconds for entries that do not specify their own.
   * null means entries do not expire by default.
   * Default: null.
   */
  defaultTtl?: number | null;

  /**
   * Default sliding TTL mode for entries that do not specify their own.
   * Default: false (fixed TTL).
   */
  defaultSlidingTtl?: boolean;

  /**
   * Interval in milliseconds for active expiration sweeps.
   * When set, the scratchpad periodically scans for and removes expired entries.
   * null or 0 disables active sweeps (lazy expiration only).
   * Default: null (disabled).
   */
  sweepIntervalMs?: number | null;

  /**
   * Persistence adapter for saving and loading scratchpad state.
   * If provided, the scratchpad auto-saves after changes (debounced).
   * Default: undefined (in-memory only).
   */
  persistence?: PersistenceAdapter;

  /**
   * Debounce interval in milliseconds for auto-save when persistence is enabled.
   * The scratchpad waits this long after the last change before saving.
   * Default: 1000 (1 second).
   */
  autoSaveDebounceMs?: number;

  /**
   * Function that returns the current time in milliseconds.
   * Override for testing with deterministic time.
   * Default: () => Date.now().
   */
  now?: () => number;
}

// ── Snapshot ──────────────────────────────────────────────────────────

/** A frozen copy of the scratchpad's state at a point in time. */
interface ScratchpadSnapshot {
  /** All entries at the time of the snapshot, keyed by full key (including namespace prefixes). */
  entries: Record<string, ScratchpadEntry>;

  /** Timestamp when the snapshot was taken. */
  timestamp: number;

  /** Serialization format version. */
  version: 1;
}

// ── Stats ────────────────────────────────────────────────────────────

/** Statistics about the scratchpad's current state. */
interface ScratchpadStats {
  /** Total number of live (non-expired) entries. */
  size: number;

  /** Total number of entries including expired but not yet cleaned up. */
  rawSize: number;

  /** Number of distinct namespaces in use. */
  namespaceCount: number;

  /** Names of distinct namespaces in use. */
  namespaces: string[];

  /** Number of entries that have a TTL set. */
  entriesWithTtl: number;

  /** Number of entries that have expired but not yet been evicted (lazy expiration pending). */
  expiredPending: number;

  /** Count of entries by tag. */
  tagCounts: Record<string, number>;

  /** Timestamp of the oldest entry. */
  oldestEntryAt: number | null;

  /** Timestamp of the newest entry. */
  newestEntryAt: number | null;
}

// ── Context Rendering ────────────────────────────────────────────────

/** Options for rendering scratchpad contents as an LLM context string. */
interface ToContextOptions {
  /**
   * Output format.
   * - 'markdown': Renders as a Markdown section with headers and bullet points.
   * - 'xml': Renders entries as XML tags: <entry key="...">value</entry>.
   * - 'json': Renders as a JSON object.
   * - 'kv': Renders as plain key: value pairs, one per line.
   * Default: 'markdown'.
   */
  format?: 'markdown' | 'xml' | 'json' | 'kv';

  /**
   * Only include entries with at least one of these tags.
   * If empty or undefined, all entries are included.
   */
  filterTags?: string[];

  /**
   * Only include entries in this namespace.
   * If undefined, all namespaces are included.
   */
  filterNamespace?: string;

  /**
   * Maximum token budget for the rendered output.
   * If the rendered output exceeds this, entries are omitted from the end
   * (oldest entries are dropped first).
   * Requires tokenCounter to be set.
   * Default: Infinity (no limit).
   */
  maxTokens?: number;

  /**
   * Token counter function for enforcing maxTokens.
   * Required when maxTokens is set.
   * Default: undefined.
   */
  tokenCounter?: (text: string) => number;

  /**
   * Whether to include entry metadata (timestamps, tags) in the output.
   * Default: false.
   */
  includeMetadata?: boolean;

  /**
   * Header text prepended to the output.
   * Default: 'Working Memory' (for markdown), undefined for other formats.
   */
  header?: string;
}

// ── Persistence ──────────────────────────────────────────────────────

/** Adapter interface for custom persistence backends. */
interface PersistenceAdapter {
  /**
   * Load the scratchpad state from the backend.
   * Returns null if no saved state exists.
   */
  load(): Promise<ScratchpadSnapshot | null>;

  /**
   * Save the scratchpad state to the backend.
   */
  save(snapshot: ScratchpadSnapshot): Promise<void>;
}

// ── Events ───────────────────────────────────────────────────────────

/** Event types emitted by the scratchpad. */
interface ScratchpadEvents {
  /** Fired when an entry is set (created or updated). */
  set: { key: string; entry: ScratchpadEntry; isUpdate: boolean };

  /** Fired when an entry is explicitly deleted. */
  delete: { key: string; entry: ScratchpadEntry };

  /** Fired when an entry is removed due to TTL expiration. */
  expire: { key: string; entry: ScratchpadEntry };

  /** Fired when the scratchpad is cleared. */
  clear: { count: number };
}

type ScratchpadEventName = keyof ScratchpadEvents;
type ScratchpadEventHandler<E extends ScratchpadEventName> = (event: ScratchpadEvents[E]) => void;

// ── Error Classes ────────────────────────────────────────────────────

/** Base error for all agent-scratchpad errors. */
class ScratchpadError extends Error {
  readonly code: string;
}

/** Thrown when configuration is invalid. */
class ScratchpadConfigError extends ScratchpadError {
  readonly code = 'SCRATCHPAD_CONFIG_ERROR';
}

/** Thrown when a persistence operation fails. */
class ScratchpadPersistenceError extends ScratchpadError {
  readonly code = 'SCRATCHPAD_PERSISTENCE_ERROR';
}

/** Thrown when a snapshot version is not supported. */
class ScratchpadVersionError extends ScratchpadError {
  readonly code = 'SCRATCHPAD_VERSION_ERROR';
  readonly version: number;
}
```

### Scratchpad API

```typescript
/**
 * Create a new scratchpad instance.
 *
 * @param options - Configuration options.
 * @returns A Scratchpad instance.
 * @throws ScratchpadConfigError if configuration is invalid.
 */
function createScratchpad(options?: ScratchpadOptions): Scratchpad;

/** The scratchpad instance. */
interface Scratchpad {
  // ── Core Operations ────────────────────────────────────────────────

  /**
   * Set a key-value entry.
   * If the key already exists, updates the value, updatedAt timestamp,
   * and any provided options (ttl, tags). Fires 'set' event.
   *
   * @param key - The entry key. Must be a non-empty string.
   * @param value - The value to store. Must be JSON-serializable if persistence is used.
   * @param options - Optional entry-specific TTL, sliding TTL mode, and tags.
   */
  set<T>(key: string, value: T, options?: EntryOptions): void;

  /**
   * Get an entry's value by key.
   * Returns undefined if the key does not exist or has expired.
   * Updates the entry's accessedAt timestamp.
   * If the entry has a sliding TTL, resets the expiration timer.
   *
   * @param key - The entry key.
   * @returns The value, or undefined if not found or expired.
   */
  get<T>(key: string): T | undefined;

  /**
   * Check whether a key exists and is not expired.
   *
   * @param key - The entry key.
   * @returns true if the key exists and is not expired.
   */
  has(key: string): boolean;

  /**
   * Delete an entry by key.
   * Fires 'delete' event if the entry existed.
   *
   * @param key - The entry key.
   * @returns true if the entry existed and was deleted.
   */
  delete(key: string): boolean;

  /**
   * Remove all entries.
   * Fires 'clear' event with the count of removed entries.
   */
  clear(): void;

  /**
   * Get all non-expired keys.
   * Triggers lazy expiration for any expired entries encountered.
   *
   * @returns Array of keys.
   */
  keys(): string[];

  /**
   * Get all non-expired entries as [key, entry] tuples.
   * Triggers lazy expiration for any expired entries encountered.
   *
   * @returns Array of [key, ScratchpadEntry] tuples.
   */
  entries(): [string, ScratchpadEntry][];

  /**
   * Get an entry's full metadata by key.
   * Returns undefined if the key does not exist or has expired.
   * Does NOT update accessedAt or reset sliding TTL.
   *
   * @param key - The entry key.
   * @returns The full entry with metadata, or undefined.
   */
  getEntry(key: string): ScratchpadEntry | undefined;

  // ── Query Operations ───────────────────────────────────────────────

  /**
   * Find entries matching a predicate.
   * Iterates all non-expired entries and returns those for which the
   * predicate returns true.
   *
   * @param predicate - Function that receives an entry and returns boolean.
   * @returns Array of matching entries.
   */
  find(predicate: (entry: ScratchpadEntry) => boolean): ScratchpadEntry[];

  /**
   * Find all non-expired entries with a specific tag.
   *
   * @param tag - The tag to search for.
   * @returns Array of entries that include the tag.
   */
  findByTag(tag: string): ScratchpadEntry[];

  // ── Namespace Operations ───────────────────────────────────────────

  /**
   * Create a namespaced view of the scratchpad.
   * The returned Scratchpad instance scopes all operations to keys
   * prefixed with the namespace name and a ':' separator.
   * Namespaces share the underlying storage.
   *
   * @param name - The namespace name. Must be a non-empty string without ':'.
   * @returns A Scratchpad instance scoped to the namespace.
   */
  namespace(name: string): Scratchpad;

  // ── Snapshot Operations ────────────────────────────────────────────

  /**
   * Capture a snapshot of the scratchpad's current state.
   * The snapshot is a deep copy -- mutations to the scratchpad after
   * snapshot() do not affect the snapshot.
   *
   * @returns A frozen snapshot of the current state.
   */
  snapshot(): ScratchpadSnapshot;

  /**
   * Restore the scratchpad's state from a snapshot.
   * All current entries are replaced with the snapshot's entries.
   * Fires 'clear' event followed by 'set' events for each restored entry.
   *
   * @param snapshot - The snapshot to restore.
   * @throws ScratchpadVersionError if the snapshot version is not supported.
   */
  restore(snapshot: ScratchpadSnapshot): void;

  // ── Context Rendering ──────────────────────────────────────────────

  /**
   * Render scratchpad contents as a formatted string for injection
   * into an LLM prompt.
   *
   * @param options - Rendering options (format, filters, token budget).
   * @returns A formatted string representing the scratchpad contents.
   */
  toContext(options?: ToContextOptions): string;

  // ── Serialization ──────────────────────────────────────────────────

  /**
   * Serialize the scratchpad state to a JSON-compatible object.
   * Equivalent to taking a snapshot, but returned as a plain object
   * suitable for JSON.stringify().
   *
   * @returns A JSON-serializable snapshot.
   */
  serialize(): ScratchpadSnapshot;

  // ── Properties ─────────────────────────────────────────────────────

  /**
   * The number of live (non-expired) entries.
   * Triggers lazy expiration check.
   */
  readonly size: number;

  // ── Stats ──────────────────────────────────────────────────────────

  /**
   * Get statistics about the scratchpad's current state.
   *
   * @returns A ScratchpadStats object.
   */
  stats(): ScratchpadStats;

  // ── Events ─────────────────────────────────────────────────────────

  /**
   * Register an event handler.
   *
   * @param event - The event name.
   * @param handler - The event handler function.
   * @returns A function that removes the handler when called.
   */
  on<E extends ScratchpadEventName>(event: E, handler: ScratchpadEventHandler<E>): () => void;

  // ── Lifecycle ──────────────────────────────────────────────────────

  /**
   * Destroy the scratchpad.
   * Clears the sweep interval (if active), flushes pending persistence saves,
   * and removes all event handlers.
   * The scratchpad instance should not be used after destroy().
   */
  destroy(): Promise<void>;

  // ── Persistence ────────────────────────────────────────────────────

  /**
   * Manually save the current state to the persistence adapter.
   * No-op if no persistence adapter is configured.
   *
   * @throws ScratchpadPersistenceError if the save fails.
   */
  save(): Promise<void>;

  /**
   * Manually load state from the persistence adapter, replacing current state.
   * No-op if no persistence adapter is configured.
   *
   * @throws ScratchpadPersistenceError if the load fails.
   * @throws ScratchpadVersionError if the loaded state version is not supported.
   */
  load(): Promise<void>;
}

// ── Static Functions ─────────────────────────────────────────────────

/**
 * Restore a scratchpad from a serialized snapshot.
 *
 * @param snapshot - The serialized snapshot from Scratchpad.serialize().
 * @param options - Scratchpad options (persistence, sweepInterval, etc.).
 * @returns A Scratchpad instance with the restored state.
 * @throws ScratchpadVersionError if the snapshot version is not supported.
 */
function fromSnapshot(snapshot: ScratchpadSnapshot, options?: ScratchpadOptions): Scratchpad;

/**
 * Create a file-system persistence adapter.
 * Saves and loads scratchpad state as a JSON file.
 *
 * @param filePath - Path to the JSON file.
 * @returns A PersistenceAdapter.
 */
function filePersistence(filePath: string): PersistenceAdapter;
```

---

## 8. Namespaces

### Purpose

Agents often need to scope working memory by concern. A multi-agent system has multiple agents, each with its own scratchpad entries. A single agent may decompose a task into subtasks, each needing its own scope. Namespaces provide this scoping without requiring multiple scratchpad instances.

### Creating Namespaces

```typescript
const pad = createScratchpad();

// Per-agent namespaces
const agent1 = pad.namespace("agent1");
const agent2 = pad.namespace("agent2");

agent1.set("plan", "Research the topic");
agent2.set("plan", "Write the report");

agent1.get("plan"); // "Research the topic"
agent2.get("plan"); // "Write the report"
pad.get("agent1:plan"); // "Research the topic" (full key access from root)
```

### Hierarchical Namespaces

Namespaces can be nested to arbitrary depth:

```typescript
const taskPad = pad.namespace("agent1").namespace("task2");
taskPad.set("status", "in-progress");

// Stored internally as "agent1:task2:status"
pad.get("agent1:task2:status"); // "in-progress"
```

### Namespace-Level Operations

Each namespace supports the full scratchpad API. Operations are scoped to the namespace:

- **`ns.keys()`**: Returns keys within the namespace, with the prefix stripped. If `agent1:plan` and `agent1:result` exist, `pad.namespace("agent1").keys()` returns `["plan", "result"]`.
- **`ns.clear()`**: Deletes only entries within the namespace. Other namespaces and root-level entries are unaffected.
- **`ns.entries()`**: Returns entries within the namespace, with keys stripped of the namespace prefix.
- **`ns.size`**: Count of entries within the namespace.
- **`ns.findByTag(tag)`**: Searches only within the namespace.

### Namespace-Level TTL Defaults

A namespace can override the parent's default TTL:

```typescript
const pad = createScratchpad({ defaultTtl: 300_000 }); // 5-minute default
const hotData = pad.namespace("hot");
// Entries in the "hot" namespace do not inherit the parent's default TTL directly --
// they use whatever the root scratchpad's defaultTtl is, unless overridden per-entry.
// To give a namespace a different default, set TTL on each entry or use a wrapper.
```

Since namespaces are views over the same store, namespace-level TTL customization is achieved by the caller consistently passing `EntryOptions.ttl` for entries in that namespace. This keeps the implementation simple -- namespaces are pure key-prefix views, not separate configurations.

### Cross-Namespace Access

The root scratchpad can always access any entry by its full key (including namespace prefix). This is useful for cross-namespace reads:

```typescript
const agent1Result = pad.get("agent1:result"); // Read agent1's result from root
const agent2Pad = pad.namespace("agent2");
// agent2 cannot directly access agent1's entries through its own namespace view
// (namespace scoping is enforced), but the root pad can read both.
```

### Namespace Isolation

Namespace views enforce strict prefix isolation:

- `ns.get("key")` only accesses `"prefix:key"`, never `"key"` at the root level.
- `ns.keys()` only returns keys with the namespace prefix, never root-level keys.
- `ns.delete("key")` only deletes `"prefix:key"`.
- Events fired from namespace operations include the full key (with prefix).

---

## 9. Context Rendering

### Purpose

LLMs consume text. The scratchpad stores structured data. The `toContext()` method bridges this gap by rendering scratchpad contents as a formatted string that can be injected into an LLM prompt alongside the system prompt, conversation history, and other context sections.

### Rendering Formats

**Markdown (default)**:

```markdown
## Working Memory

- **order-id**: "12345"
- **customer-name**: "Alice Johnson"
- **search-results**: {"products": [{"id": 1, "name": "Widget"}], "total": 1}
- **current-plan**: "Verify the order status, then check shipping"
```

**XML**:

```xml
<working-memory>
  <entry key="order-id">"12345"</entry>
  <entry key="customer-name">"Alice Johnson"</entry>
  <entry key="search-results">{"products": [{"id": 1, "name": "Widget"}], "total": 1}</entry>
  <entry key="current-plan">"Verify the order status, then check shipping"</entry>
</working-memory>
```

**JSON**:

```json
{
  "order-id": "12345",
  "customer-name": "Alice Johnson",
  "search-results": {"products": [{"id": 1, "name": "Widget"}], "total": 1},
  "current-plan": "Verify the order status, then check shipping"
}
```

**Key-Value**:

```
order-id: "12345"
customer-name: "Alice Johnson"
search-results: {"products": [{"id": 1, "name": "Widget"}], "total": 1}
current-plan: "Verify the order status, then check shipping"
```

### Filtering

The caller can filter which entries are rendered:

```typescript
// Only render tool results
pad.toContext({ filterTags: ["tool-result"] });

// Only render entries in the "agent1" namespace
pad.toContext({ filterNamespace: "agent1" });

// Combine filters
pad.toContext({ filterTags: ["entity"], filterNamespace: "extraction" });
```

When `filterTags` is provided, an entry is included if it has at least one of the specified tags (OR logic). When `filterNamespace` is provided, only entries in that namespace are included. When both are provided, entries must satisfy both conditions (AND logic).

### Token Budget Awareness

When `maxTokens` is set, `toContext()` renders entries from newest to oldest (by `updatedAt`), accumulating token count using the provided `tokenCounter` function. When adding the next entry would exceed the budget, rendering stops and remaining entries are omitted. This ensures the most recently updated entries -- which are most likely to be relevant to the agent's current reasoning step -- are included in the context.

```typescript
const context = pad.toContext({
  maxTokens: 1000,
  tokenCounter: (text) => Math.ceil(text.length / 4),
  format: "markdown",
});
```

### Metadata Inclusion

When `includeMetadata` is true, each entry includes its timestamps and tags:

```markdown
## Working Memory

- **order-id**: "12345"
  _Tags: entity, user-input | Updated: 2026-03-18T10:30:00Z_
- **search-results**: {"products": [...]}
  _Tags: tool-result | Updated: 2026-03-18T10:31:15Z | TTL: 300s_
```

### Integration with context-budget

`context-budget` can allocate a token budget for a "scratchpad" section, and the scratchpad uses that budget when rendering:

```typescript
import { createBudget } from 'context-budget';
import { createScratchpad } from 'agent-scratchpad';

const budget = createBudget({
  model: 'gpt-4o',
  sections: {
    system: { basis: 500, shrink: 0, priority: 100 },
    scratchpad: { basis: 1000, grow: 1, shrink: 2, min: 0, priority: 40 },
    conversation: { grow: 1, min: 2000, priority: 80 },
    currentMessage: { basis: 'auto', shrink: 0, priority: 100 },
  },
});

const allocation = budget.allocate({
  system: 450,
  scratchpad: pad.size * 50, // rough estimate
  conversation: 12000,
  currentMessage: 300,
});

const scratchpadContext = pad.toContext({
  maxTokens: allocation.sections.scratchpad.allocation,
  tokenCounter: myTokenCounter,
});
```

---

## 10. Persistence

### In-Memory Only (Default)

By default, the scratchpad stores all data in process memory. When the process exits, the data is lost. This is appropriate for single-run agent executions where working memory is not needed after the run completes.

### File System Persistence

The package provides a built-in file system adapter for simple persistence:

```typescript
import { createScratchpad, filePersistence } from 'agent-scratchpad';

const pad = createScratchpad({
  persistence: filePersistence('/tmp/agent-scratchpad.json'),
  autoSaveDebounceMs: 2000,
});

// Load any previously saved state
await pad.load();

// Use the scratchpad normally -- changes auto-save after 2 seconds of inactivity
pad.set("key", "value");

// Explicitly save before exiting
await pad.save();
```

The file adapter writes the snapshot as a JSON file using `fs.writeFile()` with an atomic write pattern (write to a temporary file, then rename). It loads using `fs.readFile()` with `JSON.parse()`.

### Custom Adapter Interface

Applications can implement their own persistence adapter for any backend:

```typescript
interface PersistenceAdapter {
  load(): Promise<ScratchpadSnapshot | null>;
  save(snapshot: ScratchpadSnapshot): Promise<void>;
}
```

Example: Redis persistence adapter:

```typescript
import { createScratchpad, type PersistenceAdapter } from 'agent-scratchpad';

const redisAdapter: PersistenceAdapter = {
  async load() {
    const json = await redis.get('agent:scratchpad:run-123');
    return json ? JSON.parse(json) : null;
  },
  async save(snapshot) {
    await redis.set('agent:scratchpad:run-123', JSON.stringify(snapshot));
  },
};

const pad = createScratchpad({ persistence: redisAdapter });
```

Example: localStorage adapter (for browser environments):

```typescript
const localStorageAdapter: PersistenceAdapter = {
  async load() {
    const json = localStorage.getItem('agent-scratchpad');
    return json ? JSON.parse(json) : null;
  },
  async save(snapshot) {
    localStorage.setItem('agent-scratchpad', JSON.stringify(snapshot));
  },
};
```

### Auto-Save Behavior

When a persistence adapter is configured, the scratchpad auto-saves after changes. The save is debounced: after each `set()`, `delete()`, or `clear()` call, the scratchpad waits `autoSaveDebounceMs` milliseconds before calling `adapter.save()`. If another change occurs during the debounce window, the timer resets. This coalesces rapid sequences of changes (common during agent execution) into a single save.

If the auto-save fails, the error is caught and logged via a `console.error` call. The scratchpad continues operating normally -- persistence failure does not affect in-memory operation. The caller can also explicitly call `pad.save()` to trigger an immediate save and handle errors.

### Manual Save and Load

```typescript
// Explicitly save current state
await pad.save();

// Load saved state, replacing current state
await pad.load();
```

`load()` replaces the scratchpad's entire state with the loaded snapshot. Entries that existed before `load()` are removed. `save()` serializes the current state and passes it to the adapter.

---

## 11. Snapshots and Branching

### Taking Snapshots

A snapshot captures the scratchpad's complete state at a point in time:

```typescript
const pad = createScratchpad();
pad.set("plan", "Approach A");
pad.set("result", 42);

const snap = pad.snapshot();
// snap contains: { entries: { plan: {...}, result: {...} }, timestamp: ..., version: 1 }
```

The snapshot is a deep copy. Modifying the scratchpad after taking a snapshot does not affect the snapshot. Modifying the snapshot object does not affect the scratchpad.

### Restoring Snapshots

Restoring a snapshot replaces the scratchpad's entire state:

```typescript
pad.set("plan", "Approach B"); // Changed plan
pad.set("newKey", "value");    // Added new entry

pad.restore(snap);             // Reset to snapshot state

pad.get("plan");               // "Approach A" (restored)
pad.get("result");             // 42 (restored)
pad.has("newKey");             // false (did not exist at snapshot time)
```

Restoration fires events: a `clear` event for the entries being removed, followed by `set` events for each entry being restored.

### Use Case: Backtracking in Agent Reasoning

An agent tries approach A, fails, and backtracks to try approach B:

```typescript
// Save state before trying approach A
const checkpoint = pad.snapshot();

pad.set("approach", "A");
const resultA = await tryApproachA();

if (!resultA.success) {
  // Backtrack to the checkpoint
  pad.restore(checkpoint);

  // Try approach B with clean state
  pad.set("approach", "B");
  const resultB = await tryApproachB();
}
```

### Use Case: Parallel Exploration

An agent explores two alternatives in parallel using separate scratchpad snapshots:

```typescript
const baseline = pad.snapshot();

// Explore option 1
pad.restore(baseline);
pad.set("option", "1");
const result1 = await explore(pad);

// Explore option 2
pad.restore(baseline);
pad.set("option", "2");
const result2 = await explore(pad);

// Pick the better result and restore its state
pad.restore(result1.score > result2.score ? result1.snap : result2.snap);
```

### Use Case: Debugging

A developer captures snapshots at each step of the agent loop for post-mortem analysis:

```typescript
const snapshots: ScratchpadSnapshot[] = [];

for (const step of agentLoop) {
  snapshots.push(pad.snapshot());
  await executeStep(step, pad);
}

// After execution, compare snapshots to see what changed at each step
for (let i = 1; i < snapshots.length; i++) {
  const diff = diffSnapshots(snapshots[i - 1], snapshots[i]);
  console.log(`Step ${i}: added ${diff.added.length}, removed ${diff.removed.length}, updated ${diff.updated.length}`);
}
```

### Snapshot Diffing

The package provides a utility function for comparing two snapshots:

```typescript
/**
 * Compare two snapshots and return the differences.
 *
 * @param before - The earlier snapshot.
 * @param after - The later snapshot.
 * @returns An object describing added, removed, and updated entries.
 */
function diffSnapshots(
  before: ScratchpadSnapshot,
  after: ScratchpadSnapshot,
): SnapshotDiff;

interface SnapshotDiff {
  /** Keys that exist in 'after' but not in 'before'. */
  added: string[];

  /** Keys that exist in 'before' but not in 'after'. */
  removed: string[];

  /** Keys that exist in both but have different values. */
  updated: string[];

  /** Keys that are identical in both. */
  unchanged: string[];
}
```

---

## 12. Configuration

### Default Values

| Option | Default | Description |
|---|---|---|
| `defaultTtl` | `null` | Default TTL for entries (ms). `null` = no expiration. |
| `defaultSlidingTtl` | `false` | Default sliding TTL mode. `false` = fixed TTL. |
| `sweepIntervalMs` | `null` | Active expiration sweep interval (ms). `null` = disabled. |
| `persistence` | `undefined` | Persistence adapter. `undefined` = in-memory only. |
| `autoSaveDebounceMs` | `1000` | Debounce interval for auto-save (ms). |
| `now` | `() => Date.now()` | Time source function. |

### Configuration Validation

All configuration values are validated at `createScratchpad()` call time:

- `defaultTtl`, if not null, must be a positive number. Zero or negative values throw `ScratchpadConfigError`.
- `sweepIntervalMs`, if not null, must be a positive number >= 100. Very short intervals (under 100ms) are rejected to prevent excessive CPU usage.
- `autoSaveDebounceMs` must be a non-negative number.
- `now`, if provided, must be a function.
- `persistence`, if provided, must be an object with `load` and `save` functions.

---

## 13. Integration

### With Agent Frameworks

**LangChain/LangGraph:**

```typescript
import { createScratchpad } from 'agent-scratchpad';
import { ChatOpenAI } from '@langchain/openai';

const pad = createScratchpad({ defaultTtl: 600_000 });

// In a LangGraph node:
async function researchNode(state: AgentState) {
  const searchResults = await searchTool.invoke(state.query);
  pad.set("search-results", searchResults, { tags: ["tool-result", "search"] });

  // Include scratchpad in the next LLM call
  const context = pad.toContext({ format: "xml" });
  const messages = [
    { role: "system", content: `${systemPrompt}\n\n${context}` },
    ...state.messages,
  ];
  return { messages: await llm.invoke(messages) };
}
```

**Vercel AI SDK:**

```typescript
import { createScratchpad } from 'agent-scratchpad';
import { generateText } from 'ai';

const pad = createScratchpad();

const result = await generateText({
  model: openai('gpt-4o'),
  system: `You are a research assistant.\n\n${pad.toContext()}`,
  messages,
  tools: {
    search: {
      execute: async (args) => {
        const results = await search(args.query);
        pad.set(`search:${args.query}`, results, { tags: ["tool-result"] });
        return results;
      },
    },
  },
});
```

**Custom Agent Loop:**

```typescript
import { createScratchpad } from 'agent-scratchpad';

const pad = createScratchpad({ defaultTtl: 300_000 });

async function agentLoop(task: string) {
  pad.set("task", task, { tags: ["task"] });
  pad.set("status", "planning", { tags: ["status"] });

  while (pad.get("status") !== "complete") {
    const context = pad.toContext({ format: "markdown" });
    const action = await llm.decide(context);

    if (action.type === "tool-call") {
      const result = await executeTool(action.tool, action.args);
      pad.set(`tool:${action.tool}:${Date.now()}`, result, {
        ttl: 120_000,
        tags: ["tool-result", action.tool],
      });
    } else if (action.type === "update-plan") {
      pad.set("plan", action.plan, { tags: ["plan"] });
    } else if (action.type === "complete") {
      pad.set("status", "complete", { tags: ["status"] });
      pad.set("answer", action.answer, { tags: ["output"] });
    }
  }

  return pad.get("answer");
}
```

### With sliding-context

`sliding-context` manages conversation history; `agent-scratchpad` manages working memory. They complement each other:

```typescript
import { createContext } from 'sliding-context';
import { createScratchpad } from 'agent-scratchpad';

const ctx = createContext({ tokenBudget: 8192, summarizer: mySummarizer });
const pad = createScratchpad({ defaultTtl: 300_000 });

// On each agent step:
ctx.addMessage({ role: "user", content: userMessage });

const scratchpadContext = pad.toContext({ format: "xml", maxTokens: 1000, tokenCounter });
const conversationMessages = await ctx.getMessages();

// Inject scratchpad as a system-level context section
const messages = [
  { role: "system", content: `${systemPrompt}\n\n<working-memory>\n${scratchpadContext}\n</working-memory>` },
  ...conversationMessages,
];
```

### With context-budget

`context-budget` allocates token budgets across context sections, including a scratchpad section:

```typescript
import { createBudget } from 'context-budget';
import { createScratchpad } from 'agent-scratchpad';

const budget = createBudget({
  model: 'gpt-4o',
  sections: {
    system: { basis: 'auto', shrink: 0, priority: 100 },
    scratchpad: { basis: 500, grow: 1, shrink: 2, min: 0, max: 2000, priority: 40 },
    conversation: { grow: 1, min: 2000, priority: 80 },
    currentMessage: { basis: 'auto', shrink: 0, priority: 100 },
  },
});

const pad = createScratchpad();

// On each turn, allocate and render scratchpad within its budget
const allocation = budget.allocate({
  system: systemTokens,
  scratchpad: estimatedScratchpadTokens,
  conversation: conversationTokens,
  currentMessage: messageTokens,
});

const scratchpadText = pad.toContext({
  maxTokens: allocation.sections.scratchpad.allocation,
  tokenCounter: myTokenCounter,
});
```

### With memory-dedup

`memory-dedup` deduplicates memory entries. When an agent writes similar entries to the scratchpad across multiple steps (e.g., "user's name is Alice" appearing multiple times from different tool calls), `memory-dedup` can be used to deduplicate before rendering to context:

```typescript
import { dedup } from 'memory-dedup';
import { createScratchpad } from 'agent-scratchpad';

const pad = createScratchpad();

// Before rendering to context, deduplicate entries
const entries = pad.entries().map(([key, entry]) => ({
  id: key,
  text: JSON.stringify(entry.value),
}));
const unique = await dedup(entries, { similarityThreshold: 0.9 });
// Use unique entries for context rendering
```

---

## 14. Testing Strategy

### Test Categories

**Unit tests: Core operations** -- The fundamental `set()`, `get()`, `has()`, `delete()`, `clear()`, `keys()`, `entries()` operations are tested with various value types (strings, numbers, objects, arrays, null, nested objects). Tests verify that `get()` returns the exact value that was `set()`, that `delete()` removes entries, that `clear()` removes all entries, and that `keys()` and `entries()` return only live entries.

**Unit tests: TTL and expiration** -- Entries are created with TTLs and a mock `now` function that controls time. Tests verify that entries are accessible before TTL expires, return `undefined` after TTL expires, and are removed from `keys()` and `entries()` after expiration. Fixed TTL and sliding TTL are tested separately. Sliding TTL tests verify that `get()` resets the expiration timer. Tests cover: TTL of 0 (reject), TTL of 1ms (very short), default TTL inheritance, per-entry TTL override, explicit `null` TTL on an entry to disable default TTL.

**Unit tests: Tags and querying** -- Entries are created with various tag combinations. `findByTag()` is tested to return the correct entries. Tests verify: single tag, multiple tags, entries with no tags, tag not found, `find()` with custom predicates.

**Unit tests: Events** -- Event handlers are registered for `set`, `delete`, `expire`, and `clear`. Tests verify that the correct events fire with the correct payloads at the correct times. Tests verify that unsubscription works (handler removal function returned by `on()` prevents further calls).

**Unit tests: Namespaces** -- Namespace creation, key prefixing, isolation between namespaces, nested namespaces, namespace-level `keys()` and `clear()`, cross-namespace access from root. Tests verify that namespace operations do not affect entries outside the namespace.

**Unit tests: Type safety** -- TypeScript generic tests verify that `set<T>()` and `get<T>()` produce correct type inference. Tests verify that the TypeScript compiler catches type mismatches (these are compile-time tests, not runtime tests).

**Integration tests: Snapshots** -- Tests create a scratchpad with entries, take a snapshot, modify the scratchpad, restore the snapshot, and verify that the state matches the snapshot. Tests cover: empty snapshot, snapshot with expired entries, snapshot after delete, snapshot with namespaces. Snapshot diffing is tested with known before/after states.

**Integration tests: Persistence** -- Tests use a mock persistence adapter that stores state in a variable. Tests verify: save stores the correct state, load restores the correct state, auto-save triggers after changes (with debounce), save after clear, load into a non-empty scratchpad replaces state. The file persistence adapter is tested with a temporary file.

**Integration tests: Context rendering** -- Tests create scratchpads with various entries and verify that `toContext()` produces the expected output for each format (Markdown, XML, JSON, key-value). Tests cover: empty scratchpad, tag filtering, namespace filtering, token budget truncation, metadata inclusion.

**Integration tests: Active expiration sweep** -- Tests configure a sweep interval with a mock time source, advance time past TTL, trigger the sweep, and verify that expired entries are removed and `expire` events fire.

**Edge case tests** -- Empty scratchpad operations (get, delete, keys on empty pad), very large values, keys with special characters, namespace names with edge cases, snapshot of a scratchpad with 10,000 entries (performance), concurrent set/get operations, destroy followed by attempted use.

### Test Organization

```
src/__tests__/
  scratchpad.test.ts              -- Full lifecycle integration tests
  core/
    operations.test.ts            -- set, get, has, delete, clear, keys, entries
    entry-metadata.test.ts        -- Timestamps, getEntry()
  ttl/
    fixed-ttl.test.ts             -- Fixed TTL expiration
    sliding-ttl.test.ts           -- Sliding TTL expiration
    default-ttl.test.ts           -- Default TTL inheritance
    sweep.test.ts                 -- Active expiration sweep
  tags/
    tagging.test.ts               -- Tag assignment and findByTag
    find.test.ts                  -- Custom predicate find()
  namespaces/
    basic.test.ts                 -- Namespace creation and key prefixing
    nested.test.ts                -- Nested namespaces
    isolation.test.ts             -- Cross-namespace isolation
  snapshots/
    snapshot-restore.test.ts      -- Take and restore snapshots
    diff.test.ts                  -- Snapshot diffing
  persistence/
    adapter.test.ts               -- Custom adapter interface
    file.test.ts                  -- File persistence adapter
    auto-save.test.ts             -- Auto-save debouncing
  context/
    render.test.ts                -- toContext() rendering formats
    filtering.test.ts             -- Tag and namespace filtering
    token-budget.test.ts          -- Token budget truncation
  events/
    emission.test.ts              -- Event firing and handler invocation
    unsubscribe.test.ts           -- Handler removal
  fixtures/
    entries.ts                    -- Test entry data
    mock-adapter.ts               -- Mock persistence adapter
    mock-time.ts                  -- Mock time source
```

### Test Runner

`vitest` (already configured in `package.json`).

---

## 15. Performance

### Core Operation Complexity

| Operation | Time Complexity | Notes |
|---|---|---|
| `set(key, value)` | O(1) | `Map.set()` + metadata assignment |
| `get(key)` | O(1) | `Map.get()` + TTL check |
| `has(key)` | O(1) | `Map.has()` + TTL check |
| `delete(key)` | O(1) | `Map.delete()` |
| `clear()` | O(n) | Iterates all entries for event emission |
| `keys()` | O(n) | Iterates all entries, skips expired (lazy cleanup) |
| `entries()` | O(n) | Iterates all entries, skips expired (lazy cleanup) |
| `find(predicate)` | O(n) | Iterates all entries |
| `findByTag(tag)` | O(n) | Iterates all entries, checks tag membership |
| `namespace(name)` | O(1) | Creates a lightweight wrapper object |
| `snapshot()` | O(n) | Deep copies all entries |
| `restore(snapshot)` | O(n) | Replaces all entries |
| `toContext()` | O(n) | Iterates entries, builds string |
| `size` | O(n) | Counts non-expired entries (lazy cleanup) |
| `stats()` | O(n) | Scans all entries for statistics |

Where n is the number of entries in the scratchpad. For typical agent use cases with tens to hundreds of entries, all operations complete in microseconds.

### Memory Footprint

Each entry consumes approximately 200-400 bytes of overhead (key string, metadata fields, tag array) plus the size of the value. A scratchpad with 100 entries averaging 1KB each uses approximately 120-140KB total. This is negligible for any runtime environment.

Snapshots duplicate the entry data, so each snapshot consumes approximately the same memory as the scratchpad at the time of the snapshot. Applications that take frequent snapshots should be aware of this and discard old snapshots when they are no longer needed.

### TTL Cleanup Overhead

Lazy expiration adds a constant-time check to every `get()` call: compare the current timestamp against the entry's expiration time. This adds approximately 1 microsecond per call. No background CPU cost.

Active expiration (sweep) adds periodic work proportional to the sample batch size (default: 20 entries per sweep). For a scratchpad with 100 entries and a 30-second sweep interval, this adds negligible CPU overhead (20 comparisons every 30 seconds).

### Serialization Performance

`snapshot()` and `serialize()` deep-copy entries using `JSON.parse(JSON.stringify(entries))`. For a scratchpad with 100 entries totaling 100KB, serialization takes approximately 1-5ms. This is the dominant cost of snapshot/persistence operations and is fast enough for typical agent use.

---

## 16. Dependencies

### Runtime Dependencies

None. `agent-scratchpad` has zero runtime dependencies. All scratchpad logic -- key-value storage, TTL management, namespace prefixing, snapshot deep copy, context rendering, event emission -- uses built-in JavaScript APIs (`Map`, `Date.now()`, `JSON.stringify()`, `JSON.parse()`, `setInterval()`, `clearInterval()`).

### Peer Dependencies

None. The package does not depend on any specific agent framework, LLM SDK, or token counting library.

### Optional Integration Dependencies

| Package | Purpose |
|---|---|
| `gpt-tokenizer` or `js-tiktoken` | Exact token counting for `toContext()` maxTokens. Caller provides as `tokenCounter`. |
| `context-budget` | Token budget allocation for the scratchpad section. Caller uses allocation result with `toContext()`. |
| `sliding-context` | Conversation history management alongside the scratchpad. |
| `memory-dedup` | Deduplication of scratchpad entries before context rendering. |

These are not dependencies of `agent-scratchpad`. The caller imports them separately and uses them alongside the scratchpad.

### Development Dependencies

| Package | Purpose |
|---|---|
| `typescript` | TypeScript compiler (>= 5.0) |
| `vitest` | Test runner |
| `eslint` | Linting |
| `@types/node` | Node.js type definitions |

### Why Zero Dependencies

The package implements a `Map`-like data structure with metadata and timers. Every operation uses JavaScript built-ins: `Map` for storage, `Date.now()` for timestamps, `JSON.parse(JSON.stringify())` for deep cloning, `setInterval()` for sweeps, string concatenation for namespace prefixes, and array methods for iteration and filtering. There is no parsing, networking, cryptography, or complex computation that would benefit from an external library. Zero dependencies means zero install weight, zero supply chain risk, and zero version conflicts.

---

## 17. File Structure

```
agent-scratchpad/
  package.json
  tsconfig.json
  SPEC.md
  README.md
  src/
    index.ts                       -- Public API exports (createScratchpad, fromSnapshot, filePersistence, diffSnapshots)
    scratchpad.ts                  -- Scratchpad class implementation (core operations, events)
    types.ts                       -- All TypeScript type definitions
    namespace.ts                   -- Namespace wrapper implementation
    ttl.ts                         -- TTL checking logic, expiration helpers
    sweep.ts                       -- Active expiration sweep logic
    snapshot.ts                    -- Snapshot, restore, and diff implementation
    context.ts                     -- toContext() rendering logic (all formats)
    persistence.ts                 -- PersistenceAdapter interface, filePersistence, auto-save debounce
    errors.ts                      -- Error classes (ScratchpadError, ScratchpadConfigError, etc.)
  src/__tests__/
    scratchpad.test.ts             -- Full lifecycle integration tests
    core/
      operations.test.ts           -- set, get, has, delete, clear, keys, entries
      entry-metadata.test.ts       -- Timestamps, getEntry()
    ttl/
      fixed-ttl.test.ts            -- Fixed TTL expiration
      sliding-ttl.test.ts          -- Sliding TTL expiration
      default-ttl.test.ts          -- Default TTL inheritance
      sweep.test.ts                -- Active expiration sweep
    tags/
      tagging.test.ts              -- Tag assignment and findByTag
      find.test.ts                 -- Custom predicate find()
    namespaces/
      basic.test.ts                -- Namespace creation and key prefixing
      nested.test.ts               -- Nested namespaces
      isolation.test.ts            -- Cross-namespace isolation
    snapshots/
      snapshot-restore.test.ts     -- Take and restore snapshots
      diff.test.ts                 -- Snapshot diffing
    persistence/
      adapter.test.ts              -- Custom adapter interface
      file.test.ts                 -- File persistence adapter
      auto-save.test.ts            -- Auto-save debouncing
    context/
      render.test.ts               -- toContext() rendering formats
      filtering.test.ts            -- Tag and namespace filtering
      token-budget.test.ts         -- Token budget truncation
    events/
      emission.test.ts             -- Event firing and handler invocation
      unsubscribe.test.ts          -- Handler removal
    fixtures/
      entries.ts                   -- Test entry data
      mock-adapter.ts              -- Mock persistence adapter
      mock-time.ts                 -- Mock time source
  dist/                            -- Compiled output (generated by tsc, gitignored)
```

---

## 18. Implementation Roadmap

### Phase 1: Core Scratchpad (v0.1.0)

Implement the foundation: typed key-value store with metadata, TTL, and basic operations.

1. **Types**: Define all TypeScript types in `types.ts` -- `ScratchpadEntry`, `EntryOptions`, `ScratchpadOptions`, `ScratchpadSnapshot`, `ScratchpadStats`, `ScratchpadEvents`, `ToContextOptions`, `PersistenceAdapter`, error classes.
2. **Core store**: Implement `createScratchpad()` returning a `Scratchpad` instance backed by a `Map<string, ScratchpadEntry>`. Implement `set()`, `get()`, `has()`, `delete()`, `clear()`, `keys()`, `entries()`, `getEntry()`, `size`.
3. **Entry metadata**: On `set()`, populate `createdAt`, `updatedAt`, `accessedAt`, `ttl`, `slidingTtl`, and `tags`. On `get()`, update `accessedAt`. On repeated `set()` to the same key, update `updatedAt` and value, preserve `createdAt`.
4. **TTL expiration**: Implement lazy expiration in `get()`, `has()`, `keys()`, and `entries()`. Check `isExpired(entry, now)` using the entry's TTL mode (fixed vs. sliding). Remove expired entries and fire `expire` events.
5. **Configuration validation**: Validate all options at `createScratchpad()` time. Throw `ScratchpadConfigError` for invalid values.
6. **Tests**: Core operations, TTL expiration (fixed and sliding), default TTL, configuration validation.

### Phase 2: Tags, Querying, and Events (v0.2.0)

Add entry categorization, querying, and event emission.

1. **Tags**: Implement `tags` on `EntryOptions`, store on entry, validate as string arrays.
2. **Querying**: Implement `findByTag(tag)` and `find(predicate)`.
3. **Events**: Implement the event emitter. `on(event, handler)` returns an unsubscribe function. Fire events: `set` (on create and update), `delete` (on explicit delete), `expire` (on lazy or active expiration), `clear` (on clear).
4. **Tests**: Tagging, findByTag, find with predicates, event emission and unsubscription.

### Phase 3: Namespaces (v0.3.0)

Add hierarchical namespace support.

1. **Namespace wrapper**: Implement `namespace(name)` returning a `Scratchpad` view that prefixes all keys with `name:`. The wrapper delegates to the parent's `Map` with key transformation.
2. **Namespace isolation**: Implement `keys()`, `entries()`, `clear()`, `size`, `findByTag()` on the namespace wrapper with prefix filtering and stripping.
3. **Nested namespaces**: Implement `namespace(name)` on namespace wrappers, concatenating prefixes.
4. **Tests**: Namespace creation, key prefixing, isolation, nesting, cross-namespace access.

### Phase 4: Snapshots and Context Rendering (v0.4.0)

Add point-in-time snapshots and LLM context rendering.

1. **Snapshots**: Implement `snapshot()` -- deep copy all entries into a `ScratchpadSnapshot`. Implement `restore(snapshot)` -- clear current state, load snapshot entries.
2. **Snapshot diffing**: Implement `diffSnapshots(before, after)` -- compare keys, detect added/removed/updated entries.
3. **fromSnapshot()**: Implement the static function to create a scratchpad from a snapshot.
4. **Context rendering**: Implement `toContext(options)` with four formats (Markdown, XML, JSON, key-value). Implement tag and namespace filtering. Implement token budget truncation with a caller-provided token counter.
5. **Tests**: Snapshot/restore round-trip, diffing, context rendering for all formats, filtering, token budget.

### Phase 5: Persistence (v0.5.0)

Add optional persistence with pluggable adapters.

1. **PersistenceAdapter interface**: Define `load()` and `save()` contract.
2. **File adapter**: Implement `filePersistence(path)` using `fs.writeFile` and `fs.readFile` with atomic writes.
3. **Auto-save**: Implement debounced auto-save that triggers after `set()`, `delete()`, and `clear()` when a persistence adapter is configured.
4. **Manual save/load**: Implement `pad.save()` and `pad.load()`.
5. **Tests**: Mock adapter, file adapter with temp files, auto-save debouncing.

### Phase 6: Active Sweep and Polish (v1.0.0)

Harden for production use.

1. **Active expiration sweep**: Implement `sweepIntervalMs` using `setInterval()` with batch sampling.
2. **destroy()**: Implement cleanup -- clear sweep interval, flush pending auto-save, remove event handlers.
3. **Serialization**: Implement `serialize()` as an alias for `snapshot()` that ensures JSON-serializability.
4. **Edge case hardening**: Test with extreme configurations (0 entries, 10,000 entries, very short TTLs, very long TTLs, rapid set/get sequences).
5. **Performance benchmarking**: Profile set/get/snapshot/toContext with various scratchpad sizes.
6. **Documentation**: README with installation, quick start, API reference, framework integration examples.

---

## 19. Example Use Cases

### ReAct Agent Working Memory

A ReAct agent (Thought-Action-Observation loop) uses the scratchpad to store intermediate reasoning, tool outputs, and the evolving plan:

```typescript
import { createScratchpad } from 'agent-scratchpad';

const pad = createScratchpad({ defaultTtl: 600_000 });

async function reactLoop(question: string): Promise<string> {
  pad.set("question", question, { tags: ["input"] });
  pad.set("step", 0);

  for (let step = 0; step < 10; step++) {
    pad.set("step", step);

    // Render current working memory for the LLM
    const context = pad.toContext({ format: "xml" });
    const prompt = `${systemPrompt}\n\n${context}\n\nQuestion: ${question}\n\nThink step by step.`;

    const response = await llm.generate(prompt);

    if (response.action) {
      // Agent decided to use a tool
      const result = await executeTool(response.action.tool, response.action.args);
      pad.set(`observation:step-${step}`, {
        tool: response.action.tool,
        args: response.action.args,
        result,
      }, {
        ttl: 300_000,
        tags: ["tool-result", response.action.tool],
      });

      // Store the agent's reasoning
      pad.set(`thought:step-${step}`, response.thought, {
        tags: ["thought"],
      });
    } else if (response.answer) {
      // Agent produced a final answer
      return response.answer;
    }
  }

  return "Unable to determine answer within step limit.";
}
```

### Multi-Step Data Extraction

An agent extracts structured data from a document in multiple passes, storing intermediate results in namespaced scratchpad entries:

```typescript
import { createScratchpad } from 'agent-scratchpad';

const pad = createScratchpad();

async function extractStructuredData(document: string) {
  const entities = pad.namespace("entities");
  const relations = pad.namespace("relations");
  const validation = pad.namespace("validation");

  // Pass 1: Extract entities
  const extractedEntities = await llm.extract(document, "entities");
  for (const entity of extractedEntities) {
    entities.set(entity.id, entity, { tags: [entity.type] });
  }

  // Pass 2: Resolve relationships using extracted entities
  const entityContext = entities.toContext({ format: "json" });
  const extractedRelations = await llm.extract(
    document,
    "relationships",
    { context: entityContext },
  );
  for (const rel of extractedRelations) {
    relations.set(`${rel.from}-${rel.type}-${rel.to}`, rel, { tags: [rel.type] });
  }

  // Pass 3: Validate extracted data
  const fullContext = pad.toContext({ format: "json" });
  const issues = await llm.validate(fullContext);
  for (const issue of issues) {
    validation.set(issue.id, issue, { tags: ["issue", issue.severity] });
  }

  // Return the structured extraction with validation results
  return {
    entities: entities.entries().map(([, e]) => e.value),
    relations: relations.entries().map(([, e]) => e.value),
    issues: validation.findByTag("issue").map(e => e.value),
  };
}
```

### Parallel Task Tracking

An agent decomposes a task into subtasks and tracks their status using the scratchpad:

```typescript
import { createScratchpad } from 'agent-scratchpad';

const pad = createScratchpad();
const tasks = pad.namespace("tasks");

async function planAndExecute(goal: string) {
  // Planning phase
  const plan = await llm.plan(goal);
  pad.set("goal", goal, { tags: ["plan"] });
  pad.set("plan", plan, { tags: ["plan"] });

  for (const subtask of plan.subtasks) {
    tasks.set(subtask.id, {
      description: subtask.description,
      status: "pending",
      result: null,
    }, { tags: ["subtask", "pending"] });
  }

  // Execution phase
  for (const subtask of plan.subtasks) {
    // Check dependencies
    const deps = subtask.dependencies.map(id => tasks.get(id));
    const allDepsComplete = deps.every(d => d?.status === "complete");

    if (!allDepsComplete) {
      tasks.set(subtask.id, { ...tasks.get(subtask.id), status: "blocked" }, {
        tags: ["subtask", "blocked"],
      });
      continue;
    }

    // Execute subtask
    tasks.set(subtask.id, { ...tasks.get(subtask.id), status: "in-progress" }, {
      tags: ["subtask", "in-progress"],
    });

    const taskContext = pad.toContext({ format: "markdown" });
    const result = await llm.execute(subtask.description, { context: taskContext });

    tasks.set(subtask.id, {
      description: subtask.description,
      status: "complete",
      result,
    }, { tags: ["subtask", "complete"] });
  }

  // Synthesis
  const finalContext = pad.toContext({ format: "json" });
  return await llm.synthesize(goal, finalContext);
}
```

### Debugging with Snapshots

A developer captures the agent's state at each step for post-mortem debugging:

```typescript
import { createScratchpad, diffSnapshots, type ScratchpadSnapshot } from 'agent-scratchpad';

const pad = createScratchpad();
const debugLog: Array<{ step: number; snapshot: ScratchpadSnapshot; action: string }> = [];

async function debuggableAgentLoop(task: string) {
  pad.set("task", task);

  for (let step = 0; step < maxSteps; step++) {
    // Capture state before this step
    const before = pad.snapshot();

    const action = await agentStep(pad);

    // Capture state after this step
    const after = pad.snapshot();
    debugLog.push({ step, snapshot: after, action: action.description });

    // Log what changed
    const diff = diffSnapshots(before, after);
    if (diff.added.length > 0) console.log(`Step ${step}: Added: ${diff.added.join(", ")}`);
    if (diff.updated.length > 0) console.log(`Step ${step}: Updated: ${diff.updated.join(", ")}`);
    if (diff.removed.length > 0) console.log(`Step ${step}: Removed: ${diff.removed.join(", ")}`);

    if (action.done) break;
  }

  // The developer can replay from any step:
  // pad.restore(debugLog[3].snapshot);
  // await agentStep(pad); // Re-execute step 4 with step 3's state
}
```
