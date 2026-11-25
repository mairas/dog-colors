// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { openPage } from './app.ts';

const HEADING = 'Colour is never a reason to choose a pairing';

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
