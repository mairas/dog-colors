// @vitest-environment happy-dom
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { ResolvedDog } from '../../src/genetics/dog.ts';
import type { Report, Sex } from '../../src/report/types.ts';
import { READER_VERSION } from '../../src/report/version.ts';
import { STORED_VERSION, type SavedDog, type UsableDog } from '../../src/saved/check.ts';
import { openSavedDogs, SAVED_DOGS_KEY } from '../../src/saved/store.ts';
import {
  dogLabel,
  filterField,
  listing,
  listingStatus,
  listsDogs,
  renderListSlot,
  resolveSaved,
  showsFilter,
  type ListActions,
  type ListSlotInput,
} from '../../src/ui/list.ts';
import { alertBox, renderOpenSlot } from '../../src/ui/slots.ts';
import { MemoryStorage, sequentialIds, withNoseQuestion } from '../saved/storage.ts';
import { sampleReport } from './app.ts';

let white: Report;
let solid: Report;

beforeAll(async () => {
  [white, solid] = await Promise.all([sampleReport('a'), sampleReport('c')]);
});

const dog = (name: string | null, sex: Sex | null, base: Report = white): Report => ({ ...base, name, sex, kitIdHash: null });

/** The dogs a store lists after saving the reports, in its order. */
function saved(...reports: readonly Report[]): readonly SavedDog[] {
  const storage = new MemoryStorage();
  const store = openSavedDogs({ storage: () => storage, newId: sequentialIds(), locale: 'en' });
  for (const report of reports) {
    store.add(report);
  }
  return store.dogs();
}

/** The dogs a store lists from raw stored entries, as an older page or another site wrote them. */
function stored(entries: readonly Readonly<Record<string, unknown>>[]): readonly SavedDog[] {
  const storage = new MemoryStorage({ [SAVED_DOGS_KEY]: JSON.stringify({ version: STORED_VERSION, dogs: entries }) });
  return openSavedDogs({ storage: () => storage, locale: 'en' }).dogs();
}

const entry = (id: string, report: unknown, changes: Readonly<Record<string, unknown>> = {}): Record<string, unknown> => ({
  id,
  readerVersion: READER_VERSION,
  savedAt: 0,
  nose: null,
  report,
  ...changes,
});

let calls: string[];
const ACTIONS: ListActions = {
  toggle: (slot, id) => calls.push(`toggle ${slot} ${id}`),
  remove: (slot, id) => calls.push(`remove ${slot} ${id}`),
  showAll: (slot, all) => calls.push(`showAll ${slot} ${all}`),
  clearFilter: (slot) => calls.push(`clearFilter ${slot}`),
  undo: (slot) => calls.push(`undo ${slot}`),
  pick: (slot) => calls.push(`pick ${slot}`),
  readd: (slot, id) => calls.push(`readd ${slot} ${id}`),
  answer: (slot, nose) => calls.push(`answer ${slot} ${nose}`),
};

beforeEach(() => {
  calls = [];
});

function render(input: Partial<ListSlotInput> & Pick<ListSlotInput, 'dogs'>): HTMLElement {
  const element = renderListSlot(
    {
      slot: 1,
      chosen: null,
      other: null,
      field: filterField(1, () => undefined),
      filterText: '',
      showAll: false,
      notice: null,
      deleted: null,
      reading: null,
      resolve: resolveSaved,
      ...input,
    },
    ACTIONS,
  );
  document.body.replaceChildren(element);
  return element;
}

const rows = (element: HTMLElement): HTMLButtonElement[] => [...element.querySelectorAll<HTMLButtonElement>('.dogs-list button.dog')];
const rowNames = (element: HTMLElement): string[] => rows(element).map((row) => row.querySelector('.nm')?.firstChild?.textContent ?? '');
const heading = (element: HTMLElement): string => element.querySelector('h2')?.lastChild?.textContent ?? '';
const text = (element: Element | null): string => (element?.textContent ?? '').replace(/\s+/g, ' ').trim();
const byKey = (element: HTMLElement, key: string): HTMLButtonElement => {
  const found = element.querySelector<HTMLButtonElement>(`[data-key="${key}"]`);
  if (found === null) {
    throw new Error(`no element ${key}`);
  }
  return found;
};
const idOf = (dogs: readonly SavedDog[], name: string): string => {
  const found = dogs.find((candidate) => candidate.name === name);
  if (found === undefined) {
    throw new Error(`no dog ${name}`);
  }
  return found.id;
};
const find = (dogs: readonly SavedDog[], name: string): SavedDog => dogs.find((candidate) => candidate.name === name) ?? (() => {
  throw new Error(`no dog ${name}`);
})();

