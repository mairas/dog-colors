// One parent, as its card shows it: the candidate genotypes the report allows,
// the questions that could narrow them, and the own colour each candidate
// predicts.

import { COLOUR_GENES, type ColourGene } from '../report/loci.ts';
import type { Report } from '../report/types.ts';
import type { Genotype } from './alleles.ts';
import { candidateGenotypes, resolveReport, type GenotypeResolution, type Inconsistency } from './haplotypes.ts';
import { FLAGS, ownColourName, phenotype, type Phenotype } from './phenotype.ts';
import { applyAnswers, questionsFor, type Answers, type Question } from './questions.ts';

export interface OwnColour {
  /**
   * The phenotypes of the genotypes merged: a field they disagree on is
   * unknown, and the flags are those of any of them.
   */
  readonly phenotype: Phenotype;
  readonly name: string;
  /** The candidate genotypes that give this colour. */
  readonly genotypes: readonly Genotype[];
}

export interface InconsistentLocus {
  readonly gene: ColourGene;
  readonly reason: Inconsistency;
}

export interface ResolvedDog {
  /** Candidate pairs per locus, narrowed by the answers. */
  readonly loci: GenotypeResolution;
  /** Every question this dog's report raises, answered or not. */
  readonly questions: readonly Question[];
  /** Loci with more than one candidate pair left. */
  readonly ambiguousLoci: readonly ColourGene[];
  /** Ambiguous loci no open question can settle: "The report can't tell which; results show both." */
  readonly unsettled: readonly ColourGene[];
  readonly missingLoci: readonly ColourGene[];
  /** Loci whose copy counts fit no genotype; treated as unknown. */
  readonly inconsistentLoci: readonly InconsistentLocus[];
  /** The predicted own colours, one per name, in candidate order. */
  readonly ownColours: readonly OwnColour[];
}

const same = <T extends string>(left: T, right: T): T | 'unknown' => (left === right ? left : 'unknown');

function merge(left: Phenotype, right: Phenotype): Phenotype {
  const trait = (name: keyof Phenotype['traits']) => same(left.traits[name], right.traits[name]);
  return {
    base: same(left.base, right.base),
    pattern: same(left.pattern, right.pattern),
    nose: same(left.nose, right.nose),
    white: same(left.white, right.white),
    traits: {
      merle: trait('merle'),
      doubleMerle: trait('doubleMerle'),
      dilute: trait('dilute'),
      beige: trait('beige'),
      harlequin: trait('harlequin'),
      roan: trait('roan'),
    },
    lethal: same(left.lethal, right.lethal),
    flags: FLAGS.filter((flag) => left.flags.includes(flag) || right.flags.includes(flag)),
  };
}

export function resolveDog(report: Pick<Report, 'colour' | 'missingLoci'>, answers: Answers = {}): ResolvedDog {
  const reported = resolveReport(report);
  const questions = questionsFor(reported);
  const loci = applyAnswers(reported, questions, answers);

  const ambiguousLoci = COLOUR_GENES.filter((gene) => {
    const locus = loci[gene];
    return locus.status === 'resolved' && locus.candidates.length > 1;
  });
  const open: readonly ColourGene[] = questions.filter((question) => answers[question.id] === undefined).map((question) => question.gene);
  const inconsistentLoci = COLOUR_GENES.flatMap((gene): InconsistentLocus[] => {
    const locus = loci[gene];
    return locus.status === 'inconsistent' ? [{ gene, reason: locus.reason }] : [];
  });

  const ownColours = new Map<string, { name: string; phenotype: Phenotype; genotypes: Genotype[] }>();
  for (const genotype of candidateGenotypes(loci)) {
    const predicted = phenotype(genotype);
    const name = ownColourName(predicted);
    const entry = ownColours.get(name);
    if (entry === undefined) {
      ownColours.set(name, { name, phenotype: predicted, genotypes: [genotype] });
    } else {
      entry.phenotype = merge(entry.phenotype, predicted);
      entry.genotypes.push(genotype);
    }
  }

  return {
    loci,
    questions,
    ambiguousLoci,
    unsettled: ambiguousLoci.filter((gene) => !open.includes(gene)),
    missingLoci: COLOUR_GENES.filter((gene) => loci[gene].status === 'missing'),
    inconsistentLoci,
    ownColours: [...ownColours.values()],
  };
}
