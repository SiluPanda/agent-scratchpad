import { describe, it, expect, vi } from 'vitest';
import { createScratchpad, fromSnapshot } from '../scratchpad.js';
import { ScratchpadVersionError } from '../errors.js';

describe('basic set/get', () => {
  it('stores and retrieves a value', () => {
    const pad = createScratchpad();
    pad.set('foo', 'bar');
    expect(pad.get('foo')).toBe('bar');
  });

  it('returns undefined for missing key', () => {
    const pad = createScratchpad();
    expect(pad.get('nope')).toBeUndefined();
  });

  it('overwrites an existing key', () => {
    const pad = createScratchpad();
    pad.set('x', 1);
    pad.set('x', 2);
    expect(pad.get('x')).toBe(2);
  });

  it('has() returns true for existing key', () => {
    const pad = createScratchpad();
    pad.set('a', 1);
    expect(pad.has('a')).toBe(true);
  });

  it('has() returns false for missing key', () => {
    const pad = createScratchpad();
    expect(pad.has('z')).toBe(false);
  });

  it('delete() removes key and returns true', () => {
    const pad = createScratchpad();
    pad.set('d', 9);
    expect(pad.delete('d')).toBe(true);
    expect(pad.has('d')).toBe(false);
  });

  it('delete() returns false for missing key', () => {
    const pad = createScratchpad();
    expect(pad.delete('nope')).toBe(false);
  });
});

describe('TTL expiry', () => {
  it('entry expires after ttl ms', () => {
    let now = 0;
    const pad = createScratchpad({ now: () => now });
    pad.set('k', 'v', { ttl: 100 });
    expect(pad.get('k')).toBe('v');
    now = 100; // exactly at expiry
    expect(pad.get('k')).toBeUndefined();
  });

  it('entry is still valid before ttl', () => {
    let now = 0;
    const pad = createScratchpad({ now: () => now });
    pad.set('k', 'v', { ttl: 100 });
    now = 99;
    expect(pad.get('k')).toBe('v');
  });

  it('defaultTtl applied when no per-entry ttl given', () => {
    let now = 0;
    const pad = createScratchpad({ defaultTtl: 50, now: () => now });
    pad.set('k', 'v');
    now = 50;
    expect(pad.get('k')).toBeUndefined();
  });

  it('null ttl means no expiry', () => {
    let now = 0;
    const pad = createScratchpad({ now: () => now });
    pad.set('k', 'v', { ttl: null });
    now = 999999;
    expect(pad.get('k')).toBe('v');
  });
});

describe('sliding TTL', () => {
  it('accessing resets expiry window', () => {
    let now = 0;
    const pad = createScratchpad({ now: () => now });
    pad.set('k', 'v', { ttl: 100, slidingTtl: true });

    now = 80;
    expect(pad.get('k')).toBe('v'); // accessedAt updated to 80

    now = 150; // 70ms after last access, still within 100ms window
    expect(pad.get('k')).toBe('v');

    now = 251; // 101ms after last access (150), expired
    expect(pad.get('k')).toBeUndefined();
  });

  it('without sliding TTL, expiry is based on createdAt', () => {
    let now = 0;
    const pad = createScratchpad({ now: () => now });
    pad.set('k', 'v', { ttl: 100, slidingTtl: false });

    now = 80;
    pad.get('k'); // access it

    now = 100; // 100ms from createdAt=0, expired
    expect(pad.get('k')).toBeUndefined();
  });
});

describe('tags', () => {
  it('findByTag returns entries with the matching tag', () => {
    const pad = createScratchpad();
    pad.set('a', 1, { tags: ['alpha', 'shared'] });
    pad.set('b', 2, { tags: ['beta'] });
    pad.set('c', 3, { tags: ['shared'] });

    const shared = pad.findByTag('shared');
    expect(shared.map((e) => e.key).sort()).toEqual(['a', 'c']);
  });

  it('findByTag returns empty array when no match', () => {
    const pad = createScratchpad();
    pad.set('a', 1, { tags: ['alpha'] });
    expect(pad.findByTag('nope')).toEqual([]);
  });

  it('findByTag excludes expired entries', () => {
    let now = 0;
    const pad = createScratchpad({ now: () => now });
    pad.set('x', 10, { tags: ['t'], ttl: 50 });
    now = 50;
    expect(pad.findByTag('t')).toEqual([]);
  });
});

