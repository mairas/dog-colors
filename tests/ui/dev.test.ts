// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { resolveDog } from '../../src/genetics/dog.ts';
import { predictPuppies } from '../../src/genetics/results.ts';
import { analyseHealth, type HealthAnalysis } from '../../src/health/health.ts';
import type { AppState, LoadedSlot } from '../../src/ui/app.ts';
import { STATE_NAMES, fixtureOptions, stateFromQuery } from '../../src/ui/dev.ts';
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
  'results-health-unknown': ['.health tbody th', 'Both reports give the same sex, so the odds are unknown.'],
};

async function health(query: Record<string, string>): Promise<HealthAnalysis> {
  const [first, second] = loaded(await stateFromQuery(new URLSearchParams(query)));
  if (first === undefined || second === undefined) {
    throw new Error('two reports expected');
  }
  return analyseHealth(first.report, second.report);
}

const reasons = (analysis: HealthAnalysis): string[] => analysis.rows.flatMap((row) => (row.odds.kind === 'unknown' ? [row.odds.reason] : []));

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

  it('reaches unknown health odds for same-sex parents, and the unknown-inheritance warning', async () => {
    const analysis = await health({ state: 'results-health-unknown' });
    expect(reasons(analysis)).toEqual(['same-sex-parents', 'same-sex-parents', 'inheritance-unknown']);
    expect(analysis.warnings.map((warning) => warning.kind)).toEqual(['inheritance-unknown']);
  });

  it('reaches the assumed pairing with one sex unread', async () => {
    const analysis = await health({ fixtures: 'h,n' });
    expect(analysis.rows.filter((row) => row.sexInferred).map((row) => row.inheritance)).toEqual(['XR', 'MT']);
    expect(analysis.warnings).toContainEqual(expect.objectContaining({ kind: 'affected-puppies', among: 'daughters', sexInferred: true }));
  });

  it('reaches the X-linked range with neither sex read', async () => {
    const analysis = await health({ fixtures: 'u,n' });
    expect(reasons(analysis)).toEqual(['sex-unknown', 'sex-unknown', 'inheritance-unknown']);
    const daughters = analysis.warnings.find((warning) => warning.kind === 'affected-puppies');
    expect(daughters?.kind === 'affected-puppies' && 'min' in daughters.chance).toBe(true);
  });

  it('loads any two reports by name', async () => {
    const app = await stateFromQuery(new URLSearchParams({ fixtures: 'c,m' }));
    expect(loaded(app).map((slot) => slot.report.missingLoci)).toEqual([[], ['TYRP1']]);
  });
});

describe('the fixture states’ breeding note', () => {
  const note = (root: HTMLElement) => root.querySelector<HTMLElement>('section.ethics');

  async function open(query: Record<string, string>): Promise<HTMLElement> {
    const { root } = openPage({}, await fixtureOptions(new URLSearchParams(query)));
    return root;
  }

  it.each([{ state: 'slot-empty' }, { state: 'results-populated' }, { fixtures: 'a,b' }])('starts dismissed with note=hidden in %o', async (query) => {
    expect(note(await open({ ...query, note: 'hidden' }))?.hidden).toBe(true);
  });

  it('shows without note=hidden, and a dismissal stays in memory', async () => {
    window.localStorage.clear();
    const root = await open({ state: 'slot-empty' });
    expect(note(root)?.hidden).toBe(false);
    root.querySelector<HTMLButtonElement>('section.ethics button.close')?.click();
    expect(note(root)?.hidden).toBe(true);
    expect(window.localStorage.length).toBe(0);
    expect(note(await open({ state: 'slot-empty' }))?.hidden).toBe(false);
  });
});