describe('a list-mode slot’s rows', () => {
  it('lists the saved dogs alphabetically as unpressed toggle buttons with name, sex and coat picture', () => {
    const dogs = saved(dog('Canela', 'female'), dog('aino', 'female'), dog('Bruno', 'male', solid));
    const element = render({ dogs });

    expect(rowNames(element)).toEqual(['aino', 'Bruno', 'Canela']);
    for (const row of rows(element)) {
      expect(row.getAttribute('aria-pressed')).toBe('false');
      expect(row.querySelector('svg.chip')?.getAttribute('aria-hidden')).toBe('true');
    }
    const bruno = rows(element)[1];
    expect(bruno?.getAttribute('aria-label')).toBe('Bruno, male');
    expect(bruno?.querySelector('.sx')?.textContent).toBe('♂');
    expect(bruno?.querySelector('.sx')?.getAttribute('aria-hidden')).toBe('true');
    expect(rows(element)[0]?.getAttribute('aria-label')).toBe('aino, female');
    expect(heading(element)).toBe('Choose a dog');
    expect(element.querySelector('.dogs-list')?.getAttribute('aria-label')).toBe('Saved dogs for Parent 2');
  });

  it('marks the chosen row pressed with a tick, names the slot after it and shows its card', () => {
    const dogs = saved(dog('Aino', 'female'), dog('Bruno', 'male', solid));
    const element = render({ dogs, chosen: idOf(dogs, 'Bruno') });

    const [aino, bruno] = rows(element);
    expect(bruno?.getAttribute('aria-pressed')).toBe('true');
    expect(bruno?.querySelector('.tick svg')).not.toBeNull();
    expect(aino?.querySelector('.tick svg')).toBeNull();
    expect(heading(element)).toBe('Bruno');
    expect(text(element.querySelector('.card-body .own-name'))).toBe('Brown, solid');
    expect(element.querySelector('.card-body .stale-note')).toBeNull();
  });

  it('calls toggle with the dog’s ID on a row and remove on its delete button', () => {
    const dogs = saved(dog('Aino', 'female'), dog('Bruno', 'male'));
    const element = render({ dogs, chosen: idOf(dogs, 'Bruno') });
    const aino = idOf(dogs, 'Aino');
    const bruno = idOf(dogs, 'Bruno');

    byKey(element, `dog-1-${aino}`).click();
    byKey(element, `dog-1-${bruno}`).click();
    byKey(element, `delete-1-${aino}`).click();
    expect(calls).toEqual([`toggle 1 ${aino}`, `toggle 1 ${bruno}`, `remove 1 ${aino}`]);
  });

  it('gives each row a delete button beside it, named after the dog', () => {
    const dogs = saved(dog('Aino', 'female'));
    const element = render({ dogs });
    const item = element.querySelector('.dogs-list li');
    const remove = item?.querySelector('button.del');
    expect(remove?.getAttribute('aria-label')).toBe('Delete Aino');
    expect(remove?.previousElementSibling?.classList.contains('dog')).toBe(true);
  });

  it('shows "Unnamed dog" for a dog without a name, in its row, heading and genotype caption', () => {
    const dogs = saved(dog(null, 'female'), dog('Aino', 'female'));
    const element = render({ dogs, chosen: dogs[1]?.id ?? null });

    expect(rowNames(element)).toEqual(['Aino', 'Unnamed dog']);
    expect(heading(element)).toBe('Unnamed dog');
    expect(text(element.querySelector('table.geno caption'))).toBe('Unnamed dog: colour genotype as read');
  });

  it('writes a name that looks like markup as literal text', () => {
    const name = '<img src=x onerror=alert(1)>';
    const dogs = saved(dog(name, 'female'));
    const element = render({ dogs, chosen: dogs[0]?.id ?? null, deleted: { name, colour: null } });

    expect(element.querySelector('img')).toBeNull();
    expect(rowNames(element)).toEqual([name]);
    expect(heading(element)).toBe(name);
    expect(text(element.querySelector('.undo'))).toContain(name);
  });
});

