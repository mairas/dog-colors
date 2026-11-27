// The page's state and its one render path. The saved dogs live in the store;
// which dog each slot holds, reads in progress and the slots' messages live in
// memory. Every change re-renders the slots and recomputes the results, but
// for a bulk add's save that changes no slot's layout and no chosen dog,
// which redraws only the rows and the progress.
// Elements with a data-key keep their focus, open disclosures and expanded
// caveats across renders, so answering a question doesn't lose the keyboard
// position.

import { predictPuppies, type PuppyPrediction } from '../genetics/results.ts';
import { analyseHealth, type HealthAnalysis, type ParentIndex } from '../health/health.ts';
import type { ReadResult, Report, Sex } from '../report/types.ts';
import type { SavedDog, UsableDog } from '../saved/check.ts';
import { openSavedDogs, type AddOutcome, type SavedDogs, type StoreMode, type StoredDog } from '../saved/store.ts';
import { createAnnouncer } from './announce.ts';
import { h, svg } from './dom.ts';
import { healthWarnings, renderHealth } from './health.ts';
import {
  chosenInView,
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
  bulkProgressText,
  bulkStartText,
  PRIVACY_DOWNLOAD,
  PRIVACY_KEPT,
  PRIVACY_READ,
  READER_FAILED,
  REJECTIONS,
  RESULTS_FAILED,
  sameDogNotice,
  STORAGE_WARNINGS,
  type Message,
} from './messages.ts';
import { parentLabel, savedName } from './names.ts';
import { ETHICS_LINK_KEY, renderResults, sameSexLead } from './results.ts';
import {
  alertBox,
  bulkProgress,
  bulkSummary,
  bulkSummaryText,
  renderOpenSlot,
  setBulkProgress,
  slotHeadingId,
  type BulkStatus,
  type BulkSummary,
  type DogLabel,
  type OpenSlot,
  type RejectedFile,
  type SlotNotice,
} from './slots.ts';

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

/** Several files picked or dropped at once: their progress, then their summary until the next add or delete. */
export interface BulkAdd {
  /** The slot the files were picked or dropped in; null for a drop outside both slots. */
  readonly at: ParentIndex | null;
  readonly status: BulkStatus;
}

export interface AppState {
  readonly slots: readonly [SlotState, SlotState];
  readonly bulk: BulkAdd | null;
  readonly undo: UndoLine | null;
  /** Clear saved dogs is asking for its second tap. */
  readonly clearing: boolean;
}

/** Where the saved dogs and the breeding note's dismissal are kept: localStorage in the browser. */
export type PageStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export interface AppOptions {
  readonly read: ReadFile;
  readonly initial?: AppState;
  /** Whether the viewport is narrow enough to collapse the genotype tables once results exist. */
  readonly narrow?: () => boolean;
  readonly storage?: PageStorage;
  /** The current time in epoch milliseconds. */
  readonly now?: () => number;
  /** IDs for newly saved dogs; random by default. */
  readonly newId?: () => string;
  /** The colour prediction; replaceable so that a pair the genetics reject can be shown. */
  readonly predictPuppies?: typeof predictPuppies;
  /** The saved dogs, opened over `storage` by default; a fixture state passes a store whose storage refuses. */
  readonly savedDogs?: SavedDogs;
}

interface ViewState {
  readonly active: string | undefined;
  /** The slot holding focus: when its focused keyed element is gone, focus goes to the slot's picker or the bulk progress in its place. */
  readonly activeSlot: ParentIndex | null;
  readonly open: ReadonlyMap<string, boolean>;
  readonly expanded: ReadonlySet<string>;
  /** Each saved-dog list's scroll position. */
  readonly scrolled: ReadonlyMap<string, number>;
  /** Per slot, whether its list showed its chosen row in full. */
  readonly chosenShown: readonly boolean[];
}

/** What only a full render redraws, taken before a bulk add saves a file. */
interface Shape {
  /** Each slot's chosen dog, as the store's object, which a save that changes the dog replaces. */
  readonly chosen: readonly (SavedDog | null)[];
  readonly filter: boolean;
  readonly undo: boolean;
}

