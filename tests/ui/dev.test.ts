// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { resolveDog } from '../../src/genetics/dog.ts';
import { predictPuppies } from '../../src/genetics/results.ts';
import { analyseHealth, type HealthAnalysis } from '../../src/health/health.ts';
import type { Report } from '../../src/report/types.ts';
import { openSavedDogs } from '../../src/saved/store.ts';
import { STATE_NAMES, fixtureOptions, stateFromQuery } from '../../src/ui/dev.ts';
import { MemoryStorage } from '../saved/storage.ts';
import { openPage, openState } from './app.ts';

/** The reports of the dogs a state or fixture pair chooses, in slot order. */
async function chosen(query: Record<string, string>): Promise<Report[]> {
  const storage = new MemoryStorage();
  const { initial } = await stateFromQuery(new URLSearchParams(query), storage);
  const store = openSavedDogs({ storage: () => storage });
  return initial.slots.flatMap(({ chosen: id }) => {
    const dog = id === null ? undefined : store.dog(id);
    return dog === undefined || dog.status === 'unusable' ? [] : [dog.report];
  });
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
  'slot-missing': ['[data-slot="1"] .flag', 'not in report'],
  'list-none-chosen': ['[data-slot="0"] h2', 'Choose a dog'],
  'list-chosen': ['[data-slot="0"] button.dog[aria-pressed="true"]', 'Sample A'],
  'list-narrowed': ['[data-slot="0"] .listnote', 'Males only'],
  'list-all-shown': ['[data-slot="1"] .listnote', 'Showing all dogs'],
  'list-no-match': ['[data-slot="1"] .listempty', 'No females match “zz”.'],
  'list-many': ['[data-slot="1"] label.find', 'Find a dog for Parent 2'],
  'list-reading': ['[data-slot="0"] .add[aria-busy="true"]', 'Reading wisdom-report.pdf…'],
  'list-rejected': ['[data-slot="0"] .err', "This PDF isn't a Wisdom Panel dog report."],
  'list-same-dog': ['[data-slot="1"] .err.info + label.find, [data-slot="1"] .err.info + .listing', 'Sample'],
  'open-same-dog': ['[data-slot="1"] .err.info + .drop', 'Choose PDF'],
  'list-stale': ['[data-slot="0"] .older', 'Older reading'],
  'stale-chosen': ['[data-slot="1"] .stale-note', 'Read by an older version of this page.'],
  'results-populated': ['#results h2', 'Puppy colours: Sample Q × Sample B'],
  'results-ranges': ['#results .note', 'Answer the questions on the cards to narrow them.'],
  'results-warnings': ['#results .warnings', 'Double merle'],
  'results-partial': ['#results .note', "TYRP1 (chocolate) missing from Parent 2's report"],
  'results-health-unknown': ['.health tbody th', 'Both reports give the same sex, so the odds are unknown.'],
  'results-failed': ['main:not(.has-results) .pair .results-error', 'Puppy colours can’t be worked out for this pair.'],
  'list-undo': ['[data-slot="1"] .listing + .undo', 'Deleted Sample D.'],
  'open-undo': ['[data-slot="1"] h2 + .undo + .drop', 'Choose PDF'],
  'clear-asking': ['.slots + .library-tools [role="group"]', 'Delete all 4 saved dogs?'],
  'storage-refused': ['.storage-alert [role="alert"]', 'Dogs can’t be saved in this browser.'],
  'storage-full': ['.storage-alert [role="alert"]', 'New dogs can’t be saved in this browser.'],
  'page-outdated': ['.storage-alert [role="alert"]', 'This page is out of date.'],
  'bulk-open-reading': ['[data-slot="0"][aria-busy="true"] .drop[data-key="progress-0"]', 'Reading 3 of 8 reports…'],
  'bulk-list-reading': ['[data-slot="1"] .listing + .add[data-key="progress-1"]', 'Reading 3 of 8 reports…'],
  'bulk-open-summary': ['[data-slot="0"] h2 + .bulk-summary', 'No dogs added.'],
  'bulk-list-summary': ['[data-slot="1"] .listing + .bulk-summary', 'Added 3 dogs and updated 1.'],
  'bulk-page-reading': ['.page-bulk .bulk', 'Reading 2 of 5 reports…'],
  'bulk-page-summary': ['.page-bulk .bulk-summary', 'Added Sample C.'],
};

async function health(query: Record<string, string>): Promise<HealthAnalysis> {
  const [first, second] = await chosen(query);
  if (first === undefined || second === undefined) {
    throw new Error('two reports expected');
  }
  return analyseHealth(first, second);
}

