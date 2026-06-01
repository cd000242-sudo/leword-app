export function stableHash(input: string): number {
  let hash = 2166136261;
  const text = String(input || '');
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function deterministicRange(key: string, min: number, max: number): number {
  const low = Math.ceil(Math.min(min, max));
  const high = Math.floor(Math.max(min, max));
  if (high <= low) return low;
  return low + (stableHash(key) % (high - low + 1));
}

export function deterministicRatio(key: string, min: number, max: number, precision = 4): number {
  const low = Math.min(min, max);
  const high = Math.max(min, max);
  if (high <= low) return low;
  const unit = stableHash(key) / 0xffffffff;
  const value = low + unit * (high - low);
  const scale = Math.pow(10, precision);
  return Math.round(value * scale) / scale;
}

export function deterministicPick<T>(items: readonly T[], key: string): T | undefined {
  if (!items.length) return undefined;
  return items[stableHash(key) % items.length];
}

export function deterministicShuffle<T>(items: readonly T[], key: string): T[] {
  return items
    .map((item, index) => ({
      item,
      sortKey: stableHash(`${key}:${index}:${String(item)}`),
    }))
    .sort((a, b) => a.sortKey - b.sortKey)
    .map(entry => entry.item);
}
