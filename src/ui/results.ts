// The puppy results for a pairing: warnings first, then the most likely
// combined outcomes, the distribution tables, the yes/no traits, hidden and
// carried alleles, and every caveat collected at the end.

import { HIDDEN_EFFECTS, HIDER_LABELS } from '../genetics/hidden.ts';
import { FLAG_INFO, FLAGS, ownColourName, type BaseColour, type Flag, type Phenotype, type Unknown } from '../genetics/phenotype.ts';
import type { PuppyPrediction, Row, Table, TraitRow, UndocumentedLocus } from '../genetics/results.ts';
import { caveatText, COLOUR_WARNING_TEXT, type CaveatId, type ColourWarning } from '../genetics/warnings.ts';
import { h, present, svg, type Child } from './dom.ts';
import { chance, chanceParts } from './format.ts';
import {
  BASE_NAMES,
  copiesText,
  lowerFirst,
  parentLabel,
  PATTERN_NAMES,
  taggedFlags,
  TRAIT_NAMES,
  unknownLociText,
  WHITE_NAMES,
} from './names.ts';

export interface PanelItem {
  readonly title: string;
  readonly text: string;
}

export interface ResultsInput {
  readonly names: readonly [string, string];
  readonly prediction: PuppyPrediction;
  /** Whether a parent card still has an unanswered question. */
  readonly openQuestion: boolean;
  /** Extra panel warnings, from the health section. */
  readonly healthWarnings?: readonly PanelItem[];
  /** Sections inserted before the caveats, such as health. */
  readonly sections?: readonly Node[];
}

const UNDOCUMENTED: Flag = 'undocumented-haplotype';

const isFlag = (id: CaveatId): id is Flag => (FLAGS as readonly string[]).includes(id);

/** "Undocumented combination (TYRP1 in Parent 1's report)": the caveat that names its genes. */
function undocumentedLabel(loci: readonly UndocumentedLocus[]): string {
  const where = loci.map((locus) => `${locus.gene} in ${parentLabel(locus.parent)}'s report`).join(', ');
  return `Undocumented combination (${where})`;
}

/** A badge that expands its caveats inline; collected again at the bottom of the results. */
function caveatBadge(key: string, caveats: readonly CaveatId[], undocumented: readonly UndocumentedLocus[] = []): Child[] {
  const texts = [
    ...caveats.map(caveatText),
    ...(undocumented.length > 0 ? [`${undocumentedLabel(undocumented)}: ${caveatText(UNDOCUMENTED)}`] : []),
  ];
  if (texts.length === 0) {
    return [];
  }
  const id = `cav-${key}`;
  const text = h('span', { class: 'cavtext', id, hidden: true }, texts.join(' '));
  const button = h('button', { type: 'button', class: 'cav', 'aria-expanded': 'false', 'aria-controls': id, 'data-key': id }, 'caveat');
  button.addEventListener('click', () => {
    text.hidden = !text.hidden;
    button.setAttribute('aria-expanded', String(!text.hidden));
  });
  return [button, text];
}

/** Row-level flags as one muted tag after the name: " · possible saddle, low confidence". */
export function flagTags(flags: readonly Flag[], relabel: Readonly<Partial<Record<Flag, string>>> = {}): Child {
  const labels = [...new Set(taggedFlags(flags).map((flag) => relabel[flag] ?? FLAG_INFO[flag].label))];
  return labels.length === 0 ? null : h('span', { class: 'tag' }, labels.map((label) => ` · ${label}`).join(''));
}

function chanceTable(caption: Child[], firstColumn: string, rows: readonly HTMLElement[]): HTMLTableElement {
  return h(
    'table',
    { class: 't' },
    h('caption', {}, ...caption),
    h(
      'thead',
      {},
      h('tr', {}, h('th', { class: 'sec', scope: 'col' }, firstColumn), h('th', { class: 'sec v', scope: 'col' }, 'Chance per puppy')),
    ),
    h('tbody', {}, ...rows),
  );
}

function chanceRow(label: Child[], row: Pick<Row<unknown>, 'chance'>): HTMLElement {
  return h('tr', {}, h('td', {}, ...label), h('td', { class: 'v' }, chance(row.chance)));
}

function outcomeTable<V extends string>(key: string, title: string, table: Table<V>, label: (value: V) => Child[]): HTMLTableElement {
  const rows = table.rows.map((row) => {
    const pill = row.copies === null ? null : h('span', { class: 'pill' }, copiesText(row.copies));
    const name: Child[] = row.value === 'unknown' ? [`Unknown: ${unknownLociText(table.unknown)}`] : label(row.value);
    return chanceRow([pill, pill ? ' ' : null, ...name, flagTags(row.flags)], row);
  });
  return chanceTable([title, ...caveatBadge(key, table.caveats, table.undocumented)], 'Outcome', rows);
}

