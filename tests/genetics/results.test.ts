import { describe, expect, it } from 'vitest';
import { crossScenarios, type CrossParent } from '../../src/genetics/cross.ts';
import { resolveDog } from '../../src/genetics/dog.ts';
import type { Range } from '../../src/genetics/range.ts';
import { predictPuppies, scenarioTables, type PuppyPrediction } from '../../src/genetics/results.ts';
import { CAVEAT_TEXT, COLOUR_WARNING_TEXT } from '../../src/genetics/warnings.ts';
import { add, fraction, ZERO, type Fraction } from '../../src/health/fraction.ts';
import { COLOUR_GENES, type ColourGene } from '../../src/report/loci.ts';
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

/** One candidate per locus, heterozygous wherever a locus has a variant. */
const HETEROZYGOUS_SINGLE = Object.fromEntries(
  Object.entries(HETEROZYGOUS).map(([gene, pairs]) => [gene, typeof pairs === 'string' ? pairs : (pairs[0] ?? '')]),
);

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
    ...prediction.warnings.flatMap((warning) => ('chance' in warning ? [warning.chance] : [])),
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

describe('predictPuppies: combined outcomes', () => {
  it('gives the share of the outcomes not listed as other', () => {
    const parent = { loci: parentLoci({ TYRP1: 'B/b', MLPH: 'D/d', MITF: 'sp/+', CBD103: 'KB/KB' }) };
    const prediction = predictPuppies(parent, parent);
    // Four colours × three white classes; the six listed hold 18 + 9 + 9 + 6 + 6 + 3 of 64.
    expect(prediction.combined.outcomes).toHaveLength(6);
    expect(prediction.combined.other).toEqual(range('13/64'));
  });

  it('lists each own-colour name once, merging the coats that share it', async () => {
    const prediction = await samples('b', 'c');
    const names = prediction.combined.outcomes.map((outcome) => outcome.name);
    expect(names.length).toBeGreaterThan(1);
    expect(new Set(names).size).toBe(names.length);
  });

  it("names a merged outcome by its group's name, not its merged phenotype", () => {
    const prediction = predictPuppies({ loci: parentLoci({ CBD103: 'KB/ky', ASIP: 'a/a' }) }, { loci: parentLoci({ CBD103: 'ky/ky', ASIP: 'a/a' }) });
    expect(prediction.combined.outcomes).toHaveLength(1);
    expect(prediction.combined.outcomes[0]).toMatchObject({ name: 'Black, solid', chance: range('1'), phenotype: { pattern: 'unknown' } });
  });

  it('keeps beige puppies with a brown nose apart from those with a black one', () => {
    const parent = { loci: parentLoci({ MC1R: 'e/e', TYRP1: 'B/b' }) };
    const outcomes = predictPuppies(parent, parent).combined.outcomes;
    expect(outcomes.map(({ name, chance }) => [name, chance])).toEqual([
      ['Beige, solid', range('3/4')],
      ['Beige, brown nose, solid', range('1/4')],
    ]);
  });
});

