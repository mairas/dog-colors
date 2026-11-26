// The saved dogs, kept in one localStorage key as their parsed reports. While
// storage works, every change re-reads the key, changes one entry, writes it
// back and adopts what was written, so two tabs neither resurrect a deleted dog
// nor lose an added one. Once storage refuses, the tab's own list is the truth
// for the rest of the visit; deletes and Clear are still tried, since they only
// shrink what is stored.

import { resolveDog } from '../genetics/dog.ts';
import type { NoseAnswer } from '../genetics/questions.ts';
import type { Report } from '../report/types.ts';
import { READER_VERSION } from '../report/version.ts';
import { checkStored, STORED_VERSION, type CheckedEntry, type SavedDog, type StoredValue, type UsableDog } from './check.ts';

export const SAVED_DOGS_KEY = 'dog-colors:saved-dogs';

/** localStorage in the browser. */
export type SavedStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/**
 * working: changes are written. nothing-stored: storage cannot be read, or the
 * first write was refused. full: a write was refused with dogs stored.
 * out-of-date: a newer version of the page wrote the key, so nothing is written.
 */
export type StoreMode = 'working' | 'nothing-stored' | 'full' | 'out-of-date';

export interface SavedDogsOptions {
  /** Called for every access: even reading window.localStorage throws where storage is disabled. */
  readonly storage: () => SavedStorage;
  readonly newId?: () => string;
  /** The clock, in epoch milliseconds. */
  readonly now?: () => number;
  /** The locale names sort in; the user's by default. */
  readonly locale?: string;
}

/** What became of a matched dog's nose answer: none, or kept or dropped by whether the new reading still asks. */
export type NoseOutcome = 'none' | 'kept' | 'dropped';

export type AddOutcome =
  | { readonly kind: 'added'; readonly id: string }
  /** A current dog with the report's kit hash, read again. */
  | { readonly kind: 'updated'; readonly id: string; readonly nose: NoseOutcome }
  /** A stale or unusable dog with the report's kit hash, or the re-add's target, renewed in place. */
  | { readonly kind: 'replaced'; readonly id: string; readonly nose: NoseOutcome };

export interface Change {
  /** Listed dogs that another tab removed, or that storage no longer lets this page read. */
  readonly gone: readonly string[];
}

export interface AddResult extends Change {
  readonly outcome: AddOutcome;
}

/** A listed dog with the JSON it is stored as: what a delete returns, for undo. */
export interface StoredDog extends CheckedEntry {
  readonly dog: SavedDog;
}

export interface DeleteResult extends Change {
  readonly deleted: StoredDog | null;
}

export interface SavedDogs {
  mode(): StoreMode;
  /** Every listed dog, sorted by name in the locale's order, unnamed last, ties by time first saved. */
  dogs(): readonly SavedDog[];
  dog(id: string): SavedDog | undefined;
  /**
   * Saves a report read now: updates the first saved dog with its kit hash, or
   * adds a new dog. A re-add from a stale or unusable dog names it as the
   * target, which is replaced when the kit hashes match or either is missing.
   */
  add(report: Report, target?: string): AddResult;
  setNose(id: string, nose: NoseAnswer | null): Change;
  remove(id: string): DeleteResult;
  /** Undo: an ordinary add of the deleted dog, which comes back as it was stored when nothing matches it. */
  restore(deleted: StoredDog): AddResult;
  /** Removes the key, every entry included. */
  clear(): void;
}

/** A report to save, with the reader version that read it and a nose answer to carry. */
interface Reading {
  readonly report: Report;
  readonly readerVersion: number;
  readonly nose: NoseAnswer | null;
}

type Patched<T> = { readonly next: readonly CheckedEntry[]; readonly result: T };

const HEX = 16;
const ID_BYTES = 16;

function randomId(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(ID_BYTES)), (byte) => byte.toString(HEX).padStart(2, '0')).join('');
}

function asksNose(report: Report): boolean {
  try {
    return resolveDog(report).questions.some((question) => question.id === 'nose');
  } catch {
    // Stored data the genetics reject asks nothing; the page shows such a dog as unusable.
    return false;
  }
}

