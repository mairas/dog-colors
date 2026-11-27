// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from 'vitest';
import { resolveDog } from '../../src/genetics/dog.ts';
import type { Phenotype } from '../../src/genetics/phenotype.ts';
import type { ColourGene } from '../../src/report/loci.ts';
import type { Report } from '../../src/report/types.ts';
import { renderCard, renderCardBody } from '../../src/ui/card.ts';
import { coatChip } from '../../src/ui/coat.ts';
import { syntheticReport } from '../genetics/synthetic.ts';
import { withNoseQuestion } from '../saved/storage.ts';
import { sampleReport, shapes } from './app.ts';

const ACTIONS = { answer: () => undefined, replace: () => undefined, remove: () => undefined };

interface Card {
  readonly ownColour: string;
  readonly rows: ReadonlyMap<string, string>;
  /** The own-colour picture's shapes, as "tag class". */
  readonly picture: readonly string[] | null;
}

function card(report: Report): Card {
  const element = renderCard({ slot: 0, report, dog: resolveDog(report), nose: undefined, replacing: false, alert: null }, ACTIONS);
  const rows = [...element.querySelectorAll('table.geno tbody tr')].map(
    (row): [string, string] => [row.querySelector('th')?.textContent ?? '', row.lastElementChild?.textContent ?? ''],
  );
  const picture = element.querySelector<SVGSVGElement>('.own svg.chip[aria-hidden="true"]');
  return {
    ownColour: element.querySelector('.own-name')?.textContent ?? '',
    rows: new Map(rows),
    picture: picture === null ? null : shapes(picture),
  };
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
    { CBD103: 'KB/ky: one colour (Dominant Black), not expressed with eA or eH', ASIP: 'at/at: tan points' },
  ],
  [
    'KB with eA/e',
    { 'CBD103 KB': 1, 'MC1R eA': 1, 'MC1R e1': 1, 'ASIP at': 2 },
    'Black and tan, solid',
    { CBD103: 'KB/ky: one colour (Dominant Black), not expressed with eA or eH' },
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

const NO_TYRP1 = { basd: 0, bc: 0, bd: 0, be: 0, bh: 0, bs: 0 };

function onlyPhenotype(report: Report): Phenotype {
  const [own, ...others] = resolveDog(report).ownColours;
  if (own === undefined || others.length > 0) {
    throw new Error('expected one own colour');
  }
  return own.phenotype;
}

describe('a card’s own-colour picture', () => {
  let white: Report;
  let solid: Report;
  beforeAll(async () => {
    [white, solid] = await Promise.all([sampleReport('a'), sampleReport('c')]);
  });

  it('draws a white ground with brown markings for a dog read as white with brown markings', () => {
    const { ownColour, picture } = card(white);
    expect(ownColour).toBe('White with brown markings');
    const [ground, ...markings] = picture ?? [];
    expect(ground).toBe('rect coat coat-white');
    expect(markings.length).toBeGreaterThan(0);
    expect(markings.every((shape) => shape.endsWith(' coat coat-brown'))).toBe(true);
    expect(picture).toEqual(shapes(coatChip(onlyPhenotype(white))));
  });

  it('draws a single base-colour rect for a solid dog', () => {
    const { ownColour, picture } = card(solid);
    expect(ownColour).toBe('Brown, solid');
    expect(picture).toEqual(['rect coat coat-brown']);
  });

  it('draws the merle picture for a merle dog', () => {
    const merle: Report = { ...solid, colour: { ...solid.colour, PMEL: { ...solid.colour.PMEL, M: 1 } } };
    expect(onlyPhenotype(merle).traits.merle).toBe('yes');
    const { picture } = card(merle);
    expect(picture?.[0]).toBe('rect coat coat-merle');
    expect(picture).toEqual(shapes(coatChip(onlyPhenotype(merle))));
  });

  it('draws the unknown swatch with the shared white pattern when the possible colours differ only in base', () => {
    const ambiguous: Report = { ...white, colour: { ...white.colour, TYRP1: { ...NO_TYRP1, bc: 1, bd: 1 } } };
    const colours = resolveDog(ambiguous).ownColours.map((colour) => colour.phenotype);
    expect(new Set(colours.map((colour) => colour.base)).size).toBeGreaterThan(1);
    expect(colours.map((colour) => colour.white)).toEqual(['extensive', 'extensive']);
    const [ground, ...markings] = card(ambiguous).picture ?? [];
    expect(ground).toBe('rect coat coat-white');
    expect(markings.length).toBeGreaterThan(0);
    expect(markings.every((shape) => shape.endsWith(' coat coat-unknown'))).toBe(true);
  });
});

describe('a card body under a list', () => {
  let report: Report;
  beforeAll(async () => {
    report = withNoseQuestion(await sampleReport('a'));
  });

  const body = (readd: ((slot: 0 | 1) => void) | null, nose: 'brown' | undefined = undefined): HTMLElement =>
    renderCardBody({ slot: 1, name: 'Nina', report, dog: resolveDog(report, nose === undefined ? {} : { nose }), nose }, () => undefined, readd);

  it('has no heading and no Replace or Remove buttons', () => {
    const element = body(null);
    expect(element.className).toBe('card-body');
    expect(element.querySelector('h2')).toBeNull();
    expect([...element.querySelectorAll('button')].map((button) => button.textContent)).toEqual([]);
    expect(element.querySelector('table.geno caption')?.textContent).toBe('Nina: colour genotype as read');
  });

  it('asks the nose question, checked with the saved answer', () => {
    const element = body(null, 'brown');
    expect(element.querySelector('fieldset.question legend')?.textContent).toBe('Nose and paw pads: black or brown?');
    expect(element.querySelector<HTMLInputElement>('[data-key="nose-1-brown"]')?.checked).toBe(true);
  });

  it('opens with the stale note when the dog was read by an older version', () => {
    const asked: number[] = [];
    const element = body((slot) => asked.push(slot));
    const note = element.firstElementChild;
    expect(note?.className).toBe('err info stale-note');
    element.querySelector<HTMLButtonElement>('[data-key="readd-1"]')?.click();
    expect(asked).toEqual([1]);
  });
});
