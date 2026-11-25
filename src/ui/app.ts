// The page's state and its one render path. State lives in memory only, apart
// from the breeding note's dismissal; every change re-renders the slots and
// recomputes the results. Elements with a data-key keep their focus, open
// disclosures and expanded caveats across renders, so answering a question
// doesn't lose the keyboard position.

import { resolveDog, type ResolvedDog } from '../genetics/dog.ts';
import type { NoseAnswer } from '../genetics/questions.ts';
import { predictPuppies, type PuppyPrediction } from '../genetics/results.ts';
import { analyseHealth, type HealthAnalysis, type ParentIndex } from '../health/health.ts';
import type { ReadResult, Report, Sex } from '../report/types.ts';
import { createAnnouncer } from './announce.ts';
import { dogName, renderCard } from './card.ts';
import { h, svg } from './dom.ts';
import { healthWarnings, renderHealth } from './health.ts';
import {
  DROP_FULL,
  DROP_ONE_FREE,
  DROP_READING,
  DROP_TOO_MANY,
  READER_FAILED,
  REJECTIONS,
  replacementRejected,
  type Message,
} from './messages.ts';
import { parentLabel } from './names.ts';
import { ETHICS_LINK_KEY, renderResults, sameSexLead } from './results.ts';
import { alertBox, renderOpenSlot, slotHeadingId, type OpenSlot } from './slots.ts';

/** Reads a chosen file; throws only when the reader itself fails. */
export type ReadFile = (file: File) => Promise<ReadResult>;

export interface LoadedSlot {
  readonly kind: 'loaded';
  readonly report: Report;
  readonly nose: NoseAnswer | undefined;
  /** A replacement is being read; the card stays until it succeeds. */
  readonly replacing: boolean;
  /** A rejected replacement's message, until the next action. */
  readonly alert: Message | null;
}

export type SlotState = OpenSlot | LoadedSlot;

export interface AppState {
  readonly slots: readonly [SlotState, SlotState];
  /** A page-level drop message, until the next action. */
  readonly pageAlert: string | null;
}

/** Where the breeding note's dismissal is kept: localStorage in the browser. */
export type NoteStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export interface AppOptions {
  readonly read: ReadFile;
  readonly initial?: AppState;
  /** Whether the viewport is narrow enough to collapse the genotype tables once results exist. */
  readonly narrow?: () => boolean;
  readonly storage?: NoteStorage;
  /** The current time in epoch milliseconds. */
  readonly now?: () => number;
}

interface ViewState {
  readonly active: string | undefined;
  readonly open: ReadonlyMap<string, boolean>;
  readonly expanded: ReadonlySet<string>;
}

export interface App {
  /** Loads a file into a slot, as the slot's picker does; replaces a loaded report. */
  load(slot: ParentIndex, file: File): Promise<void>;
  /** Applies the drop rules to files dropped on a slot, or elsewhere when `target` is null. */
  drop(files: readonly File[], target: ParentIndex | null): Promise<void>;
}

const EMPTY: OpenSlot = { kind: 'empty', error: null };
const SLOTS = [0, 1] as const;
/** The stylesheet's narrow layout. */
const NARROW_QUERY = '(max-width: 700px)';
/** Holds the epoch milliseconds until which the breeding note stays hidden. */
const NOTE_HIDDEN_KEY = 'dog-colors:breeding-note-hidden-until';
const NOTE_HIDDEN_MS = 30 * 24 * 60 * 60 * 1000;

/** The parents' sex when both reports give the same one; an unread sex settles nothing. */
const sameSex = (first: Sex | null, second: Sex | null): Sex | undefined => (first !== null && first === second ? first : undefined);

const sameReport = (first: Report, second: Report): boolean =>
  first.kitIdHash !== null && first.kitIdHash === second.kitIdHash;

