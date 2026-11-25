import { describe, expect, it } from 'vitest';
import { crossScenarios, type CrossParent } from '../../src/genetics/cross.ts';
import { resolveDog } from '../../src/genetics/dog.ts';
import type { Range } from '../../src/genetics/range.ts';
import { predictPuppies, scenarioTables, type PuppyPrediction } from '../../src/genetics/results.ts';
import { add, fraction, ZERO, type Fraction } from '../../src/health/fraction.ts';
import { parentLoci } from './genotypes.ts';
import { sampleReport, syntheticReport } from './reports.ts';

/** Heterozygous at every locus, with four candidates at ASIP and MC1R: 16 per parent, 256 scenarios for a pair. */
const HETEROZYGOUS = {
  ASIP: ['ay/at', 'ayt/aw', 'aw/at', 'at/a'],
  MC1R: ['Em/e', 'E/e', 'Em/eA', 'eH/e'],
  CBD103: 'KB/ky',
  HPS3: 'co/+',
  MFSD12: 'i/+',
  MLPH: 'D/d',
  TYRP1: 'B/b',
  PMEL: 'M/m',
  PSMB7: 'H/h',
  RALY: '+/dup',
  SLC45A2: 'cal/+',
  MITF: 'sp/+',
  USH2A: 'R/+',
};

function frac(text: string): Fraction {
  const [numerator, denominator = '1'] = text.split('/');
  return fraction(Number(numerator), Number(denominator));
}

function range(min: string, max: string = min): Range {
  return { min: frac(min), max: frac(max) };
}

const rows = <V>(table: { rows: readonly { value: V; chance: Range }[] }) => table.rows.map((row) => [row.value, row.chance]);

/** Every range the prediction shows. */
function allRanges(prediction: PuppyPrediction): Range[] {
  return [
    ...prediction.combined.outcomes.map((outcome) => outcome.chance),
    ...(prediction.combined.other === null ? [] : [prediction.combined.other]),
    ...[prediction.base, prediction.pattern, prediction.white].flatMap((table) => table.rows.map((row) => row.chance)),
    ...prediction.traits.possible.map((row) => row.chance),
    ...prediction.hidden.map((row) => row.chance),
    ...prediction.warnings.map((warning) => warning.chance),
  ];
}

const atMost = (left: Fraction, right: Fraction): boolean =>
  left.numerator * right.denominator <= right.numerator * left.denominator;

async function samples(first: string, second: string): Promise<PuppyPrediction> {
  return predictPuppies(resolveDog(await sampleReport(first)), resolveDog(await sampleReport(second)));
}

describe('predictPuppies: Sample A × Sample B', () => {
  it('gives 100% brown, one colour, with the brindle caveat on the pattern table', async () => {
    const prediction = await samples('a', 'b');
    expect(rows(prediction.base)).toEqual([['brown', range('1')]]);
    expect(rows(prediction.pattern)).toEqual([['one-colour', range('1')]]);
    expect(prediction.pattern.caveats).toContain('brindle-possible');
    expect(prediction.pattern.rows[0]?.flags).not.toContain('brindle-possible');
    expect(prediction.hasRanges).toBe(false);
    expect(prediction.scenarios).toBe(1);
  });

  it('gives half piebald to mostly white and half limited white, with copies pills and the deafness caveat', async () => {
    const prediction = await samples('a', 'b');
    expect(prediction.white.rows.map((row) => [row.value, row.chance, row.copies])).toEqual([
      ['extensive', range('1/2'), 2],
      ['limited', range('1/2'), 1],
    ]);
    expect(prediction.white.caveats).toContain('deafness');
    expect(prediction.warnings).toEqual([]);
  });

  it('lists beige, dilute and merle as not possible, and no trait as possible', async () => {
    const prediction = await samples('a', 'b');
    expect(prediction.traits.possible).toEqual([]);
    expect(prediction.traits.notPossible).toEqual(['merle', 'doubleMerle', 'dilute', 'beige', 'harlequin', 'roan']);
    expect(prediction.traits.cannotPredict).toEqual([]);
  });

  it('lists the beige carriers at 50% among the hidden and carried alleles', async () => {
    const prediction = await samples('a', 'b');
    expect(prediction.hidden.find((row) => row.id === 'carries-beige')).toEqual({
      id: 'carries-beige',
      hider: null,
      genotypes: ['Em/e', 'E/e'],
      chance: range('1/2'),
      onlyIn: null,
    });
    expect(prediction.hidden.find((row) => row.id === 'tan-points-hidden')).toMatchObject({
      hider: 'dominant-black',
      genotypes: ['at/at'],
      chance: range('1/2'),
    });
    expect(prediction.hidden.find((row) => row.id === 'mask-hidden')).toMatchObject({ chance: range('1/2') });
    expect(prediction.hidden.find((row) => row.id === 'light-cream-hidden')).toMatchObject({ genotypes: ['i/i'], chance: range('1/2') });
  });

  it('gives two combined outcomes at 50% each, and no other outcomes', async () => {
    const prediction = await samples('a', 'b');
    expect(prediction.combined.outcomes.map((outcome) => [outcome.phenotype.base, outcome.phenotype.white, outcome.chance])).toEqual([
      ['brown', 'extensive', range('1/2')],
      ['brown', 'limited', range('1/2')],
    ]);
    expect(prediction.combined.other).toBeNull();
  });
});

