// A chosen dog's card, under its slot's list: who the report says the dog is,
// its colour genotype as read, its predicted own colour, and the question that
// can settle it.

import type { AllelePair } from '../genetics/alleles.ts';
import type { OwnColour, ResolvedDog } from '../genetics/dog.ts';
import { pairEffect } from '../genetics/effects.ts';
import { OWN_COLOUR_LIMITS } from '../genetics/warnings.ts';
import { FLAG_INFO, mergePhenotypes } from '../genetics/phenotype.ts';
import type { NoseAnswer } from '../genetics/questions.ts';
import type { ParentIndex } from '../health/health.ts';
import { COLOUR_GENES, COLOUR_VARIANTS, type ColourGene } from '../report/loci.ts';
import type { Report } from '../report/types.ts';
import { coatChip } from './coat.ts';
import { h, type Child } from './dom.ts';
import { flagTags } from './results.ts';
import { alertBox } from './slots.ts';
import { formatPairs, geneName, GENE_LABELS, lowerFirst, SEX_NAMES } from './names.ts';

export interface CardActions {
  answer(slot: ParentIndex, nose: NoseAnswer | undefined): void;
}

/** What a card shows about one dog. */
export interface CardContent {
  readonly slot: ParentIndex;
  readonly name: string;
  readonly report: Report;
  readonly dog: ResolvedDog;
  readonly nose: NoseAnswer | undefined;
}

type Answer = CardActions['answer'];

/** The coat picture of what the possible own colours share: a part they disagree on is unknown or left out. */
export function ownPicture(colours: readonly OwnColour[]): SVGSVGElement | null {
  const [first, ...others] = colours;
  if (first === undefined) {
    return null;
  }
  const picture = coatChip(others.reduce((shared, colour) => mergePhenotypes(shared, colour.phenotype), first.phenotype));
  picture.classList.add('chip');
  return picture;
}

function pairOf(genotype: OwnColour['genotypes'][number], gene: ColourGene): AllelePair<ColourGene> | undefined {
  return genotype[gene];
}

/** "White with brown markings (b/b) or white with black markings (B/b)" when the genotype is ambiguous. */
export function ownColourText(dog: ResolvedDog): string {
  const [first, ...others] = dog.ownColours;
  if (first === undefined) {
    return 'Unknown';
  }
  if (others.length === 0) {
    return first.name;
  }
  return dog.ownColours
    .map((colour, index) => {
      const pairs = new Set(
        colour.genotypes.map((genotype) =>
          dog.ambiguousLoci.flatMap((gene) => {
            const pair = pairOf(genotype, gene);
            return pair === undefined ? [] : [formatPairs([pair])];
          }).join(', '),
        ),
      );
      const name = index === 0 ? colour.name : lowerFirst(colour.name);
      return `${name} (${[...pairs].join(' or ')})`;
    })
    .join(' or ');
}

function copiesCell(report: Report, gene: ColourGene, missing: boolean): HTMLElement {
  const codes = report.colour[gene] ?? {};
  const pills = COLOUR_VARIANTS.filter((variant) => variant.gene === gene && (codes[variant.code] ?? 0) > 0).map((variant) =>
    h('span', { class: 'pill' }, `${variant.code === '-' ? 'marker' : variant.code} · ${codes[variant.code] ?? 0}`),
  );
  return h('td', {}, ...pills, missing ? h('span', { class: 'flag' }, 'not in report') : null);
}

function readsAs(dog: ResolvedDog, gene: ColourGene, answered: boolean): string {
  const locus = dog.loci[gene];
  if (locus.status === 'missing') {
    return `unknown: ${GENE_LABELS[gene]} can't be predicted`;
  }
  if (locus.status === 'inconsistent') {
    return "unknown: these copies fit no genotype, so it's treated as missing";
  }
  const pairs = formatPairs(locus.candidates);
  if (locus.candidates.length > 1) {
    const asked = dog.questions.some((question) => question.gene === gene);
    return `${pairs}: ${asked ? 'see the question below' : "the report can't tell which"}`;
  }
  const [pair] = locus.candidates;
  const effect = pair === undefined ? '' : pairEffect(gene, pair, dog.ownColours.flatMap((colour) => colour.genotypes));
  const asked = answered && dog.questions.some((question) => question.gene === gene);
  return `${pairs}: ${effect}${asked ? ' (your answer)' : ''}${locus.undocumented ? ' (undocumented combination)' : ''}`;
}

function genotypeTable(input: CardContent): HTMLElement {
  const { report, dog, slot } = input;
  const listed = COLOUR_GENES.filter(
    (gene) =>
      dog.loci[gene].status !== 'resolved' || Object.values(report.colour[gene] ?? {}).some((copies) => copies > 0),
  );
  const others = COLOUR_GENES.filter((gene) => !listed.includes(gene));
  const missingCount = dog.missingLoci.length + dog.inconsistentLoci.length;
  const rows = listed.map((gene) =>
    h(
      'tr',
      {},
      h('th', { scope: 'row' }, gene),
      copiesCell(report, gene, dog.loci[gene].status === 'missing'),
      h('td', {}, readsAs(dog, gene, input.nose !== undefined)),
    ),
  );
  if (others.length > 0) {
    rows.push(
      h('tr', {}, h('th', { scope: 'row' }, 'Others'), h('td', {}, 'none'), h('td', {}, `${others.join(', ')}: no variants`)),
    );
  }
  return h(
    'details',
    { class: 'gd', open: true, 'data-key': `geno-${slot}` },
    h(
      'summary',
      { class: 'sec' },
      'Colour genotype as read',
      missingCount > 0 ? h('span', { class: 'flag' }, ` · ${missingCount === 1 ? '1 locus' : `${missingCount} loci`} missing`) : null,
    ),
    h(
      'table',
      { class: 'geno' },
      h('caption', { class: 'vh' }, `${input.name}: colour genotype as read`),
      h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Gene'), h('th', { scope: 'col' }, 'Report'), h('th', { scope: 'col' }, 'Reads as'))),
      h('tbody', {}, ...rows),
    ),
  );
}

