// A parent slot listing the saved dogs: one toggle button per dog with its
// delete button, the filter field once there are many, the sex narrowing the
// other slot's dog asks for, and the chosen dog's card below. The render is
// pure; the page passes in its state, its filter field and its actions.

import { resolveDog, type ResolvedDog } from '../genetics/dog.ts';
import type { ParentIndex } from '../health/health.ts';
import type { Sex } from '../report/types.ts';
import type { SavedDog, UsableDog } from '../saved/check.ts';
import { ownColourText, ownPicture, renderCardBody, type CardActions } from './card.ts';
import { h, svg } from './dom.ts';
import { lowerFirst, parentLabel, savedName, SEX_PLURALS, SEX_SYMBOLS, SEX_WORDS } from './names.ts';
import { alertBox, slotHeading, slotHeadingId, undoLine, type DogLabel, type SlotNotice } from './slots.ts';

/** More saved dogs than this and each slot gets a filter field. */
export const FILTER_FROM = 6;

const OPPOSITE: Readonly<Record<Sex, Sex>> = { male: 'female', female: 'male' };

const upperFirst = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

/** What decides which saved dogs a slot lists. */
export interface ListingInput {
  /** Every saved dog, in the store's order. */
  readonly dogs: readonly SavedDog[];
  /** This slot's chosen dog. */
  readonly chosen: string | null;
  /** The dog chosen in the other slot. */
  readonly other: SavedDog | null;
  readonly filterText: string;
  readonly showAll: boolean;
}

export interface Listing {
  readonly rows: readonly SavedDog[];
  /** The sex the other slot's dog asks for; null when that slot is empty or its sex unread. */
  readonly opposite: Sex | null;
  /** Rows are only of the opposite sex: it is known and Show all is off. */
  readonly narrowed: boolean;
  /** The filter text in force, trimmed; empty when the field is not shown. */
  readonly filter: string;
  /** Whether the chosen dog is among the rows. */
  readonly chosenListed: boolean;
  /** The filter or the narrowing left no row but the chosen one. */
  readonly empty: boolean;
}

export interface ListActions {
  /** A row was tapped: choose its dog, or clear the slot when it is the chosen one. */
  toggle(slot: ParentIndex, id: string): void;
  remove(slot: ParentIndex, id: string): void;
  showAll(slot: ParentIndex, showAll: boolean): void;
  clearFilter(slot: ParentIndex): void;
  undo(slot: ParentIndex): void;
  /** Add a dog: opens the slot's file picker. */
  pick(slot: ParentIndex): void;
  /** Add the report again, from an unusable row or a stale dog's card. */
  readd(slot: ParentIndex, id: string): void;
  answer: CardActions['answer'];
}

export interface ListSlotInput extends ListingInput {
  readonly slot: ParentIndex;
  /** The slot's filter field, made once by `filterField` and kept across renders; its value follows `filterText`. */
  readonly field: HTMLInputElement;
  readonly notice: SlotNotice | null;
  /** The dog whose delete the undo line offers to take back. */
  readonly deleted: DogLabel | null;
  /** The name of a file being read for this slot. */
  readonly reading: string | null;
  /** The dog as the genetics read it, or null when they reject its stored data; may also throw. */
  readonly resolve: (dog: UsableDog) => ResolvedDog | null;
}

/** Whether a slot lists dogs: any saved dog but the other slot's, stale and unusable ones included. */
export const listsDogs = (dogs: readonly SavedDog[], other: SavedDog | null): boolean =>
  dogs.some((dog) => dog.id !== other?.id);

export const showsFilter = (dogs: readonly SavedDog[]): boolean => dogs.length > FILTER_FROM;

/** Lower case without accents, so "gaudi" finds Gaudí. */
const fold = (text: string): string =>
  text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase();

