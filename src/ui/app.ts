// The page's state and its one render path. The saved dogs live in the store;
// which dog each slot holds, reads in progress and the slots' messages live in
// memory. Every change re-renders the slots and recomputes the results.
// Elements with a data-key keep their focus, open disclosures and expanded
// caveats across renders, so answering a question doesn't lose the keyboard
// position.

import { predictPuppies, type PuppyPrediction } from '../genetics/results.ts';
import { analyseHealth, type HealthAnalysis, type ParentIndex } from '../health/health.ts';
import type { ReadResult, Report, Sex } from '../report/types.ts';
import type { SavedDog, UsableDog } from '../saved/check.ts';
import { openSavedDogs, type StoreMode, type StoredDog } from '../saved/store.ts';
import { createAnnouncer } from './announce.ts';
import { h, svg } from './dom.ts';
import { healthWarnings, renderHealth } from './health.ts';
import {
  dogLabel,
  filterField,
  listing,
  listingStatus,
  listsDogs,
  renderListing,
  renderListSlot,
  resolveSaved,
  revealChosen,
  showsFilter,
  type ListActions,
  type ListSlotInput,
} from './list.ts';
import {
  DROP_FULL,
  DROP_ONE_FREE,
  DROP_READING,
  DROP_TOO_MANY,
  PRIVACY_DOWNLOAD,
  PRIVACY_KEPT,
  PRIVACY_READ,
  READER_FAILED,
  REJECTIONS,
  RESULTS_FAILED,
  sameDogNotice,
  STORAGE_WARNINGS,
} from './messages.ts';
import { parentLabel, savedName } from './names.ts';
import { ETHICS_LINK_KEY, renderResults, sameSexLead } from './results.ts';
import { alertBox, renderOpenSlot, slotHeadingId, type DogLabel, type OpenSlot, type SlotNotice } from './slots.ts';

/** Reads a chosen file; throws only when the reader itself fails. */
export type ReadFile = (file: File) => Promise<ReadResult>;

export interface SlotState {
  /** The ID of the saved dog chosen here. */
  readonly chosen: string | null;
  /** The name of the file being read for this slot. */
  readonly reading: string | null;
  /** A rejection, or a note that the report added here was the other slot's dog; until the next choose, clear or add here. */
  readonly notice: SlotNotice | null;
  /** The filter field's text, kept while the field shows. */
  readonly filter: string;
  /** Show all: the list is not narrowed to the sex the other slot's dog asks for. */
  readonly showAll: boolean;
}

/** The last deleted dog, offered back until the next choose, clear, add, delete or Clear saved dogs in either slot. */
export interface UndoLine {
  readonly deleted: StoredDog;
  /** The slot whose list it was deleted from. */
  readonly slot: ParentIndex;
  /** Whether that slot had it chosen: Undo chooses it again if the slot still has nothing chosen. */
  readonly chosen: boolean;
}

export interface AppState {
  readonly slots: readonly [SlotState, SlotState];
  /** A page-level drop message, until the next action. */
  readonly pageAlert: string | null;
  readonly undo: UndoLine | null;
  /** Clear saved dogs is asking for its second tap. */
  readonly clearing: boolean;
}

/** Where the saved dogs and the breeding note's dismissal are kept: localStorage in the browser. */
export type NoteStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export interface AppOptions {
  readonly read: ReadFile;
  readonly initial?: AppState;
  /** Whether the viewport is narrow enough to collapse the genotype tables once results exist. */
  readonly narrow?: () => boolean;
  readonly storage?: NoteStorage;
  /** The current time in epoch milliseconds. */
  readonly now?: () => number;
  /** IDs for newly saved dogs; random by default. */
  readonly newId?: () => string;
  /** The colour prediction; replaceable so that a pair the genetics reject can be shown. */
  readonly predictPuppies?: typeof predictPuppies;
}

interface ViewState {
  readonly active: string | undefined;
  readonly open: ReadonlyMap<string, boolean>;
  readonly expanded: ReadonlySet<string>;
}

export interface App {
  /** Reads a file into a slot, as the slot's picker does: a re-add when the picker was opened by Add the report again. */
  load(slot: ParentIndex, file: File): Promise<void>;
  /** Applies the drop rules to files dropped on a slot, or elsewhere when `target` is null. */
  drop(files: readonly File[], target: ParentIndex | null): Promise<void>;
}

