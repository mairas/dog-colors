// The coat picture shared by the puppy outcomes and the parent cards: the base
// colour with its white pattern, merle or double merle.

import type { BaseColour, Phenotype, Unknown } from '../genetics/phenotype.ts';
import { svg } from './dom.ts';

const COAT_SHAPES = {
  limitedWhite: 'M0 120 L0 92 Q30 78 52 96 Q74 80 100 94 L160 120Z',
  patch: 'M10 8 Q40 0 64 14 Q70 40 42 46 Q14 44 10 8Z',
};

/** A coat chip: the base colour with its white pattern. Its label is the colour's name beside it. */
export function coatChip(phenotype: Phenotype): SVGSVGElement {
  const coat = `coat coat-${phenotype.base satisfies BaseColour | Unknown}`;
  const frame = (...shapes: SVGElement[]) =>
    svg('svg', { viewBox: '0 0 160 120', 'aria-hidden': 'true', focusable: 'false' }, ...shapes);
  const rect = (className: string) => svg('rect', { width: '160', height: '120', class: className });
  if (phenotype.traits.doubleMerle === 'yes') {
    // Two copies still whiten the coat where the merle pattern itself cannot show.
    const patch = phenotype.flags.includes('merle-hidden') ? coat : 'coat coat-merle';
    return frame(
      rect('coat coat-white'),
      svg('circle', { cx: '46', cy: '38', r: '16', class: patch }),
      svg('circle', { cx: '56', cy: '42', r: '7', class: coat }),
    );
  }
  if (phenotype.traits.merle === 'yes') {
    return frame(
      rect('coat coat-merle'),
      svg('circle', { cx: '40', cy: '40', r: '22', class: coat }),
      svg('circle', { cx: '110', cy: '76', r: '28', class: coat }),
      svg('circle', { cx: '124', cy: '22', r: '12', class: coat }),
    );
  }
  if (phenotype.white === 'extensive') {
    return frame(
      rect('coat coat-white'),
      svg('path', { d: COAT_SHAPES.patch, class: coat }),
      svg('circle', { cx: '118', cy: '70', r: '20', class: coat }),
      svg('circle', { cx: '62', cy: '96', r: '9', class: coat }),
    );
  }
  if (phenotype.white === 'limited') {
    return frame(
      rect(coat),
      svg('path', { d: COAT_SHAPES.limitedWhite, class: 'coat coat-white' }),
      svg('ellipse', { cx: '80', cy: '30', rx: '7', ry: '16', class: 'coat coat-white' }),
    );
  }
  return frame(rect(coat));
}
