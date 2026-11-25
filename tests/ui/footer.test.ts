// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

let footer: HTMLElement;

beforeAll(() => {
  const html = readFileSync(join(import.meta.dirname, '..', '..', 'index.html'), 'utf8');
  const page = new DOMParser().parseFromString(html, 'text/html');
  const found = page.querySelector('footer');
  if (found === null) {
    throw new Error('index.html has no footer');
  }
  footer = found;
});

describe('the footer', () => {
  it('lists the sources in a collapsed section, each linked over https', () => {
    const sources = footer.querySelector('details.sources');
    expect(sources?.hasAttribute('open')).toBe(false);
    expect(sources?.querySelector('summary')?.textContent).toBe('Sources');
    const links = [...(sources?.querySelectorAll('a') ?? [])];
    expect(links.map((link) => link.textContent)).toEqual([
      'Dreger et al. 2019',
      'Anderson et al. 2020',
      'Honkanen et al. 2024',
      'Dreger and Schmutz 2010',
      'Dreger and Schmutz 2011',
      'Bannasch et al. 2021',
      'Dreger et al. 2020',
      'Dreger et al. 2013',
      'Hédan et al. 2019',
      'Kiener et al. 2020',
      'Clark et al. 2006',
      'Murphy et al. 2018',
      'Clark et al. 2011',
      'Brancalion et al. 2021',
      'brown (TYRP1)',
      'white spotting',
      'merle',
      'mask',
      'albinism',
      'cocoa (HPS3)',
      'UC Davis Veterinary Genetics Laboratory',
      'Orivet',
    ]);
    for (const link of links) {
      expect(link.getAttribute('href'), link.textContent ?? '').toMatch(/^https:\/\//);
    }
  });

  it('links every source the genetics oracle cites', () => {
    const oracle = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'genetics', 'oracle.json'), 'utf8')) as {
      citation: { source: string; url: string };
    }[];
    const hrefs = new Set([...footer.querySelectorAll('details.sources a')].map((link) => link.getAttribute('href')));
    for (const { citation } of oracle) {
      expect(hrefs.has(citation.url), citation.source).toBe(true);
    }
  });

  it('names the author with a mail link and the source code', () => {
    const author = footer.querySelector('.author');
    expect(author?.textContent?.replace(/\s+/g, ' ').trim()).toBe('Made by Matti Airas · mairas@iki.fi · Source code on GitHub');
    expect(author?.querySelector('a[href="mailto:mairas@iki.fi"]')).not.toBeNull();
    expect(author?.querySelector('a[href="https://github.com/mairas/dog-colors"]')).not.toBeNull();
  });
});
