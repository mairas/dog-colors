// Health conditions are identified across reports by normalised name, gene
// and risk variant: gene and variant alone are not unique (VWF G>A is two
// conditions). Reports sometimes withhold the gene ("Confidential") or, in the
// older format, the variant (printed as a dash); such a row matches on the
// name alone, provided the genes do not contradict each other.
import type { Inheritance } from '../report/types.ts';
import catalogue from './conditions.json' with { type: 'json' };

export interface ConditionKey {
  readonly name: string;
  readonly gene: string;
  readonly variant: string;
}

export interface CatalogueEntry extends ConditionKey {
  readonly inheritance: Inheritance;
}

/** Inheritance modes of every condition on the current-format panel, built by `./run conditions`. */
const CATALOGUE = catalogue as readonly CatalogueEntry[];

const CONFIDENTIAL_GENE = 'Confidential';
const WITHHELD_VARIANT = '-';

function sameName(a: ConditionKey, b: ConditionKey): boolean {
  return a.name.toLowerCase() === b.name.toLowerCase();
}

function isWithheld(key: ConditionKey): boolean {
  return key.gene === CONFIDENTIAL_GENE || key.variant === WITHHELD_VARIANT;
}

function genesAgree(a: ConditionKey, b: ConditionKey): boolean {
  return a.gene === b.gene || a.gene === CONFIDENTIAL_GENE || b.gene === CONFIDENTIAL_GENE;
}

/** The candidate that is the same condition as `key`, if exactly one is. */
export function findCondition<T extends ConditionKey>(key: ConditionKey, candidates: readonly T[]): T | undefined {
  const exact = candidates.find(
    (candidate) => sameName(key, candidate) && key.gene === candidate.gene && key.variant === candidate.variant,
  );
  if (exact) {
    return exact;
  }
  const withheld = candidates.filter(
    (candidate) =>
      sameName(key, candidate) && (isWithheld(key) || isWithheld(candidate)) && genesAgree(key, candidate),
  );
  return withheld.length === 1 ? withheld[0] : undefined;
}

export function catalogueInheritance(key: ConditionKey): Inheritance | null {
  return findCondition(key, CATALOGUE)?.inheritance ?? null;
}