describe('predictPuppies: ranges', () => {
  const bdBc = syntheticReport({ 'TYRP1 bd': 1, 'TYRP1 bc': 1, 'CBD103 KB': 1, 'MITF sp': 2 });

  it('gives brown 50–100% and black 0–50% for an unanswered nose question, and single white figures', async () => {
    const prediction = predictPuppies(resolveDog(bdBc), resolveDog(await sampleReport('b')));
    expect(prediction.scenarios).toBe(2);
    expect(rows(prediction.base)).toEqual([
      ['brown', range('1/2', '1')],
      ['black', range('0', '1/2')],
    ]);
    expect(rows(prediction.white)).toEqual([
      ['extensive', range('1/2')],
      ['limited', range('1/2')],
    ]);
    expect(prediction.hasRanges).toBe(true);
    expect(prediction.hidden.find((row) => row.id === 'carries-brown')).toEqual({
      id: 'carries-brown',
      hider: null,
      genotypes: ['B/b'],
      chance: range('0', '1/2'),
      onlyIn: 'black',
    });
  });

  it('narrows to single values once the nose question is answered', async () => {
    const prediction = predictPuppies(resolveDog(bdBc, { nose: 'brown' }), resolveDog(await sampleReport('b')));
    expect(rows(prediction.base)).toEqual([['brown', range('1')]]);
    expect(prediction.hasRanges).toBe(false);
  });

  it('collapses 16 scenarios into one range per figure, each lower bound at most its upper bound', () => {
    const ambiguous = resolveDog(syntheticReport({ 'TYRP1 bd': 1, 'TYRP1 bc': 1, 'ASIP ay': 1, 'ASIP at': 1, 'MITF sp': 1 }));
    expect(ambiguous.ambiguousLoci).toEqual(['ASIP', 'TYRP1']);
    const prediction = predictPuppies(ambiguous, ambiguous);
    expect(prediction.scenarios).toBe(16);
    expect(prediction.hasRanges).toBe(true);
    const ranges = allRanges(prediction);
    expect(ranges.length).toBeGreaterThan(10);
    for (const { min, max } of ranges) {
      expect(atMost(min, max)).toBe(true);
    }
  });

  it('ranks combined outcomes by their upper bound, and sums the rest as other outcomes', () => {
    const ambiguous = resolveDog(syntheticReport({ 'TYRP1 bd': 1, 'TYRP1 bc': 1, 'ASIP ay': 1, 'ASIP at': 1, 'MITF sp': 1, 'MLPH d1': 1 }));
    const prediction = predictPuppies(ambiguous, ambiguous);
    const uppers = prediction.combined.outcomes.map((outcome) => outcome.chance.max);
    expect(uppers).toHaveLength(6);
    for (let index = 1; index < uppers.length; index++) {
      expect(atMost(uppers[index] ?? ZERO, uppers[index - 1] ?? ZERO)).toBe(true);
    }
    expect(prediction.combined.other).not.toBeNull();
  });
});

