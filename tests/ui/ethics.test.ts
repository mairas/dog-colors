// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from 'vitest';
import type { Report } from '../../src/report/types.ts';
import { stateFromQuery } from '../../src/ui/dev.ts';
import { ok, openPage, pdf, sampleReport } from './app.ts';

const HEADING = 'Colour is never a reason to choose a pairing';
const REMINDER =
  'Colour is never a reason to choose a pairing: health, temperament, fitness for purpose and genetic diversity are. Before you plan a litter';

let a: Report;
let b: Report;

beforeAll(async () => {
  [a, b] = await Promise.all([sampleReport('a'), sampleReport('b')]);
});

describe('the breeding note', () => {
  it('opens the empty page, before the privacy note', () => {
    const { root } = openPage({});
    const panel = root.querySelector<HTMLElement>('section.ethics');
    expect(panel?.parentElement).toBe(root);
    expect(root.firstElementChild).toBe(panel);
    expect(panel?.nextElementSibling?.classList.contains('privacy')).toBe(true);
  });

  it('is labelled by its heading and holds the three paragraphs', () => {
    const { root } = openPage({});
    const panel = root.querySelector<HTMLElement>('section.ethics');
    const heading = panel?.querySelector('h2');
    expect(heading?.textContent).toBe(HEADING);
    expect(panel?.getAttribute('aria-labelledby')).toBe(heading?.id);
    const paragraphs = [...(panel?.querySelectorAll('p') ?? [])];
    expect(paragraphs.map((paragraph) => paragraph.querySelector('b')?.textContent ?? null)).toEqual([
      null,
      'A clear DNA result is not a health check.',
      'This page cannot tell how closely related the two dogs are.',
    ]);
    expect(paragraphs[0]?.textContent).toContain('not so you can select for them.');
    expect(paragraphs[1]?.textContent).toContain('It says nothing about hips, elbows, eyes');
    expect(paragraphs[2]?.textContent).toContain('through your kennel club or a pedigree database.');
  });
});

describe('the results reminder', () => {
  const line = (root: HTMLElement) => root.querySelector<HTMLElement>('#results .ethics-line');

  it('follows the odds line once two reports load, and links to the note', async () => {
    const { app, root } = openPage({ 'a.pdf': ok(a), 'b.pdf': ok(b) });
    await app.load(0, pdf('a.pdf'));
    await app.load(1, pdf('b.pdf'));
    const reminder = line(root);
    expect(reminder?.textContent).toBe(REMINDER);
    expect(reminder?.previousElementSibling?.textContent).toBe('Odds for each puppy, not the make-up of a litter.');
    const href = reminder?.querySelector('a')?.getAttribute('href') ?? '';
    expect(href).toBe('#ethics');
    expect(root.querySelector(href)?.classList.contains('ethics')).toBe(true);
  });

  it('keeps focus on its link when the results re-render', async () => {
    const { app, root } = openPage({ 'a.pdf': ok(a), 'b.pdf': ok(b) });
    await app.load(0, pdf('a.pdf'));
    await app.load(1, pdf('b.pdf'));
    const before = line(root)?.querySelector('a');
    before?.focus();
    await app.load(1, pdf('b.pdf'));
    const after = line(root)?.querySelector('a');
    expect(after).not.toBe(before);
    expect(document.activeElement).toBe(after);
  });

  it('precedes the warnings', async () => {
    const { root } = openPage({}, { initial: await stateFromQuery(new URLSearchParams({ state: 'results-warnings' })) });
    expect(line(root)?.nextElementSibling?.classList.contains('warnings')).toBe(true);
  });

  it.each([
    ['populated', { state: 'results-populated' }],
    ['ranges', { state: 'results-ranges' }],
    ['partial', { state: 'results-partial' }],
    ['same-sex', { fixtures: 'a,c' }],
  ])('shows in the %s results', async (name, query) => {
    const { root } = openPage({}, { initial: await stateFromQuery(new URLSearchParams(query)) });
    expect(line(root)?.textContent).toBe(REMINDER);
    expect(root.querySelector('#results .same-sex') !== null).toBe(name === 'same-sex');
  });
});
