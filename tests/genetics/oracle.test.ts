// Genotype → phenotype pairs from the cited literature. A row lists only the
// loci its source speaks to; every other locus is wild type. Expected fields a
// row leaves out are not asserted, and its flags are the exact flag set.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { phenotype, type Phenotype } from '../../src/genetics/phenotype.ts';
import type { ColourGene } from '../../src/report/loci.ts';
import { genotype } from './genotypes.ts';

interface OracleRow {
  readonly id: string;
  readonly genotype: Readonly<Partial<Record<ColourGene, string>>>;
  readonly expected: {
    readonly base?: Phenotype['base'];
    readonly pattern?: Phenotype['pattern'];
    readonly nose?: Phenotype['nose'];
    readonly white?: Phenotype['white'];
    readonly traits?: Partial<Phenotype['traits']>;
    readonly lethal?: Phenotype['lethal'];
    readonly flags: Phenotype['flags'];
  };
  readonly citation: { readonly source: string; readonly url: string; readonly locator: string };
  readonly note?: string;
  /** How the row was fitted to this model, when its literal expectation strains the plan. */
  readonly adaptation?: string;
}

const rows = JSON.parse(readFileSync(new URL('./oracle.json', import.meta.url), 'utf8')) as OracleRow[];

describe('literature oracle', () => {
  it('holds the 42 compiled rows, each with a citation', () => {
    expect(rows).toHaveLength(42);
    expect(new Set(rows.map((row) => row.id)).size).toBe(rows.length);
    for (const row of rows) {
      expect(row.citation.source).not.toBe('');
      expect(row.citation.url).toMatch(/^https:\/\//);
      expect(row.citation.locator).not.toBe('');
    }
  });

  it.each(rows.map((row) => [row.id, row] as const))('%s', (_id, row) => {
    const result = phenotype(genotype(row.genotype));
    const { traits, flags, ...fields } = row.expected;
    expect(result).toMatchObject(fields);
    expect(result.traits).toMatchObject(traits ?? {});
    expect([...result.flags].sort()).toEqual([...flags].sort());
  });
});