/** "TYRP1 (chocolate) is missing or unreadable in this report", or null when every locus was read. */
function unreadLoci(dog: ResolvedDog): string | null {
  const unknown = [...dog.missingLoci, ...dog.inconsistentLoci.map((locus) => locus.gene)];
  if (unknown.length === 0) {
    return null;
  }
  return `${unknown.map(geneName).join(', ')} ${unknown.length === 1 ? 'is' : 'are'} missing or unreadable in this report`;
}

function mismatchHelp(input: CardContent): HTMLElement {
  const { dog, slot } = input;
  const unread = unreadLoci(dog);
  return h(
    'details',
    { class: 'why', 'data-key': `why-${slot}` },
    h('summary', {}, "Doesn't match your dog?"),
    h(
      'ul',
      {},
      ...OWN_COLOUR_LIMITS.map((limit) => h('li', {}, limit)),
      unread === null ? null : h('li', {}, `${unread}.`),
      dog.undocumentedLoci.length > 0
        ? h('li', {}, `Undocumented combination (${dog.undocumentedLoci.join(', ')}): ${FLAG_INFO['undocumented-haplotype'].caveat}`)
        : null,
      h('li', {}, 'Check that this is the right dog’s report. If it is, the results below may be affected.'),
    ),
  );
}

const NOSE_OPTIONS: readonly { readonly value: NoseAnswer | undefined; readonly label: string; readonly key: string }[] = [
  { value: 'brown', label: 'Brown', key: 'brown' },
  { value: 'black', label: 'Black', key: 'black' },
  { value: undefined, label: 'Not sure', key: 'unsure' },
];

function noseQuestion(input: CardContent, answer: Answer): HTMLElement[] {
  const { slot } = input;
  const radios = NOSE_OPTIONS.map((option) => {
    const radio = h('input', {
      type: 'radio',
      name: `nose-${slot}`,
      value: option.key,
      checked: input.nose === option.value,
      'data-key': `nose-${slot}-${option.key}`,
    });
    radio.addEventListener('change', () => answer(slot, option.value));
    return h('label', { class: 'r' }, radio, ` ${option.label}`);
  });
  return [
    h(
      'fieldset',
      { class: 'question' },
      h('legend', {}, 'Nose and paw pads: black or brown?'),
      ...radios,
      h('p', { class: 'sec hint' }, "The report can't tell whether this dog is brown or a black brown-carrier."),
    ),
    h(
      'p',
      { class: 'print-only' },
      `Nose and paw pads: ${input.nose === undefined ? 'not answered' : `${input.nose} (your answer)`}`,
    ),
  ];
}

function unsettledNotes(dog: ResolvedDog): HTMLElement[] {
  return dog.unsettled.map((gene) => {
    const locus = dog.loci[gene];
    const candidates = locus.status === 'resolved' ? locus.candidates : [];
    const tail = candidates.length > 2 ? 'results show all of them.' : 'results show both.';
    return h('p', { class: 'note' }, `${geneName(gene)} reads as ${formatPairs(candidates)}. The report can't tell which; ${tail}`);
  });
}

function missingNote(dog: ResolvedDog): HTMLElement | null {
  const unread = unreadLoci(dog);
  return unread === null ? null : h('p', { class: 'note' }, `${unread}, so what depends on it shows as unknown.`);
}

/** Everything under the heading: sex and breed, own colour, notes, the nose question and the genotype table. */
function cardDetails(content: CardContent, answer: Answer): Child[] {
  const { report, dog } = content;
  const details = [report.sex === null ? null : SEX_NAMES[report.sex], report.breed].filter((part) => part !== null);
  const flags = dog.ownColours.flatMap((colour) => colour.phenotype.flags);
  return [
    details.length > 0 ? h('p', { class: 'sec meta' }, details.join(' · ')) : null,
    h(
      'div',
      { class: 'own' },
      ownPicture(dog.ownColours),
      h(
        'div',
        {},
        h('span', { class: 'sec' }, 'Predicted own colour'),
        h('br'),
        h('b', { class: 'own-name' }, ownColourText(dog)),
        flagTags(flags, { 'undocumented-haplotype': `${FLAG_INFO['undocumented-haplotype'].label} (${dog.undocumentedLoci.join(', ')})` }),
      ),
    ),
    missingNote(dog),
    mismatchHelp(content),
    ...(dog.questions.length > 0 ? noseQuestion(content, answer) : []),
    ...unsettledNotes(dog),
    genotypeTable(content),
  ];
}

/**
 * A chosen dog's card under its slot's list, without a heading of its own. A
 * stale dog's card opens with a note and `readd`'s button.
 */
export function renderCardBody(content: CardContent, answer: Answer, readd: ((slot: ParentIndex) => void) | null): HTMLElement {
  const { slot } = content;
  let staleNote: HTMLElement | null = null;
  if (readd !== null) {
    staleNote = alertBox({ text: 'Read by an older version of this page.' }, 'stale-note', 'info');
    const again = h('button', { type: 'button', class: 'ghost', 'data-key': `readd-${slot}` }, 'Add the report again');
    again.addEventListener('click', () => readd(slot));
    staleNote.append(again);
  }
  return h('div', { class: 'card-body' }, staleNote, ...cardDetails(content, answer));
}
