// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from 'vitest';
import { resolveDog } from '../../src/genetics/dog.ts';
import type { Phenotype } from '../../src/genetics/phenotype.ts';
import type { ColourGene } from '../../src/report/loci.ts';
import type { Report } from '../../src/report/types.ts';
import { renderCard } from '../../src/ui/card.ts';
import { syntheticReport } from '../genetics/synthetic.ts';
import { sampleReport } from './app.ts';

const ACTIONS = { answer: () => undefined, replace: () => undefined, remove: () => undefined };

interface Card {
  readonly ownColour: string;
  readonly rows: ReadonlyMap<string, string>;
}

function card(report: Report): Card {
  const element = renderCard({ slot: 0, report, dog: resolveDog(report), nose: undefined, replacing: false, alert: null }, ACTIONS);
  const rows = [...element.querySelectorAll('table.geno tbody tr')].map(
    (row): [string, string] => [row.querySelector('th')?.textContent ?? '', row.lastElementChild?.textContent ?? ''],
  );
  return { ownColour: element.querySelector('.own-name')?.textContent ?? '', rows: new Map(rows) };
}

/**
 * Whether the dog's own coat shows the effect a row names, read from its
 * phenotype, or null when the row names no effect this check covers.
 */
const SHOWS: Partial<Record<ColourGene, (effect: string, coat: Phenotype) => boolean | null>> = {
  ASIP: (_effect, coat) => ['sable', 'wolf-sable', 'tan-points', 'recessive-solid'].includes(coat.pattern),
  CBD103: (effect, coat) => (effect.startsWith('one colour') ? coat.pattern === 'one-colour' : null),
  MC1R: (effect, coat) => (effect.startsWith('mask') ? coat.flags.includes('mask') : null),
  MFSD12: (effect, coat) =>
    effect.startsWith('light cream') ? coat.base === 'beige-light' || coat.flags.includes('pheomelanin-light') : null,
  PMEL: (effect, coat) => (effect.startsWith('merle') ? coat.traits.merle === 'yes' : null),
  USH2A: (effect, coat) => (effect.startsWith('roan') ? coat.traits.roan === 'yes' : null),
};

const MARKED = /\b(hidden|not expressed)\b/;

/** Rows whose "hidden" marking disagrees with the dog's own coat. */
function contradictions(report: Report): string[] {
  const [own, ...others] = resolveDog(report).ownColours;
  if (own === undefined || others.length > 0) {
    throw new Error('expected one own colour');
  }
  return [...card(report).rows].flatMap(([gene, text]) => {
    const effect = /^[^ ]+\/[^ ]+: (.*)$/.exec(text)?.[1];
    const shows = effect === undefined ? null : (SHOWS[gene as ColourGene]?.(effect, own.phenotype) ?? null);
    return shows === null || shows !== MARKED.test(effect ?? '') ? [] : [`${gene} ${text} on ${own.name}`];
  });
}

type Case = readonly [string, Readonly<Record<string, number>>, string, Readonly<Record<string, string>>];

const CASES: readonly Case[] = [
  [
    'KB on a beige dog',
    { 'CBD103 KB': 2, 'MC1R e1': 2, 'ASIP at': 2 },
    'Beige, solid',
    { CBD103: 'KB/KB: one colour (Dominant Black), hidden by beige', ASIP: 'at/at: tan points, hidden by beige' },
  ],
  ['Em on a recessive black dog', { 'MC1R Em': 1, 'ASIP a': 2, 'ASIP at': 2 }, 'Black, solid', { MC1R: 'Em/E: mask, hidden on solid coats' }],
  [
    'KB with eA/eA',
    { 'CBD103 KB': 1, 'MC1R eA': 2, 'ASIP at': 2 },
    'Black and tan, solid',
    { CBD103: 'KB/ky: one colour (Dominant Black), not expressed with eA', ASIP: 'at/at: tan points' },
  ],
  [
    'KB with eA/e',
    { 'CBD103 KB': 1, 'MC1R eA': 1, 'MC1R e1': 1, 'ASIP at': 2 },
    'Black and tan, solid',
    { CBD103: 'KB/ky: one colour (Dominant Black), not expressed with eA' },
  ],
  [
    'merle and roan on a light beige dog',
    { 'PMEL M': 1, 'MC1R e1': 2, 'ASIP at': 2, 'USH2A TRr': 1, 'MFSD12 i': 2 },
    'Beige, light cream likely, solid',
    {
      PMEL: 'M/m: merle, hidden by beige',
      USH2A: 'R/+: roan (within white areas), hidden without white spotting',
      MFSD12: 'i/i: light cream if beige, lighter tan',
    },
  ],
];

describe('a card’s "Reads as" rows', () => {
  it.each(CASES)('agree with the own colour: %s', (_label, copies, ownColour, rows) => {
    const report = syntheticReport(copies);
    const shown = card(report);
    expect(shown.ownColour).toBe(ownColour);
    for (const [gene, text] of Object.entries(rows)) {
      expect(shown.rows.get(gene)).toBe(text);
    }
    expect(contradictions(report)).toEqual([]);
  });

  describe('on the sample reports', () => {
    const samples = new Map<string, Report>();
    beforeAll(async () => {
      for (const letter of ['a', 'b', 'c', 'd', 'e']) {
        samples.set(letter, await sampleReport(letter));
      }
    });

    it.each(['a', 'b', 'c', 'd', 'e'])('agree with the own colour: sample %s', (letter) => {
      const report = samples.get(letter);
      if (report === undefined) {
        throw new Error(`no sample ${letter}`);
      }
      expect(contradictions(report)).toEqual([]);
    });

    it('mark what Dominant Black hides on sample A', () => {
      const report = samples.get('a');
      if (report === undefined) {
        throw new Error('no sample a');
      }
      const { rows } = card(report);
      expect(rows.get('ASIP')).toBe('aw/at: wolf sable, hidden by Dominant Black');
      expect(rows.get('CBD103')).toBe('KB/KB: one colour (Dominant Black)');
      expect(rows.get('MFSD12')).toBe('i/i: light cream if beige, lighter tan, hidden');
    });
  });
});
