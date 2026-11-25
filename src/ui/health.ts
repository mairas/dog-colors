// The health section below the colour results, and the health entries in the
// warning panel above them. Genetic odds only; condition names come from the
// reports and go in as text.

import type { Fraction, Range } from '../health/fraction.ts';
import type { Condition, ConditionRow, HealthAnalysis, HealthWarning, PuppyOdds, UnknownReason } from '../health/health.ts';
import type { Inheritance } from '../report/types.ts';
import { h, type Child } from './dom.ts';
import { chance, exactChance, odds } from './format.ts';
import { copiesText, parentLabel } from './names.ts';
import type { PanelItem } from './results.ts';

const INHERITANCE: Readonly<Record<Inheritance, string>> = {
  AR: 'Recessive: two copies needed',
  AD: 'Dominant: one copy raises the risk',
  XR: 'X-linked recessive: sons need one copy, daughters two',
  XD: 'X-linked dominant: one copy raises the risk',
  MT: 'Mitochondrial: passed on by the dam only',
};

const UNKNOWN_REASONS: Readonly<Record<UnknownReason, string>> = {
  'inheritance-unknown': "This condition's inheritance isn't known, so the odds can't be worked out.",
  'inheritance-conflict': 'The two reports give different inheritance, so the odds are unknown.',
  'same-sex-parents': 'Both reports give the same sex, so the odds are unknown.',
  'sex-unknown': "Neither report's sex could be read, so the odds are unknown.",
};

const ASSUMED_PAIRING = 'Assuming a female × male pairing.';
const NO_CARRIER_STATE = '–';

const inheritanceText = (mode: Inheritance | null): string => (mode === null ? 'Inheritance not known' : INHERITANCE[mode]);

const isRange = (value: Fraction | Range): value is Range => 'min' in value;

function figures(odds: PuppyOdds): HTMLElement[] {
  return [
    h('td', { class: 'v' }, exactChance(odds.atRisk)),
    h('td', { class: 'v' }, odds.carrier === null ? NO_CARRIER_STATE : exactChance(odds.carrier)),
  ];
}

function conditionRows(row: ConditionRow): HTMLElement[] {
  const notes: string[] = [];
  if (row.odds.kind === 'unknown') {
    notes.push(UNKNOWN_REASONS[row.odds.reason]);
  }
  if (row.sexInferred) {
    notes.push(ASSUMED_PAIRING);
  }
  const label = h(
    'th',
    { scope: 'row' },
    h('b', {}, row.name),
    row.knownInBreed ? ' ' : null,
    row.knownInBreed ? h('span', { class: 'pill' }, 'known in the breed') : null,
    h('br'),
    h('span', { class: 'sec' }, inheritanceText(row.inheritance)),
    ...notes.flatMap((note): Child[] => [h('br'), h('span', { class: 'sec' }, note)]),
  );
  switch (row.odds.kind) {
    case 'puppies':
      return [h('tr', {}, label, ...figures(row.odds.puppies))];
    case 'unknown':
      return [h('tr', {}, label, h('td', { class: 'v' }, 'unknown'), h('td', { class: 'v' }))];
    case 'by-sex':
      return [
        h('tr', { class: 'parent-row' }, label, h('td', { class: 'v' }), h('td', { class: 'v' })),
        h('tr', { class: 'sub' }, h('th', { scope: 'row' }, 'Sons'), ...figures(row.odds.sons)),
        h('tr', { class: 'sub' }, h('th', { scope: 'row' }, 'Daughters'), ...figures(row.odds.daughters)),
      ];
  }
}

