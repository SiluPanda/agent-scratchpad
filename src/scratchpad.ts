import {
  Scratchpad,
  ScratchpadEntry,
  ScratchpadOptions,
  ScratchpadSnapshot,
  ScratchpadStats,
  ToContextOptions,
  EntryOptions,
  ScratchpadEventName,
  ScratchpadEventHandler,
  PersistenceAdapter,
} from './types.js';
import { isExpired } from './ttl.js';
import { toContext as toContextFn } from './context.js';
import { ScratchpadVersionError } from './errors.js';

export function createScratchpad(options?: ScratchpadOptions): Scratchpad {
  const store = new Map<string, ScratchpadEntry>();
  const listeners = new Map<string, Set<(data: unknown) => void>>();
  const nowFn = options?.now ?? (() => Date.now());
  const persistence: PersistenceAdapter | undefined = options?.persistence;

  let sweepTimer: ReturnType<typeof setInterval> | null = null;

  if (options?.sweepIntervalMs && options.sweepIntervalMs > 0) {
    sweepTimer = setInterval(() => {
      const n = nowFn();
      for (const [key, entry] of store) {
        if (isExpired(entry, n)) {
          store.delete(key);
          emit('expire', { key, entry });
        }
      }
    }, options.sweepIntervalMs);
    if (sweepTimer.unref) sweepTimer.unref();
  }

  function emit(event: string, data: unknown): void {
    const handlers = listeners.get(event);
    if (handlers) {
      for (const h of handlers) {
        try { h(data); } catch { /* swallow handler errors */ }
      }
    }
  }

  function set<T = unknown>(key: string, value: T, entryOptions?: EntryOptions): void {
    const now = nowFn();

    // Lazy-expire any existing entry
    const existing = store.get(key);
    if (existing && isExpired(existing, now)) {
      store.delete(key);
      emit('expire', { key, entry: existing });
    }

    const isUpdate = store.has(key);
    const ttl = entryOptions?.ttl !== undefined ? entryOptions.ttl : (options?.defaultTtl ?? null);
    const slidingTtl = entryOptions?.slidingTtl !== undefined
      ? entryOptions.slidingTtl
      : (options?.defaultSlidingTtl ?? false);
    const tags = entryOptions?.tags ?? [];

    const entry: ScratchpadEntry<T> = {
      key,
      value,
      createdAt: isUpdate ? (store.get(key)!.createdAt) : now,
      updatedAt: now,
      accessedAt: now,
      ttl,
      slidingTtl,
      tags,
    };

    store.set(key, entry as ScratchpadEntry);
    emit('set', { key, entry, isUpdate });
  }

  function get<T = unknown>(key: string): T | undefined {
    const entry = store.get(key);
    if (!entry) return undefined;

    const now = nowFn();
    if (isExpired(entry, now)) {
      store.delete(key);
      emit('expire', { key, entry });
      return undefined;
    }

    // Update accessedAt (and sliding TTL base)
    const updated: ScratchpadEntry = { ...entry, accessedAt: now };
    store.set(key, updated);

    return updated.value as T;
  }

  function has(key: string): boolean {
    const entry = store.get(key);
    if (!entry) return false;
    const now = nowFn();
    if (isExpired(entry, now)) {
      store.delete(key);
      emit('expire', { key, entry });
      return false;
    }
    return true;
  }

  function del(key: string): boolean {
    const entry = store.get(key);
    if (!entry) return false;
    store.delete(key);
    emit('delete', { key, entry });
    return true;
  }

  function clear(): void {
    const count = store.size;
    store.clear();
    emit('clear', { count });
  }

  function keys(): string[] {
    const now = nowFn();
    const result: string[] = [];
    for (const [key, entry] of store) {
      if (!isExpired(entry, now)) result.push(key);
    }
    return result;
  }

  function entries(): [string, ScratchpadEntry][] {
    const now = nowFn();
    const result: [string, ScratchpadEntry][] = [];
    for (const [key, entry] of store) {
      if (!isExpired(entry, now)) result.push([key, entry]);
    }
    return result;
  }

  function findByTag(tag: string): ScratchpadEntry[] {
    const now = nowFn();
    const result: ScratchpadEntry[] = [];
    for (const [, entry] of store) {
      if (!isExpired(entry, now) && entry.tags.includes(tag)) result.push(entry);
    }
    return result;
  }

  function namespace(name: string): Scratchpad {
    const prefix = `${name}:`;

    const ns: Scratchpad = {
      set<T = unknown>(key: string, value: T, entryOpts?: EntryOptions): void {
        set(`${prefix}${key}`, value, entryOpts);
      },
      get<T = unknown>(key: string): T | undefined {
        return get<T>(`${prefix}${key}`);
      },
      has(key: string): boolean {
        return has(`${prefix}${key}`);
      },
      delete(key: string): boolean {
        return del(`${prefix}${key}`);
      },
      clear(): void {
        const now = nowFn();
        for (const [k, entry] of store) {
          if (k.startsWith(prefix) && !isExpired(entry, now)) {
            store.delete(k);
            emit('delete', { key: k, entry });
          }
        }
      },
      keys(): string[] {
        const now = nowFn();
        const result: string[] = [];
        for (const [k, entry] of store) {
          if (k.startsWith(prefix) && !isExpired(entry, now)) {
            result.push(k.slice(prefix.length));
          }
        }
        return result;
      },
      entries(): [string, ScratchpadEntry][] {
        const now = nowFn();
        const result: [string, ScratchpadEntry][] = [];
        for (const [k, entry] of store) {
          if (k.startsWith(prefix) && !isExpired(entry, now)) {
            result.push([k.slice(prefix.length), entry]);
          }
        }
        return result;
      },
      findByTag(tag: string): ScratchpadEntry[] {
        const now = nowFn();
        const result: ScratchpadEntry[] = [];
        for (const [k, entry] of store) {
          if (k.startsWith(prefix) && !isExpired(entry, now) && entry.tags.includes(tag)) {
            result.push(entry);
          }
        }
        return result;
      },
      namespace(subName: string): Scratchpad {
        return namespace(`${name}:${subName}`);
      },
      snapshot(): ScratchpadSnapshot {
        return snapshot();
      },
      restore(snap: ScratchpadSnapshot): void {
        return restore(snap);
      },
      toContext(opts?: ToContextOptions): string {
        return toContext(opts);
      },
      serialize(): ScratchpadSnapshot {
        return snapshot();
      },
      stats(): ScratchpadStats {
        return stats();
      },
      on<K extends ScratchpadEventName>(
        event: K,
        handler: ScratchpadEventHandler<K>
      ): () => void {
        return on(event, handler);
      },
      save(): Promise<void> {
        return save();
      },
      load(): Promise<void> {
        return load();
      },
      destroy(): Promise<void> {
        return destroy();
      },
    };

    return ns;
  }

  function snapshot(): ScratchpadSnapshot {
    const entriesObj: Record<string, ScratchpadEntry> = {};
    for (const [k, v] of store) {
      entriesObj[k] = v;
    }
    return { entries: entriesObj, timestamp: nowFn(), version: 1 };
  }

  function restore(snap: ScratchpadSnapshot): void {
    if (snap.version !== 1) {
      throw new ScratchpadVersionError(snap.version as number);
    }
    store.clear();
    for (const [k, v] of Object.entries(snap.entries)) {
      store.set(k, v);
    }
  }

  function toContext(opts?: ToContextOptions): string {
    const all = entries().map(([, e]) => e);
    return toContextFn(all, opts);
  }

  function stats(): ScratchpadStats {
    const now = nowFn();
    const liveEntries: ScratchpadEntry[] = [];
    for (const [, entry] of store) {
      if (!isExpired(entry, now)) liveEntries.push(entry);
    }

    const namespaceSet = new Set<string>();
    for (const e of liveEntries) {
      const colonIdx = e.key.indexOf(':');
      if (colonIdx !== -1) {
        namespaceSet.add(e.key.slice(0, colonIdx));
      }
    }
    const namespaces = Array.from(namespaceSet);

    let entriesWithTtl = 0;
    const tagCounts: Record<string, number> = {};
    let oldestEntryAt: number | null = null;
    let newestEntryAt: number | null = null;

    for (const e of liveEntries) {
      if (e.ttl !== null && e.ttl !== undefined) entriesWithTtl++;
      for (const tag of e.tags) {
        tagCounts[tag] = (tagCounts[tag] ?? 0) + 1;
      }
      if (oldestEntryAt === null || e.createdAt < oldestEntryAt) oldestEntryAt = e.createdAt;
      if (newestEntryAt === null || e.createdAt > newestEntryAt) newestEntryAt = e.createdAt;
    }

    return {
      size: liveEntries.length,
      rawSize: store.size,
      namespaceCount: namespaces.length,
      namespaces,
      entriesWithTtl,
      tagCounts,
      oldestEntryAt,
      newestEntryAt,
    };
  }

  function on<K extends ScratchpadEventName>(
    event: K,
    handler: ScratchpadEventHandler<K>
  ): () => void {
    if (!listeners.has(event)) {
      listeners.set(event, new Set());
    }
    const set = listeners.get(event)!;
    set.add(handler as (data: unknown) => void);
    return () => {
      set.delete(handler as (data: unknown) => void);
    };
  }

  function save(): Promise<void> {
    if (!persistence) return Promise.resolve();
    return persistence.save(snapshot());
  }

  function load(): Promise<void> {
    if (!persistence) return Promise.resolve();
    return persistence.load().then((snap) => {
      if (snap) restore(snap);
    });
  }

  function destroy(): Promise<void> {
    if (sweepTimer !== null) {
      clearInterval(sweepTimer);
      sweepTimer = null;
    }
    return Promise.resolve();
  }

  const scratchpad: Scratchpad = {
    set,
    get,
    has,
    delete: del,
    clear,
    keys,
    entries,
    findByTag,
    namespace,
    snapshot,
    restore,
    toContext,
    serialize: snapshot,
    stats,
    on,
    save,
    load,
    destroy,
  };

  return scratchpad;
}

export function fromSnapshot(
  snap: ScratchpadSnapshot,
  opts?: ScratchpadOptions
): ReturnType<typeof createScratchpad> {
  const pad = createScratchpad(opts);
  pad.restore(snap);
  return pad;
}

// Re-export types for convenience
export type {
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
} from './types.js';
