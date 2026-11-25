// The page's state and its one render path. State lives in memory only; every
// change re-renders the slots and recomputes the results. Elements with a
// data-key keep their focus, open disclosures and expanded caveats across
// renders, so answering a question doesn't lose the keyboard position.

import { resolveDog, type ResolvedDog } from '../genetics/dog.ts';
import type { NoseAnswer } from '../genetics/questions.ts';
import { predictPuppies, type PuppyPrediction } from '../genetics/results.ts';
import type { ParentIndex } from '../health/health.ts';
import type { ReadResult, Report } from '../report/types.ts';
import { createAnnouncer } from './announce.ts';
import { dogName, renderCard } from './card.ts';
import { h, svg } from './dom.ts';
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
import { renderResults } from './results.ts';
import { alertBox, renderOpenSlot, type OpenSlot } from './slots.ts';

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

export interface AppOptions {
  readonly read: ReadFile;
  readonly initial?: AppState;
  /** Whether the viewport is narrow enough to collapse the genotype tables once results exist. */
  readonly narrow?: () => boolean;
}

export interface App {
  /** Loads a file into a slot, as the slot's picker does; replaces a loaded report. */
  load(slot: ParentIndex, file: File): Promise<void>;
  /** Applies the drop rules to files dropped on a slot, or elsewhere when `target` is null. */
  drop(files: readonly File[], target: ParentIndex | null): Promise<void>;
}

const EMPTY: OpenSlot = { kind: 'empty', error: null };
const SLOTS = [0, 1] as const;
const NARROW_QUERY = '(max-width: 700px)';

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
      'Reports are read in your browser and never uploaded. Nothing is saved: reloading the page clears it. Download the PDF from your dog’s results on Wisdom Panel, or print the web report from Chrome, Edge or Safari with “Save as PDF”.',
    ),
  );
}

export function startApp(root: HTMLElement, options: AppOptions): App {
  const narrow = options.narrow ?? (() => window.matchMedia(NARROW_QUERY).matches);
  let state: AppState = options.initial ?? { slots: [EMPTY, EMPTY], pageAlert: null };
  const tokens: [number, number] = [0, 0];
  let focusKey: string | null = null;
  let renderedKinds: readonly string[] = [];
  let resultsShown = false;
  let cached: { key: readonly unknown[]; prediction: PuppyPrediction } | null = null;

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
  root.replaceChildren(
    privacyNote(),
    h('a', { class: 'ready btn', href: '#results' }, 'Results ready', h('span', { 'aria-hidden': 'true' }, ' ↓')),
    dropAlert,
    slotsEl,
    pairEl,
    resultsEl,
    announcer.region,
    ...inputs,
  );

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

  const resolve = (slot: LoadedSlot): ResolvedDog => resolveDog(slot.report, slot.nose === undefined ? {} : { nose: slot.nose });

  const predict = (first: LoadedSlot, second: LoadedSlot, dogs: readonly [ResolvedDog, ResolvedDog]): PuppyPrediction => {
    const key = [first.report, first.nose, second.report, second.nose];
    if (cached === null || cached.key.some((item, index) => item !== key[index])) {
      cached = { key, prediction: predictPuppies(dogs[0], dogs[1]) };
    }
    return cached.prediction;
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

  function render(): void {
    const active = document.activeElement instanceof HTMLElement ? document.activeElement.dataset['key'] : undefined;
    const open = new Map<string, boolean>();
    root.querySelectorAll<HTMLDetailsElement>('details[data-key]').forEach((details) => {
      open.set(details.dataset['key'] ?? '', details.open);
    });
    const expanded = new Set<string>();
    root.querySelectorAll<HTMLElement>('.cav[aria-expanded="true"][data-key]').forEach((badge) => {
      expanded.add(badge.dataset['key'] ?? '');
    });

    dropAlert.replaceChildren(...(state.pageAlert === null ? [] : [alertBox({ text: state.pageAlert })]));

    const resolveSlot = (slot: SlotState): ResolvedDog | null => (slot.kind === 'loaded' ? resolve(slot) : null);
    const dogs = [resolveSlot(state.slots[0]), resolveSlot(state.slots[1])] as const;
    const cards = SLOTS.map((slot) => {
      const current = state.slots[slot];
      const dog = dogs[slot];
      if (current.kind !== 'loaded' || dog === null) {
        return renderOpenSlot(slot, current.kind === 'loaded' ? EMPTY : current, pick);
      }
      return renderCard(
        { slot, report: current.report, dog, nose: current.nose, replacing: current.replacing, alert: current.alert },
        { answer, replace: pick, remove },
      );
    });
    const kinds = SLOTS.map((slot) => state.slots[slot].kind);
    cards.forEach((card, slot) => card.classList.toggle('enter', renderedKinds[slot] !== kinds[slot]));
    renderedKinds = kinds;
    slotsEl.replaceChildren(...cards);
    renderPair();

    const pair = loaded();
    const [firstDog, secondDog] = dogs;
    const show = pair !== null && !duplicate() && firstDog !== null && secondDog !== null;
    if (show) {
      const prediction = predict(pair[0], pair[1], [firstDog, secondDog]);
      resultsEl.replaceChildren(
        ...renderResults({
          names: [dogName(pair[0].report, 0), dogName(pair[1].report, 1)],
          prediction,
          openQuestion: SLOTS.some((slot) => pair[slot].nose === undefined && (dogs[slot]?.questions.length ?? 0) > 0),
        }),
      );
    } else {
      resultsEl.replaceChildren();
    }
    resultsEl.hidden = !show;
    root.classList.toggle('has-results', show);
    const collapse = show && !resultsShown && narrow();
    resultsShown = show;

    root.querySelectorAll<HTMLDetailsElement>('details[data-key]').forEach((details) => {
      const key = details.dataset['key'] ?? '';
      if (collapse && details.classList.contains('gd')) {
        details.open = false;
      } else if (open.has(key)) {
        details.open = open.get(key) ?? details.open;
      }
    });
    root.querySelectorAll<HTMLElement>('.cav[data-key]').forEach((badge) => {
      if (expanded.has(badge.dataset['key'] ?? '')) {
        badge.click();
      }
    });
    const target = focusKey ?? active;
    focusKey = null;
    if (target !== undefined) {
      root.querySelector<HTMLElement>(`[data-key="${CSS.escape(target)}"]`)?.focus();
    }
  }

  const resultsStatus = (): string => {
    if (duplicate()) {
      return ' Both slots hold the same report.';
    }
    return resultsShown ? ' Results updated.' : '';
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