export function renderHealth(analysis: HealthAnalysis): HTMLElement {
  const clear = analysis.clearInBoth.length;
  const table =
    analysis.rows.length === 0
      ? null
      : h(
          'table',
          { class: 't ht' },
          h('caption', { class: 'vh' }, 'Puppy odds for conditions not clear in both parents'),
          h(
            'thead',
            {},
            h(
              'tr',
              {},
              h('th', { class: 'sec', scope: 'col' }, 'Condition'),
              h('th', { class: 'sec v', scope: 'col' }, 'At risk'),
              h('th', { class: 'sec v', scope: 'col' }, 'Carrier'),
            ),
          ),
          h('tbody', {}, ...analysis.rows.flatMap(conditionRows)),
        );
  const oneParent =
    analysis.oneParentOnly.length === 0
      ? []
      : [
          h('h3', { class: 'minor' }, 'Tested in one parent only'),
          h(
            'ul',
            { class: 'sec one-parent' },
            ...analysis.oneParentOnly.map((condition) =>
              h('li', {}, `${condition.name}: tested in ${parentLabel(condition.parent)} only: ${condition.tested.result}`),
            ),
          ),
        ];
  return h(
    'section',
    { class: 'health', 'aria-labelledby': 'health-h' },
    h('h2', { id: 'health-h' }, 'Health'),
    h('p', { class: 'sec' }, 'Genetic odds for the conditions both reports test. Not medical advice.'),
    table,
    ...oneParent,
    h('p', { class: 'sec clear' }, `Clear in both parents: ${clear} other ${clear === 1 ? 'condition' : 'conditions'}.`),
  );
}

/** Why the condition's row gives no odds, or null when it gives them. */
function unknownReason(analysis: HealthAnalysis, condition: Condition): UnknownReason | null {
  const row = analysis.rows.find(
    (candidate) => candidate.name === condition.name && candidate.gene === condition.gene && candidate.variant === condition.variant,
  );
  return row?.odds.kind === 'unknown' ? row.odds.reason : null;
}

function daughtersText(chanceIsRange: boolean, reason: UnknownReason | null): string {
  if (reason !== 'sex-unknown') {
    return 'The dam carries this X-linked recessive variant and the sire has it, so daughters can be affected.';
  }
  const either = chanceIsRange ? 'the range covers both.' : 'the figure is the same either way.';
  return `Both parents carry this X-linked recessive variant, so daughters can be affected. Neither report's sex could be read, so either parent may be the dam; ${either}`;
}

function healthWarning(warning: HealthWarning, analysis: HealthAnalysis): PanelItem {
  switch (warning.kind) {
    case 'affected-puppies': {
      const figure = isRange(warning.chance) ? chance(warning.chance) : exactChance(warning.chance);
      const daughters = warning.among === 'daughters';
      const text = daughters
        ? daughtersText(isRange(warning.chance), unknownReason(analysis, warning.condition))
        : 'Both parents carry this recessive variant, so puppies that inherit a copy from each are affected.';
      return {
        title: `${warning.condition.name}: ${figure}${daughters ? ' of daughters' : ''}`,
        text: `${text}${warning.sexInferred ? ` ${ASSUMED_PAIRING}` : ''}`,
      };
    }
    case 'inheritance-unknown':
      return {
        title: `${warning.condition.name}: inheritance unknown`,
        text: 'Both parents carry this variant, and how it is inherited is not known, so some puppies may be affected.',
      };
    case 'bobtail': {
      const twoCopies = warning.twoCopyParents.map(
        (parent) => ` ${parentLabel(parent)}'s report shows ${copiesText(2)}, which is unexpected in a live dog.`,
      );
      const share = odds(warning.embryosTT);
      const embryos = share === 'all' ? 'Every embryo gets' : `About ${share} embryos get`;
      return {
        title: 'Bobtail × bobtail',
        text: `Both parents carry the short-tail variant. ${embryos} two copies (T/T), which is not viable, so litters may be smaller.${twoCopies.join('')}`,
      };
    }
  }
}

export function healthWarnings(analysis: HealthAnalysis): PanelItem[] {
  return analysis.warnings.map((warning) => healthWarning(warning, analysis));
}