export const EMPTY_SLOT: SlotState = { chosen: null, reading: null, notice: null, filter: '', showAll: false };
const SLOTS = [0, 1] as const;
/** The stylesheet's narrow layout. */
const NARROW_QUERY = '(max-width: 700px)';
/** How long typing in a filter pauses before the number of listed dogs is announced. */
const TYPING_PAUSE_MS = 600;
/** Holds the epoch milliseconds until which the breeding note stays hidden. */
export const NOTE_HIDDEN_KEY = 'dog-colors:breeding-note-hidden-until';
const NOTE_HIDDEN_MS = 30 * 24 * 60 * 60 * 1000;

const otherSlot = (slot: ParentIndex): ParentIndex => (slot === 0 ? 1 : 0);

/** The parents' sex when both reports give the same one; an unread sex settles nothing. */
const sameSex = (first: Sex | null, second: Sex | null): Sex | undefined => (first !== null && first === second ? first : undefined);

/** The privacy line's text: its storage sentences go while nothing can be stored. */
const privacyText = (mode: StoreMode): string =>
  (mode === 'nothing-stored' ? [PRIVACY_READ, PRIVACY_DOWNLOAD] : [PRIVACY_READ, PRIVACY_KEPT, PRIVACY_DOWNLOAD]).join(' ');

function privacyNote(text: HTMLElement): HTMLElement {
  return h(
    'p',
    { class: 'privacy' },
    svg(
      'svg',
      { width: '20', height: '20', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'aria-hidden': 'true' },
      svg('rect', { x: '4', y: '10', width: '16', height: '11', rx: '2' }),
      svg('path', { d: 'M8 10V7a4 4 0 0 1 8 0v3' }),
    ),
    text,
  );
}

function breedingNote(): HTMLElement {
  return h(
    'section',
    { class: 'ethics', id: 'ethics', 'aria-labelledby': 'ethics-h' },
    h(
      'button',
      { type: 'button', class: 'close', 'aria-label': 'Hide this note for 30 days', title: 'Hide for 30 days' },
      svg(
        'svg',
        {
          width: '20',
          height: '20',
          viewBox: '0 0 24 24',
          fill: 'none',
          stroke: 'currentColor',
          'stroke-width': '2.2',
          'stroke-linecap': 'round',
          'aria-hidden': 'true',
        },
        svg('path', { d: 'M6 6l12 12M18 6L6 18' }),
      ),
    ),
    h('h2', { id: 'ethics-h', tabindex: '-1' }, 'Colour is never a reason to choose a pairing'),
    h(
      'p',
      { class: 'lead' },
      'Choose a pairing for the dogs’ health, temperament and fitness for the work they are bred for, and for the litter’s genetic diversity. This page shows which colours a litter might have, so you know what to expect, not so you can select for them.',
    ),
    h(
      'p',
      {},
      h('b', {}, 'A clear DNA result is not a health check.'),
      ' The health section covers only the variants on the Wisdom Panel report. It says nothing about hips, elbows, eyes or the many conditions no DNA test detects. Those need clinical screening, and the health of the dogs’ relatives matters too.',
    ),
    h(
      'p',
      {},
      h('b', {}, 'This page cannot tell how closely related the two dogs are.'),
      ' The reports give each dog’s own heterozygosity, not how related two dogs are, and siblings can pass every check here. Work out the planned litter’s coefficient of inbreeding from the pedigrees, through your kennel club or a pedigree database.',
    ),
  );
}

/**
 * Hides the note while a stored dismissal lasts, and wires its close cross and
 * the results link that brings it back.
 */
