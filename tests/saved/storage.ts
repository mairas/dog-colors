import type { Report } from '../../src/report/types.ts';
import type { SavedStorage } from '../../src/saved/store.ts';

/** A storage that forgets everything when the test ends; `failWrites` makes setItem throw as a full quota does. */
export class MemoryStorage implements SavedStorage {
  readonly items: Map<string, string>;
  failWrites = false;

  constructor(entries: Readonly<Record<string, string>> = {}) {
    this.items = new Map(Object.entries(entries));
  }

  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    if (this.failWrites) {
      throw new DOMException('quota exceeded', 'QuotaExceededError');
    }
    this.items.set(key, value);
  }

  removeItem(key: string): void {
    this.items.delete(key);
  }
}

/** A storage that refuses every call, as disabled storage can. */
export const refusing: SavedStorage = {
  getItem(): string | null {
    throw new DOMException('denied', 'SecurityError');
  },
  setItem(): void {
    throw new DOMException('denied', 'SecurityError');
  },
  removeItem(): void {
    throw new DOMException('denied', 'SecurityError');
  },
};

/** IDs id-1, id-2, … in order. */
export function sequentialIds(prefix = 'id'): () => string {
  let next = 0;
  return () => `${prefix}-${++next}`;
}

/** A synthetic kit hash: 64 lowercase hex characters, clear of the fixtures' all-zero placeholders. */
export const hash = (pair: string): string => pair.repeat(32);

const NO_TYRP1 = { basd: 0, bc: 0, bd: 0, be: 0, bh: 0, bs: 0 };

/** The report with TYRP1 bd 1 + bc 1, which asks the nose question. */
export const withNoseQuestion = (report: Report): Report => ({
  ...report,
  colour: { ...report.colour, TYRP1: { ...NO_TYRP1, bc: 1, bd: 1 } },
});