export interface App {
  /** Reads a file into a slot, as the slot's picker does: a re-add when the picker was opened by Add the report again. */
  load(slot: ParentIndex, file: File): Promise<void>;
  /** Adds files dropped or picked in a slot, or dropped outside both slots when `target` is null. */
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
function wireBreedingNote(root: HTMLElement, note: HTMLElement, storage: () => PageStorage, now: () => number): void {
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
  const storage = (): PageStorage => options.storage ?? window.localStorage;
  const store = options.savedDogs ?? openSavedDogs({ storage, now, ...(options.newId === undefined ? {} : { newId: options.newId }) });
  let state: AppState = options.initial ?? { slots: [EMPTY_SLOT, EMPTY_SLOT], bulk: null, undo: null, clearing: false };
  /** Each slot's latest read: an earlier one still saves its dog, but does not place it. */
  const tokens: [number, number] = [0, 0];
  /** Each slot's latest-started read that has finished, by token: a rejection finishing after it is out of date. */
  const finished: [number, number] = [0, 0];
  /** How many times Clear saved dogs was confirmed: a read that began before the latest is discarded. */
  let clears = 0;
  /** How many bulk adds began: a placed one shows its summary only if it was the latest. */
  let bulks = 0;
  /** The unplaced bulk add reading: its queue, which later several-file adds join, where it shows, and its end. */
  let gathering: { readonly queue: File[]; readonly at: ParentIndex | null; readonly done: Promise<void> } | null = null;
  /** The dog Add the report again was pressed for, until the slot's picker gives a file or Add a dog opens it. */
  const readdTargets: [string | null, string | null] = [null, null];
  const typingTimers: [number | undefined, number | undefined] = [undefined, undefined];
  /** Where the next render puts focus: the first of these data-keys found, else where focus was. */
  let focusKeys: readonly string[] = [];
  /** The store mode the storage warning and the privacy line were last drawn for. */
  let drawnMode: StoreMode | null = null;
  /** What Clear saved dogs last drew: nothing, its button, or its confirmation with the count. */
  let drawnTools: string | null = null;
  let renderedLayouts: readonly string[] = [];
  let revealed: readonly (string | null)[] = [null, null];
  let resultsShown = false;
  let resultsFailed = false;
  let cached: { dogs: readonly [UsableDog, UsableDog]; prediction: PuppyPrediction } | null = null;
  let cachedHealth: { reports: readonly [Report, Report]; health: HealthAnalysis } | null = null;

  const announcer = createAnnouncer();
  const pageBulk = h('div', { class: 'page-bulk' });
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
      multiple: true,
      class: 'vh',
      tabindex: '-1',
      'aria-hidden': 'true',
      'data-testid': `file-${slot}`,
    });
    input.addEventListener('change', () => {
      const files = [...(input.files ?? [])];
      const [file] = files;
      if (files.length > 1) {
        void app.drop(files, slot);
      } else if (file !== undefined) {
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
    pageBulk,
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

  /** Ends a bulk add's summary: the next add or delete does. */
  const endSummary = (): void => {
    if (state.bulk?.status.kind === 'summary') {
      state = { ...state, bulk: null };
    }
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
    setSlot(slot, { chosen: id, notice: null });
  }

  /** Supersedes the slot's read in progress: it still saves its dog, without placing it here. */
  function supersede(slot: ParentIndex): void {
    if (state.slots[slot].reading !== null) {
      tokens[slot]++;
      setSlot(slot, { reading: null });
    }
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
    gathering = null;
    tokens[0]++;
    tokens[1]++;
    readdTargets[0] = null;
    readdTargets[1] = null;
    store.clear();
    state = { slots: [EMPTY_SLOT, EMPTY_SLOT], bulk: null, undo: null, clearing: false };
    focusKeys = ['pick-0'];
    render();
    announcer.announce('All saved dogs deleted.');
  }

  const pick = (slot: ParentIndex): void => {
    readdTargets[slot] = null;
    openPicker(slot);
  };

  /** Opens the slot's picker: several files for Add a dog and Choose PDF, one for Add the report again. */
  function openPicker(slot: ParentIndex): void {
    render();
    const input = inputs[slot];
    input.multiple = readdTargets[slot] === null;
    input.value = '';
    input.click();
  }

  /** The bulk add shown in the slot, or at page level for null. */
  const bulkAt = (slot: ParentIndex | null): BulkStatus | null => (state.bulk !== null && state.bulk.at === slot ? state.bulk.status : null);

  /** The deleted dog the slot's undo line offers back. */
  const undoLabel = (slot: ParentIndex): DogLabel | null =>
    state.undo === null || state.undo.slot !== slot ? null : dogLabel(state.undo.deleted.dog, store.dogs());

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
      bulk: bulkAt(slot),
    };
  };

  /** Re-renders only the slot's rows while its filter is typed in, and says how many are listed once typing pauses. */
  function typed(slot: ParentIndex, text: string): void {
    setSlot(slot, { filter: text });
    const input = listInput(slot);
    // As render() keeps the list's scroll and its chosen row in view.
    const view = snapshot();
    slotsEl.querySelector(`[data-slot="${slot}"] .listing`)?.replaceWith(renderListing(input, actions));
    restoreScroll(view);
    const element = slotsEl.querySelector<HTMLElement>(`[data-slot="${slot}"]`);
    if (element !== null && view.chosenShown[slot] === true) {
      revealChosen(element);
    }
    window.clearTimeout(typingTimers[slot]);
    typingTimers[slot] = window.setTimeout(() => announcer.announce(listingStatus(listing(input))), TYPING_PAUSE_MS);
  }

  /** The layout `renderSlot` gives the slot: its list, or the open slot empty or reading. */
  const layoutOf = (slot: ParentIndex): string => (listMode(slot) ? 'list' : state.slots[slot].reading === null ? 'empty' : 'reading');

  function renderSlot(slot: ParentIndex): { element: HTMLElement; layout: string } {
    const current = state.slots[slot];
    if (listMode(slot)) {
      return { element: renderListSlot(listInput(slot), actions), layout: 'list' };
    }
    const warning = current.notice?.tone === 'warning' ? current.notice.message : null;
    const info = current.notice?.tone === 'info' ? current.notice.message : null;
    const open: OpenSlot =
      current.reading === null ? { kind: 'empty', error: warning } : { kind: 'reading', fileName: current.reading, error: warning };
    const extras = { notice: info, deleted: undoLabel(slot), undo: actions.undo, bulk: bulkAt(slot) };
    return { element: renderOpenSlot(slot, open, pick, extras), layout: open.kind };
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
    let computed: ReturnType<typeof pairResults>;
    try {
      computed = pairResults(dogs);
    } catch {
      return null;
    }
    const { prediction, health } = computed;
    return renderResults({
      names: [savedName(dogs[0].name), savedName(dogs[1].name)],
      prediction,
      openQuestion: dogs.some((dog) => dog.nose === null && (resolveSaved(dog)?.questions.length ?? 0) > 0),
      sameSex: sameSex(dogs[0].sex, dogs[1].sex),
      healthWarnings: healthWarnings(health),
      sections: [renderHealth(health)],
    });
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
    const scrolled = new Map<string, number>();
    root.querySelectorAll<HTMLElement>('.dogs-list[data-key]').forEach((list) => {
      scrolled.set(list.dataset['key'] ?? '', list.scrollTop);
    });
    const chosenShown = SLOTS.map((slot) => {
      const element = slotsEl.querySelector<HTMLElement>(`[data-slot="${slot}"]`);
      return element !== null && chosenInView(element);
    });
    const focusedEl = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const slot = focusedEl?.closest<HTMLElement>('[data-slot]')?.dataset['slot'];
    const activeSlot = slot === '0' ? 0 : slot === '1' ? 1 : null;
    return { active: focusedEl?.dataset['key'], activeSlot, open, expanded, scrolled, chosenShown };
  }

  /**
   * Scrolls the new lists back to where the old ones were. Runs before the
   * chosen rows are revealed, which may then move a list from that offset.
   */
  function restoreScroll(view: ViewState): void {
    root.querySelectorAll<HTMLElement>('.dogs-list[data-key]').forEach((list) => {
      list.scrollTop = view.scrolled.get(list.dataset['key'] ?? '') ?? 0;
    });
  }

  /** Puts a snapshot's disclosures, caveats and focus back on the new elements; `collapse` closes the genotype tables. */
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
    // Only a keyed element the render removed sends focus to the slot's picker or progress.
    const replaced = view.activeSlot === null || view.active === undefined ? [] : [`pick-${view.activeSlot}`, `progress-${view.activeSlot}`];
    const target = [...focusKeys, view.active, ...replaced].find((key) => key !== undefined && keyed(key) !== null);
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

  /**
   * Clear saved dogs, or its inline confirmation, while any dog is saved and
   * storage may be written; redrawn only when that changes, so focus on it stays.
   */
  function drawTools(): void {
    const count = store.dogs().length;
    const shown = count === 0 || store.mode() === 'out-of-date' ? 'none' : state.clearing ? `asking ${count}` : 'button';
    if (shown === drawnTools) {
      return;
    }
    drawnTools = shown;
    if (shown === 'none') {
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
    // A count taken before this action would overwrite what the action announces.
    SLOTS.forEach((slot) => window.clearTimeout(typingTimers[slot]));
    settle();
    const view = snapshot();
    drawStorage();
    drawTools();

    const page = bulkAt(null);
    pageBulk.replaceChildren(
      ...(page === null ? [] : [page.kind === 'reading' ? bulkProgress(page, 'bulk', null) : bulkSummary(page)]),
    );

    const slots = SLOTS.map(renderSlot);
    slots.forEach(({ element, layout }, slot) => element.classList.toggle('enter', renderedLayouts[slot] !== layout));
    renderedLayouts = slots.map(({ layout }) => layout);
    slotsEl.replaceChildren(...slots.map(({ element }) => element));
    // Once in the page, so that the capped lists can be scrolled. The reveal
    // comes after the restore, which would otherwise undo it: a new choice is
    // scrolled to, and a list showing its chosen row keeps showing it as rows
    // come and go above it. A list scrolled away from its chosen row stays put.
    restoreScroll(view);
    SLOTS.forEach((slot) => {
      if (state.slots[slot].chosen !== revealed[slot] || view.chosenShown[slot] === true) {
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

  const shape = (): Shape => ({ chosen: SLOTS.map(chosenDog), filter: showsFilter(store.dogs()), undo: state.undo !== null });

  /** Whether a full render is needed since `before`: a slot's layout, a chosen dog, the filter field or the undo line changed. */
  const reshaped = (before: Shape): boolean =>
    before.undo ||
    before.filter !== showsFilter(store.dogs()) ||
    SLOTS.some((slot) => chosenDog(slot) !== before.chosen[slot] || layoutOf(slot) !== renderedLayouts[slot]);

  /**
   * Redraws in place what a bulk add's step changes when `reshaped` says no
   * full render is needed: the storage warning, Clear saved dogs, each slot's
   * rows and the progress count. Focus stays, unless it was on a row the
   * listing replaced, which is focused again by its key.
   */
  function refresh(): void {
    const view = snapshot();
    drawStorage();
    drawTools();
    SLOTS.forEach((slot) => {
      slotsEl.querySelector(`[data-slot="${slot}"] .listing`)?.replaceWith(renderListing(listInput(slot), actions));
    });
    const bulk = state.bulk;
    if (bulk?.status.kind === 'reading') {
      const line = bulk.at === null ? pageBulk.firstElementChild : slotsEl.querySelector(`[data-key="progress-${bulk.at}"]`);
      if (line !== null) {
        setBulkProgress(line, bulk.status);
      }
    }
    restoreScroll(view);
    SLOTS.forEach((slot) => {
      const element = slotsEl.querySelector<HTMLElement>(`[data-slot="${slot}"]`);
      if (element !== null && view.chosenShown[slot] === true) {
        revealChosen(element);
      }
    });
    const active = document.activeElement;
    if (view.active !== undefined && (active === null || active === document.body)) {
      root.querySelector<HTMLElement>(`[data-key="${CSS.escape(view.active)}"]`)?.focus();
    }
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

  /** Reads a file; null when the reader itself fails. */
  async function readReport(file: File): Promise<ReadResult | null> {
    try {
      return await options.read(file);
    } catch {
      return null;
    }
  }

  const rejection = (result: ReadResult | null): Message => (result === null || result.ok ? READER_FAILED : REJECTIONS[result.kind]);

  /** Shows the slot reading the file; only the slot's latest read, by its token, places its dog there. */
  function reserve(slot: ParentIndex, file: File): number {
    setSlot(slot, { reading: file.name, notice: null });
    return ++tokens[slot];
  }

  /** Reads a file for a slot and saves it, unless Clear saved dogs is confirmed meanwhile. */
  async function startLoad(slot: ParentIndex, file: File, target: string | null): Promise<void> {
    endSummary();
    const token = reserve(slot, file);
    const cleared = clears;
    render();
    announcer.announce(`Reading the report for ${parentLabel(slot)}…`);
    const result = await readReport(file);
    if (cleared === clears) {
      finishLoad(slot, token, file.name, result, target);
    }
  }

  /**
   * Saves a read made for a slot. Only the slot's latest read places its dog
   * there; a superseded or overtaken read is still saved. A report of the dog
   * the other slot holds updates that dog and leaves it there. Returns what
   * the store did, or null for a rejected file.
   */
  function finishLoad(
    slot: ParentIndex,
    token: number,
    fileName: string,
    result: ReadResult | null,
    target: string | null,
  ): AddOutcome | null {
    const placed = token === tokens[slot];
    const overtaken = finished[slot] > token;
    finished[slot] = Math.max(finished[slot], token);
    if (placed) {
      setSlot(slot, { reading: null });
    }

    if (result?.ok !== true) {
      if (overtaken) {
        // A file added to the slot later has already finished: its outcome stands.
        render();
        return null;
      }
      // A superseded read shows its rejection too, named by its file since the
      // slot has moved on, but focus stays where the user has acted since.
      const reason = rejection(result);
      const message = placed ? reason : { ...reason, text: `${fileName}: ${reason.text}` };
      setSlot(slot, { notice: { tone: 'warning', message } });
      if (placed && focusInSlotOrLost(slot)) {
        focusKeys = [`pick-${slot}`];
      }
      render();
      announcer.announce(`${parentLabel(slot)}: ${message.text}`);
      return null;
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
        if (moveFocus) {
          focusKeys = [`pick-${slot}`];
        }
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
    return outcome;
  }

  /** A slot that has nothing chosen and is not reading. */
  const free = (slot: ParentIndex): boolean => state.slots[slot].chosen === null && state.slots[slot].reading === null;

  /** What a bulk add has saved and rejected so far. */
  interface Tally {
    readonly added: string[];
    readonly updated: string[];
    readonly rejected: RejectedFile[];
  }

  /** Counts a saved report under its dog's name as the store now holds it. */
  function tally(into: Tally, outcome: AddOutcome, report: Report): void {
    const name = savedName(store.dog(outcome.id)?.name ?? report.name);
    (outcome.kind === 'added' ? into.added : into.updated).push(name);
  }

  /**
   * Reads files that fit the free slots one at a time and places each in its
   * slot, in drop order, as a single add would. A summary follows only if one
   * updated a saved dog; it is shown, not announced.
   */
  async function addPlaced(files: readonly File[], open: readonly ParentIndex[], at: ParentIndex | null): Promise<void> {
    const batch = ++bulks;
    const cleared = clears;
    const reads = files.flatMap((file, index) => {
      const slot = open[index];
      return slot === undefined ? [] : [{ file, slot, token: reserve(slot, file) }];
    });
    state = { ...state, bulk: null };
    render();
    announcer.announce(`Reading the reports for ${reads.map(({ slot }) => parentLabel(slot)).join(' and ')}…`);

    const saved: Tally = { added: [], updated: [], rejected: [] };
    for (const { file, slot, token } of reads) {
      const result = await readReport(file);
      if (cleared !== clears) {
        // Clear saved dogs was confirmed during the read: the rest is discarded.
        return;
      }
      const outcome = finishLoad(slot, token, file.name, result, null);
      if (outcome !== null && result?.ok === true) {
        tally(saved, outcome, result.report);
      }
    }
    // A later bulk add owns the progress and summary.
    if (batch === bulks && saved.updated.length > 0) {
      state = { ...state, bulk: { at, status: { kind: 'summary', ...saved } } };
      render();
    }
  }

  /** Shows the unplaced bulk add's progress: the file being read, counted from 1, of every file queued. */
  function showProgress(at: ParentIndex | null, current: number, queue: readonly File[]): void {
    state = { ...state, bulk: { at, status: { kind: 'reading', current, total: queue.length } } };
  }

  /**
   * Reads the queued files one at a time and saves each, placing none:
   * progress, then the summary, show where the files arrived, and only those
   * two are announced. Files queued meanwhile are read in turn.
   */
  async function readUnplaced(queue: File[], at: ParentIndex | null): Promise<void> {
    bulks++;
    const cleared = clears;
    if (at !== null) {
      // As a single add does, the slot's new files replace its last message.
      setSlot(at, { notice: null });
    }
    showProgress(at, 1, queue);
    render();
    announcer.announce(bulkStartText(queue.length));
    if (at === null) {
      pageBulk.scrollIntoView({ block: 'nearest' });
    }

    const saved: Tally = { added: [], updated: [], rejected: [] };
    try {
      // An array's iterator checks its length at each step, so it reaches files queued meanwhile.
      for (const [index, file] of queue.entries()) {
        const result = await readReport(file);
        if (cleared !== clears) {
          return;
        }
        const before = shape();
        if (result?.ok === true) {
          tally(saved, store.add(result.report).outcome, result.report);
          endUndo();
        } else {
          saved.rejected.push({ name: file.name, message: rejection(result) });
        }
        if (index + 1 < queue.length) {
          showProgress(at, index + 2, queue);
        }
        settle();
        if (reshaped(before)) {
          render();
        } else {
          refresh();
        }
      }
    } finally {
      // After a Clear, a later bulk add may own the queue by now.
      if (gathering?.queue === queue) {
        gathering = null;
      }
    }
    const done: BulkSummary = { kind: 'summary', ...saved };
    state = { ...state, bulk: { at, status: done } };
    render();
    announcer.announce(bulkSummaryText(done));
  }

  /**
   * Several files: placed when they fit the slots free as they arrive,
   * otherwise none is placed. While an unplaced add reads, they join its
   * queue, its progress and its one summary.
   */
  async function addSeveral(files: readonly File[], at: ParentIndex | null): Promise<void> {
    if (gathering !== null) {
      const { queue, at: shownAt, done } = gathering;
      queue.push(...files);
      const current = state.bulk?.status.kind === 'reading' ? state.bulk.status.current : 1;
      showProgress(shownAt, current, queue);
      refresh();
      announcer.announce(bulkProgressText(current, queue.length));
      await done;
      return;
    }
    const open = SLOTS.filter(free);
    if (files.length <= open.length) {
      await addPlaced(files, open, at);
      return;
    }
    const queue = [...files];
    const done = readUnplaced(queue, at);
    gathering = { queue, at, done };
    await done;
  }

  const actions: ListActions = {
    toggle(slot, id) {
      const clearing = state.slots[slot].chosen === id;
      supersede(slot);
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
      endSummary();
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
      endUndo();
      const { outcome } = store.restore(line.deleted);
      const { slot } = line;
      const chooses = line.chosen && state.slots[slot].chosen === null && state.slots[otherSlot(slot)].chosen !== outcome.id;
      if (chooses) {
        supersede(slot);
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
      await startLoad(slot, file, target);
    },
    async drop(files, target) {
      const [file] = files;
      // One file goes to the slot it was dropped on, or outside the slots to the first free one.
      const slot = target ?? SLOTS.find(free);
      if (files.length === 1 && file !== undefined && slot !== undefined) {
        await startLoad(slot, file, null);
      } else if (files.length > 0) {
        await addSeveral(files, target);
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