export function listing(input: ListingInput): Listing {
  const { dogs, chosen, other } = input;
  const sex = other?.sex ?? null;
  const opposite = sex === null ? null : OPPOSITE[sex];
  const narrowed = opposite !== null && !input.showAll;
  const filter = showsFilter(dogs) ? input.filterText.trim() : '';
  const folded = fold(filter);
  const rows = dogs.filter(
    (dog) =>
      dog.id !== other?.id &&
      (dog.id === chosen || ((!narrowed || dog.sex === opposite) && fold(savedName(dog.name)).includes(folded))),
  );
  const chosenListed = rows.some((dog) => dog.id === chosen);
  const empty = (narrowed || filter !== '') && rows.length === (chosenListed ? 1 : 0);
  return { rows, opposite, narrowed, filter, chosenListed, empty };
}

/** "No females match “ro”.", or null while the filter and narrowing leave rows. */
function noMatchText(shown: Listing): string | null {
  if (!shown.empty) {
    return null;
  }
  const other = shown.chosenListed ? 'other ' : '';
  const sex = shown.narrowed && shown.opposite !== null ? SEX_PLURALS[shown.opposite] : null;
  if (shown.filter === '') {
    return `No ${other}saved ${sex ?? 'dogs'}.`;
  }
  return `No ${other}${sex ?? 'dogs'} match “${shown.filter}”.`;
}

/** What the polite region says when typing pauses: "3 dogs listed", or the no-match text. */
export function listingStatus(shown: Listing): string {
  return noMatchText(shown) ?? (shown.rows.length === 1 ? '1 dog listed' : `${shown.rows.length} dogs listed`);
}

/** The slot's filter field, made once per slot; Escape clears it. */
export function filterField(slot: ParentIndex, change: (text: string) => void): HTMLInputElement {
  const field = h('input', {
    type: 'search',
    placeholder: 'Find a dog',
    autocomplete: 'off',
    spellcheck: 'false',
    'data-key': `find-${slot}`,
  });
  field.addEventListener('input', () => change(field.value));
  field.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && field.value !== '') {
      event.preventDefault();
      field.value = '';
      change('');
    }
  });
  return field;
}

// The store hands out the same object for an unchanged dog, so each is read once.
const resolvedDogs = new WeakMap<UsableDog, ResolvedDog | null>();

/** The dog as the genetics read it with its nose answer, or null when they reject its stored data. */
export function resolveSaved(dog: UsableDog): ResolvedDog | null {
  if (!resolvedDogs.has(dog)) {
    let resolved: ResolvedDog | null = null;
    try {
      resolved = resolveDog(dog.report, dog.nose === null ? {} : { nose: dog.nose });
    } catch {
      // Stored data the genetics reject: the dog shows as unusable.
    }
    resolvedDogs.set(dog, resolved);
  }
  return resolvedDogs.get(dog) ?? null;
}

function safely(resolve: ListSlotInput['resolve'], dog: SavedDog): ResolvedDog | null {
  if (dog.status === 'unusable') {
    return null;
  }
  try {
    return resolve(dog);
  } catch {
    return null;
  }
}

/** The dog's name, with its own colour when another of the dogs shares the name. */
export function dogLabel(dog: SavedDog, dogs: readonly SavedDog[], resolve: ListSlotInput['resolve']): DogLabel {
  const name = savedName(dog.name);
  const key = name.toLocaleLowerCase();
  const shared = dogs.some((other) => other.id !== dog.id && savedName(other.name).toLocaleLowerCase() === key);
  const resolved = shared ? safely(resolve, dog) : null;
  return { name, colour: resolved === null ? null : lowerFirst(ownColourText(resolved)) };
}

const pictures = new WeakMap<ResolvedDog, SVGSVGElement | null>();

function picture(dog: ResolvedDog): SVGSVGElement | null {
  if (!pictures.has(dog)) {
    pictures.set(dog, ownPicture(dog.ownColours));
  }
  const made = pictures.get(dog) ?? null;
  return made === null ? null : (made.cloneNode(true) as SVGSVGElement);
}

