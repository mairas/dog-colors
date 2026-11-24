// Observable questions that settle a locus the report leaves ambiguous. Under
// the documented-cis rule only TYRP1 pairs that include bd become ambiguous
// with an observable answer: a B/b dog has a black nose and paw pads, a b/b
// dog brown ones. ASIP ambiguity has no reliable observable and gets no
// question. A question is asked only when each answer keeps some candidates,
// so no answer can contradict them all.

import { formatPair, type AllelePair } from './alleles.ts';
import { candidateGenotypes, type GenotypeResolution } from './haplotypes.ts';
import { pigmentPhenotype } from './phenotype.ts';

export const NOSE_ANSWERS = ['black', 'brown'] as const;
export type NoseAnswer = (typeof NOSE_ANSWERS)[number];

export interface QuestionOption {
  readonly answer: NoseAnswer;
  /** The TYRP1 candidates this answer keeps. */
  readonly candidates: readonly AllelePair<'TYRP1'>[];
}

export interface Question {
  /** "Nose and paw pads: black or brown?" */
  readonly id: 'nose';
  readonly gene: 'TYRP1';
  readonly options: readonly QuestionOption[];
}

export interface Answers {
  readonly nose?: NoseAnswer;
}

const isNoseAnswer = (nose: string): nose is NoseAnswer => (NOSE_ANSWERS as readonly string[]).includes(nose);

export function questionsFor(resolution: GenotypeResolution): Question[] {
  const locus = resolution.TYRP1;
  if (locus.status !== 'resolved' || locus.candidates.length < 2) {
    return [];
  }

  // The nose also depends on MLPH, HPS3 and SLC45A2, so it is predicted per
  // full candidate genotype. A dilute, albino or unknown nose answers neither
  // "black" nor "brown", and a cocoa nose is brown whatever TYRP1 holds; those
  // loci act on every TYRP1 candidate alike, so either answer then keeps none.
  const noses = new Map<string, Set<string>>();
  for (const genotype of candidateGenotypes(resolution)) {
    const pair = genotype.TYRP1;
    if (pair !== undefined) {
      const key = formatPair(pair);
      noses.set(key, (noses.get(key) ?? new Set()).add(pigmentPhenotype(genotype).nose));
    }
  }
  const answerOf = (pair: AllelePair<'TYRP1'>): NoseAnswer | null => {
    const [nose, ...others] = noses.get(formatPair(pair)) ?? [];
    return nose !== undefined && others.length === 0 && isNoseAnswer(nose) ? nose : null;
  };

  const options = NOSE_ANSWERS.map((answer) => ({
    answer,
    candidates: locus.candidates.filter((pair) => answerOf(pair) === answer),
  }));
  if (options.some((option) => option.candidates.length === 0)) {
    return [];
  }
  return [{ id: 'nose', gene: 'TYRP1', options }];
}

/** The resolution narrowed by the answers. An answer to a question the dog is not asked is ignored. */
export function applyAnswers(resolution: GenotypeResolution, answers: Answers): GenotypeResolution {
  let narrowed = resolution;
  for (const question of questionsFor(resolution)) {
    const option = question.options.find((candidate) => candidate.answer === answers[question.id]);
    if (option !== undefined) {
      narrowed = { ...narrowed, [question.gene]: { status: 'resolved', candidates: option.candidates } };
    }
  }
  return narrowed;
}
