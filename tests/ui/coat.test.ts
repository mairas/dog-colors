// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import type { Phenotype } from '../../src/genetics/phenotype.ts';
import { coatChip } from '../../src/ui/coat.ts';
import { shapes } from './app.ts';

const SOLID_BROWN: Phenotype = {
  base: 'brown',
  pattern: 'one-colour',
  nose: 'brown',
  white: 'solid',
  traits: { merle: 'no', doubleMerle: 'no', dilute: 'no', beige: 'no', harlequin: 'no', roan: 'no' },
  lethal: 'no',
  flags: [],
};

describe('the coat picture', () => {
  it.each<readonly [string, Partial<Phenotype>, readonly string[]]>([
    ['a solid coat', {}, ['rect coat coat-brown']],
    ['an unknown base', { base: 'unknown' }, ['rect coat coat-unknown']],
    ['limited white', { white: 'limited' }, ['rect coat coat-brown', 'path coat coat-white', 'ellipse coat coat-white']],
    [
      'extensive white',
      { white: 'extensive' },
      ['rect coat coat-white', 'path coat coat-brown', 'circle coat coat-brown', 'circle coat coat-brown'],
    ],
    [
      'merle',
      { traits: { ...SOLID_BROWN.traits, merle: 'yes' } },
      ['rect coat coat-merle', 'circle coat coat-brown', 'circle coat coat-brown', 'circle coat coat-brown'],
    ],
    [
      'double merle',
      { traits: { ...SOLID_BROWN.traits, merle: 'yes', doubleMerle: 'yes' } },
      ['rect coat coat-white', 'circle coat coat-merle', 'circle coat coat-brown'],
    ],
  ])('draws %s', (_label, change, expected) => {
    expect(shapes(coatChip({ ...SOLID_BROWN, ...change }))).toEqual(expected);
  });

  it('is hidden from assistive technology, with a 4:3 view box', () => {
    const picture = coatChip(SOLID_BROWN);
    expect(picture.getAttribute('aria-hidden')).toBe('true');
    expect(picture.getAttribute('viewBox')).toBe('0 0 160 120');
  });
});
