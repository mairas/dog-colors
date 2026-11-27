// @vitest-environment happy-dom
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { Report } from '../../src/report/types.ts';
import { hash, MemoryStorage } from '../saved/storage.ts';
import { syntheticReport } from '../genetics/synthetic.ts';
import { openSavedDogs, SAVED_DOGS_KEY } from '../../src/saved/store.ts';
import {
  button,
  fixtureText,
  heading,
  ok,
  openPage,
  openState,
  parsed,
  pdf,
  rewriteSaved,
  sampleReport,
  savedStorage,
  slowRead,
  tableRows,
  variant,
  type ReadResults,
} from './app.ts';

const ANSWER_NOTE = "Some figures are ranges because a parent's genotype is uncertain. Answer the questions on the cards to narrow them.";
const SETTLE_NOTE = "Some figures are ranges because the report can't settle a parent's genotype.";
const ADOBE =
  "This report was saved with the Windows 'Adobe PDF' printer, which scrambles the text so it can't be read. Download the report from Wisdom Panel instead. Or open the web report in Chrome or Edge, choose Print, and set the printer to 'Save as PDF'.";

let a: Report;
let b: Report;
let c: Report;
let d: Report;
let nose: Report;
let asip: Report;
let reads: ReadResults;

beforeAll(async () => {
  [a, b, c, d] = await Promise.all([sampleReport('a'), sampleReport('b'), sampleReport('c'), sampleReport('d')]);
  nose = await variant('a', 'Sample Q', { TYRP1: { basd: 0, bc: 1, bd: 1, be: 0, bh: 0, bs: 0 } });
  asip = await variant('b', 'Sample X', { ASIP: { ay: 1, a: 0, at: 1 } });
  reads = {
    'a.pdf': ok(a),
    'b.pdf': ok(b),
    'c.pdf': ok(c),
    'd.pdf': ok(d),
    'a-unread.pdf': ok({ ...a, kitIdHash: null, sex: null }),
    'c-unread.pdf': ok({ ...c, kitIdHash: null, sex: null }),
    'nose.pdf': ok(nose),
    'asip.pdf': ok(asip),
    'other.pdf': { ok: false, kind: 'not-wisdom-dog' },
  };
});

async function pair(first: string, second: string) {
  const page = openPage(reads);
  await page.app.load(0, pdf(first));
  await page.app.load(1, pdf(second));
  return page;
}

const results = (root: HTMLElement) => root.querySelector<HTMLElement>('#results');