describe('two saved dogs with the same name', () => {
  it('add each dog’s predicted own colour to its row’s, delete button’s and undo line’s names', () => {
    const dogs = saved(dog('Luna', 'female'), dog('Luna', 'female', solid), dog('Aino', 'female'));
    const element = render({ dogs });

    expect(rows(element).map((row) => row.getAttribute('aria-label'))).toEqual([
      'Aino, female',
      'Luna, female, white with brown markings',
      'Luna, female, brown, solid',
    ]);
    expect([...element.querySelectorAll('button.del')].map((button) => button.getAttribute('aria-label'))).toEqual([
      'Delete Aino',
      'Delete Luna, white with brown markings',
      'Delete Luna, brown, solid',
    ]);
    const luna = find(dogs, 'Luna');
    expect(dogLabel(luna, dogs, resolveSaved)).toEqual({ name: 'Luna', colour: 'white with brown markings' });
    expect(dogLabel(find(dogs, 'Aino'), dogs, resolveSaved)).toEqual({ name: 'Aino', colour: null });
  });

  it('keeps the colour on the deleted dog’s undo line when another dog shares its name', () => {
    const [luna, ...rest] = saved(dog('Luna', 'female'), dog('Luna', 'female', solid));
    if (luna === undefined) {
      throw new Error('no dog');
    }
    const label = dogLabel(luna, rest, resolveSaved);
    expect(label).toEqual({ name: 'Luna', colour: 'white with brown markings' });
    const element = render({ dogs: rest, deleted: label });
    const undo = element.querySelector('.undo');
    expect(text(undo)).toBe('Deleted Luna, white with brown markings. Undo');
    expect(text(undo?.querySelector('.vh') ?? null)).toBe(', white with brown markings');
  });
});

describe('the other slot’s dog', () => {
  it('is never listed', () => {
    const dogs = saved(dog('Aino', 'female'), dog('Bruno', 'male'), dog('Canela', 'female'));
    const element = render({ dogs, other: find(dogs, 'Aino'), showAll: true });
    expect(rowNames(element)).toEqual(['Bruno', 'Canela']);
  });

  it('narrows the list to the opposite sex, captioned with a Show all button', () => {
    const dogs = saved(dog('Aino', 'female'), dog('Bruno', 'male'), dog('Canela', 'female'), dog('Eetu', 'male'), dog('Kim', null));
    const element = render({ dogs, other: find(dogs, 'Aino') });

    expect(rowNames(element)).toEqual(['Bruno', 'Eetu']);
    const caption = element.querySelector('.listnote');
    expect(caption?.firstChild?.textContent).toBe('Males only');
    const showAll = byKey(element, 'show-all-1');
    expect(text(showAll)).toBe('Show all');
    expect(showAll.hasAttribute('aria-pressed')).toBe(false);
    showAll.click();
    expect(calls).toEqual(['showAll 1 true']);
  });

  it('lists every other dog after Show all, captioned with a button that narrows again', () => {
    const dogs = saved(dog('Aino', 'female'), dog('Bruno', 'male'), dog('Canela', 'female'), dog('Kim', null));
    const element = render({ dogs, other: find(dogs, 'Aino'), showAll: true });

    expect(rowNames(element)).toEqual(['Bruno', 'Canela', 'Kim']);
    expect(element.querySelector('.listnote')?.firstChild?.textContent).toBe('Showing all dogs');
    const only = byKey(element, 'show-all-1');
    expect(text(only)).toBe('Only males');
    expect(only.hasAttribute('aria-pressed')).toBe(false);
    only.click();
    expect(calls).toEqual(['showAll 1 false']);
  });

  it('narrows nothing when its sex was not read', () => {
    const dogs = saved(dog('Aino', null), dog('Bruno', 'male'), dog('Canela', 'female'));
    const element = render({ dogs, other: find(dogs, 'Aino') });
    expect(rowNames(element)).toEqual(['Bruno', 'Canela']);
    expect(element.querySelector('.listnote')).toBeNull();
  });

  it('never hides the chosen row, even of the same sex', () => {
    const dogs = saved(dog('Aino', 'female'), dog('Bruno', 'male'), dog('Canela', 'female'));
    expect(rowNames(render({ dogs, other: find(dogs, 'Canela'), chosen: idOf(dogs, 'Aino') }))).toEqual(['Aino', 'Bruno']);
    expect(rowNames(render({ dogs, other: find(dogs, 'Aino'), chosen: idOf(dogs, 'Canela') }))).toEqual(['Bruno', 'Canela']);
  });
});

