"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createScratchpad = createScratchpad;
exports.fromSnapshot = fromSnapshot;
const ttl_js_1 = require("./ttl.js");
const context_js_1 = require("./context.js");
const errors_js_1 = require("./errors.js");
function createScratchpad(options) {
    const store = new Map();
    const listeners = new Map();
    const nowFn = options?.now ?? (() => Date.now());
    const persistence = options?.persistence;
    let sweepTimer = null;
    if (options?.sweepIntervalMs && options.sweepIntervalMs > 0) {
        sweepTimer = setInterval(() => {
            const n = nowFn();
            for (const [key, entry] of store) {
                if ((0, ttl_js_1.isExpired)(entry, n)) {
                    store.delete(key);
                    emit('expire', { key, entry });
                }
            }
        }, options.sweepIntervalMs);
        if (sweepTimer.unref)
            sweepTimer.unref();
    }
    function emit(event, data) {
        const handlers = listeners.get(event);
        if (handlers) {
            for (const h of handlers) {
                try {
                    h(data);
                }
                catch { /* swallow handler errors */ }
            }
        }
    }
    function set(key, value, entryOptions) {
        const now = nowFn();
        // Lazy-expire any existing entry
        const existing = store.get(key);
        if (existing && (0, ttl_js_1.isExpired)(existing, now)) {
            store.delete(key);
            emit('expire', { key, entry: existing });
        }
        const isUpdate = store.has(key);
        const ttl = entryOptions?.ttl !== undefined ? entryOptions.ttl : (options?.defaultTtl ?? null);
        const slidingTtl = entryOptions?.slidingTtl !== undefined
            ? entryOptions.slidingTtl
            : (options?.defaultSlidingTtl ?? false);
        const tags = entryOptions?.tags ?? [];
        const entry = {
            key,
            value,
            createdAt: isUpdate ? (store.get(key).createdAt) : now,
            updatedAt: now,
            accessedAt: now,
            ttl,
            slidingTtl,
            tags,
        };
        store.set(key, entry);
        emit('set', { key, entry, isUpdate });
    }
    function get(key) {
        const entry = store.get(key);
        if (!entry)
            return undefined;
        const now = nowFn();
        if ((0, ttl_js_1.isExpired)(entry, now)) {
            store.delete(key);
            emit('expire', { key, entry });
            return undefined;
        }
        // Update accessedAt (and sliding TTL base)
        const updated = { ...entry, accessedAt: now };
        store.set(key, updated);
        return updated.value;
    }
    function has(key) {
        const entry = store.get(key);
        if (!entry)
            return false;
        const now = nowFn();
        if ((0, ttl_js_1.isExpired)(entry, now)) {
            store.delete(key);
            emit('expire', { key, entry });
            return false;
        }
        return true;
    }
    function del(key) {
        const entry = store.get(key);
        if (!entry)
            return false;
        store.delete(key);
        emit('delete', { key, entry });
        return true;
    }
    function clear() {
        const now = nowFn();
        let count = 0;
        for (const [, entry] of store) {
            if (!(0, ttl_js_1.isExpired)(entry, now))
                count++;
        }
        store.clear();
        emit('clear', { count });
    }
    function keys() {
        const now = nowFn();
        const result = [];
        for (const [key, entry] of store) {
            if (!(0, ttl_js_1.isExpired)(entry, now))
                result.push(key);
        }
        return result;
    }
    function entries() {
        const now = nowFn();
        const result = [];
        for (const [key, entry] of store) {
            if (!(0, ttl_js_1.isExpired)(entry, now))
                result.push([key, entry]);
        }
        return result;
    }
    function findByTag(tag) {
        const now = nowFn();
        const result = [];
        for (const [, entry] of store) {
            if (!(0, ttl_js_1.isExpired)(entry, now) && entry.tags.includes(tag))
                result.push(entry);
        }
        return result;
    }
    function namespace(name) {
        const prefix = `${name}:`;
        const ns = {
            set(key, value, entryOpts) {
                set(`${prefix}${key}`, value, entryOpts);
            },
            get(key) {
                return get(`${prefix}${key}`);
            },
            has(key) {
                return has(`${prefix}${key}`);
            },
            delete(key) {
                return del(`${prefix}${key}`);
            },
            clear() {
                for (const [k, entry] of store) {
                    if (k.startsWith(prefix)) {
                        store.delete(k);
                        emit('delete', { key: k, entry });
                    }
                }
            },
            keys() {
                const now = nowFn();
                const result = [];
                for (const [k, entry] of store) {
                    if (k.startsWith(prefix) && !(0, ttl_js_1.isExpired)(entry, now)) {
                        result.push(k.slice(prefix.length));
                    }
                }
                return result;
            },
            entries() {
                const now = nowFn();
                const result = [];
                for (const [k, entry] of store) {
                    if (k.startsWith(prefix) && !(0, ttl_js_1.isExpired)(entry, now)) {
                        result.push([k.slice(prefix.length), entry]);
                    }
                }
                return result;
            },
            findByTag(tag) {
                const now = nowFn();
                const result = [];
                for (const [k, entry] of store) {
                    if (k.startsWith(prefix) && !(0, ttl_js_1.isExpired)(entry, now) && entry.tags.includes(tag)) {
                        result.push(entry);
                    }
                }
                return result;
            },
            namespace(subName) {
                return namespace(`${name}:${subName}`);
            },
            snapshot() {
                return snapshot();
            },
            restore(snap) {
                return restore(snap);
            },
            toContext(opts) {
                return toContext(opts);
            },
            serialize() {
                return snapshot();
            },
            stats() {
                return stats();
            },
            on(event, handler) {
                return on(event, handler);
            },
            save() {
                return save();
            },
            load() {
                return load();
            },
            destroy() {
                return destroy();
            },
        };
        return ns;
    }
    function snapshot() {
        const entriesObj = {};
        for (const [k, v] of store) {
            entriesObj[k] = v;
        }
        return { entries: entriesObj, timestamp: nowFn(), version: 1 };
    }
    function restore(snap) {
        if (snap.version !== 1) {
            throw new errors_js_1.ScratchpadVersionError(snap.version);
        }
        store.clear();
        for (const [k, v] of Object.entries(snap.entries)) {
            store.set(k, v);
        }
    }
    function toContext(opts) {
        const all = entries().map(([, e]) => e);
        return (0, context_js_1.toContext)(all, opts);
    }
    function stats() {
        const now = nowFn();
        const liveEntries = [];
        for (const [, entry] of store) {
            if (!(0, ttl_js_1.isExpired)(entry, now))
                liveEntries.push(entry);
        }
        const namespaceSet = new Set();
        for (const e of liveEntries) {
            const colonIdx = e.key.indexOf(':');
            if (colonIdx !== -1) {
                namespaceSet.add(e.key.slice(0, colonIdx));
            }
        }
        const namespaces = Array.from(namespaceSet);
        let entriesWithTtl = 0;
        const tagCounts = {};
        let oldestEntryAt = null;
        let newestEntryAt = null;
        for (const e of liveEntries) {
            if (e.ttl !== null && e.ttl !== undefined)
                entriesWithTtl++;
            for (const tag of e.tags) {
                tagCounts[tag] = (tagCounts[tag] ?? 0) + 1;
            }
            if (oldestEntryAt === null || e.createdAt < oldestEntryAt)
                oldestEntryAt = e.createdAt;
            if (newestEntryAt === null || e.createdAt > newestEntryAt)
                newestEntryAt = e.createdAt;
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
    function on(event, handler) {
        if (!listeners.has(event)) {
            listeners.set(event, new Set());
        }
        const set = listeners.get(event);
        set.add(handler);
        return () => {
            set.delete(handler);
        };
    }
    function save() {
        if (!persistence)
            return Promise.resolve();
        return persistence.save(snapshot());
    }
    function load() {
        if (!persistence)
            return Promise.resolve();
        return persistence.load().then((snap) => {
            if (snap)
                restore(snap);
        });
    }
    function destroy() {
        if (sweepTimer !== null) {
            clearInterval(sweepTimer);
            sweepTimer = null;
        }
        return Promise.resolve();
    }
    const scratchpad = {
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
function fromSnapshot(snap, opts) {
    const pad = createScratchpad(opts);
    pad.restore(snap);
    return pad;
}
//# sourceMappingURL=scratchpad.js.map