import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { resolveDog } from '../../src/genetics/dog.ts';
import type { Report } from '../../src/report/types.ts';
import { READER_VERSION } from '../../src/report/version.ts';
import type { SavedDog } from '../../src/saved/check.ts';
import { openSavedDogs, SAVED_DOGS_KEY, type StoredDog, type SavedDogs, type SavedDogsOptions, type SavedStorage } from '../../src/saved/store.ts';
import { fixtureReport } from '../report/fixtures.ts';
import { hash, MemoryStorage, refusing, sequentialIds, withNoseQuestion } from './storage.ts';

let a: Report;
let b: Report;
let c: Report;

beforeAll(async () => {
  [a, b, c] = await Promise.all([fixtureReport('a'), fixtureReport('b'), fixtureReport('c')]);
});

const NOW = Date.UTC(2026, 10, 27, 12);

let storage: MemoryStorage;
let clock: number;

beforeEach(() => {
  storage = new MemoryStorage();
  clock = NOW;
});

function open(options: Partial<SavedDogsOptions> = {}): SavedDogs {
  return openSavedDogs({ storage: () => storage, newId: sequentialIds(), now: () => clock++, locale: 'en', ...options });
}

const named = (report: Report, name: string | null, kitIdHash: string | null = null): Report => ({ ...report, name, kitIdHash });
const names = (store: SavedDogs): (string | null)[] => store.dogs().map((dog) => dog.name);
const stored = (): unknown => JSON.parse(storage.getItem(SAVED_DOGS_KEY) ?? 'null');

/** A raw stored entry, as another tab or an older version of the page wrote it. */
function entry(id: string, report: unknown, changes: Readonly<Record<string, unknown>> = {}): Record<string, unknown> {
  return { id, readerVersion: READER_VERSION, savedAt: NOW, nose: null, report, ...changes };
}

function seed(entries: readonly unknown[], version = 1): void {
  storage.setItem(SAVED_DOGS_KEY, JSON.stringify({ version, dogs: entries }));
}

function usable(dog: SavedDog | undefined): Extract<SavedDog, { report: Report }> {
  if (dog === undefined || dog.status === 'unusable') {
    throw new Error(`expected a usable dog, got ${dog?.status ?? 'none'}`);
  }
  return dog;
}

describe('adding and listing', () => {
  it('stores an added report as an entry under the stored version, with no kit ID or PDF bytes', () => {
    const store = open();
    expect(store.add(a)).toEqual({ outcome: { kind: 'added', id: 'id-1' }, gone: [] });
    expect(stored()).toEqual({
      version: 1,
      dogs: [{ id: 'id-1', readerVersion: READER_VERSION, savedAt: NOW, nose: null, report: a }],
    });
    const text = storage.getItem(SAVED_DOGS_KEY) ?? '';
    expect(text).not.toContain('KIT000');
    expect(text).not.toContain('%PDF');
    expect(Object.keys(a).sort()).toEqual(['breed', 'colour', 'format', 'health', 'kitIdHash', 'missingLoci', 'name', 'sex', 'shortTail']);
    expect(store.mode()).toBe('working');
  });

  it('lists the dogs with their nose answers after a reload, in alphabetical order', () => {
    const first = open();
    first.add(named(b, 'Bea'));
    const { outcome } = first.add(withNoseQuestion(named(a, 'aino')));
    first.setNose(outcome.id, 'brown');
    const reloaded = open();
    expect(reloaded.dogs().map((dog) => [dog.name, dog.status, dog.nose])).toEqual([
      ['aino', 'current', 'brown'],
      ['Bea', 'current', null],
    ]);
  });

  it('adds two reports without a kit hash as two dogs', () => {
    const store = open();
    store.add(named(a, 'Same'));
    expect(store.add(named(a, 'Same')).outcome.kind).toBe('added');
    expect(store.dogs()).toHaveLength(2);
  });

  it.each([
    ['en', ['aino', 'Ärrä', 'Bea', null]],
    ['fi', ['aino', 'Bea', 'Ärrä', null]],
  ])('sorts in the locale’s order, case-insensitively, unnamed dogs last (%s)', (locale, expected) => {
    const first = open({ locale });
    for (const name of [null, 'Bea', 'Ärrä', 'aino']) {
      first.add(named(a, name));
    }
    expect(names(first)).toEqual(expected);
    expect(names(open({ locale }))).toEqual(expected);
  });

  it('breaks ties in the order first saved', () => {
    const store = open();
    store.add(named(a, 'luna'));
    store.add(named(b, 'Luna'));
    store.add(named(c, null));
    store.add(named(a, null));
    expect(store.dogs().map((dog) => dog.id)).toEqual(['id-1', 'id-2', 'id-3', 'id-4']);
  });

  it('finds a dog by ID', () => {
    const store = open();
    const { outcome } = store.add(a);
    expect(store.dog(outcome.id)?.name).toBe('Sample A');
    expect(store.dog('nobody')).toBeUndefined();
  });

  it('hands out the same list and dog objects until something changes', () => {
    const store = open();
    store.add(a);
    const list = store.dogs();
    expect(store.dogs()).toBe(list);
    store.add(b);
    expect(store.dogs()).not.toBe(list);
    expect(store.dogs().find((dog) => dog.id === 'id-1')).toBe(list[0]);
  });
});

