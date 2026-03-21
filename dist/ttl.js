"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isExpired = isExpired;
exports.expiresAt = expiresAt;
function isExpired(entry, now) {
    if (entry.ttl === null || entry.ttl === undefined)
        return false;
    const base = entry.slidingTtl ? entry.accessedAt : entry.createdAt;
    return now >= base + entry.ttl;
}
function expiresAt(entry) {
    if (entry.ttl === null || entry.ttl === undefined)
        return null;
    const base = entry.slidingTtl ? entry.accessedAt : entry.createdAt;
    return base + entry.ttl;
}
//# sourceMappingURL=ttl.js.map