import type { HealthRow, Inheritance } from '../../src/report/types.ts';

const RESULTS = ['Clear', 'Carrier', 'At Risk'] as const;

/** A health row as a report prints it; the result text follows the copies. */
export function healthRow(
  name: string,
  copies: number,
  inheritance: Inheritance | null,
  { gene = 'GENE', variant = 'G>A', knownInBreed = false }: Partial<Pick<HealthRow, 'gene' | 'variant' | 'knownInBreed'>> = {},
): HealthRow {
  return { name, gene, variant, copies, result: RESULTS[Math.min(copies, 2)] ?? 'Clear', inheritance, knownInBreed };
}