function traitTable(rows: readonly TraitRow[]): HTMLTableElement {
  // A harlequin puppy is also merle, so the merle figure counts it too.
  const withHarlequin = rows.some((row) => row.value === 'harlequin');
  const traitName = (trait: TraitRow['value']): string =>
    trait === 'merle' && withHarlequin ? `${TRAIT_NAMES.merle} (includes harlequin)` : TRAIT_NAMES[trait];
  return chanceTable(
    ['Chance of each trait'],
    'Trait',
    rows.map((row) =>
      chanceRow(
        [
          row.copies === null ? null : h('span', { class: 'pill' }, copiesText(row.copies)),
          row.copies === null ? null : ' ',
          traitName(row.value),
          flagTags(row.flags),
          ...caveatBadge(`trait-${row.value}`, row.caveats),
        ],
        row,
      ),
    ),
  );
}

function hiddenTable(prediction: PuppyPrediction): HTMLTableElement {
  return chanceTable(
    ['Hidden and carried'],
    'Trait',
    prediction.hidden.map((row) => {
      const effect = HIDDEN_EFFECTS[row.id] + (row.hider === null ? '' : `, ${HIDER_LABELS[row.hider]}`);
      const only = row.onlyIn === null ? '' : ` (all ${lowerFirst(BASE_NAMES[row.onlyIn])} puppies)`;
      return chanceRow([effect + only, h('br'), h('span', { class: 'sec' }, row.genotypes.join(', '))], row);
    }),
  );
}

const COAT_SHAPES = {
  limitedWhite: 'M0 120 L0 92 Q30 78 52 96 Q74 80 100 94 L160 120Z',
  patch: 'M10 8 Q40 0 64 14 Q70 40 42 46 Q14 44 10 8Z',
};

/** A coat chip: the base colour with its white pattern. Its label is the outcome's name beside it. */
function coatChip(phenotype: Phenotype): SVGSVGElement {
  const coat = `coat coat-${phenotype.base satisfies BaseColour | Unknown}`;
  const frame = (...shapes: SVGElement[]) =>
    svg('svg', { viewBox: '0 0 160 120', 'aria-hidden': 'true', focusable: 'false' }, ...shapes);
  const rect = (className: string) => svg('rect', { width: '160', height: '120', class: className });
  if (phenotype.traits.doubleMerle === 'yes') {
    return frame(
      rect('coat-white'),
      svg('circle', { cx: '46', cy: '38', r: '16', class: 'coat-merle' }),
      svg('circle', { cx: '56', cy: '42', r: '7', class: coat }),
    );
  }
  if (phenotype.traits.merle === 'yes') {
    return frame(
      rect('coat-merle'),
      svg('circle', { cx: '40', cy: '40', r: '22', class: coat }),
      svg('circle', { cx: '110', cy: '76', r: '28', class: coat }),
      svg('circle', { cx: '124', cy: '22', r: '12', class: coat }),
    );
  }
  if (phenotype.white === 'extensive') {
    return frame(
      rect('coat-white'),
      svg('path', { d: COAT_SHAPES.patch, class: coat }),
      svg('circle', { cx: '118', cy: '70', r: '20', class: coat }),
      svg('circle', { cx: '62', cy: '96', r: '9', class: coat }),
    );
  }
  if (phenotype.white === 'limited') {
    return frame(
      rect(coat),
      svg('path', { d: COAT_SHAPES.limitedWhite, class: 'coat-white' }),
      svg('ellipse', { cx: '80', cy: '30', rx: '7', ry: '16', class: 'coat-white' }),
    );
  }
  return frame(rect(coat));
}

function combinedOutcomes(prediction: PuppyPrediction): Child[] {
  const { outcomes, other } = prediction.combined;
  const chips = outcomes.map((outcome) => {
    const parts = chanceParts(outcome.chance);
    return h(
      'li',
      { class: 'out' },
      coatChip(outcome.phenotype),
      h('span', { class: 'p' }, parts.figure),
      parts.odds === null ? null : h('span', { class: 'sec' }, parts.odds),
      h('span', { class: 'n' }, ownColourName(outcome.phenotype), flagTags(outcome.phenotype.flags)),
    );
  });
  return [
    h('h3', { class: 'sub' }, 'Most likely puppies'),
    h('ul', { class: 'chips' }, ...chips),
    other === null ? null : h('p', { class: 'sec' }, `Other outcomes: ${chance(other)}`),
  ];
}

function warningPanel(items: readonly PanelItem[]): HTMLElement | null {
  if (items.length === 0) {
    return null;
  }
  return h(
    'div',
    { class: 'warnings' },
    ...items.map((item) =>
      h(
        'p',
        { class: 'err' },
        h('span', { 'aria-hidden': 'true', class: 'icon' }, '⚠'),
        h('span', {}, h('b', {}, `${item.title}.`), ` ${item.text}`),
      ),
    ),
  );
}

