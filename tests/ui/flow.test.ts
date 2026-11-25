// @vitest-environment happy-dom
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { Report } from '../../src/report/types.ts';
import { button, fixtureText, ok, openPage, parsed, pdf, sampleReport, tableRows, variant, type Library } from './app.ts';

const ANSWER_NOTE = "Some figures are ranges because a parent's genotype is uncertain. Answer the questions on the cards to narrow them.";
const SETTLE_NOTE = "Some figures are ranges because the report can't settle a parent's genotype.";
const ADOBE =
  "This report was saved with the Windows 'Adobe PDF' printer, which scrambles the text so it can't be read. Download the report from Wisdom Panel instead. Or open the web report in Chrome or Edge, choose Print, and set the printer to 'Save as PDF'.";

let a: Report;
let b: Report;
let c: Report;
let nose: Report;
let asip: Report;
let library: Library;

beforeAll(async () => {
  [a, b, c] = await Promise.all([sampleReport('a'), sampleReport('b'), sampleReport('c')]);
  nose = await variant('a', 'Sample Q', { TYRP1: { basd: 0, bc: 1, bd: 1, be: 0, bh: 0, bs: 0 } });
  asip = await variant('b', 'Sample X', { ASIP: { ay: 1, a: 0, at: 1 } });
  library = {
    'a.pdf': ok(a),
    'b.pdf': ok(b),
    'c.pdf': ok(c),
    'nose.pdf': ok(nose),
    'asip.pdf': ok(asip),
    'other.pdf': { ok: false, kind: 'not-wisdom-dog' },
  };
});

async function pair(first: string, second: string) {
  const page = openPage(library);
  await page.app.load(0, pdf(first));
  await page.app.load(1, pdf(second));
  return page;
}

const results = (root: HTMLElement) => root.querySelector<HTMLElement>('#results');