const icon = (width: string, ...paths: string[]): SVGSVGElement =>
  svg(
    'svg',
    {
      width,
      height: width,
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': '2',
      'stroke-linecap': 'round',
      'aria-hidden': 'true',
    },
    ...paths.map((d) => svg('path', { d })),
  );

const tickIcon = (): SVGSVGElement => {
  const tick = icon('18', 'M5 12l5 5 9-10');
  tick.setAttribute('stroke-width', '3');
  return tick;
};
const trashIcon = (): SVGSVGElement => icon('20', 'M4 7h16M10 7V4h4v3M6 7l1 13h10l1-13M10 11v6M14 11v6');
const fileIcon = (): SVGSVGElement => icon('20', 'M14 3H6v18h12V7z', 'M14 3v4h4');

const sexSymbol = (sex: Sex | null): HTMLElement | null =>
  sex === null ? null : h('span', { class: 'sx', 'aria-hidden': 'true' }, SEX_SYMBOLS[sex]);

function row(input: ListSlotInput, dog: SavedDog, actions: ListActions): HTMLLIElement {
  const { slot } = input;
  const label = dogLabel(dog, input.dogs, input.resolve);
  const resolved = safely(input.resolve, dog);
  const sex = dog.sex === null ? [] : [SEX_WORDS[dog.sex]];
  const colour = label.colour === null ? [] : [label.colour];
  const key = `dog-${slot}-${dog.id}`;

  let button: HTMLButtonElement;
  if (resolved === null || dog.status === 'unusable') {
    button = h(
      'button',
      { type: 'button', class: 'dog unusable', 'data-key': key, 'aria-label': [label.name, ...sex, 'add the report again'].join(', ') },
      h('span', { class: 'tick' }),
      h('span', { class: 'unusable-icon' }, fileIcon()),
      h('span', { class: 'nm' }, label.name, h('span', { class: 'again' }, 'Add the report again')),
      sexSymbol(dog.sex),
    );
    button.addEventListener('click', () => actions.readd(slot, dog.id));
  } else {
    const chosen = dog.id === input.chosen;
    const stale = dog.status === 'stale';
    button = h(
      'button',
      {
        type: 'button',
        class: 'dog',
        'aria-pressed': String(chosen),
        'data-key': key,
        'aria-label': [label.name, ...sex, ...(stale ? ['older reading'] : []), ...colour].join(', '),
      },
      h('span', { class: 'tick' }, chosen ? tickIcon() : null),
      picture(resolved),
      h('span', { class: 'nm' }, label.name, stale ? h('span', { class: 'older' }, 'Older reading') : null),
      sexSymbol(dog.sex),
    );
    button.addEventListener('click', () => actions.toggle(slot, dog.id));
  }

  const remove = h(
    'button',
    { type: 'button', class: 'del', 'data-key': `delete-${slot}-${dog.id}`, 'aria-label': [`Delete ${label.name}`, ...colour].join(', ') },
    trashIcon(),
  );
  remove.addEventListener('click', () => actions.remove(slot, dog.id));
  return h('li', {}, button, remove);
}

/**
 * The rows with their sex caption or no-match message. The page can render
 * this alone while the filter is typed in, leaving the field untouched.
 */
