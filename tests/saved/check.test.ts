import { beforeAll, describe, expect, it } from 'vitest';
import { READER_VERSION } from '../../src/report/version.ts';
import { checkStored, STORED_VERSION, type SavedDog } from '../../src/saved/check.ts';
import type { Report } from '../../src/report/types.ts';
import { fixtureReport } from '../report/fixtures.ts';

let a: Report;

beforeAll(async () => {
  a = await fixtureReport('a');
});

type Raw = Record<string, unknown>;

function rawEntry(changes: Raw = {}, report: Raw = {}): Raw {
  return { id: 'dog1', readerVersion: READER_VERSION, savedAt: 1000, nose: null, report: { ...a, ...report }, ...changes };
}

const value = (entries: readonly unknown[], version: unknown = STORED_VERSION): string => JSON.stringify({ version, dogs: entries });

function dogsOf(stored: string | null): (SavedDog | null)[] {
  const checked = checkStored(stored);
  if (checked.kind !== 'dogs') {
    throw new Error(`expected dogs, got ${checked.kind}`);
  }
  return checked.entries.map((entry) => entry.dog);
}

function onlyDog(entry: Raw): SavedDog | null {
  const dogs = dogsOf(value([entry]));
  expect(dogs).toHaveLength(1);
  return dogs[0] ?? null;
}

describe('checkStored: the stored value', () => {
  it('reads an absent key as no dogs', () => {
    expect(checkStored(null)).toEqual({ kind: 'dogs', entries: [] });
  });

  it.each([
    ['not JSON', '{"version":1,"dogs":['],
    ['a JSON string', '"dogs"'],
    ['null', 'null'],
    ['an array', '[]'],
    ['no dogs list', '{"version":1}'],
    ['dogs not a list', '{"version":1,"dogs":{}}'],
    ['no version', '{"dogs":[]}'],
    ['a version that is not an integer', '{"version":"1","dogs":[]}'],
    ['a version below the first', '{"version":0,"dogs":[]}'],
  ])('reads %s as no dogs', (_name, stored) => {
    expect(checkStored(stored)).toEqual({ kind: 'dogs', entries: [] });
  });

  it('reports a newer stored version without reading its dogs', () => {
    expect(checkStored(value([rawEntry()], STORED_VERSION + 1))).toEqual({ kind: 'newer' });
    expect(checkStored(JSON.stringify({ version: STORED_VERSION + 1, dogs: 'a shape this code cannot know' }))).toEqual({
      kind: 'newer',
    });
  });
});