function storedDog(id: string, readerVersion: number, savedAt: number, nose: NoseAnswer | null, report: Report): StoredDog {
  const dog: UsableDog = {
    id,
    status: readerVersion === READER_VERSION ? 'current' : 'stale',
    readerVersion,
    savedAt,
    name: report.name,
    sex: report.sex,
    kitIdHash: report.kitIdHash,
    nose,
    report,
  };
  return { json: JSON.stringify({ id, readerVersion, savedAt, nose, report }), dog };
}

const serialise = (entries: readonly CheckedEntry[]): string =>
  `{"version":${STORED_VERSION},"dogs":[${entries.map((entry) => entry.json).join(',')}]}`;

const listed = (entries: readonly CheckedEntry[]): SavedDog[] => entries.flatMap((entry) => (entry.dog === null ? [] : [entry.dog]));

/** The index of the first saved listed entry with the kit hash, or -1. */
function firstWithHash(entries: readonly CheckedEntry[], kitIdHash: string): number {
  let found = -1;
  let foundSavedAt = Number.POSITIVE_INFINITY;
  entries.forEach(({ dog }, index) => {
    if (dog !== null && dog.kitIdHash === kitIdHash && (found < 0 || dog.savedAt < foundSavedAt)) {
      found = index;
      foundSavedAt = dog.savedAt;
    }
  });
  return found;
}

