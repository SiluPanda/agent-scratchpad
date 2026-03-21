import { ScratchpadEntry } from './types.js';

export function isExpired(entry: ScratchpadEntry, now: number): boolean {
  if (entry.ttl === null || entry.ttl === undefined) return false;
  const base = entry.slidingTtl ? entry.accessedAt : entry.createdAt;
  return now >= base + entry.ttl;
}

export function expiresAt(entry: ScratchpadEntry): number | null {
  if (entry.ttl === null || entry.ttl === undefined) return null;
  const base = entry.slidingTtl ? entry.accessedAt : entry.createdAt;
  return base + entry.ttl;
}
