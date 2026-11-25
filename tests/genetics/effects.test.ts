import { describe, expect, it } from 'vitest';
import { withLocus, type AllelePair, type Genotype } from '../../src/genetics/alleles.ts';
import { pairEffect } from '../../src/genetics/effects.ts';
import { NEUTRAL } from '../../src/genetics/hidden.ts';
import type { ColourGene } from '../../src/report/loci.ts';

/** Gene, pair, the dog's loci that differ from wild type, and the text. */
type Case = readonly [ColourGene, readonly [string, string], Genotype, string];

const KB: Genotype = { CBD103: ['KB', 'ky'] };
const BEIGE: Genotype = { MC1R: ['e', 'e'] };
const ALBINO: Genotype = { SLC45A2: ['cal', 'cal'] };
const SPOTTED: Genotype = { MITF: ['sp', '+'] };

const dog = <G extends ColourGene>(gene: G, pair: AllelePair<G>, others: Genotype): Genotype =>
  withLocus({ ...NEUTRAL, ...others }, gene, pair);

const CASES: readonly Case[] = [
  ['ASIP', ['ay', 'ay'], {}, 'sable'],
  ['ASIP', ['ay', 'a'], {}, 'sable, carries recessive black'],
  ['ASIP', ['ayt', 'at'], {}, 'sable'],
  ['ASIP', ['aw', 'at'], {}, 'wolf sable'],
  ['ASIP', ['at', 'at'], {}, 'tan points'],
  ['ASIP', ['at', 'a'], {}, 'tan points, carries recessive black'],
  ['ASIP', ['a', 'a'], {}, 'recessive black'],
  ['ASIP', ['at', 'at'], KB, 'tan points, hidden by Dominant Black'],
  ['ASIP', ['at', 'a'], KB, 'tan points, hidden by Dominant Black, carries recessive black'],
  ['ASIP', ['a', 'a'], KB, 'recessive black, hidden by Dominant Black'],
  ['ASIP', ['at', 'at'], BEIGE, 'tan points, hidden by beige'],
  ['ASIP', ['ay', 'at'], ALBINO, 'sable, hidden by albino'],
  ['ASIP', ['at', 'at'], { ...KB, MC1R: ['eA', 'eA'] }, 'tan points'],
  ['CBD103', ['KB', 'ky'], {}, 'one colour (Dominant Black)'],
  ['CBD103', ['KB', 'KB'], BEIGE, 'one colour (Dominant Black), hidden by beige'],
  ['CBD103', ['KB', 'ky'], ALBINO, 'one colour (Dominant Black), hidden by albino'],
  ['CBD103', ['KB', 'ky'], { MC1R: ['eA', 'eA'] }, 'one colour (Dominant Black), not expressed with eA'],
  ['CBD103', ['KB', 'ky'], { MC1R: ['eA', 'e'] }, 'one colour (Dominant Black), not expressed with eA'],
  // Anderson 2020: E/eA dogs were unaffected.
  ['CBD103', ['KB', 'ky'], { MC1R: ['E', 'eA'] }, 'one colour (Dominant Black)'],
  ['CBD103', ['ky', 'ky'], {}, 'no Dominant Black'],
  ['CBD103', ['ky', 'ky'], BEIGE, 'no Dominant Black'],
  ['MC1R', ['E', 'E'], {}, 'no effect'],
  ['MC1R', ['Em', 'E'], {}, 'mask'],
  ['MC1R', ['Em', 'E'], { ASIP: ['at', 'at'] }, 'mask'],
  ['MC1R', ['Em', 'E'], KB, 'mask, hidden on solid coats'],
  ['MC1R', ['Em', 'E'], { ASIP: ['a', 'a'] }, 'mask, hidden on solid coats'],
  ['MC1R', ['Em', 'e'], KB, 'mask, hidden on solid coats, carries beige'],
  ['MC1R', ['E', 'e'], {}, 'carries beige'],
  ['MC1R', ['Em', 'e'], {}, 'mask, carries beige'],
  ['MC1R', ['e', 'e'], {}, 'beige'],
  ['MC1R', ['eA', 'eA'], {}, 'not modelled precisely'],
  ['MC1R', ['eA', 'e'], {}, 'not modelled precisely, carries beige'],
  ['MC1R', ['E', 'eA'], {}, 'no effect'],
  ['MC1R', ['E', 'eH'], {}, 'not modelled precisely'],
  ['MC1R', ['eH', 'eG'], {}, 'not modelled precisely'],
  ['HPS3', ['co', 'co'], {}, 'cocoa'],
  ['HPS3', ['co', '+'], {}, 'carries cocoa'],
  ['HPS3', ['+', '+'], {}, 'no effect'],
  ['MFSD12', ['i', 'i'], {}, 'light cream if beige, lighter tan'],
  ['MFSD12', ['i', 'i'], BEIGE, 'light cream if beige, lighter tan'],
  ['MFSD12', ['i', 'i'], KB, 'light cream if beige, lighter tan, hidden'],
  ['MFSD12', ['i', '+'], {}, 'no effect'],
  ['MLPH', ['d', 'd'], {}, 'dilute'],
  ['MLPH', ['D', 'd'], {}, 'carries dilute'],
  ['MLPH', ['D', 'D'], {}, 'no effect'],
  ['TYRP1', ['B', 'B'], {}, 'black'],
  ['TYRP1', ['B', 'b'], {}, 'black, carries brown'],
  ['TYRP1', ['b', 'b'], {}, 'brown'],
  ['MITF', ['+', '+'], {}, 'solid'],
  ['MITF', ['sp', '+'], {}, 'limited white'],
  ['MITF', ['sp', 'sp'], {}, 'piebald'],
  ['PMEL', ['m', 'm'], {}, 'no merle'],
  ['PMEL', ['M', 'm'], {}, 'merle'],
  ['PMEL', ['M', 'M'], {}, 'double merle'],
  ['PMEL', ['M', 'm'], BEIGE, 'merle, hidden by beige'],
  ['PMEL', ['M', 'M'], BEIGE, 'double merle'],
  ['PSMB7', ['H', 'h'], {}, 'harlequin (acts on merle)'],
  ['PSMB7', ['H', 'h'], { PMEL: ['M', 'm'] }, 'harlequin (acts on merle)'],
  ['PSMB7', ['H', 'h'], { ...BEIGE, PMEL: ['M', 'm'] }, 'harlequin (acts on merle), hidden by beige'],
  ['PSMB7', ['h', 'h'], {}, 'no harlequin'],
  ['RALY', ['+', 'dup'], {}, 'saddle tan marker'],
  ['RALY', ['dup', 'dup'], {}, 'no saddle tan marker'],
  ['USH2A', ['R', '+'], SPOTTED, 'roan (within white areas)'],
  ['USH2A', ['R', 'R'], SPOTTED, 'roan (within white areas)'],
  ['USH2A', ['R', '+'], {}, 'roan (within white areas), hidden without white spotting'],
  ['USH2A', ['+', '+'], {}, 'no roan'],
  ['SLC45A2', ['cal', 'cal'], {}, 'albino'],
  ['SLC45A2', ['cal', '+'], {}, 'carries albino'],
  ['SLC45A2', ['+', '+'], {}, 'no effect'],
];

describe('pairEffect', () => {
  it.each(CASES)('reads %s %j on a dog with %j as "%s"', (gene, pair, others, text) => {
    const typed = pair as AllelePair<ColourGene>;
    expect(pairEffect(gene, typed, [dog(gene, typed, others)])).toBe(text);
  });

  it('marks an effect hidden only when every candidate genotype hides it', () => {
    const candidates = [dog('ASIP', ['at', 'at'], KB), dog('ASIP', ['at', 'at'], {})];
    expect(pairEffect('ASIP', ['at', 'at'], candidates)).toBe('tan points');
  });

  it('marks nothing hidden when a locus that could hide it is unread', () => {
    const unread: Genotype = { CBD103: ['KB', 'ky'], ASIP: ['at', 'at'] };
    expect(pairEffect('ASIP', ['at', 'at'], [unread])).toBe('tan points');
  });
});