describe('adding a report the store already holds', () => {
  it('updates the dog with the same kit hash and keeps its ID and time first saved', () => {
    const store = open();
    store.add(a);
    const renewed = { ...a, breed: 'Renewed' };
    expect(store.add(renewed)).toEqual({ outcome: { kind: 'updated', id: 'id-1', nose: 'none' }, gone: [] });
    expect(store.dogs()).toHaveLength(1);
    expect(store.dog('id-1')).toMatchObject({ savedAt: NOW, report: renewed });
  });

  it('keeps the nose answer when the new reading still asks the question, and drops it when it does not', () => {
    expect(resolveDog(a).questions).toEqual([]);
    expect(resolveDog(withNoseQuestion(a)).questions.map((question) => question.id)).toEqual(['nose']);
    const store = open();
    store.add(withNoseQuestion(a));
    store.setNose('id-1', 'black');
    expect(store.add({ ...withNoseQuestion(a), breed: 'Again' }).outcome).toEqual({ kind: 'updated', id: 'id-1', nose: 'kept' });
    expect(store.dog('id-1')?.nose).toBe('black');
    expect(store.add(a).outcome).toEqual({ kind: 'updated', id: 'id-1', nose: 'dropped' });
    expect(open().dog('id-1')?.nose).toBeNull();
  });

  it('uses the first saved of two dogs that share a kit hash', () => {
    seed([
      entry('later', named(a, 'Later', hash('ab')), { savedAt: NOW + 10 }),
      entry('earlier', named(b, 'Earlier', hash('ab')), { savedAt: NOW - 10 }),
    ]);
    const store = open();
    expect(store.add(named(c, 'Renewed', hash('ab'))).outcome).toEqual({ kind: 'updated', id: 'earlier', nose: 'none' });
    expect(names(store)).toEqual(['Later', 'Renewed']);
  });

  it('sets and clears a nose answer, kept across a reload', () => {
    const store = open();
    store.add(withNoseQuestion(a));
    expect(store.setNose('id-1', 'brown')).toEqual({ gone: [] });
    expect(open().dog('id-1')?.nose).toBe('brown');
    store.setNose('id-1', null);
    expect(open().dog('id-1')?.nose).toBeNull();
  });

  it('gives an updated dog a new object and keeps the others', () => {
    const store = open();
    store.add(a);
    store.add(b);
    const [before1, before2] = [store.dog('id-1'), store.dog('id-2')];
    store.setNose('id-1', 'black');
    expect(store.dog('id-1')).not.toBe(before1);
    expect(store.dog('id-2')).toBe(before2);
    expect(usable(store.dog('id-2')).report).toBe(usable(before2).report);
  });

  it('keeps a dog’s report object when only its nose answer changes, so what was worked out from it can be kept', () => {
    const store = open();
    store.add(withNoseQuestion(a));
    const before = usable(store.dog('id-1')).report;
    store.setNose('id-1', 'brown');
    expect(usable(store.dog('id-1')).report).toBe(before);
  });
});

describe('the storage key', () => {
  it('reads dogs saved under dog-colors:saved-dogs, where every visitor’s dogs already are', () => {
    storage.setItem('dog-colors:saved-dogs', JSON.stringify({ version: 1, dogs: [entry('kept', a)] }));
    expect(open().dogs().map((dog) => dog.id)).toEqual(['kept']);
  });
});

