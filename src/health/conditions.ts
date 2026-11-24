// Health conditions are identified across reports by normalised name, gene
// and risk variant: gene and variant alone are not unique (VWF G>A is two
// conditions). Reports sometimes withhold the gene ("Confidential") or, in the
// older format, the variant (printed as a dash); such a row matches on the
// name alone, provided the genes do not contradict each other. A few older
// keys that neither rule pairs are listed in ./aliases.ts.
import type { Inheritance } from '../report/types.ts';
import { ALIASES } from './aliases.ts';
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

/** The report withholds the gene or, in the older format, the variant. */
export function isWithheld(key: ConditionKey): boolean {
  return key.gene === CONFIDENTIAL_GENE || key.variant === WITHHELD_VARIANT;
}

function genesAgree(a: ConditionKey, b: ConditionKey): boolean {
  return a.gene === b.gene || a.gene === CONFIDENTIAL_GENE || b.gene === CONFIDENTIAL_GENE;
}

function sameKey(a: ConditionKey, b: ConditionKey): boolean {
  return sameName(a, b) && a.gene === b.gene && a.variant === b.variant;
}

function canonical(key: ConditionKey): ConditionKey {
  return ALIASES.find(({ older }) => sameKey(key, older))?.current ?? key;
}

/** The candidate that is the same condition as `key`, if exactly one is. */
export function findCondition<T extends ConditionKey>(key: ConditionKey, candidates: readonly T[]): T | undefined {
  const wanted = canonical(key);
  const exact = candidates.find((candidate) => sameKey(wanted, canonical(candidate)));
  if (exact) {
    return exact;
  }
  const withheld = candidates.filter((candidate) => {
    const other = canonical(candidate);
    return sameName(wanted, other) && (isWithheld(wanted) || isWithheld(other)) && genesAgree(wanted, other);
  });
  return withheld.length === 1 ? withheld[0] : undefined;
}

export function catalogueInheritance(key: ConditionKey): Inheritance | null {
  return findCondition(key, CATALOGUE)?.inheritance ?? null;
}