describe('the colour page', () => {
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

  it('lists both candidate colours above the question', async () => {
    const { root } = await pair('nose.pdf', 'b.pdf');
    expect(root.querySelector('.own-name')?.textContent).toBe('Black, mostly white (B/b) or brown, mostly white (b/b)');
    expect(root.querySelector('legend')?.textContent).toBe('Nose and paw pads: black or brown?');
  });

  it('notes that the report can’t settle an ASIP-only ambiguity', async () => {
    const { root, text } = await pair('asip.pdf', 'b.pdf');
    expect(text()).toContain(SETTLE_NOTE);
    expect(text()).not.toContain(ANSWER_NOTE);
    expect(root.querySelector('fieldset')).toBeNull();
    expect(text()).toContain("The report can't tell which; results show both.");
    expect(tableRows(root, 'Colour pattern').some(([, figure]) => figure.includes('–'))).toBe(true);
  });

  it('hides the results when both slots hold the same report, offering Replace for Parent 2', async () => {
    const { root, text } = await pair('a.pdf', 'a.pdf');
    expect(results(root)?.hidden).toBe(true);
    expect(text()).toContain('Both slots hold the same report.');
    const input = root.querySelector<HTMLInputElement>('[data-testid="file-1"]');
    const click = vi.spyOn(input ?? new HTMLInputElement(), 'click');
    button(root, 'duplicate-replace').click();
    expect(click).toHaveBeenCalled();
  });

  it('does not treat two reports without a kit ID as the same report', async () => {
    const { root } = await pair('nose.pdf', 'asip.pdf');
    expect(results(root)?.hidden).toBe(false);
  });

  it('hides the results on Remove and moves focus to that slot’s picker', async () => {
    const { root, text } = await pair('a.pdf', 'b.pdf');
    button(root, 'remove-1').click();
    expect(results(root)?.hidden).toBe(true);
    expect(text()).toContain('Sample A');
    expect(document.activeElement?.getAttribute('data-key')).toBe('pick-1');
  });

  it('keeps the card with an inline alert when a replacement is rejected', async () => {
    const { app, root } = await pair('a.pdf', 'b.pdf');
    await app.load(0, pdf('other.pdf'));
    const card = root.querySelector('[data-slot="0"]');
    expect(card?.querySelector('h3')?.textContent).toContain('Sample A');
    expect(card?.firstElementChild?.textContent).toContain(
      "Replacement not loaded: this PDF isn't a Wisdom Panel dog report. Choose the genetics report you got from Wisdom Panel or MyDogDNA.",
    );
    expect(results(root)?.hidden).toBe(false);

    root.querySelector<HTMLElement>('[data-key="why-1"] summary')?.click();
    button(root, 'remove-1').click();
    expect(card?.isConnected).toBe(false);
    expect(root.querySelector('[data-slot="0"] .card-alert')).toBeNull();
  });

  it('shows Reading… on Replace while the replacement parses, then the new card', async () => {
    const { app, root, text } = await pair('a.pdf', 'b.pdf');
    const loading = app.load(1, pdf('c.pdf'));
    expect(button(root, 'replace-1').textContent).toBe('Reading…');
    expect(text()).toContain('Sample B');
    await loading;
    expect(root.querySelector('[data-slot="1"] h3')?.textContent).toContain('Sample C');
  });

  it('clears a replaced dog’s answers', async () => {
    const { app, root } = await pair('nose.pdf', 'b.pdf');
    root.querySelector<HTMLInputElement>('[data-key="nose-0-brown"]')?.click();
    await app.load(0, pdf('nose.pdf'));
    expect(root.querySelector<HTMLInputElement>('[data-key="nose-0-unsure"]')?.checked).toBe(true);
  });

  it('leaves a rejected slot empty with the message and focus on its retry picker', async () => {
    const { app, root, text } = openPage({ ...library, 'f.pdf': { ok: false, kind: 'adobe-pdf-printer' } });
    await app.load(1, pdf('f.pdf'));
    expect(text()).toContain(ADOBE);
    expect(button(root, 'pick-1').textContent).toBe('Choose another PDF');
    expect(document.activeElement?.getAttribute('data-key')).toBe('pick-1');
    expect(root.querySelector('[data-slot="0"] h3')?.textContent).toContain('No report yet');
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
    const { app, root } = openPage(library);
    await app.load(0, pdf('a.pdf'));
    const live = root.querySelectorAll('[aria-live]');
    expect(live).toHaveLength(1);
    expect(live[0]?.getAttribute('aria-live')).toBe('polite');
    expect(live[0]?.textContent).toBe('Parent 1: Sample A loaded.');
    await app.load(1, pdf('b.pdf'));
    expect(live[0]?.textContent).toBe('Parent 2: Sample B loaded. Results updated.');
  });

  it('opens the file picker from the picker button', () => {
    const { root } = openPage(library);
    const input = root.querySelector<HTMLInputElement>('[data-testid="file-0"]');
    const click = vi.spyOn(input ?? new HTMLInputElement(), 'click');
    button(root, 'pick-0').click();
    expect(click).toHaveBeenCalled();
    expect(button(root, 'pick-0').tagName).toBe('BUTTON');
  });

  it('flags a missing locus on the card and as unknown in the results', async () => {
    const { TYRP1: _absent, ...colour } = b.colour;
    const missing: Report = { ...b, name: 'Sample M', kitIdHash: null, colour, missingLoci: ['TYRP1'] };
    const { app, root, text } = openPage({ ...library, 'm.pdf': ok(missing) });
    await app.load(0, pdf('a.pdf'));
    await app.load(1, pdf('m.pdf'));
    expect(root.querySelector('[data-slot="1"] summary.sec')?.textContent).toContain('1 locus missing');
    expect(text()).toContain('not in report');
    expect(tableRows(root, 'Base colour')).toEqual([["Unknown: TYRP1 (chocolate) missing from Parent 2's report", '100% (all)']]);
    expect(text()).toContain("TYRP1 (chocolate) missing from Parent 2's report, so the figures that depend on it show as unknown.");
  });

  it('collapses the genotype tables on a narrow viewport once results exist', async () => {
    const page = openPage(library, { narrow: true });
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

describe('the drop rules', () => {
  const drop = async (files: string[], target: 0 | 1 | null, filled: string[] = []) => {
    const page = openPage(library);
    for (const [slot, name] of filled.entries()) {
      await page.app.load(slot === 0 ? 0 : 1, pdf(name));
    }
    await page.app.drop(files.map(pdf), target);
    const names = [0, 1].map((slot) => page.root.querySelector(`[data-slot="${slot}"] h3`)?.textContent ?? '');
    const alert = page.root.querySelector('.drop-alert')?.textContent ?? '';
    return { names, alert };
  };

  it('prevents the browser from opening a dropped file', () => {
    openPage(library);
    const event = new Event('drop', { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it('rejects more than two files, whatever the slots hold', async () => {
    expect(await drop(['a.pdf', 'b.pdf', 'c.pdf'], null)).toEqual({
      names: ['Parent 1No report yet', 'Parent 2No report yet'],
      alert: '⚠Drop at most two reports.',
    });
    expect((await drop(['a.pdf', 'b.pdf', 'c.pdf'], 0, ['a.pdf'])).names[0]).toBe('Parent 1Sample A');
  });

  it('treats one file on a filled slot as Replace', async () => {
    expect((await drop(['c.pdf'], 1, ['a.pdf', 'b.pdf'])).names).toEqual(['Parent 1Sample A', 'Parent 2Sample C']);
  });

  it('loads one file into the slot it was dropped on, or the first free slot', async () => {
    expect((await drop(['c.pdf'], 1)).names).toEqual(['Parent 1No report yet', 'Parent 2Sample C']);
    expect((await drop(['c.pdf'], null, ['a.pdf'])).names).toEqual(['Parent 1Sample A', 'Parent 2Sample C']);
  });

  it('fills both empty slots in order from two files dropped anywhere', async () => {
    expect((await drop(['b.pdf', 'a.pdf'], null)).names).toEqual(['Parent 1Sample B', 'Parent 2Sample A']);
    expect((await drop(['b.pdf', 'a.pdf'], 1)).names).toEqual(['Parent 1Sample B', 'Parent 2Sample A']);
  });

  it('fills the one free slot from two files and rejects the second', async () => {
    expect(await drop(['b.pdf', 'c.pdf'], null, ['a.pdf'])).toEqual({
      names: ['Parent 1Sample A', 'Parent 2Sample B'],
      alert: "⚠Only one slot was free, so the second report wasn't loaded.",
    });
  });

  it('rejects a drop outside the slots when both are full', async () => {
    expect(await drop(['c.pdf'], null, ['a.pdf', 'b.pdf'])).toEqual({
      names: ['Parent 1Sample A', 'Parent 2Sample B'],
      alert: '⚠Both slots are full. Use Replace on a card.',
    });
    expect((await drop(['c.pdf', 'a.pdf'], 0, ['a.pdf', 'b.pdf'])).alert).toBe('⚠Both slots are full. Use Replace on a card.');
  });

  it('clears the drop message at the next action', async () => {
    const page = openPage(library);
    await page.app.drop(['a.pdf', 'b.pdf', 'c.pdf'].map(pdf), null);
    await page.app.load(0, pdf('a.pdf'));
    expect(page.root.querySelector('.drop-alert')?.textContent).toBe('');
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

  it('never puts the microchip, registration, kit ID or owner name into the page', async () => {
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
    const { app } = openPage({ 'd.pdf': report, 'b.pdf': library['b.pdf'] ?? report });
    await app.load(0, pdf('d.pdf'));
    await app.load(1, pdf('b.pdf'));
    const html = document.documentElement.outerHTML;
    expect(html).toContain('Sample D');
    for (const value of Object.values(FABRICATED)) {
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