describe('the colour page', () => {
  it('flags two male parents above the results and still shows them', async () => {
    const { root } = await pair('a.pdf', 'c.pdf');
    const card = results(root)?.querySelector('.same-sex');
    expect(card?.textContent).toBe('Both parents are male. Successful breeding of two male dogs may be difficult. The results are shown anyway.');
    expect(results(root)?.querySelector('.chips')).not.toBeNull();
  });

  it('flags two female parents in their own words', async () => {
    const { root } = await pair('b.pdf', 'd.pdf');
    expect(results(root)?.querySelector('.same-sex')?.textContent).toContain('Successful breeding of two female dogs may be difficult.');
  });

  it.each([
    ['a male × female pairing', 'a.pdf', 'b.pdf'],
    ['one sex unread', 'a-unread.pdf', 'c.pdf'],
    ['both sexes unread', 'a-unread.pdf', 'c-unread.pdf'],
  ])('shows no same-sex card for %s', async (_name, first, second) => {
    const { root } = await pair(first, second);
    expect(results(root)?.querySelector('#results-h')).not.toBeNull();
    expect(results(root)?.querySelector('.same-sex')).toBeNull();
  });

  it('shows 100% brown and a 50/50 white split for A × B, with no ranges', async () => {
    const { root, text } = await pair('a.pdf', 'b.pdf');
    expect(results(root)?.hidden).toBe(false);
    expect(tableRows(root, 'Base colour')).toEqual([['Brown', '100% (all)']]);
    expect(tableRows(root, 'White spotting')).toEqual([
      ['2 copies Piebald to mostly white', '50% (1 in 2)'],
      ['1 copy None to limited white', '50% (1 in 2)'],
    ]);
    expect(text()).not.toContain(ANSWER_NOTE);
    expect(text()).not.toContain(SETTLE_NOTE);
    expect(text()).toContain('Puppy colours: Sample A × Sample B');
  });

  it('shows brown as 50–100% until the nose question is answered brown', async () => {
    const { root, text } = await pair('nose.pdf', 'b.pdf');
    expect(tableRows(root, 'Base colour')).toEqual([
      ['Brown', '50–100%'],
      ['Black', '0–50%'],
    ]);
    expect(text()).toContain(ANSWER_NOTE);
    const unsure = root.querySelector<HTMLInputElement>('[data-key="nose-0-unsure"]');
    expect(unsure?.checked).toBe(true);

    const brown = root.querySelector<HTMLInputElement>('[data-key="nose-0-brown"]');
    brown?.focus();
    brown?.click();
    expect(tableRows(root, 'Base colour')).toEqual([['Brown', '100% (all)']]);
    expect(text()).not.toContain(ANSWER_NOTE);
    expect(root.querySelector<HTMLInputElement>('[data-key="nose-0-brown"]')?.checked).toBe(true);
    expect(document.activeElement?.getAttribute('data-key')).toBe('nose-0-brown');
  });

  it('heads each slot and card at the level below the page title', async () => {
    const { root } = await pair('a.pdf', 'b.pdf');
    expect([...root.querySelectorAll('[data-slot] > h2')].map((heading) => heading.id)).toEqual(['parent-0-name', 'parent-1-name']);
    expect(root.querySelector('[data-slot] h3')).toBeNull();
  });

  it('gives print a ranges note that doesn’t ask for answers it hides', async () => {
    const { root } = await pair('nose.pdf', 'b.pdf');
    const notes = [...root.querySelectorAll('#results .note')];
    expect(notes.find((note) => note.textContent === ANSWER_NOTE)?.classList.contains('screen-only')).toBe(true);
    expect(notes.find((note) => note.classList.contains('print-only'))?.textContent).toBe(
      "Some figures are ranges because a parent's genotype is uncertain and a question on the cards is unanswered.",
    );
  });

  it('lists what a predicted colour can’t account for under “Doesn’t match your dog?”', async () => {
    const { root } = await pair('a.pdf', 'b.pdf');
    const items = [...root.querySelectorAll('[data-key="why-0"] li')].map((item) => item.textContent);
    expect(items.slice(0, 2)).toEqual(["Brindle and greying can't be tested.", 'Rare variants (eA, eG, eH) are not modelled precisely.']);
  });

  it('lists both candidate colours above the question', async () => {
    const { root } = await pair('nose.pdf', 'b.pdf');
    expect(root.querySelector('.own-name')?.textContent).toBe('White with black markings (B/b) or white with brown markings (b/b)');
    expect(root.querySelector('legend')?.textContent).toBe('Nose and paw pads: black or brown?');
  });

  it('shows what each locus reads as on the card, marking the answered one', async () => {
    const { root } = await pair('nose.pdf', 'b.pdf');
    root.querySelector<HTMLInputElement>('[data-key="nose-0-black"]')?.click();
    const rows = [...root.querySelectorAll('[data-slot="0"] table.geno tbody tr')].map((row) => [
      row.querySelector('th')?.textContent,
      row.lastElementChild?.textContent,
    ]);
    expect(rows).toContainEqual(['TYRP1', 'B/b: black, carries brown (your answer)']);
  });

  it('draws the answered colour in the card’s picture', async () => {
    const { root } = await pair('nose.pdf', 'b.pdf');
    const markings = () => root.querySelector('[data-slot="0"] .own svg.chip path')?.getAttribute('class');
    expect(markings()).toBe('coat coat-unknown');
    root.querySelector<HTMLInputElement>('[data-key="nose-0-black"]')?.click();
    expect(markings()).toBe('coat coat-black');
  });

  it('notes that the report can’t settle an ASIP-only ambiguity', async () => {
    const { root, text } = await pair('asip.pdf', 'b.pdf');
    expect(text()).toContain(SETTLE_NOTE);
    expect(text()).not.toContain(ANSWER_NOTE);
    expect(root.querySelector('fieldset')).toBeNull();
    expect(text()).toContain("The report can't tell which; results show both.");
    expect(tableRows(root, 'Colour pattern').some(([, figure]) => figure.includes('–'))).toBe(true);
  });

  it('does not treat two reports without a kit ID as the same report', async () => {
    const { root } = await pair('nose.pdf', 'asip.pdf');
    expect(results(root)?.hidden).toBe(false);
  });

  it('keeps the nose answer when the same dog’s report is read again', async () => {
    const hashed: Report = { ...nose, kitIdHash: hash('ab') };
    const { app, root } = openPage({ 'nose.pdf': ok(hashed), 'b.pdf': ok(b) });
    await app.load(0, pdf('nose.pdf'));
    await app.load(1, pdf('b.pdf'));
    root.querySelector<HTMLInputElement>('[data-key="nose-0-brown"]')?.click();
    await app.load(0, pdf('nose.pdf'));
    expect(root.querySelector<HTMLInputElement>('[data-key="nose-0-brown"]')?.checked).toBe(true);
  });

  it('leaves a rejected slot empty with the message and focus on its retry picker', async () => {
    const { app, root, text } = openPage({ ...reads, 'f.pdf': { ok: false, kind: 'adobe-pdf-printer' } });
    await app.load(1, pdf('f.pdf'));
    expect(text()).toContain(ADOBE);
    expect(button(root, 'pick-1').textContent).toBe('Choose another PDF');
    expect(document.activeElement?.getAttribute('data-key')).toBe('pick-1');
    expect(root.querySelector('[data-slot="0"] h2')?.textContent).toContain('No report yet');
  });

  it('shows the Adobe PDF printer message for Sample F’s unreadable text', async () => {
    const scrambled = await parsed({
      lines: [{ page: 1, y: 700, cells: [{ text: '\u0003\u0004\u0005\u0006\u0007', x: 30, width: 40 }] }],
      info: { creator: 'PScript5.dll Version 5.2.2', producer: 'Acrobat Distiller 24.0 (Windows)' },
    });
    expect(scrambled).toEqual({ ok: false, kind: 'adobe-pdf-printer' });
    const { app, text } = openPage({ 'f.pdf': scrambled });
    await app.load(0, pdf('f.pdf'));
    expect(text()).toContain(ADOBE);
  });

  it('asks for a reload when the PDF reader cannot start', async () => {
    const { app, text } = openPage({
      'a.pdf': () => {
        throw new Error('worker failed to load');
      },
    });
    await app.load(0, pdf('a.pdf'));
    expect(text()).toContain("Couldn't start the PDF reader. Reload the page and try again.");
  });

  it('announces status through one polite live region', async () => {
    const { app, root } = openPage(reads);
    await app.load(0, pdf('a.pdf'));
    const live = root.querySelectorAll('[aria-live]');
    expect(live).toHaveLength(1);
    expect(live[0]?.getAttribute('aria-live')).toBe('polite');
    expect(live[0]?.textContent).toBe('Parent 1: Sample A saved.');
    await app.load(1, pdf('b.pdf'));
    expect(live[0]?.textContent).toBe('Parent 2: Sample B saved. Results updated.');
  });

  it.each([
    ['b.pdf', 'd.pdf', 'Sample D', 'female'],
    ['a.pdf', 'c.pdf', 'Sample C', 'male'],
  ])('announces a same-sex pair (%s, %s) with the results, since focus stays in the slot', async (first, second, name, sex) => {
    const { app, root } = openPage(reads);
    await app.load(0, pdf(first));
    await app.load(1, pdf(second));
    expect(root.querySelector('[aria-live]')?.textContent).toBe(`Parent 2: ${name} saved. Results updated. Both parents are ${sex}.`);
  });

  it('opens the file picker from the picker button', () => {
    const { root } = openPage(reads);
    const input = root.querySelector<HTMLInputElement>('[data-testid="file-0"]');
    const click = vi.spyOn(input ?? new HTMLInputElement(), 'click');
    button(root, 'pick-0').click();
    expect(click).toHaveBeenCalled();
    expect(button(root, 'pick-0').tagName).toBe('BUTTON');
  });

  it('flags a missing locus on the card and as unknown in the results', async () => {
    const { TYRP1: _absent, ...colour } = b.colour;
    const missing: Report = { ...b, name: 'Sample M', kitIdHash: null, colour, missingLoci: ['TYRP1'] };
    const { app, root, text } = openPage({ ...reads, 'm.pdf': ok(missing) });
    await app.load(0, pdf('a.pdf'));
    await app.load(1, pdf('m.pdf'));
    expect(root.querySelector('[data-slot="1"] summary.sec')?.textContent).toContain('1 locus missing');
    expect(text()).toContain('not in report');
    expect(tableRows(root, 'Base colour')).toEqual([["Unknown: TYRP1 (chocolate) missing from Parent 2's report", '100% (all)']]);
    expect(text()).toContain("TYRP1 (chocolate) missing from Parent 2's report, so the figures that depend on it show as unknown.");
  });

  it('collapses the genotype tables on a narrow viewport once results exist', async () => {
    const page = openPage(reads, { narrow: true });
    await page.app.load(0, pdf('a.pdf'));
    expect(page.root.querySelector<HTMLDetailsElement>('[data-key="geno-0"]')?.open).toBe(true);
    await page.app.load(1, pdf('b.pdf'));
    expect(page.root.querySelector<HTMLDetailsElement>('[data-key="geno-0"]')?.open).toBe(false);
    expect(page.root.classList.contains('has-results')).toBe(true);
    expect(page.root.querySelector('a.ready')?.getAttribute('href')).toBe('#results');
  });

  it('expands a caveat badge in place', async () => {
    const { root } = await pair('a.pdf', 'b.pdf');
    const badge = button(root, 'cav-white');
    const text = document.getElementById(badge.getAttribute('aria-controls') ?? '');
    expect(text?.hidden).toBe(true);
    badge.click();
    expect(text?.hidden).toBe(false);
    expect(badge.getAttribute('aria-expanded')).toBe('true');
    expect(text?.textContent).toContain('Very white heads are linked to deafness');
  });

  it('collects every caveat at the bottom', async () => {
    const { root } = await pair('a.pdf', 'b.pdf');
    const items = [...root.querySelectorAll('.caveats li')].map((item) => item.textContent ?? '');
    expect(items.some((item) => item.startsWith('Colour pattern: Brindle'))).toBe(true);
    expect(items.some((item) => item.startsWith('White spotting: Very white heads'))).toBe(true);
    expect(items).toContain('Percentages are rounded and may not add up to exactly 100.');
  });
});