const reasons = (analysis: HealthAnalysis): string[] => analysis.rows.flatMap((row) => (row.odds.kind === 'unknown' ? [row.odds.reason] : []));

describe('the dev-only fixture states', () => {
  it('has a marker for every state', () => {
    expect(Object.keys(MARKERS)).toEqual(STATE_NAMES);
  });

  it.each(STATE_NAMES)('renders %s', async (name) => {
    const { root } = await openState({ state: name });
    const [selector, text] = MARKERS[name] ?? ['', ''];
    const found = [...root.ownerDocument.querySelectorAll(selector)].map((element) => element.textContent ?? '');
    expect(found).toContainEqual(expect.stringContaining(text));
  });

  it('reaches the nose question with a synthetic bd 1 + bc 1 parent', async () => {
    const [first] = await chosen({ state: 'slot-questions' });
    expect(first && resolveDog(first).questions).toHaveLength(1);
  });

  it('reaches the ASIP ambiguity no question settles', async () => {
    const [first] = await chosen({ state: 'slot-unanswerable' });
    expect(first && resolveDog(first).unsettled).toEqual(['ASIP']);
  });

  it('reaches a colour warning', async () => {
    const [first, second] = await chosen({ state: 'results-warnings' });
    expect(first && second && predictPuppies(resolveDog(first), resolveDog(second)).warnings).toHaveLength(1);
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

  it('saves any two reports by name and chooses them', async () => {
    expect((await chosen({ fixtures: 'c,m' })).map((report) => report.missingLoci)).toEqual([[], ['TYRP1']]);
    const { root } = await openState({ fixtures: 'c,m' });
    expect(root.classList.contains('has-results')).toBe(true);
  });

  it('chooses one dog when both names are the same report', async () => {
    expect(await chosen({ fixtures: 'a,a' })).toHaveLength(1);
    expect((await chosen({ fixtures: 'u,u' })).map((report) => report.name)).toEqual(['Sample U', 'Sample U']);
  });

  it('lists a stale and an unusable dog', async () => {
    const { root } = await openState({ state: 'list-stale' });
    expect(root.querySelectorAll('[data-slot="0"] button.dog.unusable')).toHaveLength(1);
    expect(root.querySelectorAll('[data-slot="0"] button.dog .older')).toHaveLength(1);
  });

  it('lists every report with the chosen one last, under a filter field', async () => {
    const { root } = await openState({ state: 'list-many' });
    const rows = [...root.querySelectorAll('[data-slot="0"] button.dog')];
    expect(rows).toHaveLength(14);
    expect(rows.at(-1)?.getAttribute('aria-pressed')).toBe('true');
  });

  it('restores the deleted dog from an undo state', async () => {
    const { root } = await openState({ state: 'list-undo' });
    root.querySelector<HTMLButtonElement>('[data-key="undo-1"]')?.click();
    expect([...root.querySelectorAll('[data-slot="1"] button.dog')].map((row) => row.getAttribute('data-key'))).toEqual([
      'dog-1-b',
      'dog-1-d',
    ]);
  });

  it('keeps the refused states’ dogs in the page, not in storage', async () => {
    const refused = await openState({ state: 'storage-refused' });
    expect(refused.root.querySelectorAll('[data-slot="0"] button.dog')).toHaveLength(4);
    expect(refused.root.querySelector('.privacy')?.textContent).not.toContain('kept in this browser');
    expect(openSavedDogs({ storage: () => refused.storage }).dogs()).toHaveLength(0);

    const full = await openState({ state: 'storage-full' });
    expect(full.root.querySelectorAll('[data-slot="0"] button.dog')).toHaveLength(5);
    expect(full.root.querySelector('.privacy')?.textContent).toContain('kept in this browser');
    expect(openSavedDogs({ storage: () => full.storage }).dogs()).toHaveLength(4);
  });

  it('shows no Clear saved dogs button when the page is out of date', async () => {
    const { root } = await openState({ state: 'page-outdated' });
    expect(root.querySelector('[data-key="clear-saved"]')).toBeNull();
  });

  it('never writes to window.localStorage, even when a state is used', async () => {
    window.localStorage.clear();
    for (const name of STATE_NAMES) {
      const { root } = openPage({}, await fixtureOptions(new URLSearchParams({ state: name })));
      root.querySelector<HTMLButtonElement>('button.dog:not(.unusable)')?.click();
      root.querySelector<HTMLInputElement>('[data-key="nose-0-brown"]')?.click();
    }
    expect(window.localStorage.length).toBe(0);
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