function wireBreedingNote(root: HTMLElement, note: HTMLElement, storage: () => NoteStorage, now: () => number): void {
  try {
    const stored = storage().getItem(NOTE_HIDDEN_KEY);
    if (stored !== null) {
      const until = Number(stored);
      const current = now();
      // An expiry further ahead than one dismissal gives came from a clock that was wrong.
      if (Number.isFinite(until) && until > current && until <= current + NOTE_HIDDEN_MS) {
        note.hidden = true;
      } else {
        storage().removeItem(NOTE_HIDDEN_KEY);
      }
    }
  } catch {
    // Storage that fails leaves the note showing: missing it costs more than seeing it again.
  }
  note.querySelector('button.close')?.addEventListener('click', () => {
    note.hidden = true;
    try {
      storage().setItem(NOTE_HIDDEN_KEY, String(now() + NOTE_HIDDEN_MS));
    } catch {
      // Hidden for this visit only.
    }
    root.querySelector<HTMLElement>(`#${slotHeadingId(0)}`)?.focus();
  });
  // The results link is rebuilt on every render, so its clicks are caught here.
  // Following the link itself would leave focus on the body, since the section cannot take focus.
  root.addEventListener('click', (event) => {
    if (event.target instanceof Element && event.target.closest(`[data-key="${ETHICS_LINK_KEY}"]`) !== null) {
      event.preventDefault();
      note.hidden = false;
      note.querySelector<HTMLElement>('h2')?.focus({ preventScroll: true });
      note.scrollIntoView({ block: 'start' });
    }
  });
}