describe('adding several reports', () => {
  type Where = 0 | 1 | 'page';
  const progress = (root: HTMLElement, where: Where): string | null =>
    root.querySelector(where === 'page' ? '.page-bulk .bulk' : `[data-key="progress-${where}"]`)?.textContent ?? null;
  const summary = (root: HTMLElement, where: Where): string | null =>
    root.querySelector(where === 'page' ? '.page-bulk .bulk-summary' : `[data-slot="${where}"] .bulk-summary`)?.textContent ?? null;
  const headings = (root: HTMLElement) => [0, 1].map((slot) => root.querySelector(`[data-slot="${slot}"] h2`)?.textContent ?? '');
  const spoken = (root: HTMLElement) => root.querySelector('[aria-live]')?.textContent ?? '';
  const pressed = (root: HTMLElement) => [...root.querySelectorAll('button.dog[aria-pressed="true"]')].map((row) => row.getAttribute('data-key'));
  const saved = (root: HTMLElement) => [...root.querySelectorAll('[data-slot="0"] button.dog')].map((row) => row.getAttribute('data-key'));
  const NO_TEXT_REASON = 'This PDF contains no text, perhaps a scan or a photo. Download the report from Wisdom Panel instead.';

  /** Reports Dog 1 … Dog n, without kit IDs, each read slowly from dog-<i>.pdf. */
  function slowDogs(count: number) {
    const slow = Array.from({ length: count }, (_, index) => slowRead(ok({ ...b, name: `Dog ${index + 1}`, kitIdHash: null })));
    const files = slow.map((_, index) => `dog-${index + 1}.pdf`);
    const results: ReadResults = Object.fromEntries(files.map((file, index) => [file, slow[index]?.read ?? (() => Promise.reject())]));
    return { slow, files: files.map(pdf), results };
  }

  /** Picks files in a slot's file input, as the picker does. */
  function pickFiles(root: HTMLElement, slot: 0 | 1, files: readonly File[]): void {
    const input = root.querySelector<HTMLInputElement>(`[data-testid="file-${slot}"]`);
    const transfer = new DataTransfer();
    files.forEach((file) => transfer.items.add(file));
    Object.defineProperty(input, 'files', { value: transfer.files, configurable: true });
    input?.dispatchEvent(new Event('change'));
  }

  it('prevents the browser from opening a dropped file', () => {
    openPage(reads);
    const event = new Event('drop', { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it('fills both empty slots in drop order from two files, as today, with no progress or summary', async () => {
    for (const target of [null, 1] as const) {
      const { app, root } = openPage(reads);
      await app.drop([pdf('b.pdf'), pdf('a.pdf')], target);
      expect(headings(root)).toEqual(['Parent 1Sample B', 'Parent 2Sample A']);
      expect(results(root)?.hidden).toBe(false);
      expect(root.querySelector('.bulk, .bulk-summary')).toBeNull();
    }
  });

  it('shows a placed file’s rejection in its slot, with no summary', async () => {
    const { app, root } = openPage(reads);
    await app.drop([pdf('a.pdf'), pdf('other.pdf')], null);
    expect(headings(root)).toEqual(['Parent 1Sample A', 'Parent 2Report can’t be read']);
    expect(root.querySelector('[data-slot="1"] .err')?.textContent).toBe("⚠This PDF isn't a Wisdom Panel dog report. Choose the genetics report you got from Wisdom Panel or MyDogDNA.");
    expect(root.querySelector('.bulk-summary')).toBeNull();
  });

  it('fills both empty slots from two files picked at once in Parent 1’s Choose PDF', async () => {
    const { root } = openPage(reads);
    button(root, 'pick-0').click();
    expect(root.querySelector<HTMLInputElement>('[data-testid="file-0"]')?.multiple).toBe(true);
    pickFiles(root, 0, [pdf('a.pdf'), pdf('b.pdf')]);
    await vi.waitFor(() => expect(headings(root)).toEqual(['Parent 1Sample A', 'Parent 2Sample B']));
  });

  it('reads eight files picked on a first visit one by one, saving all and placing none, with progress and then a summary in the slot', async () => {
    const { slow, files, results: dogReads } = slowDogs(8);
    const { app, root } = openPage(dogReads);
    const adding = app.drop(files, 0);
    expect(progress(root, 0)).toBe('Reading 1 of 8 reports…');
    expect(headings(root)).toEqual(['Parent 1No report yet', 'Parent 2No report yet']);
    expect(root.querySelector('[data-key="pick-0"]')).toBeNull();
    expect(spoken(root)).toBe('Reading 8 reports…');
    await slow[0]?.release();
    await vi.waitFor(() => expect(progress(root, 0)).toBe('Reading 2 of 8 reports…'));
    expect(root.querySelector('[data-slot="0"] .listing + .add[data-key="progress-0"]')).not.toBeNull();
    expect(saved(root)).toEqual(['dog-0-new-1']);
    expect(spoken(root)).toBe('Reading 8 reports…');
    for (const read of slow.slice(1)) {
      await read.release();
    }
    await adding;
    expect(progress(root, 0)).toBeNull();
    expect(summary(root, 0)).toBe('Added 8 dogs.');
    expect(root.querySelector('[data-slot="0"] .bulk-summary + .add [data-key="pick-0"]')?.textContent).toBe('Add a dog');
    expect(saved(root)).toHaveLength(8);
    expect(pressed(root)).toEqual([]);
    expect(spoken(root)).toBe('Added 8 dogs.');
  });

  it('reads eight files picked in Parent 2 while Parent 1 holds a dog, with progress and summary in Parent 2', async () => {
    const { slow, files, results: dogReads } = slowDogs(8);
    const { app, root } = openPage({ ...reads, ...dogReads });
    await app.load(0, pdf('a.pdf'));
    const adding = app.drop(files, 1);
    expect(progress(root, 1)).toBe('Reading 1 of 8 reports…');
    expect(progress(root, 0)).toBeNull();
    for (const read of slow) {
      await read.release();
    }
    await adding;
    expect(summary(root, 1)).toBe('Added 8 dogs.');
    expect(summary(root, 0)).toBeNull();
    expect(headings(root)).toEqual(['Parent 1Sample A', 'Parent 2Choose a dog']);
  });

  it('places none of three files when one slot is free, and shows the progress where they were dropped', async () => {
    const { app, root } = openPage(reads);
    await app.load(0, pdf('a.pdf'));
    await app.drop([pdf('b.pdf'), pdf('c.pdf'), pdf('d.pdf')], null);
    expect(headings(root)).toEqual(['Parent 1Sample A', 'Parent 2Choose a dog']);
    expect(summary(root, 'page')).toBe('Added 3 dogs.');
    expect(saved(root)).toHaveLength(4);
  });

  it('places none of several files dropped on a slot that no longer fit, with progress in that slot', async () => {
    const { app, root } = openPage(reads);
    await app.load(0, pdf('a.pdf'));
    await app.drop([pdf('b.pdf'), pdf('c.pdf')], 0);
    expect(headings(root)).toEqual(['Parent 1Sample A', 'Parent 2Choose a dog']);
    expect(summary(root, 0)).toBe('Added 2 dogs.');
  });

  it('saves one file dropped outside the slots while both hold dogs, and names it in a page-level summary', async () => {
    const slow = slowRead(ok(c));
    const { app, root } = openPage({ ...reads, 'c.pdf': slow.read });
    await app.load(0, pdf('a.pdf'));
    await app.load(1, pdf('b.pdf'));
    const adding = app.drop([pdf('c.pdf')], null);
    expect(progress(root, 'page')).toBe('Reading 1 report…');
    await slow.release();
    await adding;
    expect(headings(root)).toEqual(['Parent 1Sample A', 'Parent 2Sample B']);
    expect(summary(root, 'page')).toBe('Added Sample C.');
  });

  it('places one file dropped on a slot there, or outside in the first free slot', async () => {
    const page = openPage(reads);
    await page.app.load(0, pdf('a.pdf'));
    await page.app.load(1, pdf('b.pdf'));
    await page.app.drop([pdf('c.pdf')], 1);
    expect(headings(page.root)).toEqual(['Parent 1Sample A', 'Parent 2Sample C']);
    const other = openPage(reads);
    await other.app.load(0, pdf('a.pdf'));
    await other.app.drop([pdf('c.pdf')], null);
    expect(headings(other.root)).toEqual(['Parent 1Sample A', 'Parent 2Sample C']);
    expect(other.root.querySelector('.bulk-summary')).toBeNull();
  });

  it('applies placed outcomes in drop order: two copies of one report give one dog in Parent 1, the notice in Parent 2 and a summary', async () => {
    const [first, second] = [slowRead(ok(a)), slowRead(ok(a))];
    const { app, root } = openPage({ '1.pdf': first.read, '2.pdf': second.read });
    const adding = app.drop([pdf('1.pdf'), pdf('2.pdf')], null);
    expect(headings(root)).toEqual(['Parent 1Reading report…', 'Parent 2Reading report…']);
    await second.release();
    await first.release();
    await adding;
    expect(heading(root, 0)).toBe('Parent 1Sample A');
    expect(root.querySelector('[data-slot="1"] .err.info')?.textContent).toBe('ⓘThis report is Sample A, already Parent 1; the saved dog was updated.');
    expect(saved(root)).toEqual(['dog-0-new-1']);
    expect(root.querySelectorAll('[data-slot="1"] button.dog')).toHaveLength(0);
    expect(summary(root, 'page')).toBe('Added 1 dog and updated 1.');
  });

  it('announces a placed batch’s start by slot and its slots’ outcomes, never its summary', async () => {
    const [first, second] = [slowRead(ok(a)), slowRead(ok(a))];
    const { app, root } = openPage({ '1.pdf': first.read, '2.pdf': second.read });
    const adding = app.drop([pdf('1.pdf'), pdf('2.pdf')], null);
    expect(spoken(root)).toBe('Reading the reports for Parent 1 and Parent 2…');
    await first.release();
    await second.release();
    await adding;
    expect(summary(root, 'page')).toBe('Added 1 dog and updated 1.');
    expect(spoken(root)).toBe('This report is Sample A, already Parent 1; the saved dog was updated.');
  });

  it('lets a row tapped in a reserved slot win over the file headed there, which is still saved', async () => {
    const [first, second] = [slowRead(ok(a)), slowRead(ok(b))];
    const storage = savedStorage(c, d);
    const { app, root } = openPage({ '1.pdf': first.read, '2.pdf': second.read }, { storage });
    const adding = app.drop([pdf('1.pdf'), pdf('2.pdf')], null);
    button(root, 'dog-1-dog-2').click();
    await first.release();
    await second.release();
    await adding;
    expect(headings(root)).toEqual(['Parent 1Sample A', 'Parent 2Sample D']);
    expect(openSavedDogs({ storage: () => storage }).dogs()).toHaveLength(4);
  });

  it('shows the rejection of a file whose reserved slot a tapped row took, leaving focus on the row', async () => {
    const [first, second] = [slowRead(ok(a)), slowRead({ ok: false, kind: 'not-wisdom-dog' })];
    const { app, root } = openPage({ '1.pdf': first.read, '2.pdf': second.read }, { storage: savedStorage(c, d) });
    const adding = app.drop([pdf('1.pdf'), pdf('2.pdf')], null);
    button(root, 'dog-1-dog-2').focus();
    button(root, 'dog-1-dog-2').click();
    await first.release();
    await second.release();
    await adding;
    const rejected = "This PDF isn't a Wisdom Panel dog report. Choose the genetics report you got from Wisdom Panel or MyDogDNA.";
    expect(headings(root)).toEqual(['Parent 1Sample A', 'Parent 2Sample D']);
    expect(root.querySelector('[data-slot="1"] .err')?.textContent).toBe(`⚠2.pdf: ${rejected}`);
    expect(document.activeElement?.getAttribute('data-key')).toBe('dog-1-dog-2');
    expect(spoken(root)).toBe(`Parent 2: 2.pdf: ${rejected}`);
    expect(root.querySelector('.bulk-summary')).toBeNull();
  });

  it('renews every stale dog in place when their reports are dropped again', async () => {
    const storage = savedStorage(a, b, c);
    rewriteSaved(storage, ['dog-1', 'dog-2', 'dog-3'], (entry) => ({ ...entry, readerVersion: 0 }));
    const { app, root } = openPage(reads, { storage });
    expect(root.querySelectorAll('[data-slot="0"] .older')).toHaveLength(3);
    await app.drop([pdf('a.pdf'), pdf('b.pdf'), pdf('c.pdf')], null);
    expect(saved(root)).toEqual(['dog-0-dog-1', 'dog-0-dog-2', 'dog-0-dog-3']);
    expect(root.querySelectorAll('.older')).toHaveLength(0);
    expect(summary(root, 'page')).toBe('Updated 3 dogs.');
  });

  it('names each rejected file with its reason in the summary', async () => {
    const { app, root } = openPage({ ...reads, 'litter.pdf': { ok: false, kind: 'no-text' } });
    await app.drop(['a.pdf', 'litter.pdf', 'b.pdf', 'c.pdf'].map(pdf), null);
    expect(summary(root, 'page')).toBe(`Added 3 dogs.⚠litter.pdf: ${NO_TEXT_REASON}`);
    expect(root.querySelector('.page-bulk .bulk-summary .err b')?.textContent).toBe('litter.pdf');
    expect(spoken(root)).toBe(`Added 3 dogs. litter.pdf: ${NO_TEXT_REASON}`);
    expect(root.querySelectorAll('[data-slot] .err')).toHaveLength(0);
  });

  it('shows the summary above Choose PDF when every file was rejected in a slot with nothing choosable', async () => {
    const { app, root } = openPage({ '1.pdf': { ok: false, kind: 'no-text' }, '2.pdf': { ok: false, kind: 'not-pdf' }, '3.pdf': { ok: false, kind: 'no-text' } });
    await app.drop(['1.pdf', '2.pdf', '3.pdf'].map(pdf), 0);
    expect(summary(root, 0)).toContain('No dogs added.');
    expect(summary(root, 0)).toContain("2.pdf: This file isn't a PDF.");
    expect(root.querySelector('[data-slot="0"] .bulk-summary + .drop [data-key="pick-0"]')?.textContent).toBe('Choose PDF');
  });

  it('keeps the slots usable during a bulk add, and moves focus only off an element it replaces', async () => {
    const { slow, files, results: dogReads } = slowDogs(3);
    const { app, root } = openPage({ ...reads, ...dogReads }, { storage: savedStorage(a, b) });
    button(root, 'pick-0').focus();
    const adding = app.drop(files, 0);
    expect(document.activeElement?.getAttribute('data-key')).toBe('progress-0');
    button(root, 'dog-1-dog-2').focus();
    await slow[0]?.release();
    await vi.waitFor(() => expect(progress(root, 0)).toBe('Reading 2 of 3 reports…'));
    expect(document.activeElement?.getAttribute('data-key')).toBe('dog-1-dog-2');
    button(root, 'dog-1-dog-2').click();
    expect(heading(root, 1)).toBe('Parent 2Sample B');
    button(root, 'pick-1').focus();
    await slow[1]?.release();
    await vi.waitFor(() => expect(progress(root, 0)).toBe('Reading 3 of 3 reports…'));
    expect(document.activeElement?.getAttribute('data-key')).toBe('pick-1');
    button(root, 'dog-0-dog-1').focus();
    await slow[2]?.release();
    await adding;
    expect(document.activeElement?.getAttribute('data-key')).toBe('dog-0-dog-1');
    expect(heading(root, 1)).toBe('Parent 2Sample B');
  });

  it('returns focus from the progress to Add a dog when the summary replaces it', async () => {
    const { app, root } = openPage(reads, { storage: savedStorage(d) });
    button(root, 'pick-0').focus();
    await app.drop([pdf('a.pdf'), pdf('b.pdf'), pdf('c.pdf')], 0);
    expect(document.activeElement?.getAttribute('data-key')).toBe('pick-0');
  });

  it('keeps the summary until the next add or delete, not a choose', async () => {
    const { app, root } = openPage(reads);
    await app.load(0, pdf('a.pdf'));
    await app.drop([pdf('b.pdf'), pdf('c.pdf')], 1);
    button(root, 'dog-1-new-2').click();
    expect(summary(root, 1)).toBe('Added 2 dogs.');
    button(root, 'delete-1-new-2').click();
    expect(summary(root, 1)).toBeNull();
    await app.drop([pdf('b.pdf'), pdf('d.pdf')], 1);
    expect(summary(root, 1)).toBe('Added 2 dogs.');
    await app.load(1, pdf('other.pdf'));
    expect(summary(root, 1)).toBeNull();
  });

  it('ends the undo line when a bulk read saves', async () => {
    const { app, root } = openPage(reads, { storage: savedStorage(a, b, c) });
    button(root, 'delete-0-dog-3').click();
    expect(root.querySelector('.undo')).not.toBeNull();
    await app.drop([pdf('d.pdf'), pdf('other.pdf'), pdf('c.pdf')], null);
    expect(root.querySelector('.undo')).toBeNull();
  });

  it('discards the remaining reads when Clear saved dogs is confirmed during a bulk add', async () => {
    const { slow, files, results: dogReads } = slowDogs(3);
    const storage = new MemoryStorage();
    const { app, root } = openPage(dogReads, { storage });
    const adding = app.drop(files, null);
    await slow[0]?.release();
    await vi.waitFor(() => expect(progress(root, 'page')).toBe('Reading 2 of 3 reports…'));
    button(root, 'clear-saved').click();
    button(root, 'clear-delete').click();
    expect(progress(root, 'page')).toBeNull();
    await slow[1]?.release();
    await slow[2]?.release();
    await adding;
    expect(storage.getItem(SAVED_DOGS_KEY)).toBeNull();
    expect(root.querySelector('.bulk, .bulk-summary')).toBeNull();
    expect(spoken(root)).toBe('All saved dogs deleted.');
  });

  it('takes one file in the picker Add the report again opens', () => {
    const storage = savedStorage(a);
    rewriteSaved(storage, ['dog-1'], (entry) => ({ ...entry, report: { ...(entry['report'] as object), shortTail: 1.5 } }));
    const { root } = openPage(reads, { storage });
    const input = root.querySelector<HTMLInputElement>('[data-testid="file-0"]');
    vi.spyOn(input ?? new HTMLInputElement(), 'click').mockImplementation(() => undefined);
    button(root, 'dog-0-dog-1').click();
    expect(input?.multiple).toBe(false);
    button(root, 'pick-0').click();
    expect(input?.multiple).toBe(true);
  });

  it('scrolls a page-level progress line into view', async () => {
    const scroll = vi.spyOn(Element.prototype, 'scrollIntoView');
    const { app, root } = openPage(reads);
    await app.drop(['a.pdf', 'b.pdf', 'c.pdf'].map(pdf), null);
    expect(scroll.mock.contexts).toContain(root.querySelector('.page-bulk'));
    scroll.mockRestore();
  });
});

describe('states between actions', () => {

  it('keeps a slot cleared when the read it started finishes', async () => {
    const slow = slowRead(ok(c));
    const { app, root } = openPage({ ...reads, 'slow.pdf': slow.read });
    await app.load(0, pdf('a.pdf'));
    await app.load(1, pdf('b.pdf'));
    const loading = app.load(1, pdf('slow.pdf'));
    button(root, 'dog-1-new-2').click();
    await slow.release();
    await loading;
    expect(heading(root, 1)).toBe('Parent 2Choose a dog');
    expect(results(root)?.hidden).toBe(true);
  });

  it('counts a slot that is still reading as taken when one file is dropped anywhere', async () => {
    const slow = slowRead(ok(a));
    const { app, root } = openPage({ ...reads, 'slow.pdf': slow.read });
    const reading = app.load(0, pdf('slow.pdf'));
    await app.drop([pdf('c.pdf')], null);
    expect([heading(root, 0), heading(root, 1)]).toEqual(['Parent 1Reading report…', 'Parent 2Sample C']);
    await slow.release();
    await reading;
    expect(heading(root, 0)).toBe('Parent 1Sample A');
  });

  it('settles the ranges note once the question is answered and only ASIP is left', async () => {
    const { root, text } = await pair('nose.pdf', 'asip.pdf');
    expect(text()).toContain(ANSWER_NOTE);
    root.querySelector<HTMLInputElement>('[data-key="nose-0-brown"]')?.click();
    expect(text()).toContain(SETTLE_NOTE);
    expect(text()).not.toContain(ANSWER_NOTE);
  });

  it('keeps open disclosures and expanded caveats across a re-render', async () => {
    const { root } = await pair('nose.pdf', 'b.pdf');
    const why = root.querySelector<HTMLDetailsElement>('[data-key="why-1"]');
    if (why !== null) {
      why.open = true;
    }
    button(root, 'cav-white').click();
    root.querySelector<HTMLInputElement>('[data-key="nose-0-brown"]')?.click();
    expect(root.querySelector('[data-key="why-1"]')).not.toBe(why);
    expect(root.querySelector<HTMLDetailsElement>('[data-key="why-1"]')?.open).toBe(true);
    const badge = button(root, 'cav-white');
    expect(badge.getAttribute('aria-expanded')).toBe('true');
    expect(document.getElementById(badge.getAttribute('aria-controls') ?? '')?.hidden).toBe(false);
  });

});

describe('drag and drop events', () => {
  function dragEvent(type: 'dragover' | 'drop', files: readonly File[]): Event {
    const event = new Event(type, { bubbles: true, cancelable: true });
    const transfer = new DataTransfer();
    files.forEach((file) => transfer.items.add(file));
    Object.defineProperty(event, 'dataTransfer', { value: transfer });
    return event;
  }

  it('lets a file be dragged over the page', () => {
    openPage(reads);
    const event = dragEvent('dragover', [pdf('c.pdf')]);
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it('loads a file dropped on the Parent 2 slot into Parent 2', async () => {
    const { root } = openPage(reads);
    const target = root.querySelector('[data-slot="1"] .drop');
    const event = dragEvent('drop', [pdf('c.pdf')]);
    target?.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    await vi.waitFor(() => expect(root.querySelector('[data-slot="1"] h2')?.textContent).toBe('Parent 2Sample C'));
    expect(root.querySelector('[data-slot="0"] h2')?.textContent).toBe('Parent 1No report yet');
  });
});

describe('untrusted report text', () => {
  const FABRICATED = {
    microchip: '985000111222333',
    registration: 'FIN-REG-424242',
    kit: 'KITSECRET77',
    ownerFirst: 'Fabricia',
    ownerLast: 'Ownerson',
  };

  it('never puts the microchip, registration, kit ID, its hash or owner name into the page', async () => {
    const source = fixtureText('d');
    const lines = source.lines.map((line) => ({
      ...line,
      cells: line.cells.map((cell) => ({
        ...cell,
        text: cell.text
          .replace('000000000000000', FABRICATED.microchip)
          .replace('XX00000/00', FABRICATED.registration)
          .replace('KIT000D', FABRICATED.kit)
          .replace(/^Owner$/, FABRICATED.ownerFirst)
          .replace(/^Surname$/, FABRICATED.ownerLast),
      })),
    }));
    const report = await parsed({ lines, info: source.info });
    const { app } = openPage({ 'd.pdf': report, 'b.pdf': reads['b.pdf'] ?? report });
    await app.load(0, pdf('d.pdf'));
    await app.load(1, pdf('b.pdf'));
    const html = document.documentElement.outerHTML;
    expect(html).toContain('Sample D');
    const hash = report.ok ? report.report.kitIdHash : null;
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    for (const value of [...Object.values(FABRICATED), hash ?? '']) {
      expect(html).not.toContain(value);
    }
  });

  it('renders markup in a name or breed as literal text', async () => {
    const hostile = '<img src=x onerror=alert(1)>';
    const { app, root, text } = openPage({ 'h.pdf': ok({ ...a, name: hostile, breed: hostile, kitIdHash: null }), 'b.pdf': ok(b) });
    await app.load(0, pdf('h.pdf'));
    await app.load(1, pdf('b.pdf'));
    expect(root.querySelector('img')).toBeNull();
    expect(text()).toContain(hostile);
    expect(text()).toContain(`Puppy colours: ${hostile} × Sample B`);
  });
});

describe('engine cases the page names', () => {
  const NO_TYRP1 = { basd: 0, bc: 0, bd: 0, be: 0, bh: 0, bs: 0 };

  it('warns that double merle is possible when a parent’s merle result is missing', async () => {
    const merle = await variant('a', 'Sample W', { PMEL: { M: 1 } });
    const { PMEL: _absent, ...colour } = b.colour;
    const unknown: Report = { ...b, colour, missingLoci: ['PMEL'] };
    const { app, root } = openPage({ 'w.pdf': ok(merle), 'u.pdf': ok(unknown) });
    await app.load(0, pdf('w.pdf'));
    await app.load(1, pdf('u.pdf'));
    expect(root.querySelector('.warnings')?.textContent).toContain("Double merle possible: PMEL (merle) missing from Parent 2's report.");
  });

  it('names the gene of an undocumented combination on the card and in the caveats', async () => {
    const undocumented = await variant('a', 'Sample U', { TYRP1: { ...NO_TYRP1, bc: 2, bs: 1 } });
    const { app, root, text } = openPage({ 'u.pdf': ok(undocumented), 'b.pdf': ok(b) });
    await app.load(0, pdf('u.pdf'));
    await app.load(1, pdf('b.pdf'));
    expect(root.querySelector('[data-slot="0"] .own .tag')?.textContent).toContain('undocumented combination (TYRP1)');
    expect(text()).toContain("Undocumented combination (TYRP1 in Parent 1's report): For the genes named");
  });

  it('gives an undocumented locus that feeds the pattern table one caveat that names it', async () => {
    const undocumented = syntheticReport({ 'ASIP a': 1 });
    const { app, root } = openPage({ 'u.pdf': ok(undocumented), 'b.pdf': ok(b) });
    await app.load(0, pdf('u.pdf'));
    await app.load(1, pdf('b.pdf'));
    const badge = document.getElementById(button(root, 'cav-pattern').getAttribute('aria-controls') ?? '');
    expect(badge?.textContent?.split('For the genes named')).toHaveLength(2);
    expect(badge?.textContent).toContain("Undocumented combination (ASIP in Parent 1's report): For the genes named");
    const items = [...root.querySelectorAll('.caveats li')].map((item) => item.textContent ?? '');
    expect(items).toContainEqual(expect.stringMatching(/^Undocumented combination \(ASIP in Parent 1's report\): For the genes named/));
    expect(items.filter((item) => item.includes('For the genes named'))).toHaveLength(1);
  });

  it('qualifies a hidden row that applies to one colour without claiming every such puppy has it', async () => {
    // Two dilute carriers: two thirds of the black puppies carry dilute, and no blue puppy does.
    const { root } = await openState({ state: 'results-warnings' });
    expect(tableRows(root, 'Hidden and carried')).toContainEqual(['Carries dilute (black puppies only)D/d', '50% (1 in 2)']);
  });

  it('qualifies a hidden row by the short colour word', async () => {
    // d/d B/b × itself: blue and lilac puppies; only blue ones can carry brown once.
    const dilute = syntheticReport({ 'MLPH d1': 2, 'TYRP1 bd': 1 });
    const { app, root } = openPage({ 's.pdf': ok(dilute), 't.pdf': ok({ ...dilute, name: 'Sample T' }) });
    await app.load(0, pdf('s.pdf'));
    await app.load(1, pdf('t.pdf'));
    expect(tableRows(root, 'Hidden and carried').map(([label]) => label)).toContain('Carries brown (blue puppies only)B/b');
    expect(tableRows(root, 'Base colour').map(([label]) => label)).toEqual(['Blue (dilute black)', 'Lilac (dilute brown)']);
  });

  it('names a combined outcome by the name its puppies share, not by its merged phenotype', async () => {
    // KB/ky a/aw × itself: Dominant Black and recessive black puppies are both "Black, solid".
    const solid = syntheticReport({ 'CBD103 KB': 1, 'ASIP a': 1, 'ASIP at': 1 });
    const { app, root } = openPage({ 's.pdf': ok(solid), 't.pdf': ok({ ...solid, name: 'Sample T' }) });
    await app.load(0, pdf('s.pdf'));
    await app.load(1, pdf('t.pdf'));
    const names = [...root.querySelectorAll('.out .n')].map((name) => name.textContent);
    expect(names).toContain('Black, solid');
    expect(names.some((name) => name?.includes('pattern unknown'))).toBe(false);
  });

  it('says the merle figure includes harlequin puppies', async () => {
    const merle = await variant('a', 'Sample W', { PMEL: { M: 1 } });
    const harlequin = await variant('b', 'Sample H', { PSMB7: { H: 1 } });
    const { app, root } = openPage({ 'w.pdf': ok(merle), 'h.pdf': ok(harlequin) });
    await app.load(0, pdf('w.pdf'));
    await app.load(1, pdf('h.pdf'));
    const traits = tableRows(root, 'Chance of each trait').map(([label]) => label);
    expect(traits.some((label) => label.includes('Merle (includes harlequin)'))).toBe(true);
    expect(traits.some((label) => label.startsWith('Harlequin') || label.includes(' Harlequin'))).toBe(true);
  });
});