describe('the filter field', () => {
  const seven = (): readonly SavedDog[] =>
    saved(...['Aino', 'Bruno', 'Canela', 'Gaudí', 'Luna', 'Lumi', 'Nilo'].map((name) => dog(name, 'female')));

  it('appears when more than six dogs are saved, labelled for the slot', () => {
    const six = saved(...['A', 'B', 'C', 'D', 'E', 'F'].map((name) => dog(name, 'female')));
    expect(showsFilter(six)).toBe(false);
    expect(render({ dogs: six }).querySelector('input')).toBeNull();

    const dogs = seven();
    expect(showsFilter(dogs)).toBe(true);
    const field = filterField(1, () => undefined);
    const element = render({ dogs, field });
    expect(element.querySelector('input')).toBe(field);
    expect(field.type).toBe('search');
    expect(field.closest('label')?.textContent).toBe('Find a dog for Parent 2');
  });

  it('narrows the list to names containing the text, ignoring case and accents', () => {
    const dogs = seven();
    expect(rowNames(render({ dogs, filterText: 'lu' }))).toEqual(['Lumi', 'Luna']);
    expect(rowNames(render({ dogs, filterText: ' GAUDI ' }))).toEqual(['Gaudí']);
  });

  it('keeps the chosen row listed when the text does not match it', () => {
    const dogs = seven();
    expect(rowNames(render({ dogs, filterText: 'lu', chosen: idOf(dogs, 'Aino') }))).toEqual(['Aino', 'Lumi', 'Luna']);
  });

  it('is the same element across renders, showing the slot’s filter text', () => {
    const dogs = seven();
    const field = filterField(1, () => undefined);
    const first = render({ dogs, field, filterText: 'lu' });
    expect(first.contains(field)).toBe(true);
    expect(field.value).toBe('lu');
    const second = render({ dogs, field, filterText: '' });
    expect(second.contains(field)).toBe(true);
    expect(field.value).toBe('');
  });

  it('is ignored with six dogs or fewer', () => {
    const dogs = saved(dog('Aino', 'female'), dog('Luna', 'female'));
    expect(rowNames(render({ dogs, filterText: 'lu' }))).toEqual(['Aino', 'Luna']);
  });

  it('reports typing, and clears on Escape', () => {
    const changes: string[] = [];
    const field = filterField(0, (value) => changes.push(value));
    document.body.replaceChildren(field);
    field.value = 'lu';
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(field.value).toBe('');
    field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(changes).toEqual(['lu', '']);
    expect(field.dataset['key']).toBe('find-0');
  });
});