function privacyNote(): HTMLElement {
  return h(
    'p',
    { class: 'privacy' },
    svg(
      'svg',
      { width: '20', height: '20', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'aria-hidden': 'true' },
      svg('rect', { x: '4', y: '10', width: '16', height: '11', rx: '2' }),
      svg('path', { d: 'M8 10V7a4 4 0 0 1 8 0v3' }),
    ),
    h(
      'span',
      {},
      'Reports are read in your browser and never uploaded. Download the PDF from your dog’s results on Wisdom Panel, or print the web report from Chrome, Edge or Safari with “Save as PDF”.',
    ),
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
  // Even reading window.localStorage throws where storage is disabled.
  const storage = (): NoteStorage => options.storage ?? window.localStorage;
  let state: AppState = options.initial ?? { slots: [EMPTY, EMPTY], pageAlert: null };
  const tokens: [number, number] = [0, 0];
  let focusKey: string | null = null;
  let renderedKinds: readonly string[] = [];
  let resultsShown = false;
  let cached: { key: readonly unknown[]; prediction: PuppyPrediction; health: HealthAnalysis } | null = null;

  const announcer = createAnnouncer();
  const dropAlert = h('div', { class: 'drop-alert' });
  const slotsEl = h('div', { class: 'slots' });
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
  const note = breedingNote();
  root.replaceChildren(
    note,
    privacyNote(),
    h('a', { class: 'ready btn', href: '#results' }, 'Results ready', h('span', { 'aria-hidden': 'true' }, '↓')),
    dropAlert,
    slotsEl,
    pairEl,
    resultsEl,
    announcer.region,
    ...inputs,
  );

  wireBreedingNote(root, note, storage, now);

  const setSlot = (slot: ParentIndex, value: SlotState): void => {
    const slots: [SlotState, SlotState] = [state.slots[0], state.slots[1]];
    slots[slot] = value;
    state = { ...state, slots };
  };

  /** Clears the messages that last only until the next action. */
  const clearTransient = (): void => {
    const clear = (slot: SlotState): SlotState => (slot.kind === 'loaded' && slot.alert !== null ? { ...slot, alert: null } : slot);
    state = { pageAlert: null, slots: [clear(state.slots[0]), clear(state.slots[1])] };
  };

  const loaded = (): [LoadedSlot, LoadedSlot] | null => {
    const [first, second] = state.slots;
    return first.kind === 'loaded' && second.kind === 'loaded' ? [first, second] : null;
  };

  const duplicate = (): boolean => {
    const pair = loaded();
    return pair !== null && sameReport(pair[0].report, pair[1].report);
  };

  const pick = (slot: ParentIndex): void => {
    clearTransient();
    render();
    const input = inputs[slot];
    input.value = '';
    input.click();
  };

  // A loaded slot is replaced, never changed, so its resolved dog can be kept with it.
  const resolved = new WeakMap<LoadedSlot, ResolvedDog>();
  const resolve = (slot: LoadedSlot): ResolvedDog => {
    let dog = resolved.get(slot);
    if (dog === undefined) {
      dog = resolveDog(slot.report, slot.nose === undefined ? {} : { nose: slot.nose });
      resolved.set(slot, dog);
    }
    return dog;
  };

  const predict = (
    first: LoadedSlot,
    second: LoadedSlot,
    dogs: readonly [ResolvedDog, ResolvedDog],
  ): { prediction: PuppyPrediction; health: HealthAnalysis } => {
    const key = [first.report, first.nose, second.report, second.nose];
    if (cached === null || cached.key.some((item, index) => item !== key[index])) {
      const health = cached !== null && cached.key[0] === first.report && cached.key[2] === second.report
        ? cached.health
        : analyseHealth(first.report, second.report);
      cached = { key, prediction: predictPuppies(dogs[0], dogs[1]), health };
    }
    return cached;
  };

  function renderPair(): void {
    if (!duplicate()) {
      pairEl.replaceChildren();
      return;
    }
    const replace = h('button', { type: 'button', class: 'ghost', 'data-key': 'duplicate-replace' }, 'Replace Parent 2');
    replace.addEventListener('click', () => pick(1));
    const message = alertBox({ text: 'Both slots hold the same report. Replace one of them to see puppy colours.' });
    message.lastElementChild?.append(' ', replace);
    pairEl.replaceChildren(message);
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
    const target = focusKey ?? view.active;
    focusKey = null;
    if (target !== undefined) {
      root.querySelector<HTMLElement>(`[data-key="${CSS.escape(target)}"]`)?.focus();
    }
  }

  function render(): void {
    const view = snapshot();

    dropAlert.replaceChildren(...(state.pageAlert === null ? [] : [alertBox({ text: state.pageAlert })]));

    const cards = SLOTS.map((slot) => {
      const current = state.slots[slot];
      if (current.kind !== 'loaded') {
        return renderOpenSlot(slot, current, pick);
      }
      return renderCard(
        { slot, report: current.report, dog: resolve(current), nose: current.nose, replacing: current.replacing, alert: current.alert },
        { answer, replace: pick, remove },
      );
    });
    const kinds = SLOTS.map((slot) => state.slots[slot].kind);
    cards.forEach((card, slot) => card.classList.toggle('enter', renderedKinds[slot] !== kinds[slot]));
    renderedKinds = kinds;
    slotsEl.replaceChildren(...cards);
    renderPair();

    const pair = loaded();
    const show = pair !== null && !duplicate();
    if (show) {
      const { prediction, health } = predict(pair[0], pair[1], [resolve(pair[0]), resolve(pair[1])]);
      resultsEl.replaceChildren(
        ...renderResults({
          names: [dogName(pair[0].report, 0), dogName(pair[1].report, 1)],
          prediction,
          openQuestion: pair.some((slot) => slot.nose === undefined && resolve(slot).questions.length > 0),
          sameSex: sameSex(pair[0].report.sex, pair[1].report.sex),
          healthWarnings: healthWarnings(health),
          sections: [renderHealth(health)],
        }),
      );
    } else {
      resultsEl.replaceChildren();
    }
    resultsEl.hidden = !show;
    root.classList.toggle('has-results', show);
    const collapse = show && !resultsShown && narrow();
    resultsShown = show;
    restore(view, collapse);
  }

  const resultsStatus = (): string => {
    if (duplicate()) {
      return ' Both slots hold the same report.';
    }
    if (!resultsShown) {
      return '';
    }
    // Focus stays on the loaded card, so the same-sex card is announced here.
    const pair = loaded();
    const shared = pair === null ? undefined : sameSex(pair[0].report.sex, pair[1].report.sex);
    return ` Results updated.${shared === undefined ? '' : ` ${sameSexLead(shared)}`}`;
  };

  async function startLoad(slot: ParentIndex, file: File): Promise<void> {
    const token = ++tokens[slot];
    const current = state.slots[slot];
    setSlot(slot, current.kind === 'loaded' ? { ...current, replacing: true, alert: null } : { kind: 'reading', fileName: file.name });
    render();
    announcer.announce(`Reading the report for ${parentLabel(slot)}…`);

    let result: ReadResult | null;
    try {
      result = await options.read(file);
    } catch {
      result = null;
    }
    if (token !== tokens[slot]) {
      return;
    }
    // It says both reads are in progress, which stops being true once one settles.
    if (state.pageAlert === DROP_READING) {
      state = { ...state, pageAlert: null };
    }

    const before = state.slots[slot];
    if (result?.ok === true) {
      const active = document.activeElement;
      const focusLost = active === null || active === document.body || !root.contains(active);
      const inSlot = slotsEl.querySelector(`[data-slot="${slot}"]`)?.contains(active) ?? false;
      // The duplicate message and its Replace button go once the new report loads.
      const inPair = pairEl.contains(active);
      setSlot(slot, { kind: 'loaded', report: result.report, nose: undefined, replacing: false, alert: null });
      if (focusLost || inSlot || inPair) {
        focusKey = `name-${slot}`;
      }
      render();
      announcer.announce(`${parentLabel(slot)}: ${dogName(result.report, slot)} loaded.${resultsStatus()}`);
      return;
    }
    const message = result === null ? READER_FAILED : REJECTIONS[result.kind];
    if (before.kind === 'loaded') {
      setSlot(slot, { ...before, replacing: false, alert: replacementRejected(message) });
    } else {
      setSlot(slot, { kind: 'empty', error: message });
      focusKey = `pick-${slot}`;
    }
    render();
    announcer.announce(`${parentLabel(slot)}: ${before.kind === 'loaded' ? replacementRejected(message).text : message.text}`);
  }

  function pageMessage(text: string): void {
    state = { ...state, pageAlert: text };
    render();
    dropAlert.scrollIntoView({ block: 'nearest' });
    announcer.announce(text);
  }

  /** Both slots are taken: Replace works on a card, but a slot still reading has none. */
  const slotsTaken = (): string => (SLOTS.some((slot) => state.slots[slot].kind === 'loaded') ? DROP_FULL : DROP_READING);

  function answer(slot: ParentIndex, nose: NoseAnswer | undefined): void {
    const current = state.slots[slot];
    if (current.kind !== 'loaded') {
      return;
    }
    clearTransient();
    setSlot(slot, { ...current, nose, alert: null });
    render();
    announcer.announce(resultsShown ? 'Results updated.' : 'Answer saved.');
  }

  function remove(slot: ParentIndex): void {
    tokens[slot]++;
    clearTransient();
    setSlot(slot, EMPTY);
    focusKey = `pick-${slot}`;
    render();
    announcer.announce(`${parentLabel(slot)} removed.`);
  }

  const app: App = {
    async load(slot, file) {
      clearTransient();
      await startLoad(slot, file);
    },
    async drop(files, target) {
      clearTransient();
      const free = SLOTS.filter((slot) => state.slots[slot].kind === 'empty');
      const [first, second] = files;
      if (files.length > 2) {
        pageMessage(DROP_TOO_MANY);
      } else if (first === undefined) {
        render();
      } else if (second === undefined) {
        const slot = target ?? free[0];
        if (slot === undefined) {
          pageMessage(slotsTaken());
        } else {
          await startLoad(slot, first);
        }
      } else if (free.length === 2) {
        await Promise.all([startLoad(0, first), startLoad(1, second)]);
      } else if (free[0] !== undefined) {
        const loading = startLoad(free[0], first);
        pageMessage(DROP_ONE_FREE);
        await loading;
      } else {
        pageMessage(slotsTaken());
      }
    },
  };

  // A stray drop must never navigate away and discard the loaded reports.
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