describe('namespace', () => {
  it('scoped set/get uses prefixed keys', () => {
    const pad = createScratchpad();
    const ns = pad.namespace('ctx');
    ns.set('item', 42);
    expect(ns.get('item')).toBe(42);
    // raw key in parent
    expect(pad.get('ctx:item')).toBe(42);
  });

  it('has() is scoped', () => {
    const pad = createScratchpad();
    const ns = pad.namespace('ns');
    ns.set('x', 1);
    expect(ns.has('x')).toBe(true);
    expect(ns.has('y')).toBe(false);
  });

  it('delete() is scoped', () => {
    const pad = createScratchpad();
    const ns = pad.namespace('ns');
    ns.set('x', 1);
    ns.delete('x');
    expect(ns.has('x')).toBe(false);
  });

  it('keys() strips namespace prefix', () => {
    const pad = createScratchpad();
    const ns = pad.namespace('ns');
    ns.set('a', 1);
    ns.set('b', 2);
    expect(ns.keys().sort()).toEqual(['a', 'b']);
  });

  it('nested namespace composes prefixes', () => {
    const pad = createScratchpad();
    const ns = pad.namespace('a').namespace('b');
    ns.set('key', 'val');
    expect(pad.get('a:b:key')).toBe('val');
  });

  it('parent namespace does not leak into child namespace keys', () => {
    const pad = createScratchpad();
    pad.set('ns:x', 99);
    pad.set('other:y', 88);
    const ns = pad.namespace('ns');
    expect(ns.keys()).toEqual(['x']);
  });
});

describe('snapshot/restore roundtrip', () => {
  it('snapshot captures current entries', () => {
    const pad = createScratchpad();
    pad.set('a', 1);
    pad.set('b', 2);
    const snap = pad.snapshot();
    expect(snap.version).toBe(1);
    expect(Object.keys(snap.entries).sort()).toEqual(['a', 'b']);
  });

  it('restore repopulates store from snapshot', () => {
    const pad = createScratchpad();
    pad.set('x', 10);
    const snap = pad.snapshot();

    const pad2 = createScratchpad();
    pad2.restore(snap);
    expect(pad2.get('x')).toBe(10);
  });

  it('fromSnapshot creates pad with entries already loaded', () => {
    const pad = createScratchpad();
    pad.set('hello', 'world');
    const snap = pad.snapshot();

    const pad2 = fromSnapshot(snap);
    expect(pad2.get('hello')).toBe('world');
  });

  it('restore throws ScratchpadVersionError for unknown version', () => {
    const pad = createScratchpad();
    expect(() =>
      pad.restore({ entries: {}, timestamp: 0, version: 99 as 1 })
    ).toThrow(ScratchpadVersionError);
  });

  it('serialize() returns same shape as snapshot()', () => {
    const pad = createScratchpad();
    pad.set('k', 'v');
    const s1 = pad.snapshot();
    const s2 = pad.serialize();
    expect(Object.keys(s1.entries)).toEqual(Object.keys(s2.entries));
    expect(s1.version).toBe(s2.version);
  });
});

