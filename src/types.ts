export interface ScratchpadEntry<T = unknown> {
  key: string;
  value: T;
  createdAt: number;
  updatedAt: number;
  accessedAt: number;
  ttl: number | null;
  slidingTtl: boolean;
  tags: string[];
}

export interface EntryOptions {
  ttl?: number | null;
  slidingTtl?: boolean;
  tags?: string[];
}

export interface ScratchpadOptions {
  defaultTtl?: number | null;
  defaultSlidingTtl?: boolean;
  sweepIntervalMs?: number | null;
  now?: () => number;
  persistence?: PersistenceAdapter;
}

export interface ScratchpadSnapshot {
  entries: Record<string, ScratchpadEntry>;
  timestamp: number;
  version: 1;
}

export interface ScratchpadStats {
  size: number;
  rawSize: number;
  namespaceCount: number;
  namespaces: string[];
  entriesWithTtl: number;
  tagCounts: Record<string, number>;
  oldestEntryAt: number | null;
  newestEntryAt: number | null;
}

export interface ToContextOptions {
  format?: 'markdown' | 'xml' | 'json' | 'kv';
  filterTags?: string[];
  filterNamespace?: string;
  maxTokens?: number;
  tokenCounter?: (text: string) => number;
  includeMetadata?: boolean;
  header?: string;
}

export interface PersistenceAdapter {
  load(): Promise<ScratchpadSnapshot | null>;
  save(snap: ScratchpadSnapshot): Promise<void>;
}

export interface ScratchpadEvents {
  set: { key: string; entry: ScratchpadEntry; isUpdate: boolean };
  delete: { key: string; entry: ScratchpadEntry };
  expire: { key: string; entry: ScratchpadEntry };
  clear: { count: number };
}

export type ScratchpadEventName = keyof ScratchpadEvents;

export type ScratchpadEventHandler<K extends ScratchpadEventName> = (
  data: ScratchpadEvents[K]
) => void;

export interface Scratchpad {
  set<T = unknown>(key: string, value: T, options?: EntryOptions): void;
  get<T = unknown>(key: string): T | undefined;
  has(key: string): boolean;
  delete(key: string): boolean;
  clear(): void;
  keys(): string[];
  entries(): [string, ScratchpadEntry][];
  findByTag(tag: string): ScratchpadEntry[];
  namespace(name: string): Scratchpad;
  snapshot(): ScratchpadSnapshot;
  restore(snapshot: ScratchpadSnapshot): void;
  toContext(options?: ToContextOptions): string;
  serialize(): ScratchpadSnapshot;
  stats(): ScratchpadStats;
  on<K extends ScratchpadEventName>(
    event: K,
    handler: ScratchpadEventHandler<K>
  ): () => void;
  save(): Promise<void>;
  load(): Promise<void>;
  destroy(): Promise<void>;
}
