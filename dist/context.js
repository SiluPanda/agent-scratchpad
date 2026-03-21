"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toContext = toContext;
function toContext(entries, options) {
    const format = options?.format ?? 'kv';
    const filterTags = options?.filterTags;
    const filterNamespace = options?.filterNamespace;
    const maxTokens = options?.maxTokens;
    const tokenCounter = options?.tokenCounter ?? ((text) => text.length);
    const header = options?.header;
    // Filter by tags
    let filtered = entries;
    if (filterTags && filterTags.length > 0) {
        filtered = filtered.filter((e) => e.tags.some((t) => filterTags.includes(t)));
    }
    // Filter by namespace
    if (filterNamespace) {
        const prefix = filterNamespace.endsWith(':') ? filterNamespace : `${filterNamespace}:`;
        filtered = filtered.filter((e) => e.key.startsWith(prefix));
    }
    let body;
    if (format === 'json') {
        const obj = {};
        for (const e of filtered) {
            obj[e.key] = e.value;
        }
        body = JSON.stringify(obj);
    }
    else if (format === 'markdown') {
        body = filtered
            .map((e) => `## ${e.key}\n${String(e.value)}`)
            .join('\n\n');
    }
    else if (format === 'xml') {
        body = filtered
            .map((e) => `<entry key="${e.key}">${String(e.value)}</entry>`)
            .join('\n');
    }
    else {
        // kv (default)
        body = filtered.map((e) => `${e.key}: ${String(e.value)}`).join('\n');
    }
    let result = header ? `${header}\n${body}` : body;
    // Truncate to maxTokens
    if (maxTokens !== undefined) {
        while (tokenCounter(result) > maxTokens && result.length > 0) {
            result = result.slice(0, result.length - 1);
        }
    }
    return result;
}
//# sourceMappingURL=context.js.map