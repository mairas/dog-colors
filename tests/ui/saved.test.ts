// @vitest-environment happy-dom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Report } from '../../src/report/types.ts';
import { openSavedDogs, SAVED_DOGS_KEY } from '../../src/saved/store.ts';
import { EMPTY_SLOT, NOTE_HIDDEN_KEY, startApp } from '../../src/ui/app.ts';
import { hash, MemoryStorage, sequentialIds, withNoseQuestion } from '../saved/storage.ts';
import {
  button,
  focused,
  heading,
  ok,
  openPage,
  pdf,
  rewriteSaved,
  sampleReport,
  savedStorage,
  slowRead,
  spoken,
  type ReadResults,
} from './app.ts';

const RESULTS_FAILED =
  '⚠Puppy colours can’t be worked out for this pair. The saved data of one of these dogs can’t be used. Add its report again, or choose another dog.';

let a: Report;
let b: Report;
let c: Report;
let d: Report;
let reads: ReadResults;

beforeAll(async () => {
  [a, b, c, d] = await Promise.all([sampleReport('a'), sampleReport('b'), sampleReport('c'), sampleReport('d')]);
  reads = { 'a.pdf': ok(a), 'b.pdf': ok(b), 'c.pdf': ok(c), 'd.pdf': ok(d), 'other.pdf': { ok: false, kind: 'not-wisdom-dog' } };
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const results = (root: HTMLElement) => root.querySelector<HTMLElement>('#results');
const pressed = (root: HTMLElement, slot: number): string[] =>
  [...root.querySelectorAll(`[data-slot="${slot}"] button.dog[aria-pressed="true"]`)].map((row) => row.getAttribute('data-key') ?? '');
const rows = (root: HTMLElement, slot: number): string[] =>
  [...root.querySelectorAll(`[data-slot="${slot}"] button.dog`)].map((row) => row.getAttribute('data-key') ?? '');
const notice = (root: HTMLElement, slot: number) => root.querySelector(`[data-slot="${slot}"] .err`)?.textContent ?? null;
const listed = (storage: MemoryStorage) => openSavedDogs({ storage: () => storage }).dogs();
/** Seven females without kit IDs: enough for the filter field. */
const sevenFemales = (): Report[] => ['Aino', 'Bruno', 'Canela', 'Duna', 'Eetu', 'Gaudí', 'Hilla'].map((name) => ({ ...b, name, kitIdHash: null }));

describe('saving and choosing dogs', () => {
  it('shows today’s empty slots with nothing saved, and saves both reports a pair loads', async () => {
    const storage = new MemoryStorage();
    const { app, root } = openPage(reads, { storage });
    expect([heading(root, 0), heading(root, 1)]).toEqual(['Parent 1No report yet', 'Parent 2No report yet']);
    expect(root.querySelector('.dogs-list')).toBeNull();
    await app.load(0, pdf('a.pdf'));
    await app.load(1, pdf('b.pdf'));
    expect(results(root)?.hidden).toBe(false);
    expect(listed(storage).map((dog) => dog.name)).toEqual(['Sample A', 'Sample B']);
    expect(storage.getItem(SAVED_DOGS_KEY)).not.toContain('%PDF');
  });

  it('lists the one saved dog in its slot and leaves the other slot as today', async () => {
    const { app, root } = openPage(reads);
    await app.load(0, pdf('a.pdf'));
    expect(pressed(root, 0)).toEqual(['dog-0-new-1']);
    expect(root.querySelector('[data-slot="1"] .dogs-list')).toBeNull();
    expect(button(root, 'pick-1').textContent).toBe('Choose PDF');
  });

  it('heads a list slot with its label and “Choose a dog” until a dog is chosen', () => {
    const { root } = openPage(reads, { storage: savedStorage(a, b, d) });
    expect([heading(root, 0), heading(root, 1)]).toEqual(['Parent 1Choose a dog', 'Parent 2Choose a dog']);
    expect(button(root, 'pick-0').textContent).toBe('Add a dog');
  });

  it('chooses, switches and clears with one tap each, updating the results', () => {
    const { root } = openPage(reads, { storage: savedStorage(a, b, d) });
    button(root, 'dog-0-dog-1').click();
    expect(heading(root, 0)).toBe('Parent 1Sample A');
    expect(rows(root, 1)).toEqual(['dog-1-dog-2', 'dog-1-dog-3']);
    button(root, 'dog-1-dog-2').click();
    expect(root.querySelector('#results-h')?.textContent).toBe('Puppy colours: Sample A × Sample B');
    expect(root.querySelectorAll('.card-body')).toHaveLength(2);

    button(root, 'dog-1-dog-3').click();
    expect(root.querySelector('#results-h')?.textContent).toBe('Puppy colours: Sample A × Sample D');
    expect(pressed(root, 1)).toEqual(['dog-1-dog-3']);

    button(root, 'dog-1-dog-3').click();
    expect(heading(root, 1)).toBe('Parent 2Choose a dog');
    expect(results(root)?.hidden).toBe(true);
    expect(root.classList.contains('has-results')).toBe(false);
  });

  it('keeps the nose answer with the saved dog after a reload', async () => {
    const storage = savedStorage(withNoseQuestion({ ...a, name: 'Sample Q', kitIdHash: null }), b);
    const first = openPage(reads, { storage });
    button(first.root, 'dog-0-dog-1').click();
    first.root.querySelector<HTMLInputElement>('[data-key="nose-0-brown"]')?.click();

    const { root } = openPage(reads, { storage });
    expect(heading(root, 0)).toBe('Parent 1Choose a dog');
    button(root, 'dog-0-dog-1').click();
    expect(root.querySelector<HTMLInputElement>('[data-key="nose-0-brown"]')?.checked).toBe(true);
  });

  it('chooses stale dogs and predicts from them, with a note on each card', () => {
    const storage = savedStorage(a, b);
    rewriteSaved(storage, ['dog-1', 'dog-2'], (entry) => ({ ...entry, readerVersion: 0 }));
    const { root } = openPage(reads, { storage });
    expect(root.querySelectorAll('[data-slot="0"] .older')).toHaveLength(2);
    button(root, 'dog-0-dog-1').click();
    button(root, 'dog-1-dog-2').click();
    expect(results(root)?.hidden).toBe(false);
    expect([...root.querySelectorAll('.stale-note')].map((note) => note.textContent)).toEqual([
      'ⓘRead by an older version of this page.Add the report again',
      'ⓘRead by an older version of this page.Add the report again',
    ]);
  });

  it('starts each visit with nothing chosen', async () => {
    const storage = new MemoryStorage();
    const first = openPage(reads, { storage });
    await first.app.load(0, pdf('a.pdf'));
    await first.app.load(1, pdf('b.pdf'));
    const { root } = openPage(reads, { storage });
    expect(pressed(root, 0)).toEqual([]);
    expect(pressed(root, 1)).toEqual([]);
    expect(results(root)?.hidden).toBe(true);
  });

  it('narrows the other slot by sex until Show all, which lasts until that dog changes', () => {
    const { root } = openPage(reads, { storage: savedStorage(a, b, c, d) });
    button(root, 'dog-0-dog-1').click();
    expect(rows(root, 1)).toEqual(['dog-1-dog-2', 'dog-1-dog-4']);
    const showAll = button(root, 'show-all-1');
    showAll.focus();
    showAll.click();
    expect(rows(root, 1)).toEqual(['dog-1-dog-2', 'dog-1-dog-3', 'dog-1-dog-4']);
    expect(focused()).toBe('show-all-1');
    button(root, 'dog-0-dog-3').click();
    expect(rows(root, 1)).toEqual(['dog-1-dog-2', 'dog-1-dog-4']);
  });

  it('opens the slot’s file picker from Add a dog', () => {
    const { root } = openPage(reads, { storage: savedStorage(a, b) });
    const input = root.querySelector<HTMLInputElement>('[data-testid="file-1"]');
    const click = vi.spyOn(input ?? new HTMLInputElement(), 'click').mockImplementation(() => undefined);
    button(root, 'pick-1').click();
    expect(click).toHaveBeenCalled();
  });
});

describe('the filter field', () => {
  const many = (): MemoryStorage =>
    savedStorage(...['Aino', 'Bruno', 'Canela', 'Duna', 'Eetu', 'Gaudí', 'Hilla'].map((name) => ({ ...b, name, kitIdHash: null })));

  it('narrows only its own slot’s list, keeping the field, and says how many are listed when typing pauses', async () => {
    vi.useFakeTimers();
    const { root } = openPage(reads, { storage: many() });
    const field = root.querySelector<HTMLInputElement>('[data-key="find-0"]');
    const list = root.querySelector('[data-slot="0"] .dogs-list');
    if (field === null) {
      throw new Error('no filter field');
    }
    field.focus();
    field.value = 'e';
    field.dispatchEvent(new Event('input'));
    expect(root.querySelector('[data-key="find-0"]')).toBe(field);
    expect(document.activeElement).toBe(field);
    expect(root.querySelector('[data-slot="0"] .dogs-list')).not.toBe(list);
    expect(rows(root, 0)).toHaveLength(2);
    expect(rows(root, 1)).toHaveLength(7);
    expect(spoken(root)).toBe('');
    vi.advanceTimersByTime(1000);
    expect(spoken(root)).toBe('2 dogs listed');
  });

  it('keeps the text after choosing a row, and Clear the filter empties it', async () => {
    const { root } = openPage(reads, { storage: many() });
    const field = root.querySelector<HTMLInputElement>('[data-key="find-0"]');
    if (field === null) {
      throw new Error('no filter field');
    }
    field.value = 'zz';
    field.dispatchEvent(new Event('input'));
    expect(root.querySelector('[data-slot="0"] .listempty')?.textContent).toContain('No dogs match “zz”.');
    button(root, 'clear-filter-0').click();
    expect(field.value).toBe('');
    expect(rows(root, 0)).toHaveLength(7);
    expect(focused()).toBe('find-0');

    field.value = 'ai';
    field.dispatchEvent(new Event('input'));
    button(root, rows(root, 0)[0] ?? '').click();
    expect(field.value).toBe('ai');
    expect(heading(root, 0)).toBe('Parent 1Aino');
  });
});

describe('adding one report to a slot', () => {
  it('saves and places it, replacing the chosen dog, with focus on the heading', async () => {
    const { app, root } = openPage(reads, { storage: savedStorage(a, b) });
    button(root, 'dog-0-dog-1').click();
    await app.load(0, pdf('c.pdf'));
    expect(heading(root, 0)).toBe('Parent 1Sample C');
    expect(pressed(root, 0)).toEqual(['dog-0-new-1']);
    expect(focused()).toBe('name-0');
    expect(spoken(root)).toBe('Parent 1: Sample C saved.');
  });

  it('updates the chosen dog in place when the report is its own', async () => {
    const storage = savedStorage(a, b);
    const { app, root } = openPage({ 'a2.pdf': ok({ ...a, name: 'Sample A Two' }) }, { storage });
    button(root, 'dog-0-dog-1').click();
    await app.load(0, pdf('a2.pdf'));
    expect(heading(root, 0)).toBe('Parent 1Sample A Two');
    expect(pressed(root, 0)).toEqual(['dog-0-dog-1']);
    expect(listed(storage)).toHaveLength(2);
    expect(spoken(root)).toBe('Parent 1: Sample A Two updated.');
  });

  it('keeps the card while reading, with the indicator in place of Add a dog', async () => {
    const slow = slowRead(ok(c));
    const { app, root } = openPage({ 'slow.pdf': slow.read }, { storage: savedStorage(a, b) });
    button(root, 'dog-0-dog-1').click();
    const loading = app.load(0, pdf('slow.pdf'));
    expect(root.querySelector('[data-slot="0"] .add[aria-busy="true"]')?.textContent).toBe('Reading slow.pdf…');
    expect(root.querySelector('[data-slot="0"] .card-body')).not.toBeNull();
    expect(root.querySelector('[data-key="pick-0"]')).toBeNull();
    await slow.release();
    await loading;
    expect(heading(root, 0)).toBe('Parent 1Sample C');
  });

  it('lets a row tapped during the read win, and saves the read without placing it', async () => {
    const slow = slowRead(ok(c));
    const storage = savedStorage(a, b);
    const { app, root } = openPage({ 'slow.pdf': slow.read }, { storage });
    const loading = app.load(0, pdf('slow.pdf'));
    button(root, 'dog-0-dog-1').click();
    await slow.release();
    await loading;
    expect(heading(root, 0)).toBe('Parent 1Sample A');
    expect(rows(root, 0)).toContain('dog-0-new-1');
    expect(pressed(root, 0)).toEqual(['dog-0-dog-1']);
    expect(listed(storage).map((dog) => dog.name)).toEqual(['Sample A', 'Sample B', 'Sample C']);
    expect(spoken(root)).toBe('Sample C saved.');
  });

  it('places a file dropped on the slot during a read instead, and saves both', async () => {
    const slow = slowRead(ok(c));
    const storage = new MemoryStorage();
    const { app, root } = openPage({ ...reads, 'slow.pdf': slow.read }, { storage });
    const loading = app.load(0, pdf('slow.pdf'));
    await app.drop([pdf('d.pdf')], 0);
    await slow.release();
    await loading;
    expect(heading(root, 0)).toBe('Parent 1Sample D');
    expect(listed(storage).map((dog) => dog.name)).toEqual(['Sample C', 'Sample D']);
  });

  it('keeps focus on a chosen row when a finished read lists a dog before it', async () => {
    const slow = slowRead(ok({ ...a, name: 'Aaron', kitIdHash: null }));
    // Unread sexes, so that neither list is narrowed.
    const { app, root } = openPage({ 'slow.pdf': slow.read }, { storage: savedStorage({ ...b, sex: null }, { ...d, sex: null }) });
    const loading = app.load(1, pdf('slow.pdf'));
    button(root, 'dog-1-dog-1').click();
    const row = button(root, 'dog-0-dog-2');
    row.focus();
    row.click();
    expect(spoken(root)).toBe('Parent 1: Sample D chosen. Results updated.');
    expect(focused()).toBe('dog-0-dog-2');
    await slow.release();
    await loading;
    expect(rows(root, 0)[0]).toBe('dog-0-new-1');
    expect(focused()).toBe('dog-0-dog-2');
    button(root, 'dog-0-dog-2').click();
    expect(spoken(root)).toBe('Parent 1 cleared.');
    expect(focused()).toBe('dog-0-dog-2');
  });

  it('shows a rejection in its slot until the next choose, clear or add there', async () => {
    const { app, root } = openPage(reads, { storage: savedStorage(a, b, d) });
    button(root, 'dog-0-dog-1').click();
    await app.load(0, pdf('other.pdf'));
    expect(notice(root, 0)).toBe("⚠This PDF isn't a Wisdom Panel dog report. Choose the genetics report you got from Wisdom Panel or MyDogDNA.");
    expect(root.querySelector('[data-slot="0"] .err')?.getAttribute('role')).toBeNull();
    expect(heading(root, 0)).toBe('Parent 1Sample A');
    expect(root.querySelector('[data-slot="0"] .card-body')).not.toBeNull();
    expect(focused()).toBe('pick-0');
    expect(spoken(root)).toBe("Parent 1: This PDF isn't a Wisdom Panel dog report. Choose the genetics report you got from Wisdom Panel or MyDogDNA.");

    button(root, 'dog-1-dog-2').click();
    expect(notice(root, 0)).not.toBeNull();
    button(root, 'dog-0-dog-1').click();
    expect(notice(root, 0)).toBeNull();
  });

  it('shows a rejection above Choose PDF in a slot with nothing choosable', async () => {
    const { app, root } = openPage(reads);
    await app.load(1, pdf('other.pdf'));
    expect(heading(root, 1)).toBe('Parent 2Report can’t be read');
    expect(button(root, 'pick-1').textContent).toBe('Choose another PDF');
    expect(focused()).toBe('pick-1');
  });
});

describe('a report that is the other slot’s dog', () => {
  const SAME = 'This report is Sample A, already Parent 1; the saved dog was updated.';

  it('updates that dog, leaves it in Parent 1 and says so in Parent 2’s list', async () => {
    const storage = savedStorage(a, b);
    const { app, root } = openPage({ 'a2.pdf': ok({ ...a, breed: 'Updated breed' }) }, { storage });
    button(root, 'dog-0-dog-1').click();
    await app.load(1, pdf('a2.pdf'));
    expect(pressed(root, 0)).toEqual(['dog-0-dog-1']);
    expect(pressed(root, 1)).toEqual([]);
    expect(notice(root, 1)).toBe(`ⓘ${SAME}`);
    expect(root.querySelector('[data-slot="1"] .err')?.previousElementSibling?.tagName).toBe('H2');
    expect(spoken(root)).toBe(SAME);
    expect(focused()).toBe('pick-1');
    expect(listed(storage)).toHaveLength(2);
    expect(root.querySelector('[data-slot="0"] .meta')?.textContent).toContain('Updated breed');
  });

  it('shows the notice above Choose PDF when Parent 2 has nothing choosable', async () => {
    const { app, root } = openPage(reads, { storage: savedStorage(a) });
    button(root, 'dog-0-dog-1').click();
    await app.load(1, pdf('a.pdf'));
    expect(heading(root, 1)).toBe('Parent 2No report yet');
    expect(notice(root, 1)).toBe(`ⓘ${SAME}`);
    expect(root.querySelector('[data-slot="1"] .err')?.nextElementSibling?.classList.contains('drop')).toBe(true);
    button(root, 'dog-0-dog-1').click();
    expect(notice(root, 1)).toBe(`ⓘ${SAME}`);
  });
});

describe('adding a report again', () => {
  const pickerOf = (root: HTMLElement, slot: number) => {
    const input = root.querySelector<HTMLInputElement>(`[data-testid="file-${slot}"]`);
    return vi.spyOn(input ?? new HTMLInputElement(), 'click').mockImplementation(() => undefined);
  };

  it('renews a stale chosen dog in place, keeping it chosen, with focus on its row', async () => {
    const storage = savedStorage(a, b);
    rewriteSaved(storage, ['dog-1'], (entry) => ({ ...entry, readerVersion: 0 }));
    const { app, root } = openPage(reads, { storage });
    button(root, 'dog-0-dog-1').click();
    const picker = pickerOf(root, 0);
    button(root, 'readd-0').click();
    expect(picker).toHaveBeenCalled();
    await app.load(0, pdf('a.pdf'));
    expect(pressed(root, 0)).toEqual(['dog-0-dog-1']);
    expect(root.querySelector('.stale-note')).toBeNull();
    expect(focused()).toBe('dog-0-dog-1');
    expect(listed(storage).map((dog) => dog.status)).toEqual(['current', 'current']);
  });

  it('adds a different dog’s report from an unusable row as a new dog, leaving the row', async () => {
    const storage = savedStorage({ ...b, kitIdHash: hash('ab') }, d);
    rewriteSaved(storage, ['dog-1'], (entry) => ({ ...entry, report: { ...(entry['report'] as object), shortTail: 1.5 } }));
    const { app, root } = openPage(reads, { storage });
    expect(button(root, 'dog-0-dog-1').classList.contains('unusable')).toBe(true);
    pickerOf(root, 0);
    button(root, 'dog-0-dog-1').click();
    await app.load(0, pdf('c.pdf'));
    expect(pressed(root, 0)).toEqual(['dog-0-new-1']);
    expect(button(root, 'dog-0-dog-1').classList.contains('unusable')).toBe(true);
    expect(focused()).toBe('dog-0-new-1');
  });

  it('renews an unusable row with its own report and chooses it', async () => {
    const storage = savedStorage(b, d);
    rewriteSaved(storage, ['dog-1'], (entry) => ({ ...entry, report: { ...(entry['report'] as object), shortTail: 1.5 } }));
    const { app, root } = openPage(reads, { storage });
    pickerOf(root, 1);
    button(root, 'dog-1-dog-1').click();
    await app.load(1, pdf('b.pdf'));
    expect(pressed(root, 1)).toEqual(['dog-1-dog-1']);
    expect(focused()).toBe('dog-1-dog-1');
  });

  it('applies the other slot’s notice to a re-add of that slot’s dog', async () => {
    const storage = savedStorage(a, b);
    rewriteSaved(storage, ['dog-2'], (entry) => ({ ...entry, readerVersion: 0 }));
    const { app, root } = openPage(reads, { storage });
    button(root, 'dog-0-dog-1').click();
    button(root, 'dog-1-dog-2').click();
    pickerOf(root, 1);
    button(root, 'readd-1').click();
    await app.load(1, pdf('a.pdf'));
    expect(pressed(root, 0)).toEqual(['dog-0-dog-1']);
    expect(pressed(root, 1)).toEqual(['dog-1-dog-2']);
    expect(notice(root, 1)).toBe('ⓘThis report is Sample A, already Parent 1; the saved dog was updated.');
  });

  it('forgets the re-add target when Add a dog opens the picker', async () => {
    const storage = savedStorage(a, b);
    rewriteSaved(storage, ['dog-1'], (entry) => ({ ...entry, readerVersion: 0 }));
    const { app, root } = openPage(reads, { storage });
    button(root, 'dog-0-dog-1').click();
    pickerOf(root, 0);
    button(root, 'readd-0').click();
    button(root, 'pick-0').click();
    await app.load(0, pdf('c.pdf'));
    expect(listed(storage)).toHaveLength(3);
  });
});

describe('stored data the page cannot use', () => {
  it('shows a results error when the pair cannot be computed, and the slots still work', () => {
    const { root } = openPage(reads, {
      storage: savedStorage(a, b, d),
      predictPuppies: () => {
        throw new Error('rejected by the genetics');
      },
    });
    button(root, 'dog-0-dog-1').click();
    button(root, 'dog-1-dog-2').click();
    expect(spoken(root)).toBe('Parent 2: Sample B chosen. Puppy colours can’t be worked out for this pair.');
    expect(root.querySelector('.results-error')?.textContent).toBe(RESULTS_FAILED);
    expect(results(root)?.hidden).toBe(true);
    button(root, 'dog-1-dog-3').click();
    expect(heading(root, 1)).toBe('Parent 2Sample D');
    button(root, 'dog-1-dog-3').click();
    expect(root.querySelector('.results-error')).toBeNull();
  });

  it('clears a slot whose chosen dog turns out unusable', async () => {
    const storage = savedStorage(a, b);
    rewriteSaved(storage, ['dog-1'], (entry) => ({ ...entry, report: { ...(entry['report'] as object), shortTail: 1.5 } }));
    const { root } = openPage(reads, {
      storage,
      initial: {
        slots: [
          { chosen: 'dog-1', reading: null, notice: null, filter: '', showAll: false },
          { chosen: 'dog-2', reading: null, notice: null, filter: '', showAll: false },
        ],
        pageAlert: null,
        undo: null,
        clearing: false,
      },
    });
    expect(heading(root, 0)).toBe('Parent 1Choose a dog');
    expect(heading(root, 1)).toBe('Parent 2Sample B');
  });

  it('clears and announces a slot whose dog another tab deleted, at this page’s next write', async () => {
    const storage = savedStorage(a, b, d);
    const { app, root } = openPage(reads, { storage });
    button(root, 'dog-0-dog-1').click();
    openSavedDogs({ storage: () => storage }).remove('dog-1');
    expect(heading(root, 0)).toBe('Parent 1Sample A');
    await app.load(1, pdf('c.pdf'));
    expect(heading(root, 0)).toBe('Parent 1Choose a dog');
    expect(spoken(root)).toBe('Parent 2: Sample C saved. Parent 1 cleared.');
  });
});

describe('the page’s storage', () => {
  it('uses window.localStorage when none is given', async () => {
    window.localStorage.clear();
    const store = openSavedDogs({ storage: () => window.localStorage, newId: sequentialIds('dog') });
    store.add(a);
    document.body.replaceChildren();
    const root = document.createElement('main');
    document.body.append(root);
    startApp(root, { read: async () => ok(b), narrow: () => false });
    expect(root.querySelector('[data-key="dog-0-dog-1"]')).not.toBeNull();
    window.localStorage.clear();
  });
});

describe('clearing a chosen row that the list would hide', () => {
  it('moves focus to the slot heading when the row leaves the list', () => {
    const { root } = openPage(reads, { storage: savedStorage(a, b, c, d) });
    button(root, 'dog-0-dog-4').click();
    button(root, 'show-all-1').click();
    button(root, 'dog-1-dog-2').click();
    expect(rows(root, 0)).toEqual(['dog-0-dog-1', 'dog-0-dog-3', 'dog-0-dog-4']);
    const row = button(root, 'dog-0-dog-4');
    row.focus();
    row.click();
    expect(rows(root, 0)).toEqual(['dog-0-dog-1', 'dog-0-dog-3']);
    expect(focused()).toBe('name-0');
  });

  it('moves focus to the filter field when it shows', () => {
    const { root } = openPage(reads, { storage: savedStorage(...sevenFemales()) });
    const field = root.querySelector<HTMLInputElement>('[data-key="find-0"]');
    if (field === null) {
      throw new Error('no filter field');
    }
    button(root, 'dog-0-dog-1').click();
    field.value = 'bru';
    field.dispatchEvent(new Event('input'));
    expect(rows(root, 0)).toEqual(['dog-0-dog-1', 'dog-0-dog-2']);
    const row = button(root, 'dog-0-dog-1');
    row.focus();
    row.click();
    expect(rows(root, 0)).toEqual(['dog-0-dog-2']);
    expect(focused()).toBe('find-0');
  });

  it('keeps focus on the row when it stays listed', () => {
    const { root } = openPage(reads, { storage: savedStorage(a, b, c, d) });
    const row = button(root, 'dog-0-dog-1');
    row.focus();
    row.click();
    button(root, 'dog-0-dog-1').click();
    expect(focused()).toBe('dog-0-dog-1');
  });
});

describe('deleting a dog', () => {
  const undoLine = (root: HTMLElement, slot: number) => root.querySelector(`[data-slot="${slot}"] .undo`);

  /** Sample B asks the nose question and is answered brown. */
  function answered(): MemoryStorage {
    const storage = savedStorage(a, withNoseQuestion({ ...b, kitIdHash: null }), c, d);
    openSavedDogs({ storage: () => storage }).setNose('dog-2', 'brown');
    return storage;
  }

  it('removes an unchosen dog from both lists, offers Undo under the list, and Undo restores it unchosen with its nose answer', () => {
    const storage = answered();
    const { root } = openPage(reads, { storage });
    button(root, 'dog-0-dog-1').click();
    expect(rows(root, 1)).toEqual(['dog-1-dog-2', 'dog-1-dog-4']);

    button(root, 'delete-1-dog-2').click();
    expect(rows(root, 1)).toEqual(['dog-1-dog-4']);
    expect(rows(root, 0)).not.toContain('dog-0-dog-2');
    expect(listed(storage).map((dog) => dog.id)).toEqual(['dog-1', 'dog-3', 'dog-4']);
    expect(undoLine(root, 1)?.textContent).toBe('Deleted Sample B. Undo');
    expect(undoLine(root, 1)?.previousElementSibling?.classList.contains('listing')).toBe(true);
    expect(undoLine(root, 0)).toBeNull();
    expect(spoken(root)).toBe('Deleted Sample B. Undo available.');
    expect(focused()).toBe('delete-1-dog-4');

    button(root, 'undo-1').click();
    expect(rows(root, 1)).toEqual(['dog-1-dog-2', 'dog-1-dog-4']);
    expect(pressed(root, 1)).toEqual([]);
    expect(undoLine(root, 1)).toBeNull();
    expect(listed(storage).find((dog) => dog.id === 'dog-2')?.nose).toBe('brown');
    expect(spoken(root)).toBe('Sample B restored.');
    expect(focused()).toBe('dog-1-dog-2');
  });

  it('clears the slot holding the deleted dog, and Undo chooses it again while that slot has nothing chosen', () => {
    const { root } = openPage(reads, { storage: savedStorage(a, b, c, d) });
    button(root, 'dog-0-dog-1').click();
    button(root, 'dog-1-dog-2').click();
    button(root, 'delete-0-dog-1').click();
    expect(heading(root, 0)).toBe('Parent 1Choose a dog');
    expect(results(root)?.hidden).toBe(true);
    button(root, 'undo-0').click();
    expect(pressed(root, 0)).toEqual(['dog-0-dog-1']);
    expect(results(root)?.hidden).toBe(false);
    expect(spoken(root)).toBe('Sample A restored. Results updated.');
    expect(focused()).toBe('dog-0-dog-1');
  });

  it('only lists the dog again when its slot holds another dog by the time of Undo', () => {
    const storage = savedStorage(a, b, c, d);
    const deleted = openSavedDogs({ storage: () => storage }).remove('dog-1').deleted;
    if (deleted === null) {
      throw new Error('nothing deleted');
    }
    const { root } = openPage(reads, {
      storage,
      initial: { slots: [{ ...EMPTY_SLOT, chosen: 'dog-3' }, EMPTY_SLOT], pageAlert: null, undo: { deleted, slot: 0, chosen: true }, clearing: false },
    });
    button(root, 'undo-0').click();
    expect(pressed(root, 0)).toEqual(['dog-0-dog-3']);
    expect(rows(root, 0)).toContain('dog-0-dog-1');
    expect(focused()).toBe('dog-0-dog-1');
  });

  it('shows today’s empty slot with Undo above Choose PDF when the delete leaves nothing choosable there, with focus on Undo', () => {
    const { root } = openPage(reads, { storage: savedStorage(a, b) });
    button(root, 'dog-0-dog-1').click();
    button(root, 'delete-1-dog-2').click();
    expect(heading(root, 1)).toBe('Parent 2No report yet');
    expect(undoLine(root, 1)?.nextElementSibling?.classList.contains('drop')).toBe(true);
    expect(focused()).toBe('undo-1');
    button(root, 'undo-1').click();
    expect(rows(root, 1)).toEqual(['dog-1-dog-2']);
    expect(focused()).toBe('dog-1-dog-2');
  });

  it('moves focus to the previous row’s delete after the last row, and to Add a dog when no row is left listed', () => {
    const { root } = openPage(reads, { storage: savedStorage(a, b, c, d) });
    button(root, 'delete-0-dog-4').click();
    expect(focused()).toBe('delete-0-dog-3');

    button(root, 'dog-0-dog-1').click();
    expect(rows(root, 1)).toEqual(['dog-1-dog-2']);
    button(root, 'delete-1-dog-2').click();
    expect(rows(root, 1)).toEqual([]);
    expect(heading(root, 1)).toBe('Parent 2Choose a dog');
    expect(focused()).toBe('pick-1');
  });

  it('keeps the undo line while typing in a filter and pressing Show all', () => {
    const { root } = openPage(reads, { storage: savedStorage(a, ...sevenFemales()) });
    button(root, 'dog-0-dog-1').click();
    button(root, 'delete-1-dog-2').click();
    const field = root.querySelector<HTMLInputElement>('[data-key="find-1"]');
    if (field === null) {
      throw new Error('no filter field');
    }
    field.value = 'e';
    field.dispatchEvent(new Event('input'));
    expect(undoLine(root, 1)).not.toBeNull();
    button(root, 'show-all-1').click();
    expect(undoLine(root, 1)).not.toBeNull();
  });

  it.each([
    ['a choose in the other slot', (root: HTMLElement) => button(root, 'dog-1-dog-2').click()],
    ['a clear in the same slot', (root: HTMLElement) => button(root, 'dog-0-dog-3').click()],
    ['another delete', (root: HTMLElement) => button(root, 'delete-1-dog-2').click()],
  ])('ends the undo line on %s', (_, act) => {
    const { root } = openPage(reads, { storage: savedStorage(a, b, c, d) });
    button(root, 'dog-0-dog-3').click();
    button(root, 'delete-0-dog-1').click();
    expect(undoLine(root, 0)).not.toBeNull();
    act(root);
    expect(undoLine(root, 0)).toBeNull();
  });

  it('ends the undo line when a read finishes and saves, even one not placed', async () => {
    const slow = slowRead(ok(c));
    const { app, root } = openPage({ 'slow.pdf': slow.read }, { storage: savedStorage(a, b, d) });
    const loading = app.load(1, pdf('slow.pdf'));
    button(root, 'dog-1-dog-2').click();
    button(root, 'delete-0-dog-1').click();
    expect(undoLine(root, 0)).not.toBeNull();
    await slow.release();
    await loading;
    expect(undoLine(root, 0)).toBeNull();
    expect(pressed(root, 1)).toEqual(['dog-1-dog-2']);
  });

  it('keeps the undo line when a read is rejected', async () => {
    const { app, root } = openPage(reads, { storage: savedStorage(a, b, d) });
    button(root, 'delete-0-dog-1').click();
    await app.load(1, pdf('other.pdf'));
    expect(undoLine(root, 0)).not.toBeNull();
  });

  it('saves the dog again when its report, being read, finishes after the delete, and ends the undo line', async () => {
    const luna = { ...a, name: 'Luna' };
    const slow = slowRead(ok(luna));
    const storage = savedStorage(luna, b, d);
    const { app, root } = openPage({ 'luna.pdf': slow.read }, { storage });
    const loading = app.load(1, pdf('luna.pdf'));
    button(root, 'delete-0-dog-1').click();
    expect(undoLine(root, 0)?.textContent).toBe('Deleted Luna. Undo');
    await slow.release();
    await loading;
    expect(undoLine(root, 0)).toBeNull();
    expect(listed(storage).map((dog) => dog.name)).toEqual(['Luna', 'Sample B', 'Sample D']);
  });

  it('on Undo keeps the dog another tab saved meanwhile with the same kit ID, carrying the nose answer and choosing it', () => {
    const luna = withNoseQuestion({ ...a, name: 'Luna', kitIdHash: hash('ab') });
    const storage = savedStorage(luna, b);
    openSavedDogs({ storage: () => storage }).setNose('dog-1', 'brown');
    const { root } = openPage(reads, { storage });
    button(root, 'dog-0-dog-1').click();
    button(root, 'delete-0-dog-1').click();
    openSavedDogs({ storage: () => storage, newId: sequentialIds('tab') }).add({ ...luna, name: 'Luna Again' });
    button(root, 'undo-0').click();
    expect(pressed(root, 0)).toEqual(['dog-0-tab-1']);
    expect(heading(root, 0)).toBe('Parent 1Luna Again');
    expect(listed(storage).find((dog) => dog.id === 'tab-1')?.nose).toBe('brown');
    expect(spoken(root)).toBe('Luna Again restored.');
    expect(focused()).toBe('dog-0-tab-1');
  });
});

describe('Clear saved dogs', () => {
  const clearButton = (root: HTMLElement) => root.querySelector<HTMLButtonElement>('[data-key="clear-saved"]');

  it('shows one button below both slots while any dog is saved', async () => {
    const { app, root } = openPage(reads);
    expect(clearButton(root)).toBeNull();
    await app.load(0, pdf('a.pdf'));
    const tools = clearButton(root)?.closest('.library-tools');
    expect(clearButton(root)?.textContent).toBe('Clear saved dogs');
    expect(clearButton(root)?.classList.contains('ghost')).toBe(true);
    expect(tools?.previousElementSibling?.classList.contains('slots')).toBe(true);
    expect(tools?.nextElementSibling?.classList.contains('pair')).toBe(true);
  });

  it('asks inline, with focus on Cancel, and Cancel returns focus to the button', () => {
    const confirm = vi.fn(() => true);
    vi.stubGlobal('confirm', confirm);
    const { root } = openPage(reads, { storage: savedStorage(a, b, c, d) });
    clearButton(root)?.click();
    const group = root.querySelector('.library-tools [role="group"]');
    expect(group?.getAttribute('aria-label')).toBe('Clear saved dogs');
    expect(group?.textContent).toBe('Delete all 4 saved dogs?DeleteCancel');
    expect(button(root, 'clear-delete').classList.contains('danger')).toBe(true);
    expect(focused()).toBe('clear-cancel');
    expect(clearButton(root)).toBeNull();
    button(root, 'clear-cancel').click();
    expect(root.querySelector('.library-tools [role="group"]')).toBeNull();
    expect(focused()).toBe('clear-saved');
    expect(confirm).not.toHaveBeenCalled();
  });

  it('deletes every dog on Delete, empties both slots and the undo line, and keeps the breeding note’s dismissal', () => {
    const storage = savedStorage(a, b, c, d);
    storage.setItem(NOTE_HIDDEN_KEY, String(Date.now() + 1000));
    const { root } = openPage(reads, { storage });
    button(root, 'dog-0-dog-1').click();
    button(root, 'dog-1-dog-2').click();
    button(root, 'delete-0-dog-3').click();
    clearButton(root)?.click();
    button(root, 'clear-delete').click();
    expect(storage.getItem(SAVED_DOGS_KEY)).toBeNull();
    expect(storage.getItem(NOTE_HIDDEN_KEY)).not.toBeNull();
    expect([heading(root, 0), heading(root, 1)]).toEqual(['Parent 1No report yet', 'Parent 2No report yet']);
    expect(root.querySelector('.undo')).toBeNull();
    expect(root.querySelector('.dogs-list')).toBeNull();
    expect(results(root)?.hidden).toBe(true);
    expect(clearButton(root)).toBeNull();
    expect(spoken(root)).toBe('All saved dogs deleted.');
    expect(focused()).toBe('pick-0');
  });

  it('discards a read in progress when Delete is confirmed', async () => {
    const slow = slowRead(ok(c));
    const storage = savedStorage(a, b);
    const { app, root } = openPage({ 'slow.pdf': slow.read }, { storage });
    const loading = app.load(1, pdf('slow.pdf'));
    clearButton(root)?.click();
    button(root, 'clear-delete').click();
    expect(heading(root, 1)).toBe('Parent 2No report yet');
    await slow.release();
    await loading;
    expect(storage.getItem(SAVED_DOGS_KEY)).toBeNull();
    expect(heading(root, 1)).toBe('Parent 2No report yet');
    expect(spoken(root)).toBe('All saved dogs deleted.');
  });
});

