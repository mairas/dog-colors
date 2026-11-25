import { describe, expect, it } from 'vitest';
import type { AllelePair } from '../../src/genetics/alleles.ts';
import { pairEffect } from '../../src/genetics/effects.ts';
import type { ColourGene } from '../../src/report/loci.ts';

type Case = readonly [ColourGene, readonly [string, string], boolean, string];

const CASES: readonly Case[] = [
  ['ASIP', ['ay', 'ay'], false, 'sable'],
  ['ASIP', ['ay', 'a'], false, 'sable, carries recessive black'],
  ['ASIP', ['ayt', 'at'], false, 'sable'],
  ['ASIP', ['aw', 'at'], false, 'wolf sable'],
  ['ASIP', ['at', 'at'], false, 'tan points'],
  ['ASIP', ['at', 'a'], false, 'tan points, carries recessive black'],
  ['ASIP', ['a', 'a'], false, 'recessive black'],
  ['ASIP', ['at', 'at'], true, 'tan points, hidden'],
  ['ASIP', ['at', 'a'], true, 'tan points, carries recessive black, hidden'],
  ['CBD103', ['KB', 'ky'], false, 'one colour (Dominant Black)'],
  ['CBD103', ['ky', 'ky'], false, 'no Dominant Black'],
  ['MC1R', ['E', 'E'], false, 'no effect'],
  ['MC1R', ['Em', 'E'], false, 'mask'],
  ['MC1R', ['Em', 'E'], true, 'mask, hidden on solid coats'],
  ['MC1R', ['E', 'e'], false, 'carries beige'],
  ['MC1R', ['Em', 'e'], false, 'mask, carries beige'],
  ['MC1R', ['e', 'e'], false, 'beige'],
  ['MC1R', ['eA', 'eA'], false, 'not modelled precisely'],
  ['MC1R', ['eA', 'e'], false, 'not modelled precisely, carries beige'],
  // Anderson 2020: E/eA dogs were unaffected.
  ['MC1R', ['E', 'eA'], false, 'no effect'],
  ['MC1R', ['E', 'eH'], false, 'not modelled precisely'],
  ['MC1R', ['eH', 'eG'], false, 'not modelled precisely'],
  ['HPS3', ['co', 'co'], false, 'cocoa'],
  ['HPS3', ['co', '+'], false, 'carries cocoa'],
  ['HPS3', ['+', '+'], false, 'no effect'],
  ['MFSD12', ['i', 'i'], false, 'light cream if beige, lighter tan'],
  ['MFSD12', ['i', '+'], false, 'no effect'],
  ['MLPH', ['d', 'd'], false, 'dilute'],
  ['MLPH', ['D', 'd'], false, 'carries dilute'],
  ['MLPH', ['D', 'D'], false, 'no effect'],
  ['TYRP1', ['B', 'B'], false, 'black'],
  ['TYRP1', ['B', 'b'], false, 'black, carries brown'],
  ['TYRP1', ['b', 'b'], false, 'brown'],
  ['MITF', ['+', '+'], false, 'solid'],
  ['MITF', ['sp', '+'], false, 'limited white'],
  ['MITF', ['sp', 'sp'], false, 'piebald'],
  ['PMEL', ['m', 'm'], false, 'no merle'],
  ['PMEL', ['M', 'm'], false, 'merle'],
  ['PMEL', ['M', 'M'], false, 'double merle'],
  ['PSMB7', ['H', 'h'], false, 'harlequin (acts on merle)'],
  ['PSMB7', ['h', 'h'], false, 'no harlequin'],
  ['RALY', ['+', 'dup'], false, 'saddle tan marker'],
  ['RALY', ['dup', 'dup'], false, 'no saddle tan marker'],
  ['USH2A', ['R', '+'], false, 'roan (within white areas)'],
  ['USH2A', ['R', 'R'], false, 'roan (within white areas)'],
  ['USH2A', ['+', '+'], false, 'no roan'],
  ['SLC45A2', ['cal', 'cal'], false, 'albino'],
  ['SLC45A2', ['cal', '+'], false, 'carries albino'],
  ['SLC45A2', ['+', '+'], false, 'no effect'],
];

describe('pairEffect', () => {
  it.each(CASES)('reads %s %j (pattern hidden: %s) as "%s"', (gene, pair, patternHidden, text) => {
    expect(pairEffect(gene, pair as AllelePair<ColourGene>, patternHidden)).toBe(text);
  });
});
