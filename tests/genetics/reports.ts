import { parseReport } from '../../src/report/parse.ts';
import { COLOUR_VARIANTS, type ColourGene } from '../../src/report/loci.ts';
import type { Report } from '../../src/report/types.ts';
import { fixtureText } from '../report/fixtures.ts';

export async function sampleReport(letter: string): Promise<Report> {
  const result = await parseReport(fixtureText(letter));
  if (!result.ok) {
    throw new Error(`fixture ${letter} was rejected as ${result.kind}`);
  }
  return result.report;
}

/**
 * A report with every catalogue code at 0 copies except the given ones
 * ("TYRP1 bd" → 1), and the given genes' rows absent.
 */
export function syntheticReport(
  copies: Readonly<Record<string, number>>,
  missing: readonly ColourGene[] = [],
): Report {
  const colour: Partial<Record<ColourGene, Record<string, number>>> = {};
  for (const { gene, code } of COLOUR_VARIANTS) {
    if (!missing.includes(gene)) {
      colour[gene] = { ...colour[gene], [code]: copies[`${gene} ${code}`] ?? 0 };
    }
  }
  return {
    format: 'current',
    name: 'Sample S',
    sex: 'female',
    breed: 'Spanish Water Dog',
    kitIdHash: null,
    colour,
    missingLoci: missing,
    shortTail: 0,
    health: [],
  };
}