export function startApp(root: HTMLElement, options: AppOptions): App {
  const narrow = options.narrow ?? (() => window.matchMedia(NARROW_QUERY).matches);
  const now = options.now ?? Date.now;
  const predict = options.predictPuppies ?? predictPuppies;
  // Even reading window.localStorage throws where storage is disabled.
  const storage = (): NoteStorage => options.storage ?? window.localStorage;
  const store = openSavedDogs({ storage, now, ...(options.newId === undefined ? {} : { newId: options.newId }) });
  let state: AppState = options.initial ?? { slots: [EMPTY_SLOT, EMPTY_SLOT], pageAlert: null, undo: null, clearing: false };
  /** Each slot's latest read: an earlier one still saves its dog, but does not place it. */
  const tokens: [number, number] = [0, 0];
  /** How many times Clear saved dogs was confirmed: a read that began before the latest is discarded. */
  let clears = 0;
  /** The dog Add the report again was pressed for, until the slot's picker gives a file or Add a dog opens it. */
  const readdTargets: [string | null, string | null] = [null, null];
  const typingTimers: [number | undefined, number | undefined] = [undefined, undefined];
  /** Where the next render puts focus: the first of these data-keys found, else where focus was. */
  let focusKeys: readonly string[] = [];
  /** The store mode the storage warning and the privacy line were last drawn for. */
  let drawnMode: StoreMode | null = null;
  let renderedLayouts: readonly string[] = [];
  let revealed: readonly (string | null)[] = [null, null];
  let resultsShown = false;
  let resultsFailed = false;
  let cached: { dogs: readonly [UsableDog, UsableDog]; prediction: PuppyPrediction } | null = null;
  let cachedHealth: { reports: readonly [Report, Report]; health: HealthAnalysis } | null = null;

  const announcer = createAnnouncer();
  const dropAlert = h('div', { class: 'drop-alert' });
  const storageAlert = h('div', { class: 'storage-alert' });
  const privacy = h('span', {});
  const slotsEl = h('div', { class: 'slots' });
  const toolsEl = h('div', { class: 'library-tools' });
  const pairEl = h('div', { class: 'pair' });
  const resultsEl = h('section', { class: 'results', id: 'results', 'aria-labelledby': 'results-h', hidden: true });
  const fileInput = (slot: ParentIndex): HTMLInputElement => {
    const input = h('input', {
      type: 'file',
      accept: 'application/pdf,.pdf',
      class: 'vh',
      tabindex: '-1',
      'aria-hidden': 'true',
      'data-testid': `file-${slot}`,
    });
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (file !== undefined) {
        void app.load(slot, file);
      }
    });
    return input;
  };
  const inputs = [fileInput(0), fileInput(1)] as const;
  // Made once, so typing is never interrupted by a render.
  const fields = [filterField(0, (text) => typed(0, text)), filterField(1, (text) => typed(1, text))] as const;
  const note = breedingNote();
  root.replaceChildren(
    note,
    privacyNote(privacy),
    storageAlert,
    h('a', { class: 'ready btn', href: '#results' }, 'Results ready', h('span', { 'aria-hidden': 'true' }, '↓')),
    dropAlert,
    slotsEl,
    toolsEl,
    pairEl,
    resultsEl,
    announcer.region,
    ...inputs,
  );

  wireBreedingNote(root, note, storage, now);

  const setSlot = (slot: ParentIndex, changes: Partial<SlotState>): void => {
    const slots: [SlotState, SlotState] = [state.slots[0], state.slots[1]];
    slots[slot] = { ...slots[slot], ...changes };
    state = { ...state, slots };
  };

  /** Clears the page-level drop message, which lasts only until the next action. */
  const clearTransient = (): void => {
    state = { ...state, pageAlert: null };
  };

  /** The saved dog, when the page can choose it: usable, and its genetics read. */
  const choosable = (id: string | null): UsableDog | null => {
    const dog = id === null ? undefined : store.dog(id);
    return dog === undefined || dog.status === 'unusable' || resolveSaved(dog) === null ? null : dog;
  };

  const chosenDog = (slot: ParentIndex): SavedDog | null => {
    const id = state.slots[slot].chosen;
    return id === null ? null : (store.dog(id) ?? null);
  };

  /** Chooses a dog in a slot, or clears it; the other slot's Show all lasts only while this slot's dog stays. */
  function choose(slot: ParentIndex, id: string | null): void {
    if (state.slots[slot].chosen !== id) {
      setSlot(otherSlot(slot), { showAll: false });
    }
    setSlot(slot, { chosen: id, reading: null, notice: null });
  }

  /**
   * Clears the slots whose dog the store no longer lists or the genetics
   * reject, and the filter text once its field is gone; returns the slots cleared.
   */
  function settle(): ParentIndex[] {
    const cleared = SLOTS.filter((slot) => {
      const { chosen } = state.slots[slot];
      return chosen !== null && (choosable(chosen) === null || (slot === 1 && chosen === state.slots[0].chosen));
    });
    cleared.forEach((slot) => choose(slot, null));
    if (!showsFilter(store.dogs())) {
      SLOTS.filter((slot) => state.slots[slot].filter !== '').forEach((slot) => setSlot(slot, { filter: '' }));
    }
    return cleared;
  }

  /** " Parent 1 cleared." for each slot a store write emptied. */
  const clearedText = (cleared: readonly ParentIndex[]): string => cleared.map((slot) => ` ${parentLabel(slot)} cleared.`).join('');

  /** Ends the undo line: any choose, clear, add, delete or Clear saved dogs does. */
  const endUndo = (): void => {
    state = { ...state, undo: null };
  };

  /** Opens or closes Clear saved dogs' inline confirmation, moving focus into it or back to the button. */
  function askClear(asking: boolean): void {
    state = { ...state, clearing: asking };
    focusKeys = [asking ? 'clear-cancel' : 'clear-saved'];
    render();
  }

  /** Deletes every saved dog and empties both slots; reads in progress are discarded, not saved. */
  function clearSaved(): void {
    clears++;
    tokens[0]++;
    tokens[1]++;
    readdTargets[0] = null;
    readdTargets[1] = null;
    store.clear();
    state = { slots: [EMPTY_SLOT, EMPTY_SLOT], pageAlert: null, undo: null, clearing: false };
    focusKeys = ['pick-0'];
    render();
    announcer.announce('All saved dogs deleted.');
  }

  const pick = (slot: ParentIndex): void => {
    readdTargets[slot] = null;
    openPicker(slot);
  };

  function openPicker(slot: ParentIndex): void {
    clearTransient();
    render();
    const input = inputs[slot];
    input.value = '';
    input.click();
  }

  /** The deleted dog the slot's undo line offers back. */
  const undoLabel = (slot: ParentIndex): DogLabel | null =>
    state.undo === null || state.undo.slot !== slot ? null : dogLabel(state.undo.deleted.dog, store.dogs(), resolveSaved);

  /** Whether the slot lists dogs, rather than today's empty slot. */
  const listMode = (slot: ParentIndex): boolean => listsDogs(store.dogs(), chosenDog(otherSlot(slot)));

  const listInput = (slot: ParentIndex): ListSlotInput => {
    const current = state.slots[slot];
    return {
      slot,
      dogs: store.dogs(),
      chosen: current.chosen,
      other: chosenDog(otherSlot(slot)),
      filterText: current.filter,
      showAll: current.showAll,
      field: fields[slot],
      notice: current.notice,
      deleted: undoLabel(slot),
      reading: current.reading,
      resolve: resolveSaved,
    };
  };

  /** Re-renders only the slot's rows while its filter is typed in, and says how many are listed once typing pauses. */
  function typed(slot: ParentIndex, text: string): void {
    setSlot(slot, { filter: text });
    const input = listInput(slot);
    slotsEl.querySelector(`[data-slot="${slot}"] .listing`)?.replaceWith(renderListing(input, actions));
    window.clearTimeout(typingTimers[slot]);
    typingTimers[slot] = window.setTimeout(() => announcer.announce(listingStatus(listing(input))), TYPING_PAUSE_MS);
  }

  function renderSlot(slot: ParentIndex): { element: HTMLElement; layout: string } {
    const current = state.slots[slot];
    if (listMode(slot)) {
      return { element: renderListSlot(listInput(slot), actions), layout: 'list' };
    }
    const warning = current.notice?.tone === 'warning' ? current.notice.message : null;
    const info = current.notice?.tone === 'info' ? current.notice.message : null;
    const open: OpenSlot = current.reading === null ? { kind: 'empty', error: warning } : { kind: 'reading', fileName: current.reading };
    return { element: renderOpenSlot(slot, open, pick, { notice: info, deleted: undoLabel(slot), undo: actions.undo }), layout: open.kind };
  }

  /** Both slots' dogs, when each holds one. */
  const chosenPair = (): readonly [UsableDog, UsableDog] | null => {
    const [first, second] = [choosable(state.slots[0].chosen), choosable(state.slots[1].chosen)];
    return first === null || second === null ? null : [first, second];
  };

  /** The pair's prediction and health analysis, kept while the same dog objects are chosen. Throws when the genetics reject the pair. */
  function pairResults(dogs: readonly [UsableDog, UsableDog]): { prediction: PuppyPrediction; health: HealthAnalysis } {
    const reports = [dogs[0].report, dogs[1].report] as const;
    if (cachedHealth === null || cachedHealth.reports[0] !== reports[0] || cachedHealth.reports[1] !== reports[1]) {
      cachedHealth = { reports, health: analyseHealth(reports[0], reports[1]) };
    }
    if (cached === null || cached.dogs[0] !== dogs[0] || cached.dogs[1] !== dogs[1]) {
      const [first, second] = [resolveSaved(dogs[0]), resolveSaved(dogs[1])];
      if (first === null || second === null) {
        throw new Error('a chosen dog cannot be resolved');
      }
      cached = { dogs, prediction: predict(first, second) };
    }
    return { prediction: cached.prediction, health: cachedHealth.health };
  }

  /** The results section's content, or null when the genetics reject the pair. */
  function results(dogs: readonly [UsableDog, UsableDog]): (Node | string)[] | null {
    try {
      const { prediction, health } = pairResults(dogs);
      return renderResults({
        names: [savedName(dogs[0].name), savedName(dogs[1].name)],
        prediction,
        openQuestion: dogs.some((dog) => dog.nose === null && (resolveSaved(dog)?.questions.length ?? 0) > 0),
        sameSex: sameSex(dogs[0].sex, dogs[1].sex),
        healthWarnings: healthWarnings(health),
        sections: [renderHealth(health)],
      });
    } catch {
      return null;
    }
  }

  /** The keyboard position, open disclosures and expanded caveats, by data-key. */
  function snapshot(): ViewState {
    const open = new Map<string, boolean>();
    root.querySelectorAll<HTMLDetailsElement>('details[data-key]').forEach((details) => {
      open.set(details.dataset['key'] ?? '', details.open);
    });
    const expanded = new Set<string>();
    root.querySelectorAll<HTMLElement>('.cav[aria-expanded="true"][data-key]').forEach((badge) => {
      expanded.add(badge.dataset['key'] ?? '');
    });
    const active = document.activeElement instanceof HTMLElement ? document.activeElement.dataset['key'] : undefined;
    return { active, open, expanded };
  }

  /** Puts a snapshot back on the new elements; `collapse` closes the genotype tables. */
  function restore(view: ViewState, collapse: boolean): void {
    root.querySelectorAll<HTMLDetailsElement>('details[data-key]').forEach((details) => {
      const key = details.dataset['key'] ?? '';
      if (collapse && details.classList.contains('gd')) {
        details.open = false;
      } else if (view.open.has(key)) {
        details.open = view.open.get(key) ?? details.open;
      }
    });
    root.querySelectorAll<HTMLElement>('.cav[data-key]').forEach((badge) => {
      if (view.expanded.has(badge.dataset['key'] ?? '')) {
        badge.click();
      }
    });
    const keyed = (key: string): HTMLElement | null => root.querySelector<HTMLElement>(`[data-key="${CSS.escape(key)}"]`);
    const target = [...focusKeys, view.active].find((key) => key !== undefined && keyed(key) !== null);
    focusKeys = [];
    if (target !== undefined) {
      keyed(target)?.focus();
    }
  }

  /** The storage warning and the privacy line, redrawn only when the mode changes, so the alert is spoken once. */
  function drawStorage(): void {
    const mode = store.mode();
    if (mode === drawnMode) {
      return;
    }
    drawnMode = mode;
    privacy.textContent = privacyText(mode);
    if (mode === 'working') {
      storageAlert.replaceChildren();
    } else {
      const warning = alertBox(STORAGE_WARNINGS[mode]);
      warning.setAttribute('role', 'alert');
      storageAlert.replaceChildren(warning);
    }
  }

  /** Clear saved dogs, or its inline confirmation, while any dog is saved and storage may be written. */
  function drawTools(): void {
    const count = store.dogs().length;
    if (count === 0 || store.mode() === 'out-of-date') {
      state = { ...state, clearing: false };
      toolsEl.replaceChildren();
      return;
    }
    const button = (key: string, className: string, text: string, click: () => void): HTMLButtonElement => {
      const made = h('button', { type: 'button', class: className, 'data-key': key }, text);
      made.addEventListener('click', click);
      return made;
    };
    toolsEl.replaceChildren(
      state.clearing
        ? h(
            'div',
            { class: 'confirm', role: 'group', 'aria-label': 'Clear saved dogs' },
            h('span', {}, `Delete all ${count} saved ${count === 1 ? 'dog' : 'dogs'}?`),
            button('clear-delete', 'danger', 'Delete', clearSaved),
            button('clear-cancel', 'ghost', 'Cancel', () => askClear(false)),
          )
        : button('clear-saved', 'ghost', 'Clear saved dogs', () => askClear(true)),
    );
  }

  function render(): void {
    settle();
    const view = snapshot();
    drawStorage();
    drawTools();

    dropAlert.replaceChildren(...(state.pageAlert === null ? [] : [alertBox({ text: state.pageAlert })]));

    const slots = SLOTS.map(renderSlot);
    slots.forEach(({ element, layout }, slot) => element.classList.toggle('enter', renderedLayouts[slot] !== layout));
    renderedLayouts = slots.map(({ layout }) => layout);
    slotsEl.replaceChildren(...slots.map(({ element }) => element));
    // Once in the page, so that the capped lists can be scrolled.
    SLOTS.forEach((slot) => {
      if (state.slots[slot].chosen !== revealed[slot]) {
        revealChosen(slots[slot]?.element ?? slotsEl);
      }
    });
    revealed = state.slots.map((slot) => slot.chosen);

    const pair = chosenPair();
    const content = pair === null ? null : results(pair);
    const show = content !== null;
    resultsFailed = pair !== null && !show;
    resultsEl.replaceChildren(...(content ?? []));
    pairEl.replaceChildren(...(resultsFailed ? [alertBox(RESULTS_FAILED, 'results-error')] : []));
    resultsEl.hidden = !show;
    root.classList.toggle('has-results', show);
    const collapse = show && !resultsShown && narrow();
    resultsShown = show;
    restore(view, collapse);
  }

  const resultsStatus = (): string => {
    if (resultsFailed) {
      return ` ${RESULTS_FAILED.title ?? ''}.`;
    }
    if (!resultsShown) {
      return '';
    }
    // Focus stays where the user acted, so the same-sex card is announced here.
    const pair = chosenPair();
    const shared = pair === null ? undefined : sameSex(pair[0].sex, pair[1].sex);
    return ` Results updated.${shared === undefined ? '' : ` ${sameSexLead(shared)}`}`;
  };

  /** Whether focus is nowhere in the page, or inside the slot. */
  function focusInSlotOrLost(slot: ParentIndex): boolean {
    const active = document.activeElement;
    const lost = active === null || active === document.body || !root.contains(active);
    return lost || (slotsEl.querySelector(`[data-slot="${slot}"]`)?.contains(active) ?? false);
  }

  /**
   * Reads a file for a slot and saves it. Only the slot's latest read places
   * its dog there; a superseded or overtaken read is still saved. A report of
   * the dog the other slot holds updates that dog and leaves it there.
   */
  async function startLoad(slot: ParentIndex, file: File, target: string | null): Promise<void> {
    const token = ++tokens[slot];
    const cleared = clears;
    setSlot(slot, { reading: file.name, notice: null });
    render();
    announcer.announce(`Reading the report for ${parentLabel(slot)}…`);

    let result: ReadResult | null;
    try {
      result = await options.read(file);
    } catch {
      result = null;
    }
    if (cleared !== clears) {
      // Clear saved dogs was confirmed during the read: Clear already emptied the slot.
      return;
    }
    const placed = token === tokens[slot];
    if (placed) {
      setSlot(slot, { reading: null });
    }
    // It says both reads are in progress, which stops being true once one settles.
    if (state.pageAlert === DROP_READING) {
      clearTransient();
    }

    if (result?.ok !== true) {
      if (!placed) {
        render();
        return;
      }
      const message = result === null ? READER_FAILED : REJECTIONS[result.kind];
      setSlot(slot, { notice: { tone: 'warning', message } });
      focusKeys = [`pick-${slot}`];
      render();
      announcer.announce(`${parentLabel(slot)}: ${message.text}`);
      return;
    }

    const moveFocus = focusInSlotOrLost(slot);
    const { outcome } = store.add(result.report, target ?? undefined);
    endUndo();
    const name = savedName(store.dog(outcome.id)?.name ?? result.report.name);
    const verb = outcome.kind === 'added' ? 'saved' : 'updated';
    const other = otherSlot(slot);
    let text: string;
    if (outcome.id === state.slots[other].chosen) {
      if (placed) {
        const notice = sameDogNotice(name, parentLabel(other));
        setSlot(slot, { notice: { tone: 'info', message: notice } });
        focusKeys = [`pick-${slot}`];
        text = notice.text;
      } else {
        text = `${name} updated.`;
      }
    } else if (placed) {
      choose(slot, outcome.id);
      if (moveFocus) {
        focusKeys = [target === null ? `name-${slot}` : `dog-${slot}-${outcome.id}`];
      }
      text = `${parentLabel(slot)}: ${name} ${verb}.`;
    } else {
      text = `${name} ${verb}.`;
    }
    const emptied = settle();
    render();
    announcer.announce(`${text}${placed && outcome.id === state.slots[slot].chosen ? resultsStatus() : ''}${clearedText(emptied)}`);
  }

  function pageMessage(text: string): void {
    state = { ...state, pageAlert: text };
    render();
    dropAlert.scrollIntoView({ block: 'nearest' });
    announcer.announce(text);
  }

  /** A slot that has nothing chosen and is not reading. */
  const free = (slot: ParentIndex): boolean => state.slots[slot].chosen === null && state.slots[slot].reading === null;

  /** Both slots are taken: by a chosen dog, or by reads in progress. */
  const slotsTaken = (): string => (SLOTS.some((slot) => state.slots[slot].chosen !== null) ? DROP_FULL : DROP_READING);

  const actions: ListActions = {
    toggle(slot, id) {
      const current = state.slots[slot];
      const clearing = current.chosen === id;
      if (current.reading !== null) {
        // The read still saves its dog, without placing it here.
        tokens[slot]++;
      }
      clearTransient();
      endUndo();
      choose(slot, clearing ? null : id);
      // A cleared row that the filter or the sex narrowing hides leaves the list.
      focusKeys = clearing ? [`dog-${slot}-${id}`, `find-${slot}`, `name-${slot}`] : [];
      render();
      announcer.announce(clearing ? `${parentLabel(slot)} cleared.` : `${parentLabel(slot)}: ${savedName(store.dog(id)?.name ?? null)} chosen.${resultsStatus()}`);
    },
    remove(slot, id) {
      const dog = store.dog(id);
      if (dog === undefined) {
        return;
      }
      const row = slotsEl.querySelector(`[data-key="${CSS.escape(`delete-${slot}-${id}`)}"]`)?.closest('li');
      const neighbours = [row?.nextElementSibling, row?.previousElementSibling].flatMap(
        (item) => item?.querySelector<HTMLElement>('button.del')?.dataset['key'] ?? [],
      );
      const chosen = state.slots[slot].chosen === id;
      SLOTS.filter((other) => state.slots[other].chosen === id).forEach((other) => choose(other, null));
      clearTransient();
      const { deleted } = store.remove(id);
      state = { ...state, undo: deleted === null ? null : { deleted, slot, chosen } };
      const cleared = settle();
      focusKeys = listMode(slot) ? [...neighbours, `pick-${slot}`, `name-${slot}`] : [`undo-${slot}`];
      render();
      announcer.announce(`Deleted ${savedName(dog.name)}. Undo available.${clearedText(cleared)}`);
    },
    showAll(slot, all) {
      setSlot(slot, { showAll: all });
      render();
    },
    clearFilter(slot) {
      setSlot(slot, { filter: '' });
      focusKeys = [`find-${slot}`];
      render();
    },
    undo() {
      const line = state.undo;
      if (line === null) {
        return;
      }
      clearTransient();
      endUndo();
      const { outcome } = store.restore(line.deleted);
      const { slot } = line;
      const chooses = line.chosen && state.slots[slot].chosen === null && state.slots[otherSlot(slot)].chosen !== outcome.id;
      if (chooses) {
        if (state.slots[slot].reading !== null) {
          // The read still saves its dog, without placing it here.
          tokens[slot]++;
        }
        choose(slot, outcome.id);
      }
      const cleared = settle();
      focusKeys = [`dog-${slot}-${outcome.id}`, `find-${slot}`, `name-${slot}`];
      render();
      const name = savedName(store.dog(outcome.id)?.name ?? line.deleted.dog.name);
      const placed = chooses && state.slots[slot].chosen === outcome.id;
      announcer.announce(`${name} restored.${placed ? resultsStatus() : ''}${clearedText(cleared)}`);
    },
    pick,
    readd(slot, id) {
      readdTargets[slot] = id;
      openPicker(slot);
    },
    answer(slot, nose) {
      const { chosen } = state.slots[slot];
      if (chosen === null) {
        return;
      }
      clearTransient();
      store.setNose(chosen, nose ?? null);
      const cleared = settle();
      render();
      announcer.announce(`${resultsShown ? 'Results updated.' : 'Answer saved.'}${clearedText(cleared)}`);
    },
  };

  const app: App = {
    async load(slot, file) {
      const target = readdTargets[slot];
      readdTargets[slot] = null;
      clearTransient();
      await startLoad(slot, file, target);
    },
    async drop(files, target) {
      clearTransient();
      const open = SLOTS.filter(free);
      const [first, second] = files;
      if (files.length > 2) {
        pageMessage(DROP_TOO_MANY);
      } else if (first === undefined) {
        render();
      } else if (second === undefined) {
        const slot = target ?? open[0];
        if (slot === undefined) {
          pageMessage(slotsTaken());
        } else {
          await startLoad(slot, first, null);
        }
      } else if (open.length === 2) {
        await Promise.all([startLoad(0, first, null), startLoad(1, second, null)]);
      } else if (open[0] !== undefined) {
        const loading = startLoad(open[0], first, null);
        pageMessage(DROP_ONE_FREE);
        await loading;
      } else {
        pageMessage(slotsTaken());
      }
    },
  };

  // A stray drop must never navigate away and discard what the page holds.
  window.addEventListener('dragover', (event) => event.preventDefault());
  window.addEventListener('drop', (event) => {
    event.preventDefault();
    const files = [...(event.dataTransfer?.files ?? [])];
    if (files.length === 0) {
      return;
    }
    const slotEl = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-slot]') : null;
    const slot = slotEl?.dataset['slot'];
    void app.drop(files, slot === '0' ? 0 : slot === '1' ? 1 : null);
  });

  render();
  return app;
}