export function renderListing(input: ListSlotInput, actions: ListActions): HTMLElement {
  const { slot } = input;
  const shown = listing(input);
  const button = (key: string, text: string, click: () => void): HTMLButtonElement => {
    const made = h('button', { type: 'button', class: 'ghost', 'data-key': `${key}-${slot}` }, text);
    made.addEventListener('click', click);
    return made;
  };
  const showAll = (): HTMLButtonElement => button('show-all', 'Show all', () => actions.showAll(slot, true));
  const noMatch = noMatchText(shown);

  let note: HTMLElement | null = null;
  if (noMatch !== null) {
    note = h(
      'div',
      { class: 'listempty' },
      h('span', {}, noMatch),
      h(
        'div',
        {},
        shown.narrowed ? showAll() : null,
        shown.filter === '' ? null : button('clear-filter', 'Clear the filter', () => actions.clearFilter(slot)),
      ),
    );
  }
  let caption: HTMLElement | null = null;
  if (shown.opposite !== null && !(noMatch !== null && shown.narrowed)) {
    caption = shown.narrowed
      ? h('p', { class: 'listnote' }, h('span', {}, `${upperFirst(SEX_PLURALS[shown.opposite])} only`), ' ', showAll())
      : h(
          'p',
          { class: 'listnote' },
          h('span', {}, 'Showing all dogs'),
          ' ',
          button('show-all', `Only ${SEX_PLURALS[shown.opposite]}`, () => actions.showAll(slot, false)),
        );
  }

  return h(
    'div',
    { class: 'listing' },
    shown.rows.length === 0
      ? null
      : h(
          'ul',
          { class: 'dogs-list', 'aria-label': `Saved dogs for ${parentLabel(slot)}`, 'data-key': `dogs-${slot}` },
          ...shown.rows.map((dog) => row(input, dog, actions)),
        ),
    caption,
    note,
  );
}

/** Scrolls the slot's capped list, and only the list, to show its chosen row. Call once the slot is in the page. */
export function revealChosen(slot: HTMLElement): void {
  const list = slot.querySelector<HTMLElement>('.dogs-list');
  const item = list?.querySelector('[aria-pressed="true"]')?.closest('li');
  if (list === null || list === undefined || item === null || item === undefined) {
    return;
  }
  if (item.offsetTop < list.scrollTop) {
    list.scrollTop = item.offsetTop;
  } else if (item.offsetTop + item.offsetHeight > list.scrollTop + list.clientHeight) {
    list.scrollTop = item.offsetTop + item.offsetHeight - list.clientHeight;
  }
}

export function renderListSlot(input: ListSlotInput, actions: ListActions): HTMLElement {
  const { slot, field } = input;
  const headingId = slotHeadingId(slot);
  const chosenDog = input.dogs.find((dog) => dog.id === input.chosen && dog.id !== input.other?.id);
  const usable = chosenDog === undefined || chosenDog.status === 'unusable' ? null : chosenDog;
  const resolved = usable === null ? null : safely(input.resolve, usable);
  const chosen = usable !== null && resolved !== null ? { dog: usable, resolved } : null;

  if (field.value !== input.filterText) {
    field.value = input.filterText;
  }

  let add: HTMLElement;
  if (input.reading === null) {
    const picker = h('button', { type: 'button', class: 'ghost', 'data-key': `pick-${slot}`, 'aria-describedby': headingId }, 'Add a dog');
    picker.addEventListener('click', () => actions.pick(slot));
    add = h('div', { class: 'add' }, picker, ' ', h('span', { class: 'sec' }, 'or drop reports here'));
  } else {
    add = h(
      'div',
      { class: 'add', 'aria-busy': 'true' },
      h('span', { class: 'spin', 'aria-hidden': 'true' }),
      h('span', { class: 'file' }, `Reading ${input.reading}…`),
    );
  }

  return h(
    'section',
    { class: 'slot', 'aria-labelledby': headingId, 'data-slot': String(slot) },
    slotHeading(slot, chosen === null ? 'Choose a dog' : savedName(chosen.dog.name)),
    input.notice === null ? null : alertBox(input.notice.message, '', input.notice.tone),
    showsFilter(input.dogs) ? h('label', { class: 'find' }, h('span', { class: 'vh' }, `Find a dog for ${parentLabel(slot)}`), field) : null,
    renderListing(input, actions),
    input.deleted === null ? null : undoLine(slot, input.deleted, actions.undo),
    add,
    chosen === null
      ? null
      : renderCardBody(
          {
            slot,
            name: savedName(chosen.dog.name),
            report: chosen.dog.report,
            dog: chosen.resolved,
            nose: chosen.dog.nose ?? undefined,
          },
          actions.answer,
          chosen.dog.status === 'stale' ? (target) => actions.readd(target, chosen.dog.id) : null,
        ),
  );
}