describe('a list narrowed to nothing', () => {
  const dogs = (): readonly SavedDog[] =>
    saved(...['Aino', 'Bruno', 'Canela', 'Duna', 'Eetu', 'Gaudí', 'Hilla'].map((name) => dog(name, 'male')), dog('Ross', 'female'));

  it('says no saved females are left, offering Show all', () => {
    const all = saved(dog('Aino', 'male'), dog('Bruno', 'male'));
    const element = render({ dogs: all, other: find(all, 'Aino') });
    expect(element.querySelector('.dogs-list')).toBeNull();
    const empty = element.querySelector('.listempty');
    expect(empty?.querySelector('span')?.textContent).toBe('No saved females.');
    expect(element.querySelector('.listnote')).toBeNull();
    byKey(element, 'show-all-1').click();
    expect(element.querySelector('[data-key="clear-filter-1"]')).toBeNull();
    expect(calls).toEqual(['showAll 1 true']);
  });

  it('says no dogs match the filter, offering to clear it', () => {
    const element = render({ dogs: dogs(), filterText: 'zz' });
    expect(element.querySelector('.listempty span')?.textContent).toBe('No dogs match “zz”.');
    expect(element.querySelector('[data-key="show-all-1"]')).toBeNull();
    byKey(element, 'clear-filter-1').click();
    expect(calls).toEqual(['clearFilter 1']);
  });

  it('offers both when the filter and the narrowing leave nothing', () => {
    const all = dogs();
    const element = render({ dogs: all, other: find(all, 'Aino'), filterText: 'br' });
    expect(element.querySelector('.listempty span')?.textContent).toBe('No females match “br”.');
    expect(text(byKey(element, 'show-all-1'))).toBe('Show all');
    expect(text(byKey(element, 'clear-filter-1'))).toBe('Clear the filter');
  });

  it('keeps the chosen row and speaks of other dogs', () => {
    const all = dogs();
    const element = render({ dogs: all, filterText: 'zz', chosen: idOf(all, 'Aino') });
    expect(rowNames(element)).toEqual(['Aino']);
    expect(element.querySelector('.listempty span')?.textContent).toBe('No other dogs match “zz”.');
  });

  it('keeps the Showing all caption beside a filter that matches nothing', () => {
    const all = dogs();
    const element = render({ dogs: all, other: find(all, 'Ross'), showAll: true, filterText: 'zz' });
    expect(element.querySelector('.listnote')?.firstChild?.textContent).toBe('Showing all dogs');
    expect(element.querySelector('.listempty span')?.textContent).toBe('No dogs match “zz”.');
  });
});

describe('the listing rules', () => {
  it('count the listed dogs for the announcement, or give the no-match text', () => {
    const dogs = saved(dog('Aino', 'female'), dog('Bruno', 'male'), dog('Canela', 'female'));
    const base = { dogs, chosen: null, other: null, filterText: '', showAll: false };
    expect(listingStatus(listing(base))).toBe('3 dogs listed');
    expect(listingStatus(listing({ ...base, other: find(dogs, 'Aino') }))).toBe('1 dog listed');
    expect(listingStatus(listing({ ...base, other: find(dogs, 'Bruno') }))).toBe('2 dogs listed');
    const lone = saved(dog('Aino', 'female'), dog('Bruno', 'female'));
    expect(listingStatus(listing({ ...base, dogs: lone, other: find(lone, 'Aino') }))).toBe('No saved males.');
  });

  it('list a slot while any dog besides the other slot’s is saved', () => {
    const dogs = saved(dog('Aino', 'female'));
    expect(listsDogs([], null)).toBe(false);
    expect(listsDogs(dogs, null)).toBe(true);
    expect(listsDogs(dogs, find(dogs, 'Aino'))).toBe(false);
    const unusable = stored([entry('u1', { name: 'Rufo', sex: 'male', shortTail: 1.5 })]);
    expect(listsDogs(unusable, null)).toBe(true);
  });
});

