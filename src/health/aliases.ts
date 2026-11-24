import type { ConditionKey } from './conditions.ts';

/**
 * Conditions the older format prints under a key the general matching rule
 * cannot pair with the current format's. Exact keys only: each older key is
 * read as its current key before matching.
 */
export const ALIASES: readonly { readonly older: ConditionKey; readonly current: ConditionKey }[] = [
  {
    // The same MIA3 variant, written "I>S" instead of "Deletion".
    older: { name: 'Dental-Skeletal-Retinal Anomaly (Discovered in the Cane Corso)', gene: 'MIA3', variant: 'I>S' },
    current: { name: 'Dental-Skeletal-Retinal Anomaly (Discovered in the Cane Corso)', gene: 'MIA3', variant: 'Deletion' },
  },
  {
    // Variant 1 is the SGCD deletion first found in the breed; the older panel predates Variant 2.
    older: { name: 'Limb-girdle Muscular Dystrophy (Discovered in the Boston Terrier)', gene: 'SGCD', variant: '-' },
    current: {
      name: 'Limb-girdle Muscular Dystrophy (Discovered in the Boston Terrier) Variant 1',
      gene: 'SGCD',
      variant: 'Deletion',
    },
  },
];