describe('toContext formats', () => {
  it('kv format (default)', () => {
    const pad = createScratchpad();
    pad.set('name', 'Alice');
    pad.set('role', 'admin');
    const ctx = pad.toContext();
    expect(ctx).toContain('name: Alice');
    expect(ctx).toContain('role: admin');
  });

  it('json format', () => {
    const pad = createScratchpad();
    pad.set('x', 1);
    const ctx = pad.toContext({ format: 'json' });
    const parsed = JSON.parse(ctx);
    expect(parsed['x']).toBe(1);
  });

  it('markdown format', () => {
    const pad = createScratchpad();
    pad.set('title', 'Hello');
    const ctx = pad.toContext({ format: 'markdown' });
    expect(ctx).toContain('## title');
    expect(ctx).toContain('Hello');
  });

  it('xml format', () => {
    const pad = createScratchpad();
    pad.set('greeting', 'hi');
    const ctx = pad.toContext({ format: 'xml' });
    expect(ctx).toContain('<entry key="greeting">hi</entry>');
  });

  it('filterTags only includes matching entries', () => {
    const pad = createScratchpad();
    pad.set('a', 1, { tags: ['important'] });
    pad.set('b', 2, { tags: ['other'] });
    const ctx = pad.toContext({ format: 'kv', filterTags: ['important'] });
    expect(ctx).toContain('a: 1');
    expect(ctx).not.toContain('b: 2');
  });

  it('filterNamespace only includes entries with matching prefix', () => {
    const pad = createScratchpad();
    pad.set('ctx:a', 1);
    pad.set('other:b', 2);
    const ctx = pad.toContext({ format: 'kv', filterNamespace: 'ctx' });
    expect(ctx).toContain('ctx:a: 1');
    expect(ctx).not.toContain('other:b');
  });

  it('header is prepended', () => {
    const pad = createScratchpad();
    pad.set('k', 'v');
    const ctx = pad.toContext({ header: '# Context' });
    expect(ctx.startsWith('# Context')).toBe(true);
  });

  it('maxTokens truncates output', () => {
    const pad = createScratchpad();
    pad.set('long_key', 'a'.repeat(200));
    const ctx = pad.toContext({ maxTokens: 10 });
    expect(ctx.length).toBeLessThanOrEqual(10);
  });
});

describe('events', () => {
  it('set event fires with correct data on new key', () => {
    const pad = createScratchpad();
    const handler = vi.fn();
    pad.on('set', handler);
    pad.set('k', 'v');
    expect(handler).toHaveBeenCalledOnce();
    const data = handler.mock.calls[0][0];
    expect(data.key).toBe('k');
    expect(data.isUpdate).toBe(false);
    expect(data.entry.value).toBe('v');
  });

  it('set event fires with isUpdate=true on overwrite', () => {
    const pad = createScratchpad();
    const handler = vi.fn();
    pad.set('k', 1);
    pad.on('set', handler);
    pad.set('k', 2);
    const data = handler.mock.calls[0][0];
    expect(data.isUpdate).toBe(true);
  });

  it('delete event fires when key is removed', () => {
    const pad = createScratchpad();
    const handler = vi.fn();
    pad.on('delete', handler);
    pad.set('k', 'v');
    pad.delete('k');
    expect(handler).toHaveBeenCalledOnce();
    expect(handler.mock.calls[0][0].key).toBe('k');
  });

  it('expire event fires on lazy expiry via get()', () => {
    let now = 0;
    const pad = createScratchpad({ now: () => now });
    const handler = vi.fn();
    pad.on('expire', handler);
    pad.set('k', 'v', { ttl: 10 });
    now = 10;
    pad.get('k');
    expect(handler).toHaveBeenCalledOnce();
    expect(handler.mock.calls[0][0].key).toBe('k');
  });

  it('unsubscribe stops future event delivery', () => {
    const pad = createScratchpad();
    const handler = vi.fn();
    const unsub = pad.on('set', handler);
    unsub();
    pad.set('k', 'v');
    expect(handler).not.toHaveBeenCalled();
  });

  it('clear event fires with correct count', () => {
    const pad = createScratchpad();
    const handler = vi.fn();
    pad.on('clear', handler);
    pad.set('a', 1);
    pad.set('b', 2);
    pad.clear();
    expect(handler).toHaveBeenCalledOnce();
    expect(handler.mock.calls[0][0].count).toBe(2);
  });
});