export function openSavedDogs(options: SavedDogsOptions): SavedDogs {
  const newId = options.newId ?? randomId;
  const now = options.now ?? Date.now;
  const collator = new Intl.Collator(options.locale, { sensitivity: 'base' });
  let mode: StoreMode = 'working';

  let entries: readonly CheckedEntry[] = [];
  let sorted: readonly SavedDog[] = [];
  let byId = new Map<string, SavedDog>();

  const order = (first: SavedDog, second: SavedDog): number => {
    if (first.name === null || second.name === null) {
      if (first.name !== second.name) {
        return first.name === null ? 1 : -1;
      }
    } else {
      const byName = collator.compare(first.name, second.name);
      if (byName !== 0) {
        return byName;
      }
    }
    return first.savedAt < second.savedAt ? -1 : first.savedAt > second.savedAt ? 1 : 0;
  };

  /** Takes the entries as the tab's own, keeping the objects of unchanged ones, and returns the listed IDs that went. */
  function adopt(next: readonly CheckedEntry[]): string[] {
    const previous = new Map(entries.map((entry) => [entry.json, entry]));
    const kept = next.map((entry) => previous.get(entry.json) ?? entry);
    const ids = new Set(listed(kept).map((dog) => dog.id));
    const gone = listed(entries)
      .map((dog) => dog.id)
      .filter((id) => !ids.has(id));
    entries = kept;
    sorted = listed(kept).sort(order);
    byId = new Map(sorted.map((dog) => [dog.id, dog]));
    return gone;
  }

  /** Saves the reading over its target or the first saved dog with its kit hash, or as the fresh entry. */
  function patchAdd(
    current: readonly CheckedEntry[],
    reading: Reading,
    target: string | undefined,
    fresh: () => StoredDog,
  ): Patched<{ outcome: AddOutcome }> {
    const { report } = reading;
    const targetIndex = target === undefined ? -1 : current.findIndex((entry) => entry.dog?.id === target);
    const targetHash = current[targetIndex]?.dog?.kitIdHash;
    const replacesTarget = targetIndex >= 0 && (targetHash === null || report.kitIdHash === null || targetHash === report.kitIdHash);
    const index = replacesTarget ? targetIndex : report.kitIdHash === null ? -1 : firstWithHash(current, report.kitIdHash);
    const matched = current[index]?.dog;
    if (matched === undefined || matched === null) {
      const entry = fresh();
      return { next: [...current, entry], result: { outcome: { kind: 'added', id: entry.dog.id } } };
    }
    const answer = reading.nose ?? matched.nose;
    const kept = answer !== null && asksNose(report);
    const nose: NoseOutcome = answer === null ? 'none' : kept ? 'kept' : 'dropped';
    const savedAt = Number.isFinite(matched.savedAt) ? matched.savedAt : now();
    const renewed = storedDog(matched.id, reading.readerVersion, savedAt, kept ? answer : null, report);
    return {
      next: current.map((entry, at) => (at === index ? renewed : entry)),
      result: { outcome: { kind: matched.status === 'current' ? 'updated' : 'replaced', id: matched.id, nose } },
    };
  }

  /** The stored value, checked; null when storage cannot be read. */
  function read(): StoredValue | null {
    try {
      return checkStored(options.storage().getItem(SAVED_DOGS_KEY));
    } catch {
      return null;
    }
  }

  function write(next: readonly CheckedEntry[]): boolean {
    try {
      options.storage().setItem(SAVED_DOGS_KEY, serialise(next));
      return true;
    } catch {
      return false;
    }
  }

  const memoryMode = (stored: readonly CheckedEntry[]): StoreMode => (listed(stored).length > 0 ? 'full' : 'nothing-stored');

  /**
   * Applies the patch to the stored list and adopts it while storage works,
   * otherwise to the tab's own list. A patch that only removes entries
   * (`shrinks`) is also tried against storage in memory mode.
   */
  function change<T>(patch: (current: readonly CheckedEntry[]) => Patched<T>, shrinks = false): T & Change {
    if (mode === 'working') {
      const current = read();
      if (current === null) {
        mode = memoryMode(entries);
      } else if (current.kind === 'newer') {
        mode = 'out-of-date';
      } else {
        const { next, result } = patch(current.entries);
        if (!write(next)) {
          mode = memoryMode(current.entries);
        }
        return { ...result, gone: adopt(next) };
      }
    } else if (shrinks && mode !== 'out-of-date') {
      const current = read();
      if (current?.kind === 'newer') {
        mode = 'out-of-date';
      } else if (current !== null) {
        const { next } = patch(current.entries);
        if (next.length < current.entries.length) {
          write(next);
        }
      }
    }
    const { next, result } = patch(entries);
    adopt(next);
    return { ...result, gone: [] };
  }

  const loaded = read();
  if (loaded === null) {
    mode = 'nothing-stored';
  } else if (loaded.kind === 'newer') {
    mode = 'out-of-date';
  } else {
    adopt(loaded.entries);
  }

  return {
    mode: () => mode,
    dogs: () => sorted,
    dog: (id) => byId.get(id),

    add(report, target) {
      return change((current) =>
        patchAdd(current, { report, readerVersion: READER_VERSION, nose: null }, target, () =>
          storedDog(newId(), READER_VERSION, now(), null, report),
        ),
      );
    },

    setNose(id, nose) {
      return change((current) => ({
        next: current.map((entry) => {
          const dog = entry.dog;
          return dog === null || dog.id !== id || dog.status === 'unusable'
            ? entry
            : storedDog(dog.id, dog.readerVersion, dog.savedAt, nose, dog.report);
        }),
        result: {},
      }));
    },

    remove(id) {
      const dog = byId.get(id);
      const json = entries.find((entry) => entry.dog === dog)?.json;
      if (dog === undefined || json === undefined) {
        return { deleted: null, gone: [] };
      }
      const { gone } = change((current) => ({ next: current.filter((entry) => entry.dog?.id !== id), result: {} }), true);
      return { deleted: { dog, json }, gone: gone.filter((other) => other !== id) };
    },

    restore(deleted) {
      const { dog } = deleted;
      return change((current): Patched<{ outcome: AddOutcome }> => {
        const added = { next: [...current, deleted], result: { outcome: { kind: 'added', id: dog.id } } } as const;
        if (current.some((entry) => entry.dog?.id === dog.id)) {
          return { ...added, next: current };
        }
        return dog.status === 'unusable'
          ? added
          : patchAdd(current, { report: dog.report, readerVersion: dog.readerVersion, nose: dog.nose }, undefined, () => deleted);
      });
    },

    clear() {
      if (mode !== 'out-of-date') {
        if (read()?.kind === 'newer') {
          mode = 'out-of-date';
        } else {
          try {
            options.storage().removeItem(SAVED_DOGS_KEY);
          } catch {
            if (mode === 'working') {
              mode = memoryMode(entries);
            }
          }
        }
      }
      adopt([]);
    },
  };
}
