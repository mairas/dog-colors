import { describe, expect, it } from 'vitest';
import { formatPair } from '../../src/genetics/alleles.ts';
import { resolveDog, type ResolvedDog } from '../../src/genetics/dog.ts';
import { sampleReport, syntheticReport } from './reports.ts';

const names = (dog: ResolvedDog): string[] => dog.ownColours.map((colour) => colour.name);

describe('resolveDog: the sample reports', () => {
  it.each([
    ['a', 'Brown, mostly white'],
    ['b', 'Brown with limited white'],
    ['c', 'Brown, solid'],
    ['d', 'Brown, mostly white'],
    ['e', 'Brown, solid'],
  ])('Sample %s → %s, with no question and no ambiguity', async (letter, name) => {
    const dog = resolveDog(await sampleReport(letter));
    expect(names(dog)).toEqual([name]);
    expect(dog.questions).toEqual([]);
    expect(dog.ambiguousLoci).toEqual([]);
    expect(dog.unsettled).toEqual([]);
    expect(dog.missingLoci).toEqual([]);
    expect(dog.inconsistentLoci).toEqual([]);
  });

  it('Sample A is brown, one colour, piebald to mostly white', async () => {
    const [own] = resolveDog(await sampleReport('a')).ownColours;
    expect(own?.phenotype).toMatchObject({ base: 'brown', pattern: 'one-colour', white: 'extensive' });
  });

  it('Sample B is brown with limited white', async () => {
    const [own] = resolveDog(await sampleReport('b')).ownColours;
    expect(own?.phenotype).toMatchObject({ base: 'brown', pattern: 'one-colour', white: 'limited' });
  });
});

describe('resolveDog: ambiguity', () => {
  const bdBc = syntheticReport({ 'TYRP1 bd': 1, 'TYRP1 bc': 1, 'CBD103 KB': 1, 'MITF sp': 2 });

  it('lists each candidate own colour with the genotype that gives it, above the nose question', () => {
    const dog = resolveDog(bdBc);
    expect(dog.questions.map((question) => question.id)).toEqual(['nose']);
    expect(dog.ambiguousLoci).toEqual(['TYRP1']);
    expect(dog.unsettled).toEqual([]);
    expect(
      dog.ownColours.map((colour) => [colour.name, colour.genotypes.map((genotype) => formatPair(genotype.TYRP1 ?? ['?', '?']))]),
    ).toEqual([
      ['Black, mostly white', ['B/b']],
      ['Brown, mostly white', ['b/b']],
    ]);
  });

  it('narrows to one own colour once the nose question is answered, and keeps the question', () => {
    const dog = resolveDog(bdBc, { nose: 'brown' });
    expect(names(dog)).toEqual(['Brown, mostly white']);
    expect(dog.ambiguousLoci).toEqual([]);
    expect(dog.questions.map((question) => question.id)).toEqual(['nose']);
  });

  it('marks ASIP-only ambiguity as unsettled, with no question', () => {
    const dog = resolveDog(syntheticReport({ 'ASIP ay': 1, 'ASIP at': 1 }));
    expect(dog.questions).toEqual([]);
    expect(dog.ambiguousLoci).toEqual(['ASIP']);
    expect(dog.unsettled).toEqual(['ASIP']);
    expect(dog.ownColours.map((colour) => [colour.phenotype.pattern, colour.phenotype.flags])).toEqual([
      ['sable', []],
      ['sable', ['ayt-unknown']],
    ]);
  });

  it('merges candidates that look the same, and still reports the locus unsettled', () => {
    const dog = resolveDog(syntheticReport({ 'ASIP ay': 1, 'ASIP at': 1, 'CBD103 KB': 2 }));
    expect(names(dog)).toEqual(['Black, solid']);
    expect(dog.ownColours[0]?.genotypes.map((genotype) => formatPair(genotype.ASIP ?? ['?', '?']))).toEqual(['ay/at', 'ayt/aw']);
    expect(dog.unsettled).toEqual(['ASIP']);
  });

  it('marks TYRP1 unsettled when the nose cannot tell (dilute)', () => {
    const dog = resolveDog(syntheticReport({ 'TYRP1 bd': 1, 'TYRP1 bc': 1, 'CBD103 KB': 1, 'MLPH d1': 2 }));
    expect(dog.questions).toEqual([]);
    expect(dog.unsettled).toEqual(['TYRP1']);
    expect(names(dog)).toEqual(['Blue, solid', 'Lilac, solid']);
  });
});

describe('resolveDog: missing and inconsistent loci', () => {
  it('leaves a missing locus unknown in the own colour', () => {
    const dog = resolveDog(syntheticReport({ 'CBD103 KB': 1, 'MITF sp': 1 }, ['TYRP1']));
    expect(dog.missingLoci).toEqual(['TYRP1']);
    expect(names(dog)).toEqual(['Unknown base colour with limited white']);
  });

  it('reports a locus whose copies fit no genotype as inconsistent, and treats it as unknown', () => {
    const dog = resolveDog(syntheticReport({ 'TYRP1 bc': 1, 'TYRP1 bs': 1, 'TYRP1 be': 1, 'CBD103 KB': 1 }));
    expect(dog.inconsistentLoci).toEqual([{ gene: 'TYRP1', reason: 'no-phasing' }]);
    expect(dog.ownColours.map((colour) => colour.phenotype.base)).toEqual(['unknown']);
  });
});
