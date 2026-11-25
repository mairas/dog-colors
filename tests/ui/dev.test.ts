// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { resolveDog } from '../../src/genetics/dog.ts';
import { predictPuppies } from '../../src/genetics/results.ts';
import type { AppState, LoadedSlot } from '../../src/ui/app.ts';
import { STATE_NAMES, stateFromQuery } from '../../src/ui/dev.ts';
import { openPage } from './app.ts';

const state = (name: string): Promise<AppState> => stateFromQuery(new URLSearchParams({ state: name }));

function loaded(app: AppState): LoadedSlot[] {
  return app.slots.filter((slot): slot is LoadedSlot => slot.kind === 'loaded');
}

/** What sets each state apart on the page: an element, and text it holds. */
const MARKERS: Readonly<Record<string, readonly [selector: string, text: string]>> = {
  'slot-empty': ['[data-slot="1"] h2', 'No report yet'],
  'results-hidden': ['main:not(.has-results) [data-slot="0"] h2', 'Sample Q'],
  'slot-reading': ['[data-slot="1"][aria-busy="true"] .file', 'wisdom-report.pdf'],
  'slot-error': ['[data-slot="1"] .err', "This report was saved with the Windows 'Adobe PDF' printer"],
  'slot-loaded': ['.has-results [data-slot="1"] h2', 'Sample B'],
  'slot-questions': ['[data-slot="0"] legend', 'Nose and paw pads: black or brown?'],
  'slot-unanswerable': ['[data-slot="0"] .note', "The report can't tell which; results show both."],
  'slot-replace-error': ['[data-slot="0"] .card-alert', 'Replacement not loaded'],
  'page-drop-error': ['.drop-alert', 'Both slots are full. Use Replace on a card.'],
  'slot-missing': ['[data-slot="1"] .flag', 'not in report'],
  'pair-duplicate': ['main:not(.has-results) .pair', 'Both slots hold the same report.'],
  'results-populated': ['#results h2', 'Puppy colours: Sample Q × Sample B'],
  'results-ranges': ['#results .note', 'Answer the questions on the cards to narrow them.'],
  'results-warnings': ['#results .warnings', 'Double merle'],
  'results-partial': ['#results .note', "TYRP1 (chocolate) missing from Parent 2's report"],
};

describe('the dev-only fixture states', () => {
  it('has a marker for every state', () => {
    expect(Object.keys(MARKERS)).toEqual(STATE_NAMES);
  });

  it.each(STATE_NAMES)('renders %s', async (name) => {
    const { root } = openPage({}, { initial: await state(name) });
    const [selector, text] = MARKERS[name] ?? ['', ''];
    const found = [...root.ownerDocument.querySelectorAll(selector)].map((element) => element.textContent ?? '');
    expect(found).toContainEqual(expect.stringContaining(text));
  });

  it('reaches the nose question with a synthetic bd 1 + bc 1 parent', async () => {
    const [first] = loaded(await state('slot-questions'));
    expect(first && resolveDog(first.report).questions).toHaveLength(1);
  });

  it('reaches the ASIP ambiguity no question settles', async () => {
    const [first] = loaded(await state('slot-unanswerable'));
    expect(first && resolveDog(first.report).unsettled).toEqual(['ASIP']);
  });

  it('reaches a colour warning', async () => {
    const [first, second] = loaded(await state('results-warnings'));
    expect(first && second && predictPuppies(resolveDog(first.report), resolveDog(second.report)).warnings).toHaveLength(1);
  });

  it('loads any two reports by name', async () => {
    const app = await stateFromQuery(new URLSearchParams({ fixtures: 'c,m' }));
    expect(loaded(app).map((slot) => slot.report.missingLoci)).toEqual([[], ['TYRP1']]);
  });
});
