// The one check every read of the saved dogs passes through. Storage is
// user-editable, may hold older code's writes, and is shared with every other
// site on the github.io origin, so each value is checked by type before use.
// Values are not checked against the gene catalogue: what the genetics reject
// is contained where the page draws a dog or a pair.

import { NOSE_ANSWERS, type NoseAnswer } from '../genetics/questions.ts';
import type { ReportFormat } from '../report/loci.ts';
import { INHERITANCE_MODES, type Report, type Sex } from '../report/types.ts';
import { READER_VERSION } from '../report/version.ts';

/**
 * The stored value's own version: `{"version": n, "dogs": [...]}`. A later
 * format must keep `version` at the top, so that this code can tell it is newer.
 */
export const STORED_VERSION = 1;

const MAX_TEXT_LENGTH = 1000;
const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const HASH_PATTERN = /^[0-9a-f]{64}$/;
const MAX_COPIES = 2;
const FORMATS: readonly ReportFormat[] = ['current', 'mydogdna'];
const SEXES: readonly Sex[] = ['male', 'female'];

export type DogStatus = 'current' | 'stale' | 'unusable';

interface DogFields {
  readonly id: string;
  /** Time first saved, in epoch milliseconds; infinite when an unusable entry's time is unreadable. */
  readonly savedAt: number;
  readonly name: string | null;
  readonly sex: Sex | null;
  readonly kitIdHash: string | null;
  readonly nose: NoseAnswer | null;
}

/** A dog the page can choose: read by this reader version (current) or an older one (stale). */
export interface UsableDog extends DogFields {
  readonly status: 'current' | 'stale';
  readonly readerVersion: number;
  readonly report: Report;
}

/** An entry that fails the check but whose name and sex can still be shown. */
export interface UnusableDog extends DogFields {
  readonly status: 'unusable';
}

export type SavedDog = UsableDog | UnusableDog;

export interface CheckedEntry {
  /** The entry as stored, re-serialised: equal strings mean an unchanged entry. */
  readonly json: string;
  /** Null for an entry read by a newer reader version: hidden, and written back as stored. */
  readonly dog: SavedDog | null;
}

export type StoredValue =
  /** The kept entries in stored order; an absent or unreadable value has none. */
  | { readonly kind: 'dogs'; readonly entries: readonly CheckedEntry[] }
  /** Written by a newer version of the page: nothing in it may be read or written. */
  | { readonly kind: 'newer' };

type JsonObject = Readonly<Record<string, unknown>>;

const isRecord = (value: unknown): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isText = (value: unknown): value is string => typeof value === 'string' && value.length <= MAX_TEXT_LENGTH;
const isTextOrNull = (value: unknown): value is string | null => value === null || isText(value);
const isCopies = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= MAX_COPIES;
const isInteger = (value: unknown): value is number => Number.isSafeInteger(value);
const isOneOf = <T>(options: readonly T[], value: unknown): value is T => (options as readonly unknown[]).includes(value);

const isSexOrNull = (value: unknown): value is Sex | null => value === null || isOneOf(SEXES, value);
const isHashOrNull = (value: unknown): value is string | null =>
  value === null || (typeof value === 'string' && HASH_PATTERN.test(value));
const isNoseOrNull = (value: unknown): value is NoseAnswer | null => value === null || isOneOf(NOSE_ANSWERS, value);

function isColour(value: unknown): boolean {
  return (
    isRecord(value) &&
    Object.entries(value).every(
      ([gene, copies]) => isText(gene) && isRecord(copies) && Object.entries(copies).every(([code, count]) => isText(code) && isCopies(count)),
    )
  );
}

function isHealthRow(value: unknown): boolean {
  return (
    isRecord(value) &&
    isText(value.name) &&
    isText(value.gene) &&
    isText(value.variant) &&
    isCopies(value.copies) &&
    isText(value.result) &&
    (value.inheritance === null || isOneOf(INHERITANCE_MODES, value.inheritance)) &&
    typeof value.knownInBreed === 'boolean'
  );
}

function isReport(value: JsonObject): value is JsonObject & Report {
  return (
    isOneOf(FORMATS, value.format) &&
    isTextOrNull(value.name) &&
    isSexOrNull(value.sex) &&
    isTextOrNull(value.breed) &&
    isHashOrNull(value.kitIdHash) &&
    isColour(value.colour) &&
    Array.isArray(value.missingLoci) &&
    value.missingLoci.every(isText) &&
    (value.shortTail === null || isCopies(value.shortTail)) &&
    Array.isArray(value.health) &&
    value.health.every(isHealthRow)
  );
}

/** The entry as the page lists it, or null when it is hidden or dropped. */
function checkEntry(entry: JsonObject, id: string): SavedDog | 'hidden' | null {
  const { readerVersion, savedAt, nose, report } = entry;
  if (isInteger(readerVersion) && readerVersion > READER_VERSION) {
    return 'hidden';
  }
  if (!isRecord(report) || !isTextOrNull(report.name) || !isSexOrNull(report.sex)) {
    return null;
  }
  const fields: DogFields = {
    id,
    savedAt: typeof savedAt === 'number' && Number.isFinite(savedAt) ? savedAt : Number.POSITIVE_INFINITY,
    name: report.name,
    sex: report.sex,
    kitIdHash: isHashOrNull(report.kitIdHash) ? report.kitIdHash : null,
    nose: isNoseOrNull(nose) ? nose : null,
  };
  const passes =
    isInteger(readerVersion) && Number.isFinite(savedAt) && isNoseOrNull(nose) && isReport(report);
  if (!passes) {
    return { ...fields, status: 'unusable' };
  }
  return { ...fields, status: readerVersion === READER_VERSION ? 'current' : 'stale', readerVersion, report };
}

/** Checks the stored value, as getItem returned it. */
export function checkStored(stored: string | null): StoredValue {
  let parsed: unknown;
  try {
    parsed = stored === null ? null : JSON.parse(stored);
  } catch {
    return { kind: 'dogs', entries: [] };
  }
  if (!isRecord(parsed) || !isInteger(parsed.version) || parsed.version < 1) {
    return { kind: 'dogs', entries: [] };
  }
  if (parsed.version > STORED_VERSION) {
    return { kind: 'newer' };
  }
  if (!Array.isArray(parsed.dogs)) {
    return { kind: 'dogs', entries: [] };
  }

  const ids = new Set<string>();
  const entries: CheckedEntry[] = [];
  for (const entry of parsed.dogs as unknown[]) {
    if (!isRecord(entry) || typeof entry.id !== 'string' || !ID_PATTERN.test(entry.id) || ids.has(entry.id)) {
      continue;
    }
    ids.add(entry.id);
    const dog = checkEntry(entry, entry.id);
    if (dog !== null) {
      entries.push({ json: JSON.stringify(entry), dog: dog === 'hidden' ? null : dog });
    }
  }
  return { kind: 'dogs', entries };
}
