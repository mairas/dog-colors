// The colour warnings for the panel and the texts of the cross's caveats. The
// panel holds only harm the mating itself creates (R12): double merle and
// H/H. Breed-typical risks, such as deafness with extensive white, are caveats
// attached to the table or row they concern. A caveat that comes from a
// phenotype flag uses the flag as its id, and its text is the flag's caveat.

import type { HealthWarning } from '../health/health.ts';
import { DOUBLE_MERLE_WHITE, FLAG_INFO, type Flag } from './phenotype.ts';
import type { Range } from './range.ts';
import type { UnknownLocus } from './results.ts';

export type ColourWarning =
  /** M/M puppies, with their chance per live puppy. */
  | { readonly kind: 'double-merle'; readonly chance: Range }
  /** A parent's PMEL is unknown and neither parent is known to lack M, so M/M can't be ruled out; `unknown` names each unknown PMEL and its parent. */
  | { readonly kind: 'double-merle-unknown'; readonly unknown: readonly UnknownLocus[] }
  /** H/H conceptions, as a share of all conceptions; thought to die before birth, they are left out of every other figure. */
  | { readonly kind: 'harlequin-lethal'; readonly chance: Range }
  /**
   * A parent's PSMB7 is unknown and neither parent is known to lack H, so H/H can't be ruled out; `unknown` names each
   * unknown PSMB7 and its parent. With neither PSMB7 known, it is raised only when some parent may carry merle.
   */
  | { readonly kind: 'harlequin-lethal-unknown'; readonly unknown: readonly UnknownLocus[] };

/** Everything the warning panel can show; the health section adds its own. */
export type PanelWarning = ColourWarning | HealthWarning;

const DOUBLE_MERLE_RISK = `${DOUBLE_MERLE_WHITE} and have a high risk of deafness and eye defects.`;

export const COLOUR_WARNING_TEXT: Readonly<Record<ColourWarning['kind'], { readonly title: string; readonly text: string }>> = {
  'double-merle': {
    title: 'Double merle',
    text: `Both parents carry merle. ${DOUBLE_MERLE_RISK}`,
  },
  'double-merle-unknown': {
    title: 'Double merle possible',
    text: `A merle result is missing or unreadable and neither parent is known to be free of merle, so double merle puppies can't be ruled out. ${DOUBLE_MERLE_RISK}`,
  },
  'harlequin-lethal': {
    title: 'Harlequin × harlequin',
    text: 'Both parents carry harlequin. Puppies with two copies (H/H) are not seen alive; they are thought to die early in pregnancy, so litters may be smaller. The other chances are for live puppies.',
  },
  'harlequin-lethal-unknown': {
    title: 'Harlequin × harlequin possible',
    text: "A harlequin result is missing or unreadable and neither parent is known to be free of harlequin, so puppies with two copies (H/H) can't be ruled out. H/H puppies are not seen alive; they are thought to die early in pregnancy, so litters may be smaller.",
  },
};

export const CROSS_CAVEATS = [
  'albino-health',
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
  'albino-health':
    'Albino dogs (two copies of SLC45A2 cal) can be sensitive to light, can have vision defects, and have a higher risk of skin tumours with sun exposure (OMIA 001821).',
  deafness: "Very white heads are linked to deafness in many breeds. The report can't predict how white the head will be.",
  'white-piebald-only': `These rows describe piebald (MITF) white only. ${DOUBLE_MERLE_WHITE} whatever their row here; see the double merle warning.`,
  'dilution-alopecia': 'Dilute dogs can develop colour dilution alopecia (hair loss in dilute areas).',
  'linkage-d1': 'Dilution d1 is a linkage test: occasional wrong calls are possible.',
  'merle-allele-length': "The test doesn't tell merle allele lengths apart, so the pattern and its risks may be weaker or stronger than shown.",
  'linkage-roan': 'Roan is a linkage test: occasional wrong calls are possible.',
  'independent-loci':
    'Each gene is treated as inherited independently. Saddle tan (RALY) sits next to the tan-points gene (ASIP), and red intensity (MFSD12) shares a chromosome with piebald (MITF).',
  'untested-loci': "Greying, ticking and other genes the report doesn't test can change how a puppy looks.",
};

const isCrossCaveat = (id: CaveatId): id is CrossCaveat => (CROSS_CAVEATS as readonly string[]).includes(id);

/** The text of any caveat badge: a cross caveat's own, or a phenotype flag's caveat. */
export function caveatText(id: CaveatId): string {
  return isCrossCaveat(id) ? CAVEAT_TEXT[id] : FLAG_INFO[id].caveat;
}