describe('stale and unusable dogs', () => {
  it('lists a stale dog as a choosable row with its picture and an "Older reading" label', () => {
    const dogs = stored([entry('s1', dog('Pepa', 'female'), { readerVersion: READER_VERSION - 1 })]);
    expect(dogs[0]?.status).toBe('stale');
    const element = render({ dogs });
    const [row] = rows(element);
    expect(row?.getAttribute('aria-pressed')).toBe('false');
    expect(row?.getAttribute('aria-label')).toBe('Pepa, female, older reading');
    expect(row?.querySelector('svg.chip')).not.toBeNull();
    expect(row?.querySelector('.older')?.textContent).toBe('Older reading');
    row?.click();
    expect(calls).toEqual(['toggle 1 s1']);
  });

  it('notes a chosen stale dog on its card, with a button to add the report again', () => {
    const dogs = stored([entry('s1', dog('Pepa', 'female'), { readerVersion: READER_VERSION - 1 })]);
    const element = render({ dogs, chosen: 's1' });
    const note = element.querySelector('.card-body .stale-note');
    expect(note?.classList.contains('info')).toBe(true);
    expect(text(note)).toBe('ⓘRead by an older version of this page.Add the report again');
    expect(note?.hasAttribute('role')).toBe(false);
    expect(element.querySelector('.card-body')?.firstElementChild).toBe(note);
    byKey(element, 'readd-1').click();
    expect(calls).toEqual(['readd 1 s1']);
  });

  it('lists an unusable dog by name and sex, asking for the report again instead of choosing it', () => {
    const dogs = stored([entry('u1', { name: 'Rufo', sex: 'male', shortTail: 1.5 })]);
    expect(dogs[0]?.status).toBe('unusable');
    const element = render({ dogs });
    const [row] = rows(element);
    expect(row?.getAttribute('aria-label')).toBe('Rufo, male, add the report again');
    expect(row?.hasAttribute('aria-pressed')).toBe(false);
    expect(row?.querySelector('svg.chip')).toBeNull();
    expect(row?.querySelector('.again')?.textContent).toBe('Add the report again');
    expect(row?.querySelector('.sx')?.textContent).toBe('♂');
    row?.click();
    expect(calls).toEqual(['readd 1 u1']);
    expect(element.querySelector('[data-key="delete-1-u1"]')?.getAttribute('aria-label')).toBe('Delete Rufo');
  });

  it('shows a dog whose genetics throw as unusable, and the other rows as usual', () => {
    const dogs = saved(dog('Aino', 'female'), dog('Bruno', 'male'));
    const bruno = idOf(dogs, 'Bruno');
    const resolve = (target: UsableDog): ResolvedDog | null => {
      if (target.id === bruno) {
        throw new Error('rejected by the genetics');
      }
      return resolveSaved(target);
    };
    const element = render({ dogs, resolve, chosen: bruno });
    const [aino, broken] = rows(element);
    expect(aino?.querySelector('svg.chip')).not.toBeNull();
    expect(broken?.getAttribute('aria-label')).toBe('Bruno, male, add the report again');
    expect(heading(element)).toBe('Choose a dog');
    expect(element.querySelector('.card-body')).toBeNull();
  });

  it('resolves a saved dog once per dog object, with its nose answer', () => {
    const storage = new MemoryStorage();
    const store = openSavedDogs({ storage: () => storage, newId: sequentialIds(), locale: 'en' });
    const { outcome } = store.add(withNoseQuestion(dog('Nina', 'female')));
    const before = store.dog(outcome.id);
    if (before === undefined || before.status === 'unusable') {
      throw new Error('no usable dog');
    }
    expect(resolveSaved(before)).toBe(resolveSaved(before));
    expect(resolveSaved(before)?.questions.length).toBe(1);
    store.setNose(outcome.id, 'brown');
    const after = store.dog(outcome.id);
    if (after === undefined || after.status === 'unusable') {
      throw new Error('no usable dog');
    }
    expect(resolveSaved(after)?.questions.length).toBe(1);
    expect(resolveSaved(after)?.ownColours.map((colour) => colour.phenotype.base)).toEqual(['brown']);
  });
});