describe('predictPuppies: hidden and carried rows', () => {
  const hiddenRow = (prediction: PuppyPrediction, id: string, hider: string | null = null) =>
    prediction.hidden.find((row) => row.id === id && row.hider === hider);

  it('hides merle and harlequin on beige and on albino puppies', () => {
    const prediction = predictPuppies(
      { loci: parentLoci({ PMEL: 'M/m', PSMB7: 'H/h', MC1R: 'E/e', SLC45A2: 'cal/+' }) },
      { loci: parentLoci({ MC1R: 'E/e', SLC45A2: 'cal/+' }) },
    );
    // M/m 1/2, H/h 1/2, albino 1/4, beige 3/4 × 1/4.
    expect(hiddenRow(prediction, 'merle-hidden', 'albino')).toMatchObject({ genotypes: ['M/m'], chance: range('1/8') });
    expect(hiddenRow(prediction, 'merle-hidden', 'beige')).toMatchObject({ genotypes: ['M/m'], chance: range('3/32') });
    expect(hiddenRow(prediction, 'harlequin-hidden', 'albino')).toMatchObject({ genotypes: ['H/h'], chance: range('1/16') });
    expect(hiddenRow(prediction, 'harlequin-hidden', 'beige')).toMatchObject({ genotypes: ['H/h'], chance: range('3/64') });
  });

  it('does not count harlequin as hidden on a beige puppy without merle', () => {
    const prediction = predictPuppies({ loci: parentLoci({ PSMB7: 'H/h', MC1R: 'e/e' }) }, { loci: parentLoci({ MC1R: 'e/e' }) });
    expect(hiddenRow(prediction, 'harlequin-hidden', 'beige')).toBeUndefined();
  });

  it('hides Dominant Black on beige and on albino puppies', () => {
    const prediction = predictPuppies(
      { loci: parentLoci({ CBD103: 'KB/ky', MC1R: 'E/e', SLC45A2: 'cal/+' }) },
      { loci: parentLoci({ MC1R: 'E/e', SLC45A2: 'cal/+' }) },
    );
    expect(hiddenRow(prediction, 'dominant-black-hidden', 'albino')).toMatchObject({ genotypes: ['KB/ky'], chance: range('1/8') });
    expect(hiddenRow(prediction, 'dominant-black-hidden', 'beige')).toMatchObject({ genotypes: ['KB/ky'], chance: range('3/32') });
  });

  it('hides sable, wolf sable and recessive black under Dominant Black', () => {
    const prediction = predictPuppies({ loci: parentLoci({ ASIP: 'ay/a', CBD103: 'KB/KB' }) }, { loci: parentLoci({ ASIP: 'aw/a' }) });
    expect(hiddenRow(prediction, 'sable-hidden', 'dominant-black')).toMatchObject({ genotypes: ['ay/aw', 'ay/a'], chance: range('1/2') });
    expect(hiddenRow(prediction, 'wolf-sable-hidden', 'dominant-black')).toMatchObject({ genotypes: ['aw/a'], chance: range('1/4') });
    expect(hiddenRow(prediction, 'recessive-black-hidden', 'dominant-black')).toMatchObject({ genotypes: ['a/a'], chance: range('1/4') });
    expect(hiddenRow(prediction, 'carries-recessive-black')).toMatchObject({ genotypes: ['ay/a', 'aw/a'], chance: range('1/2') });
  });

  it('hides roan on puppies without white spotting', () => {
    const prediction = predictPuppies({ loci: parentLoci({ USH2A: 'R/+', MITF: 'sp/+' }) }, { loci: parentLoci({ MITF: 'sp/+' }) });
    // R/+ 1/2, solid (+/+) 1/4.
    expect(hiddenRow(prediction, 'roan-hidden')).toMatchObject({ genotypes: ['R/+'], chance: range('1/8') });
  });
});