describe('predictPuppies: warnings and caveats', () => {
  it('shows the dilution caveat with range 0–25% when a d carrier exists in one scenario only', () => {
    const prediction = predictPuppies(
      { loci: parentLoci({ CBD103: 'KB/ky', MLPH: ['D/D', 'D/d'] }) },
      { loci: parentLoci({ CBD103: 'KB/ky', MLPH: 'D/d' }) },
    );
    const dilute = prediction.traits.possible.find((row) => row.value === 'dilute');
    expect(dilute).toMatchObject({ chance: range('0', '1/4'), copies: 2 });
    expect(dilute?.caveats).toEqual(['dilution-alopecia', 'linkage-d1']);
    expect(prediction.caveats).toContain('dilution-alopecia');
  });

  it('puts the dilution caveat on the dilute row when both parents carry d', () => {
    const prediction = predictPuppies(
      resolveDog(syntheticReport({ 'MLPH d1': 1, 'CBD103 KB': 2 })),
      resolveDog(syntheticReport({ 'MLPH d1': 1, 'CBD103 KB': 2 })),
    );
    expect(prediction.traits.possible.find((row) => row.value === 'dilute')).toMatchObject({
      chance: range('1/4'),
      caveats: ['dilution-alopecia', 'linkage-d1'],
    });
    expect(prediction.base.rows.map((row) => row.value)).toEqual(['black', 'blue']);
  });

  it('warns of double merle at 25% for M × M, with the merle caveat on the merle rows', () => {
    const merle = resolveDog(syntheticReport({ 'PMEL M': 1 }));
    const prediction = predictPuppies(merle, merle);
    expect(prediction.warnings).toEqual([{ kind: 'double-merle', chance: range('1/4') }]);
    const traits = prediction.traits.possible.map((row) => [row.value, row.chance, row.copies, row.caveats]);
    expect(traits).toEqual([
      ['merle', range('1/2'), 1, ['merle-allele-length']],
      ['doubleMerle', range('1/4'), 2, ['merle-allele-length']],
    ]);
    expect(prediction.white.caveats).toContain('white-piebald-only');
  });

  it('removes H/H for H × H, renormalises the rest, and says so in the panel', () => {
    const harlequin = resolveDog(syntheticReport({ 'PSMB7 H': 1, 'PMEL M': 1 }));
    const plain = resolveDog(syntheticReport({ 'PSMB7 H': 1 }));
    const prediction = predictPuppies(harlequin, plain);
    expect(prediction.warnings).toEqual([{ kind: 'harlequin-lethal', chance: range('1/4') }]);
    // M/m (1/2) × H/h among the live puppies (2/3).
    expect(prediction.traits.possible.find((row) => row.value === 'harlequin')?.chance).toEqual(range('1/3'));
    const total = prediction.combined.outcomes.reduce((sum, outcome) => add(sum, outcome.chance.min), ZERO);
    expect(total).toEqual(frac('1'));
    expect(prediction.combined.outcomes.every((outcome) => outcome.phenotype.lethal === 'no')).toBe(true);
  });

  it('puts the deafness caveat on the white table for sp/sp puppies, with no panel warning', () => {
    const piebald = resolveDog(syntheticReport({ 'MITF sp': 2 }));
    const prediction = predictPuppies(piebald, piebald);
    expect(rows(prediction.white)).toEqual([['extensive', range('1')]]);
    expect(prediction.white.caveats).toEqual(['deafness']);
    expect(prediction.warnings).toEqual([]);
  });

  it('has no white-table caveat for solid puppies', () => {
    const solid = resolveDog(syntheticReport({}));
    const prediction = predictPuppies(solid, solid);
    expect(prediction.white.caveats).toEqual([]);
    expect(prediction.white.rows.map((row) => [row.value, row.copies])).toEqual([['solid', 0]]);
  });

  it('flags the rows eA affects as not modelled precisely', () => {
    const prediction = predictPuppies(
      resolveDog(syntheticReport({ 'MC1R eA': 1, 'MC1R e1': 1, 'CBD103 KB': 2, 'ASIP at': 2 })),
      resolveDog(syntheticReport({ 'MC1R e1': 2, 'CBD103 KB': 2, 'ASIP at': 2 })),
    );
    expect(prediction.pattern.rows.map((row) => [row.value, row.chance, row.flags])).toEqual([
      ['tan-points', range('1/2'), ['not-modelled-eA']],
      ['not-visible', range('1/2'), []],
    ]);
    const tan = prediction.combined.outcomes.find((outcome) => outcome.phenotype.pattern === 'tan-points');
    expect(tan?.phenotype.flags).toContain('not-modelled-eA');
    expect(prediction.caveats).toContain('not-modelled-eA');
  });

  it('always lists the independence, untested-loci and linkage caveats', async () => {
    const prediction = await samples('a', 'b');
    expect(prediction.caveats).toEqual(
      expect.arrayContaining(['independent-loci', 'untested-loci', 'linkage-d1', 'linkage-roan', 'deafness', 'brindle-possible']),
    );
    expect(new Set(prediction.caveats).size).toBe(prediction.caveats.length);
  });
});