describe('a list-mode slot’s messages and add control', () => {
  it('puts the notice under the heading, the undo line under the list and Add a dog after it', () => {
    const dogs = saved(...['Aino', 'Bruno', 'Canela', 'Duna', 'Eetu', 'Gaudí', 'Hilla'].map((name) => dog(name, 'female')));
    const element = render({
      dogs,
      chosen: idOf(dogs, 'Aino'),
      notice: { tone: 'info', message: { text: 'This report is Bruno, already Parent 1; the saved dog was updated.' } },
      deleted: { name: 'Kuura', colour: null },
    });
    const order = [...element.children].map((child) => child.className || child.tagName.toLowerCase());
    expect(order).toEqual(['h2', 'err info', 'find', 'listing', 'undo', 'add', 'card-body']);
    expect(text(element.querySelector('.err.info'))).toBe('ⓘThis report is Bruno, already Parent 1; the saved dog was updated.');
  });

  it('shows a rejection with the warning icon', () => {
    const dogs = saved(dog('Aino', 'female'));
    const element = render({ dogs, notice: { tone: 'warning', message: { text: 'This PDF contains no text.' } } });
    const notice = element.querySelector('.err');
    expect(notice?.classList.contains('info')).toBe(false);
    expect(text(notice)).toBe('⚠This PDF contains no text.');
  });

  it('carries no live region of its own', () => {
    const dogs = saved(dog('Aino', 'female'));
    const element = render({
      dogs,
      notice: { tone: 'info', message: { text: 'Notice.' } },
      deleted: { name: 'Kuura', colour: null },
    });
    expect(element.querySelector('[role], [aria-live]')).toBeNull();
  });

  it('offers Undo on the undo line', () => {
    const element = render({ dogs: saved(dog('Aino', 'female')), deleted: { name: 'Kuura', colour: null } });
    expect(text(element.querySelector('.undo'))).toBe('Deleted Kuura. Undo');
    byKey(element, 'undo-1').click();
    expect(calls).toEqual(['undo 1']);
  });

  it('offers Add a dog, which opens the picker', () => {
    const element = render({ dogs: saved(dog('Aino', 'female')) });
    const add = byKey(element, 'pick-1');
    expect(text(add)).toBe('Add a dog');
    expect(text(element.querySelector('.add'))).toBe('Add a dog or drop reports here');
    add.click();
    expect(calls).toEqual(['pick 1']);
  });

  it('shows the reading indicator in place of Add a dog, keeping the chosen card', () => {
    const dogs = saved(dog('Aino', 'female'));
    const element = render({ dogs, chosen: dogs[0]?.id ?? null, reading: 'kuura.pdf' });
    expect(element.querySelector('[data-key="pick-1"]')).toBeNull();
    const add = element.querySelector('.add');
    expect(add?.getAttribute('aria-busy')).toBe('true');
    expect(add?.querySelector('.spin')).not.toBeNull();
    expect(text(add)).toBe('Reading kuura.pdf…');
    expect(element.querySelector('.card-body')).not.toBeNull();
  });

  it('asks the nose question on the chosen dog’s card, with its saved answer', () => {
    const dogs = saved(withNoseQuestion(dog('Nina', 'female')));
    const [nina] = dogs;
    const element = render({ dogs, chosen: nina?.id ?? null });
    const brown = byKey(element, 'nose-1-brown') as unknown as HTMLInputElement;
    expect(brown.checked).toBe(false);
    brown.click();
    expect(calls).toEqual(['answer 1 brown']);
    expect(element.querySelector('[data-key^="replace-"], [data-key^="remove-"]')).toBeNull();
  });
});

describe('an empty slot', () => {
  const pick = (): undefined => undefined;

  it('shows the undo line above Choose PDF', () => {
    const element = renderOpenSlot(1, { kind: 'empty', error: null }, pick, {
      notice: null,
      deleted: { name: 'Aino', colour: null },
      undo: (slot) => calls.push(`undo ${slot}`),
    });
    const children = [...element.children].map((child) => child.className || child.tagName.toLowerCase());
    expect(children).toEqual(['h2', 'undo', 'drop']);
    expect(text(element.querySelector('.undo'))).toBe('Deleted Aino. Undo');
    byKey(element, 'undo-1').click();
    expect(calls).toEqual(['undo 1']);
    expect(heading(element)).toBe('No report yet');
  });

  it('shows the info notice above Choose PDF', () => {
    const element = renderOpenSlot(1, { kind: 'empty', error: null }, pick, {
      notice: { text: 'This report is Bruno, already Parent 1; the saved dog was updated.' },
      deleted: null,
      undo: () => undefined,
    });
    const children = [...element.children].map((child) => child.className || child.tagName.toLowerCase());
    expect(children).toEqual(['h2', 'err info', 'drop']);
    expect(element.querySelector('[role], [aria-live]')).toBeNull();
  });

  it('is today’s slot without extras', () => {
    const element = renderOpenSlot(0, { kind: 'empty', error: null }, pick);
    expect([...element.children].map((child) => child.className || child.tagName.toLowerCase())).toEqual(['h2', 'drop']);
  });
});

describe('the alert box', () => {
  it('has an info variant with the ⓘ icon', () => {
    const info = alertBox({ text: 'Note.' }, '', 'info');
    expect(info.className).toBe('err info');
    expect(info.querySelector('.icon')?.textContent).toBe('ⓘ');
    expect(alertBox({ text: 'Warning.' }).querySelector('.icon')?.textContent).toBe('⚠');
  });
});