describe('predictPuppies: trait flags', () => {
  it('tags the merle row hard to see when merle puppies can be sable', () => {
    const prediction = predictPuppies({ loci: parentLoci({ PMEL: 'M/m', ASIP: 'ay/ay' }) }, { loci: parentLoci({ ASIP: 'ay/ay' }) });
    expect(prediction.traits.possible.find((row) => row.value === 'merle')).toMatchObject({
      chance: range('1/2'),
      flags: ['merle-hard-to-see'],
    });
  });

  it('tags the roan row uncertain when roan puppies can have one copy', () => {
    const prediction = predictPuppies({ loci: parentLoci({ USH2A: 'R/+', MITF: 'sp/sp' }) }, { loci: parentLoci({ MITF: 'sp/sp' }) });
    expect(prediction.traits.possible.find((row) => row.value === 'roan')).toMatchObject({
      chance: range('1/2'),
      flags: ['roan-single-copy'],
    });
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

  it('counts no live puppies when every conception is H/H, only the warning', () => {
    const harlequin = { loci: parentLoci({ PSMB7: 'H/H', PMEL: 'M/m', MITF: 'sp/+' }) };
    const prediction = predictPuppies(harlequin, harlequin);
    expect(prediction.warnings).toEqual([{ kind: 'harlequin-lethal', chance: range('1') }]);
    expect([prediction.base, prediction.pattern, prediction.white].map((table) => table.rows)).toEqual([[], [], []]);
    expect(prediction.combined).toEqual({ outcomes: [], other: null });
    expect(prediction.traits.possible).toEqual([]);
    expect(prediction.hidden).toEqual([]);
  });

  it('leaves a scenario in which every conception dies out of the live-puppy figures', () => {
    const prediction = predictPuppies(
      { loci: parentLoci({ PSMB7: ['H/H', 'H/h'], PMEL: 'M/m', MC1R: 'e/e' }) },
      { loci: parentLoci({ PSMB7: 'H/H', MC1R: 'e/e' }) },
    );
    expect(prediction.warnings).toEqual([{ kind: 'harlequin-lethal', chance: range('1/2', '1') }]);
    // Only H/h × H/H has live puppies: all H/h, half of them M/m, all beige.
    expect(prediction.hidden.find((row) => row.id === 'harlequin-hidden')).toMatchObject({ hider: 'beige', chance: range('1/2') });
    expect(rows(prediction.base)).toEqual([['beige', range('1')]]);
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

  it("carries a parent's undocumented combination to the tables that read the gene, naming it", () => {
    const undocumented = resolveDog(syntheticReport({ 'TYRP1 bc': 2, 'TYRP1 bs': 1 }));
    expect(undocumented.undocumentedLoci).toEqual(['TYRP1']);
    const prediction = predictPuppies(resolveDog(syntheticReport({})), undocumented);
    expect(prediction.undocumentedLoci).toEqual([{ gene: 'TYRP1', parent: 1 }]);
    expect(prediction.base).toMatchObject({ caveats: ['undocumented-haplotype'], undocumented: [{ gene: 'TYRP1', parent: 1 }] });
    expect(prediction.pattern).toMatchObject({ caveats: [], undocumented: [] });
    expect(prediction.caveats).toContain('undocumented-haplotype');
  });

  it('has no undocumented-combination caveat when every locus is documented', async () => {
    const prediction = await samples('a', 'b');
    expect(prediction.undocumentedLoci).toEqual([]);
    expect(prediction.caveats).not.toContain('undocumented-haplotype');
  });

  it('puts the albino health caveat on the base table when puppies can be albino', () => {
    const prediction = predictPuppies({ loci: parentLoci({ SLC45A2: 'cal/+' }) }, { loci: parentLoci({ SLC45A2: 'cal/+' }) });
    expect(prediction.base.caveats).toEqual(['albino-health']);
    expect(prediction.caveats).toContain('albino-health');
    expect(CAVEAT_TEXT['albino-health']).toMatch(/light.*vision.*skin tumours.*OMIA 001821/);
  });

  it('has no albino caveat when no puppy can be albino', () => {
    const prediction = predictPuppies({ loci: parentLoci({ SLC45A2: 'cal/+' }) }, { loci: parentLoci({}) });
    expect(prediction.base.caveats).toEqual([]);
    expect(prediction.caveats).not.toContain('albino-health');
  });

  it('words deafness without naming a breed, and H/H as not seen alive', () => {
    expect(CAVEAT_TEXT.deafness).not.toMatch(/Spanish Water Dog/);
    expect(COLOUR_WARNING_TEXT['harlequin-lethal'].text).toMatch(/not seen alive; they are thought to die early in pregnancy/);
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
  });

  it("warns that double merle can't be ruled out when one parent's PMEL is missing and the other carries merle", () => {
    const prediction = predictPuppies({ loci: parentLoci({}, ['PMEL']) }, { loci: parentLoci({ PMEL: 'M/m' }) });
    expect(prediction.warnings).toEqual([{ kind: 'double-merle-unknown', unknown: [{ gene: 'PMEL', parent: 0, reason: 'missing' }] }]);
  });

  it("warns that H/H can't be ruled out when one parent's PSMB7 is missing and the other carries harlequin", () => {
    const prediction = predictPuppies({ loci: parentLoci({ PSMB7: 'H/h', PMEL: 'M/m' }) }, { loci: parentLoci({}, ['PSMB7']) });
    expect(prediction.warnings).toEqual([
      { kind: 'harlequin-lethal-unknown', unknown: [{ gene: 'PSMB7', parent: 1, reason: 'missing' }] },
    ]);
  });

  it("warns that double merle can't be ruled out when neither parent's PMEL is known", () => {
    const inconsistent = { ...parentLoci({}), PMEL: { status: 'inconsistent', reason: 'invalid-count' } } as const;
    const prediction = predictPuppies({ loci: parentLoci({}, ['PMEL']) }, { loci: inconsistent });
    expect(prediction.warnings).toEqual([
      {
        kind: 'double-merle-unknown',
        unknown: [
          { gene: 'PMEL', parent: 0, reason: 'missing' },
          { gene: 'PMEL', parent: 1, reason: 'inconsistent' },
        ],
      },
    ]);
  });

  it.each<[string, Parameters<typeof parentLoci>[0], Parameters<typeof parentLoci>[0], readonly ColourGene[]]>([
    ['one parent carries merle', { PMEL: 'M/m' }, {}, ['PSMB7']],
    ["one parent's PMEL is unknown too", {}, {}, ['PSMB7', 'PMEL']],
  ])("warns that H/H can't be ruled out when neither parent's PSMB7 is known and %s", (_name, first, second, firstMissing) => {
    const prediction = predictPuppies({ loci: parentLoci(first, firstMissing) }, { loci: parentLoci(second, ['PSMB7']) });
    expect(prediction.warnings).toEqual([
      {
        kind: 'harlequin-lethal-unknown',
        unknown: [
          { gene: 'PSMB7', parent: 0, reason: 'missing' },
          { gene: 'PSMB7', parent: 1, reason: 'missing' },
        ],
      },
    ]);
  });

  it("gives no H/H warning when neither parent's PSMB7 is known but neither can carry merle", () => {
    const prediction = predictPuppies({ loci: parentLoci({}, ['PSMB7']) }, { loci: parentLoci({}, ['PSMB7']) });
    expect(prediction.warnings).toEqual([]);
  });

  it('gives no such warning when the parent whose locus is known does not carry the allele', () => {
    const prediction = predictPuppies({ loci: parentLoci({}, ['PMEL', 'PSMB7']) }, { loci: parentLoci({}) });
    expect(prediction.warnings).toEqual([]);
  });

  it('blames only the missing loci each figure reads', () => {
    const prediction = predictPuppies(
      { loci: parentLoci({ PMEL: 'M/m', MLPH: 'D/d' }, ['TYRP1', 'RALY', 'PMEL', 'USH2A']) },
      { loci: parentLoci({ PMEL: 'M/m', MLPH: 'D/d', MITF: 'sp/+', USH2A: 'R/+' }, ['MITF']) },
    );
    expect(prediction.base.unknown).toEqual([{ gene: 'TYRP1', parent: 0, reason: 'missing' }]);
    expect(prediction.white.unknown).toEqual([{ gene: 'MITF', parent: 1, reason: 'missing' }]);
    expect(prediction.traits.cannotPredict).toEqual([
      { trait: 'merle', unknown: [{ gene: 'PMEL', parent: 0, reason: 'missing' }] },
      { trait: 'doubleMerle', unknown: [{ gene: 'PMEL', parent: 0, reason: 'missing' }] },
      {
        trait: 'roan',
        unknown: [
          { gene: 'MITF', parent: 1, reason: 'missing' },
          { gene: 'USH2A', parent: 0, reason: 'missing' },
        ],
      },
    ]);
  });

  it('names a missing locus whenever a figure is unknown', () => {
    for (const gene of COLOUR_GENES) {
      const prediction = predictPuppies({ loci: parentLoci(HETEROZYGOUS_SINGLE, [gene]) }, { loci: parentLoci(HETEROZYGOUS_SINGLE) });
      for (const table of [prediction.base, prediction.pattern, prediction.white]) {
        const unknown = table.rows.some((row) => row.value === 'unknown');
        expect(table.unknown.map((locus) => locus.gene), gene).toEqual(unknown ? [gene] : []);
      }
      for (const { trait, unknown } of prediction.traits.cannotPredict) {
        expect(unknown.map((locus) => locus.gene), `${gene} ${trait}`).toEqual([gene]);
      }
    }
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