describe('stale and unusable entries', () => {
  it('lists an entry read by an older reader version as stale and choosable, and replaces it in place on an ordinary add', () => {
    seed([entry('old', withNoseQuestion(a), { readerVersion: READER_VERSION - 1, nose: 'brown', savedAt: NOW - 5 })]);
    const store = open();
    expect(usable(store.dog('old'))).toMatchObject({ status: 'stale', readerVersion: READER_VERSION - 1 });
    expect(store.add(withNoseQuestion(a))).toEqual({ outcome: { kind: 'replaced', id: 'old', nose: 'kept' }, gone: [] });
    expect(open().dogs().map((dog) => [dog.id, dog.status, dog.nose, dog.savedAt])).toEqual([['old', 'current', 'brown', NOW - 5]]);
  });

  it('keeps an unusable entry as stored when another entry is written, and drops one whose name or sex fails', () => {
    const unusable = entry('bad', { ...b, shortTail: 1.5 });
    const dropped = entry('worse', { ...c, name: 42 });
    seed([unusable, dropped]);
    const store = open();
    expect(store.dogs().map((dog) => [dog.id, dog.status, dog.name, dog.sex])).toEqual([['bad', 'unusable', 'Sample B', b.sex]]);
    store.add(a);
    expect((stored() as { dogs: unknown[] }).dogs).toEqual([unusable, expect.objectContaining({ id: 'id-1' })]);
  });

  it('leaves an unusable entry as stored when its nose answer is set', () => {
    const unusable = entry('bad', { ...withNoseQuestion(a), shortTail: 1.5 });
    seed([unusable]);
    const store = open();
    expect(store.setNose('bad', 'brown')).toEqual({ gone: [] });
    expect(store.dog('bad')).toMatchObject({ status: 'unusable', nose: null });
    expect((stored() as { dogs: unknown[] }).dogs).toEqual([unusable]);
  });

  it('keeps __proto__ and constructor keys in stored records as data, through a write', () => {
    const report = { ...a, colour: { ...a.colour, PROTO: { polluted: 1 } }, health: [{ ...b.health[0], constructor: 'x', PROTO: { polluted: true } }] };
    storage.setItem(SAVED_DOGS_KEY, JSON.stringify({ version: 1, dogs: [entry('odd', report)] }).replaceAll('"PROTO"', '"__proto__"'));
    const store = open();
    const dog = usable(store.dog('odd'));
    expect(Object.getPrototypeOf(dog.report.colour)).toBe(Object.prototype);
    expect(Object.keys(dog.report.colour)).toContain('__proto__');
    store.setNose('odd', 'brown');
    store.add(b);
    const text = storage.getItem(SAVED_DOGS_KEY) ?? '';
    expect(text).toContain('"__proto__":{"polluted":1}');
    expect(text).toContain('"constructor":"x"');
    expect(open().dog('odd')?.nose).toBe('brown');
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('replaces an unusable entry with the same kit hash on an ordinary add, with a time first saved it can store', () => {
    seed([entry('bad', { ...a, shortTail: 1.5 }, { savedAt: 'unknown' })]);
    const store = open();
    expect(store.add(a).outcome).toEqual({ kind: 'replaced', id: 'bad', nose: 'none' });
    expect(open().dog('bad')).toMatchObject({ status: 'current', savedAt: NOW });
  });

  it.each([
    ['both hashes match', hash('ab'), hash('ab')],
    ['the target has no hash', null, hash('ab')],
    ['the report has no hash', hash('ab'), null],
  ])('a re-add targeting an unusable entry replaces it when %s', (_name, targetHash, reportHash) => {
    seed([entry('bad', { ...named(a, 'Old', targetHash), shortTail: 1.5 })]);
    const store = open();
    expect(store.add(named(a, 'New', reportHash), 'bad').outcome).toEqual({ kind: 'replaced', id: 'bad', nose: 'none' });
    expect(store.dogs().map((dog) => [dog.id, dog.name, dog.status])).toEqual([['bad', 'New', 'current']]);
  });

  it('a re-add with a different kit hash from the target’s is an ordinary add, and the target stays', () => {
    seed([entry('bad', { ...named(a, 'Old', hash('ab')), shortTail: 1.5 }), entry('other', named(b, 'Other', hash('cd')))]);
    const store = open();
    expect(store.add(named(c, 'New', hash('ef')), 'bad').outcome).toEqual({ kind: 'added', id: 'id-1' });
    expect(store.add(named(c, 'Other again', hash('cd')), 'bad').outcome).toEqual({ kind: 'updated', id: 'other', nose: 'none' });
    expect(store.dogs().map((dog) => [dog.id, dog.status])).toEqual([
      ['id-1', 'current'],
      ['bad', 'unusable'],
      ['other', 'current'],
    ]);
  });

  it('a re-add whose report matches another dog’s kit hash updates that dog, even when the target has no hash, and the target stays', () => {
    seed([entry('bad', { ...named(a, 'Old', null), shortTail: 1.5 }), entry('other', named(b, 'Other', hash('cd')))]);
    const store = open();
    expect(store.add(named(c, 'Other again', hash('cd')), 'bad').outcome).toEqual({ kind: 'updated', id: 'other', nose: 'none' });
    expect(store.dogs().map((dog) => [dog.id, dog.name, dog.status])).toEqual([
      ['bad', 'Old', 'unusable'],
      ['other', 'Other again', 'current'],
    ]);
  });

  it('a re-add whose report matches the target’s kit hash replaces the target, even when an earlier dog shares the hash', () => {
    seed([
      entry('earlier', named(b, 'Earlier', hash('ab')), { savedAt: NOW - 10 }),
      entry('bad', { ...named(a, 'Old', hash('ab')), shortTail: 1.5 }),
    ]);
    const store = open();
    expect(store.add(named(a, 'New', hash('ab')), 'bad').outcome).toEqual({ kind: 'replaced', id: 'bad', nose: 'none' });
    expect(names(store)).toEqual(['Earlier', 'New']);
  });

  it('a re-add of a report with no kit hash keeps the target’s hash, so a later add of the dog still matches it', () => {
    seed([entry('old', named(a, 'Old', hash('ab')), { readerVersion: READER_VERSION - 1 })]);
    const store = open();
    expect(store.add(named(a, 'New', null), 'old').outcome).toEqual({ kind: 'replaced', id: 'old', nose: 'none' });
    expect(open().dog('old')).toMatchObject({ status: 'current', name: 'New', kitIdHash: hash('ab') });
    expect(store.add(named(a, 'Again', hash('ab'))).outcome).toEqual({ kind: 'updated', id: 'old', nose: 'none' });
    expect(store.dogs()).toHaveLength(1);
  });

  it('a re-add whose target has gone is an ordinary add', () => {
    expect(open().add(named(a, 'New'), 'gone-already').outcome).toEqual({ kind: 'added', id: 'id-1' });
  });

  it('leaves entries read by a newer reader version hidden and as stored, and never matches them', () => {
    const future = { id: 'future', readerVersion: READER_VERSION + 1, savedAt: NOW, report: { kitIdHash: a.kitIdHash, more: [1] } };
    seed([future]);
    const store = open();
    expect(store.dogs()).toEqual([]);
    expect(store.add(a).outcome.kind).toBe('added');
    expect((stored() as { dogs: unknown[] }).dogs[0]).toEqual(future);
    store.remove('id-1');
    expect(stored()).toEqual({ version: 1, dogs: [future] });
  });
});

describe('another tab', () => {
  it('after this tab’s next write, the list matches storage: deleted dogs reported gone, bad entries checked, unchanged dogs the same objects', () => {
    const first = open();
    first.add(named(a, 'Kept'));
    first.add(named(b, 'Deleted'));
    const kept = first.dog('id-1');
    const second = open({ newId: sequentialIds('tab') });
    second.remove('id-2');
    second.add(named(c, 'Added there'));
    const raw = stored() as { dogs: unknown[] };
    const badHealth = [{ ...b.health[0], copies: '2' }];
    seed([...raw.dogs, entry('text-copies', { ...b, name: 'Copies as text', health: badHealth }), entry('no-name', { ...b, name: 7 })]);

    expect(first.add(named(a, 'Added here')).gone).toEqual(['id-2']);
    expect(names(first)).toEqual(['Added here', 'Added there', 'Copies as text', 'Kept']);
    expect(first.dog('text-copies')?.status).toBe('unusable');
    expect(first.dog('id-1')).toBe(kept);
    expect(names(open())).toEqual(names(first));
    expect((stored() as { dogs: { id: string }[] }).dogs.map((dog) => dog.id)).not.toContain('no-name');
  });

  it('deleting a dog another tab already deleted returns it for undo, and does not report it gone', () => {
    const first = open();
    first.add(named(a, 'Deleted twice'));
    first.add(named(b, 'Kept'));
    open().remove('id-1');
    const result = first.remove('id-1');
    expect(result.deleted?.dog).toMatchObject({ id: 'id-1', name: 'Deleted twice' });
    expect(result.gone).toEqual([]);
    expect(names(first)).toEqual(['Kept']);
  });

  it('a delete in another tab is not undone by this tab’s nose answer, and the dog is reported gone', () => {
    const first = open();
    first.add(withNoseQuestion(a));
    open().remove('id-1');
    expect(first.setNose('id-1', 'black')).toEqual({ gone: ['id-1'] });
    expect(first.dogs()).toEqual([]);
    expect(open().dogs()).toEqual([]);
  });
});

function deletedFrom(store: SavedDogs, id: string): StoredDog {
  const { deleted } = store.remove(id);
  if (deleted === null) {
    throw new Error(`nothing deleted for ${id}`);
  }
  return deleted;
}

describe('deleting, restoring and clearing', () => {
  it('deletes a dog, and restoring it brings back the same entry with its nose answer', () => {
    const store = open();
    store.add(withNoseQuestion(a));
    store.setNose('id-1', 'brown');
    store.add(b);
    const before = stored() as { dogs: unknown[] };
    const result = store.remove('id-1');
    expect(result.gone).toEqual([]);
    expect(result.deleted?.dog).toMatchObject({ id: 'id-1', nose: 'brown' });
    expect(store.dogs().map((dog) => dog.id)).toEqual(['id-2']);
    expect(open().dogs().map((dog) => dog.id)).toEqual(['id-2']);
    if (result.deleted === null) {
      throw new Error('nothing deleted');
    }
    expect(store.restore(result.deleted)).toEqual({ outcome: { kind: 'added', id: 'id-1' }, gone: [] });
    expect(store.dogs().map((dog) => [dog.id, dog.nose])).toEqual([
      ['id-1', 'brown'],
      ['id-2', null],
    ]);
    expect((stored() as { dogs: unknown[] }).dogs).toEqual(expect.arrayContaining(before.dogs));
  });

  it('restores a stale dog as stale and an unusable one as stored', () => {
    const staleEntry = entry('old', a, { readerVersion: READER_VERSION - 1 });
    const unusableEntry = entry('bad', { ...b, shortTail: 1.5 });
    seed([staleEntry, unusableEntry]);
    const store = open();
    const stale = deletedFrom(store, 'old');
    const unusable = deletedFrom(store, 'bad');
    expect(stored()).toEqual({ version: 1, dogs: [] });
    store.restore(stale);
    store.restore(unusable);
    expect(stored()).toEqual({ version: 1, dogs: [staleEntry, unusableEntry] });
    expect(store.dogs().map((dog) => dog.status)).toEqual(['stale', 'unusable']);
  });

  it('restoring over a dog with its kit hash saved meanwhile gives it the deleted nose answer when it has none and still asks', () => {
    const store = open();
    store.add(withNoseQuestion(a));
    store.setNose('id-1', 'black');
    const deleted = deletedFrom(store, 'id-1');
    open({ newId: sequentialIds('tab') }).add(withNoseQuestion(a));
    expect(store.restore(deleted).outcome).toEqual({ kind: 'updated', id: 'tab-1', nose: 'kept' });
    expect(store.dogs().map((dog) => [dog.id, dog.nose])).toEqual([['tab-1', 'black']]);
  });

  it('restoring a dog with no nose answer over a dog with its kit hash saved meanwhile reports no nose answer', () => {
    const store = open();
    store.add(named(a, 'Deleted', hash('ab')));
    const deleted = deletedFrom(store, 'id-1');
    open({ newId: sequentialIds('tab') }).add(named(a, 'Matched', hash('ab')));
    expect(store.restore(deleted).outcome).toEqual({ kind: 'updated', id: 'tab-1', nose: 'none' });
    expect(store.dogs().map((dog) => [dog.id, dog.name, dog.nose])).toEqual([['tab-1', 'Matched', null]]);
  });

  it('restoring a stale dog over a current reading with its kit hash keeps the current reading and its ID', () => {
    seed([entry('old', withNoseQuestion(named(a, 'Old', hash('ab'))), { readerVersion: READER_VERSION - 1, nose: 'brown' })]);
    const store = open();
    const deleted = deletedFrom(store, 'old');
    open({ newId: sequentialIds('tab') }).add(withNoseQuestion(named(a, 'Current', hash('ab'))));
    expect(store.restore(deleted).outcome).toEqual({ kind: 'updated', id: 'tab-1', nose: 'kept' });
    const expected = [['tab-1', 'Current', 'current', 'brown']];
    expect(store.dogs().map((dog) => [dog.id, dog.name, dog.status, dog.nose])).toEqual(expected);
    expect(open().dogs().map((dog) => [dog.id, dog.name, dog.status, dog.nose])).toEqual(expected);
  });

  it.each<[string, boolean, 'black' | null]>([
    ['has a nose answer of its own', true, 'black'],
    ['has a reading that does not ask the nose question', false, null],
  ])('restoring over a dog with its kit hash that %s leaves that dog as it was', (_name, asks, nose) => {
    const matched = named(a, 'Matched', hash('ab'));
    const store = open();
    store.add(withNoseQuestion(named(a, 'Deleted', hash('ab'))));
    store.setNose('id-1', 'brown');
    const deleted = deletedFrom(store, 'id-1');
    const other = open({ newId: sequentialIds('tab') });
    other.add(asks ? withNoseQuestion(matched) : matched);
    other.setNose('tab-1', nose);
    const before = storage.getItem(SAVED_DOGS_KEY);
    expect(store.restore(deleted).outcome).toEqual({ kind: 'updated', id: 'tab-1', nose: 'dropped' });
    expect(store.dogs().map((dog) => [dog.id, dog.name, dog.nose])).toEqual([['tab-1', 'Matched', nose]]);
    expect(storage.getItem(SAVED_DOGS_KEY)).toBe(before);
  });

  it('restoring over an unusable dog with its kit hash renews that dog with the deleted reading', () => {
    const store = open();
    store.add(withNoseQuestion(named(a, 'Deleted', hash('ab'))));
    store.setNose('id-1', 'brown');
    const deleted = deletedFrom(store, 'id-1');
    seed([entry('bad', { ...named(a, 'Unusable', hash('ab')), shortTail: 1.5 })]);
    expect(store.restore(deleted).outcome).toEqual({ kind: 'replaced', id: 'bad', nose: 'kept' });
    expect(open().dogs().map((dog) => [dog.id, dog.name, dog.status, dog.nose])).toEqual([['bad', 'Deleted', 'current', 'brown']]);
  });

  it('restoring a dog whose ID is listed again changes nothing', () => {
    const store = open();
    store.add(withNoseQuestion(a));
    store.setNose('id-1', 'brown');
    const deleted = deletedFrom(store, 'id-1');
    store.restore(deleted);
    store.setNose('id-1', 'black');
    const [dog, before] = [store.dog('id-1'), storage.getItem(SAVED_DOGS_KEY)];
    expect(store.restore(deleted)).toEqual({ outcome: { kind: 'added', id: 'id-1' }, gone: [] });
    expect(store.dogs()).toEqual([dog]);
    expect(store.dog('id-1')).toBe(dog);
    expect(dog?.nose).toBe('black');
    expect(storage.getItem(SAVED_DOGS_KEY)).toBe(before);
  });

  it('reports nothing deleted for an unknown ID', () => {
    const store = open();
    store.add(a);
    expect(store.remove('nobody')).toEqual({ deleted: null, gone: [] });
    expect(store.dogs()).toHaveLength(1);
  });

  it('clears by removing the key, stale, unusable and hidden entries included, and leaves other keys alone', () => {
    storage.setItem('dog-colors:breeding-note-hidden-until', '1');
    seed([
      entry('old', a, { readerVersion: READER_VERSION - 1 }),
      entry('bad', { ...b, shortTail: 1.5 }),
      { id: 'future', readerVersion: READER_VERSION + 1 },
    ]);
    const store = open();
    store.add(c);
    store.clear();
    expect(store.dogs()).toEqual([]);
    expect(storage.getItem(SAVED_DOGS_KEY)).toBeNull();
    expect(storage.getItem('dog-colors:breeding-note-hidden-until')).toBe('1');
    expect(store.mode()).toBe('working');
  });
});

describe('a stored value this page cannot use', () => {
  it('reads a value that is not JSON as no dogs, and the next add replaces it', () => {
    storage.setItem(SAVED_DOGS_KEY, '{"version":1,"dogs":[');
    const store = open();
    expect(store.dogs()).toEqual([]);
    expect(store.mode()).toBe('working');
    store.add(a);
    expect(open().dogs().map((dog) => dog.id)).toEqual(['id-1']);
  });

  it('is out of date over a newer stored version: adds, nose answers, deletes, an undo and a clear stay in this tab, and storage is untouched', () => {
    seed([{ anything: true }], 2);
    const before = storage.getItem(SAVED_DOGS_KEY);
    const store = open();
    expect(store.mode()).toBe('out-of-date');
    expect(store.dogs()).toEqual([]);
    store.add(withNoseQuestion(a));
    store.add(b);
    store.setNose('id-1', 'brown');
    expect(store.dogs().map((dog) => [dog.id, dog.nose])).toEqual([
      ['id-1', 'brown'],
      ['id-2', null],
    ]);
    const deleted = deletedFrom(store, 'id-2');
    expect(store.dogs().map((dog) => dog.id)).toEqual(['id-1']);
    store.restore(deleted);
    expect(store.dogs().map((dog) => dog.id)).toEqual(['id-1', 'id-2']);
    store.clear();
    expect(store.dogs()).toEqual([]);
    expect(storage.getItem(SAVED_DOGS_KEY)).toBe(before);
    expect(store.mode()).toBe('out-of-date');
  });

  it('turns out of date when a re-read finds a newer stored version, and writes nothing', () => {
    const store = open();
    store.add(a);
    seed([], 2);
    const before = storage.getItem(SAVED_DOGS_KEY);
    expect(store.add(b)).toEqual({ outcome: { kind: 'added', id: 'id-2' }, gone: [] });
    expect(store.mode()).toBe('out-of-date');
    expect(store.dogs().map((dog) => dog.id)).toEqual(['id-1', 'id-2']);
    store.remove('id-1');
    store.clear();
    expect(storage.getItem(SAVED_DOGS_KEY)).toBe(before);
  });

  it('turns out of date instead of clearing when a newer version wrote the key meanwhile', () => {
    const store = open();
    store.add(a);
    seed([], 2);
    const before = storage.getItem(SAVED_DOGS_KEY);
    store.clear();
    expect(store.mode()).toBe('out-of-date');
    expect(store.dogs()).toEqual([]);
    expect(storage.getItem(SAVED_DOGS_KEY)).toBe(before);
  });
});

/** The test's storage, whose getItem throws once stopReads is called. */
function readsThatStop(): SavedStorage & { stopReads(): void } {
  let reads = true;
  return {
    getItem: (key) => {
      if (!reads) {
        throw new DOMException('denied', 'SecurityError');
      }
      return storage.getItem(key);
    },
    setItem: (key, value) => storage.setItem(key, value),
    removeItem: (key) => storage.removeItem(key),
    stopReads: () => {
      reads = false;
    },
  };
}

describe('storage that refuses', () => {
  it.each([
    ['storage whose every call throws', () => refusing],
    ['storage that cannot even be reached', (): never => {
      throw new DOMException('denied', 'SecurityError');
    }],
  ])('gives an empty store in memory with nothing stored, for %s', (_name, refused) => {
    const store = open({ storage: refused });
    expect(store.mode()).toBe('nothing-stored');
    expect(store.dogs()).toEqual([]);
    expect(store.add(withNoseQuestion(a))).toEqual({ outcome: { kind: 'added', id: 'id-1' }, gone: [] });
    expect(store.add(withNoseQuestion(a)).outcome).toEqual({ kind: 'updated', id: 'id-1', nose: 'none' });
    store.setNose('id-1', 'black');
    expect(store.dog('id-1')?.nose).toBe('black');
    expect(store.remove('id-1').deleted?.dog.id).toBe('id-1');
    store.add(b);
    store.clear();
    expect(store.dogs()).toEqual([]);
    expect(store.mode()).toBe('nothing-stored');
  });

  it('turns to memory with nothing stored when the first write is refused', () => {
    storage.failWrites = true;
    const store = open();
    expect(store.mode()).toBe('working');
    store.add(a);
    expect(store.mode()).toBe('nothing-stored');
    expect(store.dogs()).toHaveLength(1);
    expect(storage.getItem(SAVED_DOGS_KEY)).toBeNull();
  });

  it('turns to memory with dogs stored on a quota error at the third add; deletes still shrink storage, and a clear empties it', () => {
    const store = open();
    store.add(named(a, 'First'));
    store.add(named(b, 'Second'));
    storage.failWrites = true;
    expect(store.add(named(c, 'Third')).outcome).toEqual({ kind: 'added', id: 'id-3' });
    expect(store.mode()).toBe('full');
    expect(names(store)).toEqual(['First', 'Second', 'Third']);
    storage.failWrites = false;

    store.remove('id-1');
    expect(names(store)).toEqual(['Second', 'Third']);
    expect(names(open())).toEqual(['Second']);
    expect(store.mode()).toBe('full');

    store.clear();
    expect(store.dogs()).toEqual([]);
    expect(open().dogs()).toEqual([]);
    expect(storage.getItem(SAVED_DOGS_KEY)).toBeNull();
  });

  it('keeps its own list in memory: another tab’s changes are not adopted, and nose answers stay in the tab', () => {
    const store = open();
    store.add(withNoseQuestion(named(a, 'First')));
    storage.failWrites = true;
    store.add(named(b, 'Unsaved'));
    storage.failWrites = false;
    const before = storage.getItem(SAVED_DOGS_KEY);
    store.setNose('id-1', 'brown');
    expect(store.dog('id-1')?.nose).toBe('brown');
    expect(storage.getItem(SAVED_DOGS_KEY)).toBe(before);

    open({ newId: sequentialIds('tab') }).add(named(c, 'Other tab'));
    expect(store.add(named(c, 'Here', hash('ab'))).gone).toEqual([]);
    expect(names(store)).toEqual(['First', 'Here', 'Unsaved']);
  });

  it('an undo in memory mode with dogs stored puts the dog back in storage, so a reload lists it again', () => {
    const store = open();
    store.add(named(a, 'First'));
    store.add(named(b, 'Second'));
    storage.failWrites = true;
    store.add(named(c, 'Third'));
    storage.failWrites = false;
    const deleted = deletedFrom(store, 'id-1');
    expect(names(open())).toEqual(['Second']);
    expect(store.restore(deleted)).toEqual({ outcome: { kind: 'added', id: 'id-1' }, gone: [] });
    expect(names(store)).toEqual(['First', 'Second', 'Third']);
    expect(names(open())).toEqual(['First', 'Second']);
    expect(store.mode()).toBe('full');
  });

  it('an undo in memory mode with dogs stored over a dog with its kit hash saved meanwhile stores the carried nose answer', () => {
    const store = open();
    store.add(withNoseQuestion(named(a, 'Deleted', hash('ab'))));
    store.setNose('id-1', 'brown');
    store.add(named(b, 'Second'));
    storage.failWrites = true;
    store.add(named(c, 'Third'));
    storage.failWrites = false;
    expect(store.mode()).toBe('full');
    const deleted = deletedFrom(store, 'id-1');
    open({ newId: sequentialIds('tab') }).add(withNoseQuestion(named(a, 'Matched', hash('ab'))));
    store.restore(deleted);
    expect(open().dogs().map((dog) => [dog.id, dog.name, dog.nose])).toEqual([
      ['tab-1', 'Matched', 'brown'],
      ['id-2', 'Second', null],
    ]);
    expect(store.mode()).toBe('full');
  });

  it('an undo in memory mode with nothing stored is tried against storage too', () => {
    storage.failWrites = true;
    const store = open();
    store.add(named(a, 'First'));
    expect(store.mode()).toBe('nothing-stored');
    storage.failWrites = false;
    store.restore(deletedFrom(store, 'id-1'));
    expect(names(open())).toEqual(['First']);
    expect(store.mode()).toBe('nothing-stored');
  });

  it('an undo in memory mode whose write is refused stays in the tab', () => {
    const store = open();
    store.add(named(a, 'First'));
    store.add(named(b, 'Second'));
    storage.failWrites = true;
    store.add(named(c, 'Third'));
    storage.failWrites = false;
    const deleted = deletedFrom(store, 'id-1');
    storage.failWrites = true;
    expect(store.restore(deleted).outcome).toEqual({ kind: 'added', id: 'id-1' });
    expect(names(store)).toEqual(['First', 'Second', 'Third']);
    expect(names(open())).toEqual(['Second']);
    expect(store.mode()).toBe('full');
  });

  it('a delete in memory mode leaves storage alone when storage now holds a newer version', () => {
    const store = open();
    store.add(a);
    storage.failWrites = true;
    store.add(b);
    storage.failWrites = false;
    seed([], 2);
    const before = storage.getItem(SAVED_DOGS_KEY);
    store.remove('id-1');
    expect(storage.getItem(SAVED_DOGS_KEY)).toBe(before);
    expect(store.dogs().map((dog) => dog.id)).toEqual(['id-2']);
    expect(store.mode()).toBe('out-of-date');
  });

  it('turns to memory when reads start failing after a working load, applying the change that found it in the tab', () => {
    const flaky = readsThatStop();
    const store = open({ storage: () => flaky });
    store.add(named(a, 'First'));
    store.add(named(b, 'Second'));
    const before = storage.getItem(SAVED_DOGS_KEY);
    flaky.stopReads();
    const result = store.remove('id-1');
    expect(store.mode()).toBe('full');
    expect(result).toEqual({ deleted: expect.objectContaining({ dog: expect.objectContaining({ id: 'id-1' }) }), gone: [] });
    expect(names(store)).toEqual(['Second']);
    store.add(named(c, 'Third'));
    expect(names(store)).toEqual(['Second', 'Third']);
    expect(storage.getItem(SAVED_DOGS_KEY)).toBe(before);
  });

  it('turns to memory with nothing stored when reads start failing before any dog is listed', () => {
    const flaky = readsThatStop();
    const store = open({ storage: () => flaky });
    flaky.stopReads();
    store.add(a);
    expect(store.mode()).toBe('nothing-stored');
    expect(store.dogs()).toHaveLength(1);
    expect(storage.getItem(SAVED_DOGS_KEY)).toBeNull();
  });

  it('turns to memory when a clear is refused while storage worked', () => {
    const store = open();
    store.add(a);
    const failing: SavedStorage = {
      getItem: (key) => storage.getItem(key),
      setItem: (key, value) => storage.setItem(key, value),
      removeItem: () => {
        throw new DOMException('denied', 'SecurityError');
      },
    };
    const refusingClear = open({ storage: () => failing });
    refusingClear.clear();
    expect(refusingClear.dogs()).toEqual([]);
    expect(refusingClear.mode()).toBe('full');
  });
});
