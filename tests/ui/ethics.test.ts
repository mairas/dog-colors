// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from 'vitest';
import type { Report } from '../../src/report/types.ts';
import { stateFromQuery } from '../../src/ui/dev.ts';
import { MemoryStorage } from '../saved/storage.ts';
import { ok, openPage, pdf, sampleReport } from './app.ts';

const HEADING = 'Colour is never a reason to choose a pairing';
const REMINDER =
  'Colour is never a reason to choose a pairing: health, temperament, fitness for purpose and genetic diversity are. Before you plan a litter';

const KEY = 'dog-colors:breeding-note-hidden-until';
const NOW = Date.UTC(2026, 10, 25, 12);
const DAY = 24 * 60 * 60 * 1000;

const panelOf = (root: HTMLElement) => root.querySelector<HTMLElement>('section.ethics');
const closeOf = (root: HTMLElement) => root.querySelector<HTMLButtonElement>('section.ethics button.close');

/** A storage that refuses every call, as disabled storage or Safari private mode can. */
const refusing = {
  getItem(): string | null {
    throw new Error('SecurityError');
  },
  setItem(): void {
    throw new Error('QuotaExceededError');
  },
  removeItem(): void {
    throw new Error('SecurityError');
  },
};

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

describe('dismissing the breeding note', () => {
  it('offers a close cross as the panel’s first control', () => {
    const { root } = openPage({});
    const close = closeOf(root);
    expect(panelOf(root)?.firstElementChild).toBe(close);
    expect(close?.getAttribute('type')).toBe('button');
    expect(close?.getAttribute('aria-label')).toBe('Hide this note for 30 days');
    expect(close?.title).toBe('Hide for 30 days');
  });

  it('hides the panel for 30 days and moves focus to Parent 1', () => {
    const storage = new MemoryStorage();
    const { root } = openPage({}, { storage, now: NOW });
    closeOf(root)?.click();
    expect(panelOf(root)?.hidden).toBe(true);
    expect(storage.items.get(KEY)).toBe(String(NOW + 30 * DAY));
    expect(document.activeElement).toBe(root.querySelector('#parent-0-name'));
  });

  it('stays hidden while the stored expiry is in the future', () => {
    const storage = new MemoryStorage({ [KEY]: String(NOW + DAY) });
    const { root } = openPage({}, { storage, now: NOW });
    expect(panelOf(root)?.hidden).toBe(true);
    expect(storage.items.get(KEY)).toBe(String(NOW + DAY));
  });

  it.each([
    ['an expired', String(NOW - 1)],
    ['an unreadable', 'soon'],
    ['a too distant', String(NOW + 31 * DAY)],
  ])('shows again and forgets %s expiry', (_name, value) => {
    const storage = new MemoryStorage({ [KEY]: value });
    const { root } = openPage({}, { storage, now: NOW });
    expect(panelOf(root)?.hidden).toBe(false);
    expect(storage.items.has(KEY)).toBe(false);
  });

  it('shows when storage fails, and the cross still hides it', () => {
    const { root } = openPage({}, { storage: refusing, now: NOW });
    expect(panelOf(root)?.hidden).toBe(false);
    closeOf(root)?.click();
    expect(panelOf(root)?.hidden).toBe(true);
    expect(document.activeElement).toBe(root.querySelector('#parent-0-name'));
  });

  it('comes back for the visit through the results link, keeping the dismissal', async () => {
    const storage = new MemoryStorage({ [KEY]: String(NOW + DAY) });
    const initial = await stateFromQuery(new URLSearchParams({ state: 'results-warnings' }));
    const { root } = openPage({}, { initial, storage, now: NOW });
    expect(panelOf(root)?.hidden).toBe(true);
    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    root.querySelector<HTMLElement>('#results .ethics-line a')?.dispatchEvent(click);
    // Browsers blur the focused element when following a link to a section that cannot take focus.
    expect(click.defaultPrevented).toBe(true);
    expect(panelOf(root)?.hidden).toBe(false);
    expect(document.activeElement).toBe(panelOf(root)?.querySelector('h2'));
    expect(storage.items.get(KEY)).toBe(String(NOW + DAY));
  });

  it('focuses the shown note through the results link, leaving storage alone', async () => {
    const storage = new MemoryStorage();
    const initial = await stateFromQuery(new URLSearchParams({ state: 'results-warnings' }));
    const { root } = openPage({}, { initial, storage, now: NOW });
    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    root.querySelector<HTMLElement>('#results .ethics-line a')?.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(true);
    expect(panelOf(root)?.hidden).toBe(false);
    expect(document.activeElement).toBe(root.querySelector('#ethics-h'));
    expect(storage.items.size).toBe(0);
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