function colourWarning(warning: ColourWarning): PanelItem {
  const text = COLOUR_WARNING_TEXT[warning.kind];
  const figure = 'chance' in warning ? chance(warning.chance) : unknownLociText(warning.unknown);
  return { title: `${text.title}: ${figure}`, text: text.text };
}

function caveatList(prediction: PuppyPrediction): HTMLElement {
  const context = new Map<CaveatId, string>();
  const note = (id: CaveatId, where: string) => {
    if (!context.has(id)) {
      context.set(id, where);
    }
  };
  prediction.pattern.caveats.forEach((id) => note(id, 'Colour pattern'));
  prediction.white.caveats.forEach((id) => note(id, 'White spotting'));
  prediction.traits.possible.forEach((row) => row.caveats.forEach((id) => note(id, TRAIT_NAMES[row.value])));
  if (prediction.undocumentedLoci.length > 0) {
    note(UNDOCUMENTED, undocumentedLabel(prediction.undocumentedLoci));
  }
  const ids = [...prediction.caveats, ...(prediction.undocumentedLoci.length > 0 ? [UNDOCUMENTED] : [])];
  const items = [...new Set(ids)].map((id) => {
    const where = context.get(id) ?? (isFlag(id) ? `“${FLAG_INFO[id].label}”` : null);
    return h('li', {}, where === null ? caveatText(id) : `${where}: ${caveatText(id)}`);
  });
  return h(
    'section',
    { class: 'caveats', 'aria-labelledby': 'caveats-h' },
    h('h3', { id: 'caveats-h' }, 'Caveats'),
    h('ul', { class: 'sec' }, ...items, h('li', {}, 'Percentages are rounded and may not add up to exactly 100.')),
  );
}

function notes(input: ResultsInput): Child[] {
  const { prediction } = input;
  const result: Child[] = [];
  if (prediction.hasRanges) {
    result.push(
      h(
        'p',
        { class: 'note' },
        input.openQuestion
          ? "Some figures are ranges because a parent's genotype is uncertain. Answer the questions on the cards to narrow them."
          : "Some figures are ranges because the report can't settle a parent's genotype.",
      ),
    );
  }
  if (prediction.unknownLoci.length > 0) {
    result.push(
      h('p', { class: 'note' }, `${unknownLociText(prediction.unknownLoci)}, so the figures that depend on it show as unknown.`),
    );
  }
  return result;
}

function traitLines(prediction: PuppyPrediction): Child[] {
  const { notPossible, cannotPredict } = prediction.traits;
  const groups = new Map<string, string[]>();
  for (const { trait, unknown } of cannotPredict) {
    const why = unknownLociText(unknown);
    groups.set(why, [...(groups.get(why) ?? []), lowerFirst(TRAIT_NAMES[trait])]);
  }
  return [
    notPossible.length === 0
      ? null
      : h(
          'p',
          { class: 'line' },
          h('b', {}, 'Not possible with this pairing:'),
          ` ${notPossible.map((trait) => lowerFirst(TRAIT_NAMES[trait])).join(', ')}.`,
        ),
    ...[...groups].map(([why, traits]) =>
      h('p', { class: 'line' }, h('b', {}, `Can't predict (${why}):`), ` ${traits.join(', ')}.`),
    ),
  ];
}

/** The results section's content. */
export function renderResults(input: ResultsInput): (Node | string)[] {
  const { prediction, names } = input;
  return present([
    h('h2', { id: 'results-h', tabindex: '-1' }, `Puppy colours: ${names[0]} × ${names[1]}`),
    h('p', { class: 'sec' }, 'Odds for each puppy, not the make-up of a litter.'),
    warningPanel([...prediction.warnings.map(colourWarning), ...(input.healthWarnings ?? [])]),
    ...notes(input),
    ...combinedOutcomes(prediction),
    h(
      'div',
      { class: 'traits' },
      outcomeTable('base', 'Base colour', prediction.base, (value) => [BASE_NAMES[value]]),
      outcomeTable('pattern', 'Colour pattern', prediction.pattern, (value) => {
        const name = PATTERN_NAMES[value];
        return [name.name, ...(name.detail === undefined ? [] : [h('br'), h('span', { class: 'sec' }, name.detail)])];
      }),
      outcomeTable('white', 'White spotting', prediction.white, (value) => [WHITE_NAMES[value]]),
      prediction.traits.possible.length > 0 ? traitTable(prediction.traits.possible) : null,
      prediction.hidden.length > 0 ? hiddenTable(prediction) : null,
    ),
    ...traitLines(prediction),
    ...(input.sections ?? []),
    caveatList(prediction),
  ]);
}