describe('checkStored: entries', () => {
  it('reads a current entry with its report, and keeps its JSON for comparison', () => {
    const entry = rawEntry({ nose: 'brown' });
    const checked = checkStored(value([entry]));
    expect(checked).toEqual({
      kind: 'dogs',
      entries: [
        {
          json: JSON.stringify(entry),
          dog: {
            id: 'dog1',
            status: 'current',
            readerVersion: READER_VERSION,
            savedAt: 1000,
            name: 'Sample A',
            sex: 'male',
            kitIdHash: a.kitIdHash,
            nose: 'brown',
            report: a,
          },
        },
      ],
    });
  });

  it('marks an entry read by an older reader version stale, still carrying its report', () => {
    const dog = onlyDog(rawEntry({ readerVersion: READER_VERSION - 1 }));
    expect(dog?.status).toBe('stale');
    expect(dog?.status === 'stale' ? dog.report : null).toEqual(a);
  });

  it('hides an entry read by a newer reader version and keeps its JSON as stored, whatever it holds', () => {
    const entry = { id: 'future', readerVersion: READER_VERSION + 1, report: { shape: 'unknown here' } };
    expect(checkStored(value([entry]))).toEqual({ kind: 'dogs', entries: [{ json: JSON.stringify(entry), dog: null }] });
  });

  it('does not check colour genes or codes against the catalogue', () => {
    expect(onlyDog(rawEntry({}, { colour: { NOTAGENE: { zz: 1 } }, missingLoci: ['NOTAGENE'] }))?.status).toBe('current');
  });

  it('accepts null where a report field may be absent', () => {
    const dog = onlyDog(rawEntry({}, { name: null, sex: null, breed: null, kitIdHash: null, shortTail: null }));
    expect(dog).toMatchObject({ status: 'current', name: null, sex: null, kitIdHash: null });
  });

  const row = { name: 'Condition', gene: 'GENE', variant: 'C>T', copies: 0, result: 'Clear', inheritance: 'AR', knownInBreed: false };
  const health = (changes: Raw): Raw => ({ health: [{ ...row, ...changes }] });

  it('accepts a well-formed health row', () => {
    expect(onlyDog(rawEntry({}, health({})))?.status).toBe('current');
    expect(onlyDog(rawEntry({}, health({ inheritance: null })))?.status).toBe('current');
  });

  it.each<[string, Raw, Raw]>([
    ['shortTail 1.5', {}, { shortTail: 1.5 }],
    ['shortTail 3', {}, { shortTail: 3 }],
    ['a colour copy count of "2"', {}, { colour: { CBD103: { KB: '2' } } }],
    ['a colour copy count of -1', {}, { colour: { CBD103: { KB: -1 } } }],
    ['colour copies that are not a record', {}, { colour: { CBD103: [2] } }],
    ['a health copy count of "2"', {}, health({ copies: '2' })],
    ['an unknown inheritance mode', {}, health({ inheritance: 'XY' })],
    ['knownInBreed as text', {}, health({ knownInBreed: 'yes' })],
    ['a health row missing its result', {}, health({ result: undefined })],
    ['health that is not a list', {}, { health: {} }],
    ['an unknown report format', {}, { format: 'pdf' }],
    ['missing loci that are not a list', {}, { missingLoci: 'TYRP1' }],
    ['missing loci with a number in the list', {}, { missingLoci: ['TYRP1', 7] }],
    ['missing loci with null in the list', {}, { missingLoci: [null] }],
    ['a breed that is a number', {}, { breed: 7 }],
    ['an over-long breed', {}, { breed: 'x'.repeat(1001) }],
    ['an uppercase kit hash', {}, { kitIdHash: 'A'.repeat(64) }],
    ['a short kit hash', {}, { kitIdHash: 'a'.repeat(63) }],
    ['a report with no colour', {}, { colour: undefined }],
    ['an unknown nose answer', { nose: 'pink' }, {}],
    ['a reader version that is not an integer', { readerVersion: '1' }, {}],
    ['a reader version of 1.5', { readerVersion: 1.5 }, {}],
    ['a time that is not a number', { savedAt: 'yesterday' }, {}],
  ])('marks an entry with %s unusable, keeping its name and sex', (_name, changes, report) => {
    expect(onlyDog(rawEntry(changes, report))).toMatchObject({ id: 'dog1', status: 'unusable', name: 'Sample A', sex: 'male' });
  });

  it('keeps an unusable entry’s kit hash and nose answer when they pass, and drops them when they do not', () => {
    expect(onlyDog(rawEntry({ nose: 'black' }, { shortTail: 1.5 }))).toMatchObject({ kitIdHash: a.kitIdHash, nose: 'black' });
    expect(onlyDog(rawEntry({ nose: 'pink' }, { kitIdHash: 'A'.repeat(64) }))).toMatchObject({ kitIdHash: null, nose: null });
  });

  it.each<[string, unknown]>([
    ['a name that is a number', rawEntry({}, { shortTail: 1.5, name: 42 })],
    ['a name that is a number, all else passing', rawEntry({}, { name: 42 })],
    ['an over-long name', rawEntry({}, { name: 'x'.repeat(1001) })],
    ['an unknown sex', rawEntry({}, { sex: 'M' })],
    ['no report', rawEntry({ report: undefined })],
    ['a report that is a list', rawEntry({ report: [] })],
    ['no ID', rawEntry({ id: undefined })],
    ['a numeric ID', rawEntry({ id: 7 })],
    ['an empty ID', rawEntry({ id: '' })],
    ['an ID with a quote', rawEntry({ id: 'a"b' })],
    ['an over-long ID', rawEntry({ id: 'x'.repeat(65) })],
    ['null', null],
    ['a number', 5],
  ])('drops an entry with %s', (_name, entry) => {
    expect(dogsOf(value([entry]))).toEqual([]);
  });

  it('drops an entry with a number in its missing loci and a name that fails', () => {
    expect(dogsOf(value([rawEntry({}, { missingLoci: [7], name: 42 })]))).toEqual([]);
  });

  /** The value as JSON, with every "PROTO" key renamed __proto__, which an object literal cannot hold as data. */
  const withProtoKeys = (entry: Raw): string => value([entry]).replaceAll('"PROTO"', '"__proto__"');

  it('reads __proto__ and constructor keys in colour and health records as data, polluting no prototype', () => {
    const colour = { ...a.colour, PROTO: { polluted: 1 }, constructor: { constructor: 1 } };
    const health = [{ ...row, PROTO: { polluted: true }, constructor: 'x' }];
    const [dog] = dogsOf(withProtoKeys(rawEntry({}, { colour, health })));
    if (dog?.status !== 'current') {
      throw new Error(`expected a current dog, got ${dog?.status ?? 'none'}`);
    }
    expect(Object.getPrototypeOf(dog.report.colour)).toBe(Object.prototype);
    expect(Object.keys(dog.report.colour)).toEqual(expect.arrayContaining(['__proto__', 'constructor']));
    expect(Object.getPrototypeOf(dog.report.health[0])).toBe(Object.prototype);
    expect(({} as Raw).polluted).toBeUndefined();
  });

  it('marks an entry whose colour holds a __proto__ key that is not a record unusable', () => {
    const dogs = dogsOf(withProtoKeys(rawEntry({}, { colour: { ...a.colour, PROTO: 5 } })));
    expect(dogs[0]).toMatchObject({ status: 'unusable', name: 'Sample A' });
  });

  it('drops an entry whose report has no name of its own but a __proto__ key holding one', () => {
    expect(dogsOf(withProtoKeys(rawEntry({}, { name: undefined, PROTO: { name: 'Inherited' } })))).toEqual([]);
  });

  it('keeps only the first of two entries with the same ID', () => {
    const first = rawEntry({ savedAt: 1 });
    const second = rawEntry({ savedAt: 2 }, { name: 'Other' });
    expect(dogsOf(value([first, second])).map((dog) => [dog?.id, dog?.name])).toEqual([['dog1', 'Sample A']]);
  });

  it('counts a hidden entry’s ID toward uniqueness', () => {
    const hidden = { id: 'dog1', readerVersion: READER_VERSION + 1 };
    expect(dogsOf(value([hidden, rawEntry()]))).toEqual([null]);
  });

  it('keeps the other entries around one that fails', () => {
    const dogs = dogsOf(value([rawEntry({ id: 'one' }), rawEntry({ id: 'two' }, { name: 42 }), rawEntry({ id: 'three' })]));
    expect(dogs.map((dog) => dog?.id)).toEqual(['one', 'three']);
  });
});