describe('predictPuppies: missing and inconsistent loci', () => {
  it('marks the base colour unknown when TYRP1 is missing from one report, and computes the rest', async () => {
    const missing = resolveDog(syntheticReport({ 'CBD103 KB': 1, 'MITF sp': 1 }, ['TYRP1']));
    const prediction = predictPuppies(resolveDog(await sampleReport('a')), missing);
    expect(rows(prediction.base)).toEqual([['unknown', range('1')]]);
    expect(prediction.base.unknown).toEqual([{ gene: 'TYRP1', parent: 1, reason: 'missing' }]);
    expect(prediction.white.unknown).toEqual([]);
    expect(rows(prediction.white)).toEqual([
      ['extensive', range('1/2')],
      ['limited', range('1/2')],
    ]);
    expect(prediction.unknownLoci).toEqual([{ gene: 'TYRP1', parent: 1, reason: 'missing' }]);
    expect(prediction.combined.outcomes.map((outcome) => outcome.phenotype.base)).toEqual(['unknown', 'unknown']);
  });

  it('moves the yes/no traits of a missing locus to the can’t-predict line', () => {
    const prediction = predictPuppies(
      resolveDog(syntheticReport({ 'PMEL M': 1 }, ['PMEL'])),
      resolveDog(syntheticReport({ 'PMEL M': 1 })),
    );
    expect(prediction.traits.cannotPredict).toEqual([
      { trait: 'merle', unknown: [{ gene: 'PMEL', parent: 0, reason: 'missing' }] },
      { trait: 'doubleMerle', unknown: [{ gene: 'PMEL', parent: 0, reason: 'missing' }] },
    ]);
    // Harlequin needs H, which neither parent has, so it stays predictable.
    expect(prediction.traits.notPossible).toEqual(['dilute', 'beige', 'harlequin', 'roan']);
    expect(prediction.warnings).toEqual([]);
  });

  it('treats a locus whose copies fit no genotype like a missing one, and says which', () => {
    const inconsistent = resolveDog(syntheticReport({ 'TYRP1 bc': 1, 'TYRP1 bs': 1, 'TYRP1 be': 1, 'CBD103 KB': 1 }));
    const prediction = predictPuppies(inconsistent, resolveDog(syntheticReport({ 'CBD103 KB': 1 })));
    expect(prediction.base.unknown).toEqual([{ gene: 'TYRP1', parent: 0, reason: 'inconsistent' }]);
    expect(prediction.base.rows.map((row) => row.value)).toContain('unknown');
  });
});

describe('scenarioTables', () => {
  const pairs: readonly (readonly [string, CrossParent, CrossParent])[] = [
    [
      'two ambiguous parents',
      { loci: parentLoci({ TYRP1: ['B/b', 'b/b'], ASIP: ['ay/at', 'ayt/aw'], MITF: 'sp/+', MLPH: 'D/d' }) },
      { loci: parentLoci({ TYRP1: 'B/b', MC1R: ['Em/e', 'E/e'], MITF: 'sp/sp', PMEL: 'M/m' }) },
    ],
    ['harlequin', { loci: parentLoci({ PSMB7: 'H/h', PMEL: 'M/m', USH2A: 'R/+' }) }, { loci: parentLoci({ PSMB7: 'H/h', MITF: 'sp/+' }) }],
    ['a missing locus', { loci: parentLoci({ MC1R: 'E/e' }, ['TYRP1']) }, { loci: parentLoci({ MC1R: 'e/e', TYRP1: 'B/b' }) }],
    ['heterozygous everywhere, 256 scenarios', { loci: parentLoci(HETEROZYGOUS) }, { loci: parentLoci(HETEROZYGOUS) }],
  ];

  it.each(pairs)('sums every distribution table to exactly 1 per scenario: %s', (_name, first, second) => {
    const scenarios = crossScenarios(first, second);
    // Scenarios with the same offspring distributions share their results; each is checked once.
    const distinct = scenarios.filter(
      (scenario, index) => scenarios.findIndex((other) => other.pigment === scenario.pigment && other.white === scenario.white) === index,
    );
    for (const scenario of distinct) {
      const tables = scenarioTables(scenario);
      for (const table of [tables.base, tables.pattern, tables.white, tables.combined]) {
        expect([...table.values()].reduce(add, ZERO)).toEqual(frac('1'));
      }
    }
  });
});

describe('predictPuppies: performance', () => {
  it('computes 256 scenarios of a pair heterozygous at every pigment locus in under 500 ms', () => {
    // Test files run in parallel, so one timing measures the machine's load as
    // much as the code. After a warm-up run, the fastest of three measures the cost.
    const parent = { loci: parentLoci(HETEROZYGOUS) };
    expect(predictPuppies(parent, parent).scenarios).toBe(256);
    const timings = [0, 1, 2].map(() => {
      const start = performance.now();
      predictPuppies(parent, parent);
      return performance.now() - start;
    });
    expect(Math.min(...timings)).toBeLessThan(500);
  });
});
