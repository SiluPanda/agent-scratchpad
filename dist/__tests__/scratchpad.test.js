"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const scratchpad_js_1 = require("../scratchpad.js");
const errors_js_1 = require("../errors.js");
(0, vitest_1.describe)('basic set/get', () => {
    (0, vitest_1.it)('stores and retrieves a value', () => {
        const pad = (0, scratchpad_js_1.createScratchpad)();
        pad.set('foo', 'bar');
        (0, vitest_1.expect)(pad.get('foo')).toBe('bar');
    });
    (0, vitest_1.it)('returns undefined for missing key', () => {
        const pad = (0, scratchpad_js_1.createScratchpad)();
        (0, vitest_1.expect)(pad.get('nope')).toBeUndefined();
    });
    (0, vitest_1.it)('overwrites an existing key', () => {
        const pad = (0, scratchpad_js_1.createScratchpad)();
        pad.set('x', 1);
        pad.set('x', 2);
        (0, vitest_1.expect)(pad.get('x')).toBe(2);
    });
    (0, vitest_1.it)('has() returns true for existing key', () => {
        const pad = (0, scratchpad_js_1.createScratchpad)();
        pad.set('a', 1);
        (0, vitest_1.expect)(pad.has('a')).toBe(true);
    });
    (0, vitest_1.it)('has() returns false for missing key', () => {
        const pad = (0, scratchpad_js_1.createScratchpad)();
        (0, vitest_1.expect)(pad.has('z')).toBe(false);
    });
    (0, vitest_1.it)('delete() removes key and returns true', () => {
        const pad = (0, scratchpad_js_1.createScratchpad)();
        pad.set('d', 9);
        (0, vitest_1.expect)(pad.delete('d')).toBe(true);
        (0, vitest_1.expect)(pad.has('d')).toBe(false);
    });
    (0, vitest_1.it)('delete() returns false for missing key', () => {
        const pad = (0, scratchpad_js_1.createScratchpad)();
        (0, vitest_1.expect)(pad.delete('nope')).toBe(false);
    });
});
(0, vitest_1.describe)('TTL expiry', () => {
    (0, vitest_1.it)('entry expires after ttl ms', () => {
        let now = 0;
        const pad = (0, scratchpad_js_1.createScratchpad)({ now: () => now });
        pad.set('k', 'v', { ttl: 100 });
        (0, vitest_1.expect)(pad.get('k')).toBe('v');
        now = 100; // exactly at expiry
        (0, vitest_1.expect)(pad.get('k')).toBeUndefined();
    });
    (0, vitest_1.it)('entry is still valid before ttl', () => {
        let now = 0;
        const pad = (0, scratchpad_js_1.createScratchpad)({ now: () => now });
        pad.set('k', 'v', { ttl: 100 });
        now = 99;
        (0, vitest_1.expect)(pad.get('k')).toBe('v');
    });
    (0, vitest_1.it)('defaultTtl applied when no per-entry ttl given', () => {
        let now = 0;
        const pad = (0, scratchpad_js_1.createScratchpad)({ defaultTtl: 50, now: () => now });
        pad.set('k', 'v');
        now = 50;
        (0, vitest_1.expect)(pad.get('k')).toBeUndefined();
    });
    (0, vitest_1.it)('null ttl means no expiry', () => {
        let now = 0;
        const pad = (0, scratchpad_js_1.createScratchpad)({ now: () => now });
        pad.set('k', 'v', { ttl: null });
        now = 999999;
        (0, vitest_1.expect)(pad.get('k')).toBe('v');
    });
});
(0, vitest_1.describe)('sliding TTL', () => {
    (0, vitest_1.it)('accessing resets expiry window', () => {
        let now = 0;
        const pad = (0, scratchpad_js_1.createScratchpad)({ now: () => now });
        pad.set('k', 'v', { ttl: 100, slidingTtl: true });
        now = 80;
        (0, vitest_1.expect)(pad.get('k')).toBe('v'); // accessedAt updated to 80
        now = 150; // 70ms after last access, still within 100ms window
        (0, vitest_1.expect)(pad.get('k')).toBe('v');
        now = 251; // 101ms after last access (150), expired
        (0, vitest_1.expect)(pad.get('k')).toBeUndefined();
    });
    (0, vitest_1.it)('without sliding TTL, expiry is based on createdAt', () => {
        let now = 0;
        const pad = (0, scratchpad_js_1.createScratchpad)({ now: () => now });
        pad.set('k', 'v', { ttl: 100, slidingTtl: false });
        now = 80;
        pad.get('k'); // access it
        now = 100; // 100ms from createdAt=0, expired
        (0, vitest_1.expect)(pad.get('k')).toBeUndefined();
    });
});
(0, vitest_1.describe)('tags', () => {
    (0, vitest_1.it)('findByTag returns entries with the matching tag', () => {
        const pad = (0, scratchpad_js_1.createScratchpad)();
        pad.set('a', 1, { tags: ['alpha', 'shared'] });
        pad.set('b', 2, { tags: ['beta'] });
        pad.set('c', 3, { tags: ['shared'] });
        const shared = pad.findByTag('shared');
        (0, vitest_1.expect)(shared.map((e) => e.key).sort()).toEqual(['a', 'c']);
    });
    (0, vitest_1.it)('findByTag returns empty array when no match', () => {
        const pad = (0, scratchpad_js_1.createScratchpad)();
        pad.set('a', 1, { tags: ['alpha'] });
        (0, vitest_1.expect)(pad.findByTag('nope')).toEqual([]);
    });
    (0, vitest_1.it)('findByTag excludes expired entries', () => {
        let now = 0;
        const pad = (0, scratchpad_js_1.createScratchpad)({ now: () => now });
        pad.set('x', 10, { tags: ['t'], ttl: 50 });
        now = 50;
        (0, vitest_1.expect)(pad.findByTag('t')).toEqual([]);
    });
});
(0, vitest_1.describe)('namespace', () => {
    (0, vitest_1.it)('scoped set/get uses prefixed keys', () => {
        const pad = (0, scratchpad_js_1.createScratchpad)();
        const ns = pad.namespace('ctx');
        ns.set('item', 42);
        (0, vitest_1.expect)(ns.get('item')).toBe(42);
        // raw key in parent
        (0, vitest_1.expect)(pad.get('ctx:item')).toBe(42);
    });
    (0, vitest_1.it)('has() is scoped', () => {
        const pad = (0, scratchpad_js_1.createScratchpad)();
        const ns = pad.namespace('ns');
        ns.set('x', 1);
        (0, vitest_1.expect)(ns.has('x')).toBe(true);
        (0, vitest_1.expect)(ns.has('y')).toBe(false);
    });
    (0, vitest_1.it)('delete() is scoped', () => {
        const pad = (0, scratchpad_js_1.createScratchpad)();
        const ns = pad.namespace('ns');
        ns.set('x', 1);
        ns.delete('x');
        (0, vitest_1.expect)(ns.has('x')).toBe(false);
    });
    (0, vitest_1.it)('keys() strips namespace prefix', () => {
        const pad = (0, scratchpad_js_1.createScratchpad)();
        const ns = pad.namespace('ns');
        ns.set('a', 1);
        ns.set('b', 2);
        (0, vitest_1.expect)(ns.keys().sort()).toEqual(['a', 'b']);
    });
    (0, vitest_1.it)('nested namespace composes prefixes', () => {
        const pad = (0, scratchpad_js_1.createScratchpad)();
        const ns = pad.namespace('a').namespace('b');
        ns.set('key', 'val');
        (0, vitest_1.expect)(pad.get('a:b:key')).toBe('val');
    });
    (0, vitest_1.it)('parent namespace does not leak into child namespace keys', () => {
        const pad = (0, scratchpad_js_1.createScratchpad)();
        pad.set('ns:x', 99);
        pad.set('other:y', 88);
        const ns = pad.namespace('ns');
        (0, vitest_1.expect)(ns.keys()).toEqual(['x']);
    });
});
(0, vitest_1.describe)('snapshot/restore roundtrip', () => {
    (0, vitest_1.it)('snapshot captures current entries', () => {
        const pad = (0, scratchpad_js_1.createScratchpad)();
        pad.set('a', 1);
        pad.set('b', 2);
        const snap = pad.snapshot();
        (0, vitest_1.expect)(snap.version).toBe(1);
        (0, vitest_1.expect)(Object.keys(snap.entries).sort()).toEqual(['a', 'b']);
    });
    (0, vitest_1.it)('restore repopulates store from snapshot', () => {
        const pad = (0, scratchpad_js_1.createScratchpad)();
        pad.set('x', 10);
        const snap = pad.snapshot();
        const pad2 = (0, scratchpad_js_1.createScratchpad)();
        pad2.restore(snap);
        (0, vitest_1.expect)(pad2.get('x')).toBe(10);
    });
    (0, vitest_1.it)('fromSnapshot creates pad with entries already loaded', () => {
        const pad = (0, scratchpad_js_1.createScratchpad)();
        pad.set('hello', 'world');
        const snap = pad.snapshot();
        const pad2 = (0, scratchpad_js_1.fromSnapshot)(snap);
        (0, vitest_1.expect)(pad2.get('hello')).toBe('world');
    });
    (0, vitest_1.it)('restore throws ScratchpadVersionError for unknown version', () => {
        const pad = (0, scratchpad_js_1.createScratchpad)();
        (0, vitest_1.expect)(() => pad.restore({ entries: {}, timestamp: 0, version: 99 })).toThrow(errors_js_1.ScratchpadVersionError);
    });
    (0, vitest_1.it)('serialize() returns same shape as snapshot()', () => {
        const pad = (0, scratchpad_js_1.createScratchpad)();
        pad.set('k', 'v');
        const s1 = pad.snapshot();
        const s2 = pad.serialize();
        (0, vitest_1.expect)(Object.keys(s1.entries)).toEqual(Object.keys(s2.entries));
        (0, vitest_1.expect)(s1.version).toBe(s2.version);
    });
});
(0, vitest_1.describe)('toContext formats', () => {
    (0, vitest_1.it)('kv format (default)', () => {
        const pad = (0, scratchpad_js_1.createScratchpad)();
        pad.set('name', 'Alice');
        pad.set('role', 'admin');
        const ctx = pad.toContext();
        (0, vitest_1.expect)(ctx).toContain('name: Alice');
        (0, vitest_1.expect)(ctx).toContain('role: admin');
    });
    (0, vitest_1.it)('json format', () => {
        const pad = (0, scratchpad_js_1.createScratchpad)();
        pad.set('x', 1);
        const ctx = pad.toContext({ format: 'json' });
        const parsed = JSON.parse(ctx);
        (0, vitest_1.expect)(parsed['x']).toBe(1);
    });
    (0, vitest_1.it)('markdown format', () => {
        const pad = (0, scratchpad_js_1.createScratchpad)();
        pad.set('title', 'Hello');
        const ctx = pad.toContext({ format: 'markdown' });
        (0, vitest_1.expect)(ctx).toContain('## title');
        (0, vitest_1.expect)(ctx).toContain('Hello');
    });
    (0, vitest_1.it)('xml format', () => {
        const pad = (0, scratchpad_js_1.createScratchpad)();
        pad.set('greeting', 'hi');
        const ctx = pad.toContext({ format: 'xml' });
        (0, vitest_1.expect)(ctx).toContain('<entry key="greeting">hi</entry>');
    });
    (0, vitest_1.it)('filterTags only includes matching entries', () => {
        const pad = (0, scratchpad_js_1.createScratchpad)();
        pad.set('a', 1, { tags: ['important'] });
        pad.set('b', 2, { tags: ['other'] });
        const ctx = pad.toContext({ format: 'kv', filterTags: ['important'] });
        (0, vitest_1.expect)(ctx).toContain('a: 1');
        (0, vitest_1.expect)(ctx).not.toContain('b: 2');
    });
    (0, vitest_1.it)('filterNamespace only includes entries with matching prefix', () => {
        const pad = (0, scratchpad_js_1.createScratchpad)();
        pad.set('ctx:a', 1);
        pad.set('other:b', 2);
        const ctx = pad.toContext({ format: 'kv', filterNamespace: 'ctx' });
        (0, vitest_1.expect)(ctx).toContain('ctx:a: 1');
        (0, vitest_1.expect)(ctx).not.toContain('other:b');
    });
    (0, vitest_1.it)('header is prepended', () => {
        const pad = (0, scratchpad_js_1.createScratchpad)();
        pad.set('k', 'v');
        const ctx = pad.toContext({ header: '# Context' });
        (0, vitest_1.expect)(ctx.startsWith('# Context')).toBe(true);
    });
    (0, vitest_1.it)('maxTokens truncates output', () => {
        const pad = (0, scratchpad_js_1.createScratchpad)();
        pad.set('long_key', 'a'.repeat(200));
        const ctx = pad.toContext({ maxTokens: 10 });
        (0, vitest_1.expect)(ctx.length).toBeLessThanOrEqual(10);
    });
});
(0, vitest_1.describe)('events', () => {
    (0, vitest_1.it)('set event fires with correct data on new key', () => {
        const pad = (0, scratchpad_js_1.createScratchpad)();
        const handler = vitest_1.vi.fn();
        pad.on('set', handler);
        pad.set('k', 'v');
        (0, vitest_1.expect)(handler).toHaveBeenCalledOnce();
        const data = handler.mock.calls[0][0];
        (0, vitest_1.expect)(data.key).toBe('k');
        (0, vitest_1.expect)(data.isUpdate).toBe(false);
        (0, vitest_1.expect)(data.entry.value).toBe('v');
    });
    (0, vitest_1.it)('set event fires with isUpdate=true on overwrite', () => {
        const pad = (0, scratchpad_js_1.createScratchpad)();
        const handler = vitest_1.vi.fn();
        pad.set('k', 1);
        pad.on('set', handler);
        pad.set('k', 2);
        const data = handler.mock.calls[0][0];
        (0, vitest_1.expect)(data.isUpdate).toBe(true);
    });
    (0, vitest_1.it)('delete event fires when key is removed', () => {
        const pad = (0, scratchpad_js_1.createScratchpad)();
        const handler = vitest_1.vi.fn();
        pad.on('delete', handler);
        pad.set('k', 'v');
        pad.delete('k');
        (0, vitest_1.expect)(handler).toHaveBeenCalledOnce();
        (0, vitest_1.expect)(handler.mock.calls[0][0].key).toBe('k');
    });
    (0, vitest_1.it)('expire event fires on lazy expiry via get()', () => {
        let now = 0;
        const pad = (0, scratchpad_js_1.createScratchpad)({ now: () => now });
        const handler = vitest_1.vi.fn();
        pad.on('expire', handler);
        pad.set('k', 'v', { ttl: 10 });
        now = 10;
        pad.get('k');
        (0, vitest_1.expect)(handler).toHaveBeenCalledOnce();
        (0, vitest_1.expect)(handler.mock.calls[0][0].key).toBe('k');
    });
    (0, vitest_1.it)('unsubscribe stops future event delivery', () => {
        const pad = (0, scratchpad_js_1.createScratchpad)();
        const handler = vitest_1.vi.fn();
        const unsub = pad.on('set', handler);
        unsub();
        pad.set('k', 'v');
        (0, vitest_1.expect)(handler).not.toHaveBeenCalled();
    });
    (0, vitest_1.it)('clear event fires with correct count', () => {
        const pad = (0, scratchpad_js_1.createScratchpad)();
        const handler = vitest_1.vi.fn();
        pad.on('clear', handler);
        pad.set('a', 1);
        pad.set('b', 2);
        pad.clear();
        (0, vitest_1.expect)(handler).toHaveBeenCalledOnce();
        (0, vitest_1.expect)(handler.mock.calls[0][0].count).toBe(2);
    });
});
(0, vitest_1.describe)('clear()', () => {
    (0, vitest_1.it)('removes all entries', () => {
        const pad = (0, scratchpad_js_1.createScratchpad)();
        pad.set('a', 1);
        pad.set('b', 2);
        pad.clear();
        (0, vitest_1.expect)(pad.keys()).toEqual([]);
    });
});
(0, vitest_1.describe)('stats()', () => {
    (0, vitest_1.it)('returns correct size', () => {
        const pad = (0, scratchpad_js_1.createScratchpad)();
        pad.set('a', 1);
        pad.set('b', 2);
        (0, vitest_1.expect)(pad.stats().size).toBe(2);
    });
    (0, vitest_1.it)('excludes expired entries from size', () => {
        let now = 0;
        const pad = (0, scratchpad_js_1.createScratchpad)({ now: () => now });
        pad.set('a', 1, { ttl: 10 });
        pad.set('b', 2);
        now = 10;
        (0, vitest_1.expect)(pad.stats().size).toBe(1);
    });
    (0, vitest_1.it)('reports namespaces correctly', () => {
        const pad = (0, scratchpad_js_1.createScratchpad)();
        pad.set('ctx:item', 1);
        pad.set('mem:item', 2);
        pad.set('nonamespace', 3);
        const st = pad.stats();
        (0, vitest_1.expect)(st.namespaces.sort()).toEqual(['ctx', 'mem']);
        (0, vitest_1.expect)(st.namespaceCount).toBe(2);
    });
    (0, vitest_1.it)('counts tags correctly', () => {
        const pad = (0, scratchpad_js_1.createScratchpad)();
        pad.set('a', 1, { tags: ['t1', 't2'] });
        pad.set('b', 2, { tags: ['t1'] });
        const st = pad.stats();
        (0, vitest_1.expect)(st.tagCounts['t1']).toBe(2);
        (0, vitest_1.expect)(st.tagCounts['t2']).toBe(1);
    });
    (0, vitest_1.it)('rawSize includes expired entries not yet swept', () => {
        let now = 0;
        const pad = (0, scratchpad_js_1.createScratchpad)({ now: () => now });
        pad.set('a', 1, { ttl: 10 });
        now = 10; // expired but still in store until accessed
        // size should exclude expired, rawSize includes them
        (0, vitest_1.expect)(pad.stats().rawSize).toBe(1);
        (0, vitest_1.expect)(pad.stats().size).toBe(0);
    });
});
(0, vitest_1.describe)('sweep', () => {
    (0, vitest_1.it)('active sweep removes expired entries and emits expire', async () => {
        vitest_1.vi.useFakeTimers();
        let now = 0;
        const pad = (0, scratchpad_js_1.createScratchpad)({ now: () => now, sweepIntervalMs: 100 });
        const handler = vitest_1.vi.fn();
        pad.on('expire', handler);
        pad.set('a', 1, { ttl: 50 });
        now = 100; // entry is expired
        vitest_1.vi.advanceTimersByTime(100); // trigger sweep
        (0, vitest_1.expect)(handler).toHaveBeenCalledOnce();
        (0, vitest_1.expect)(handler.mock.calls[0][0].key).toBe('a');
        await pad.destroy();
        vitest_1.vi.useRealTimers();
    });
});
(0, vitest_1.describe)('persistence adapter', () => {
    (0, vitest_1.it)('save() calls adapter.save with snapshot', async () => {
        const saveFn = vitest_1.vi.fn().mockResolvedValue(undefined);
        const loadFn = vitest_1.vi.fn().mockResolvedValue(null);
        const pad = (0, scratchpad_js_1.createScratchpad)({
            persistence: { save: saveFn, load: loadFn },
        });
        pad.set('k', 'v');
        await pad.save();
        (0, vitest_1.expect)(saveFn).toHaveBeenCalledOnce();
        const snap = saveFn.mock.calls[0][0];
        (0, vitest_1.expect)(snap.entries['k'].value).toBe('v');
    });
    (0, vitest_1.it)('load() calls adapter.load and restores entries', async () => {
        const snap = {
            entries: { loaded: { key: 'loaded', value: 42, createdAt: 0, updatedAt: 0, accessedAt: 0, ttl: null, slidingTtl: false, tags: [] } },
            timestamp: 0,
            version: 1,
        };
        const saveFn = vitest_1.vi.fn().mockResolvedValue(undefined);
        const loadFn = vitest_1.vi.fn().mockResolvedValue(snap);
        const pad = (0, scratchpad_js_1.createScratchpad)({
            persistence: { save: saveFn, load: loadFn },
        });
        await pad.load();
        (0, vitest_1.expect)(pad.get('loaded')).toBe(42);
    });
    (0, vitest_1.it)('save()/load() are no-ops without persistence adapter', async () => {
        const pad = (0, scratchpad_js_1.createScratchpad)();
        await (0, vitest_1.expect)(pad.save()).resolves.toBeUndefined();
        await (0, vitest_1.expect)(pad.load()).resolves.toBeUndefined();
    });
});
(0, vitest_1.describe)('destroy()', () => {
    (0, vitest_1.it)('resolves successfully', async () => {
        const pad = (0, scratchpad_js_1.createScratchpad)();
        await (0, vitest_1.expect)(pad.destroy()).resolves.toBeUndefined();
    });
});
//# sourceMappingURL=scratchpad.test.js.map