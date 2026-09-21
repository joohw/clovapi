export interface CancellationTombstone {
  code: string;
  expiresAt: number;
}

export class CancellationTombstones {
  private readonly values = new Map<string, CancellationTombstone>();

  constructor(private readonly maximum = 1024) {}

  restore(id: string, tombstone: CancellationTombstone): void {
    if (id.length === 0 || id.length > 80 || typeof tombstone.code !== "string"
      || tombstone.code.length === 0 || tombstone.code.length > 80
      || !Number.isSafeInteger(tombstone.expiresAt)) return;
    this.values.set(id, tombstone);
  }

  remember(id: string, tombstone: CancellationTombstone, now: number): string[] {
    // If an expired entry with the same id was pruned, do not let persistence
    // cleanup race the replacement put for this new tombstone.
    const removed = this.prune(now).filter((removedId) => removedId !== id);
    this.values.delete(id);
    this.values.set(id, tombstone);
    while (this.values.size > this.maximum) {
      let candidate: string | null = null;
      let earliest = Number.POSITIVE_INFINITY;
      for (const [requestId, value] of this.values) {
        if (requestId !== id && value.expiresAt < earliest) {
          candidate = requestId;
          earliest = value.expiresAt;
        }
      }
      if (!candidate) break;
      this.values.delete(candidate);
      removed.push(candidate);
    }
    return removed;
  }

  take(id: string, now: number): { tombstone: CancellationTombstone | null; removed: string[] } {
    const value = this.values.get(id);
    if (!value) return { tombstone: null, removed: [] };
    this.values.delete(id);
    return { tombstone: value.expiresAt > now ? value : null, removed: [id] };
  }

  prune(now: number): string[] {
    const removed: string[] = [];
    for (const [id, value] of this.values) {
      if (value.expiresAt <= now) {
        this.values.delete(id);
        removed.push(id);
      }
    }
    while (this.values.size > this.maximum) {
      let candidate: string | null = null;
      let earliest = Number.POSITIVE_INFINITY;
      for (const [id, value] of this.values) {
        if (value.expiresAt < earliest) {
          candidate = id;
          earliest = value.expiresAt;
        }
      }
      if (!candidate) break;
      this.values.delete(candidate);
      removed.push(candidate);
    }
    return removed;
  }

  nextExpiration(): number | null {
    let earliest = Number.POSITIVE_INFINITY;
    for (const value of this.values.values()) earliest = Math.min(earliest, value.expiresAt);
    return Number.isFinite(earliest) ? earliest : null;
  }

  entries(): IterableIterator<[string, CancellationTombstone]> {
    return this.values.entries();
  }
}
