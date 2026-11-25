// The colour warnings for the panel and the texts of the cross's caveats. The
// panel holds only harm the mating itself creates (R12): double merle and
// H/H. Breed-typical risks, such as deafness with extensive white, are caveats
// attached to the table or row they concern. A caveat that comes from a
// phenotype flag uses the flag as its id, and its text is the flag's caveat.

import type { HealthWarning } from '../health/health.ts';
import type { Flag } from './phenotype.ts';
import type { Range } from './range.ts';

export type ColourWarning =
  /** M/M puppies, with their chance per live puppy. */
  | { readonly kind: 'double-merle'; readonly chance: Range }
  /** H/H conceptions, as a share of all conceptions; they die before birth and are left out of every other figure. */
  | { readonly kind: 'harlequin-lethal'; readonly chance: Range };

/** Everything the warning panel can show; the health section adds its own. */
export type PanelWarning = ColourWarning | HealthWarning;

export const COLOUR_WARNING_TEXT: Readonly<Record<ColourWarning['kind'], { readonly title: string; readonly text: string }>> = {
  'double-merle': {
    title: 'Double merle',
    text: 'Both parents carry merle. Double merle puppies (M/M) are usually mostly white and have a high risk of deafness and eye defects.',
  },
  'harlequin-lethal': {
    title: 'Harlequin × harlequin',
    text: 'Both parents carry harlequin. Puppies with two copies (H/H) die before birth, so litters may be smaller. The other chances are for live puppies.',
  },
};

export const CROSS_CAVEATS = [
  'deafness',
  'white-piebald-only',
  'dilution-alopecia',
  'linkage-d1',
  'merle-allele-length',
  'linkage-roan',
  'independent-loci',
  'untested-loci',
] as const;
export type CrossCaveat = (typeof CROSS_CAVEATS)[number];

/** A caveat badge: one of the cross's own, or a phenotype flag whose caveat applies. */
export type CaveatId = CrossCaveat | Flag;

export const CAVEAT_TEXT: Readonly<Record<CrossCaveat, string>> = {
  deafness:
    "Very white heads are linked to deafness in many breeds, including Spanish Water Dogs. The report can't predict how white the head will be.",
  'white-piebald-only':
    'These rows describe piebald (MITF) white only. Double merle puppies are usually mostly white whatever their row here; see the double merle warning.',
  'dilution-alopecia': 'Dilute dogs can develop colour dilution alopecia (hair loss in dilute areas).',
  'linkage-d1': 'Dilution d1 is a linkage test: occasional wrong calls are possible.',
  'merle-allele-length': "The test doesn't tell merle allele lengths apart, so the pattern and its risks may be weaker than shown.",
  'linkage-roan': 'Roan is a linkage test: occasional wrong calls are possible.',
  'independent-loci':
    'Each gene is treated as inherited independently. Saddle tan (RALY) sits next to the tan-points gene (ASIP), and red intensity (MFSD12) shares a chromosome with piebald (MITF).',
  'untested-loci': "Greying, ticking and other genes the report doesn't test can change how a puppy looks.",
};