describe('clear()', () => {
  it('removes all entries', () => {
    const pad = createScratchpad();
    pad.set('a', 1);
    pad.set('b', 2);
    pad.clear();
    expect(pad.keys()).toEqual([]);
  });
});

describe('stats()', () => {
  it('returns correct size', () => {
    const pad = createScratchpad();
    pad.set('a', 1);
    pad.set('b', 2);
    expect(pad.stats().size).toBe(2);
  });

  it('excludes expired entries from size', () => {
    let now = 0;
    const pad = createScratchpad({ now: () => now });
    pad.set('a', 1, { ttl: 10 });
    pad.set('b', 2);
    now = 10;
    expect(pad.stats().size).toBe(1);
  });

  it('reports namespaces correctly', () => {
    const pad = createScratchpad();
    pad.set('ctx:item', 1);
    pad.set('mem:item', 2);
    pad.set('nonamespace', 3);
    const st = pad.stats();
    expect(st.namespaces.sort()).toEqual(['ctx', 'mem']);
    expect(st.namespaceCount).toBe(2);
  });

  it('counts tags correctly', () => {
    const pad = createScratchpad();
    pad.set('a', 1, { tags: ['t1', 't2'] });
    pad.set('b', 2, { tags: ['t1'] });
    const st = pad.stats();
    expect(st.tagCounts['t1']).toBe(2);
    expect(st.tagCounts['t2']).toBe(1);
  });

  it('rawSize includes expired entries not yet swept', () => {
    let now = 0;
    const pad = createScratchpad({ now: () => now });
    pad.set('a', 1, { ttl: 10 });
    now = 10; // expired but still in store until accessed
    // size should exclude expired, rawSize includes them
    expect(pad.stats().rawSize).toBe(1);
    expect(pad.stats().size).toBe(0);
  });
});

describe('sweep', () => {
  it('active sweep removes expired entries and emits expire', async () => {
    vi.useFakeTimers();
    let now = 0;
    const pad = createScratchpad({ now: () => now, sweepIntervalMs: 100 });
    const handler = vi.fn();
    pad.on('expire', handler);

    pad.set('a', 1, { ttl: 50 });
    now = 100; // entry is expired

    vi.advanceTimersByTime(100); // trigger sweep

    expect(handler).toHaveBeenCalledOnce();
    expect(handler.mock.calls[0][0].key).toBe('a');

    await pad.destroy();
    vi.useRealTimers();
  });
});

describe('persistence adapter', () => {
  it('save() calls adapter.save with snapshot', async () => {
    const saveFn = vi.fn().mockResolvedValue(undefined);
    const loadFn = vi.fn().mockResolvedValue(null);
    const pad = createScratchpad({
      persistence: { save: saveFn, load: loadFn },
    });
    pad.set('k', 'v');
    await pad.save();
    expect(saveFn).toHaveBeenCalledOnce();
    const snap = saveFn.mock.calls[0][0];
    expect(snap.entries['k'].value).toBe('v');
  });

  it('load() calls adapter.load and restores entries', async () => {
    const snap = {
      entries: { loaded: { key: 'loaded', value: 42, createdAt: 0, updatedAt: 0, accessedAt: 0, ttl: null, slidingTtl: false, tags: [] } },
      timestamp: 0,
      version: 1 as const,
    };
    const saveFn = vi.fn().mockResolvedValue(undefined);
    const loadFn = vi.fn().mockResolvedValue(snap);
    const pad = createScratchpad({
      persistence: { save: saveFn, load: loadFn },
    });
    await pad.load();
    expect(pad.get('loaded')).toBe(42);
  });

  it('save()/load() are no-ops without persistence adapter', async () => {
    const pad = createScratchpad();
    await expect(pad.save()).resolves.toBeUndefined();
    await expect(pad.load()).resolves.toBeUndefined();
  });
});

describe('destroy()', () => {
  it('resolves successfully', async () => {
    const pad = createScratchpad();
    await expect(pad.destroy()).resolves.toBeUndefined();
  });
});
