// Dev-only: reaches every state of the page from the committed fixtures and
// synthetic reports built from them, without real PDFs. Loaded only when
// __FIXTURES__ is true, so the production build carries none of it.
//
//   ?state=<name>        one of STATE_NAMES, as in the approved mockup
//   ?fixtures=<a>,<b>    any two reports from REPORT_NAMES, unanswered

import fixtureA from '../../tests/fixtures/sample-a.json' with { type: 'json' };
import fixtureB from '../../tests/fixtures/sample-b.json' with { type: 'json' };
import fixtureC from '../../tests/fixtures/sample-c.json' with { type: 'json' };
import fixtureD from '../../tests/fixtures/sample-d.json' with { type: 'json' };
import fixtureE from '../../tests/fixtures/sample-e.json' with { type: 'json' };
import { healthRow } from '../../tests/health/rows.ts';
import type { NoseAnswer } from '../genetics/questions.ts';
import { parseReport } from '../report/parse.ts';
import type { Line } from '../report/pdfText.ts';
import type { Report, Sex } from '../report/types.ts';
import type { AppState, SlotState } from './app.ts';
import { DROP_FULL, REJECTIONS, replacementRejected, type Message } from './messages.ts';

const FIXTURES: Readonly<Record<string, { readonly lines: readonly Line[] }>> = {
  a: fixtureA,
  b: fixtureB,
  c: fixtureC,
  d: fixtureD,
  e: fixtureE,
};

async function sample(letter: string): Promise<Report> {
  const fixture = FIXTURES[letter];
  if (fixture === undefined) {
    throw new Error(`no fixture ${letter}`);
  }
  const result = await parseReport({ lines: fixture.lines, info: { creator: null, producer: null } });
  if (!result.ok) {
    throw new Error(`fixture ${letter} was rejected as ${result.kind}`);
  }
  return result.report;
}

/** A sample with some genes' copies changed, its own name, and no kit ID, so it never reads as a duplicate. */
async function synthetic(letter: string, changes: Partial<Report> & { readonly copies?: Report['colour'] }): Promise<Report> {
  const base = await sample(letter);
  const { copies, ...rest } = changes;
  return { ...base, kitIdHash: null, ...rest, colour: { ...base.colour, ...copies } };
}

const NO_TYRP1 = { basd: 0, bc: 0, bd: 0, be: 0, bh: 0, bs: 0 };

const PRCD = 'Progressive Rod-Cone Degeneration (prcd-PRA)';
const HEMOPHILIA = 'Hemophilia A';
const MITO = 'Sensory Ataxic Neuropathy';

/**
 * A sample with its sex set, carrying an X-linked, a mitochondrial and an
 * unknown-inheritance condition at the given copies: odds that the parents'
 * sexes decide, and odds nothing decides. Its own mitochondrial row is dropped
 * so that the condition appears once.
 */
async function healthCase(letter: string, name: string, sex: Sex | null, [xr, mt, unlisted]: readonly [number, number, number]): Promise<Report> {
  const base = await sample(letter);
  return synthetic(letter, {
    name,
    sex,
    health: [
      ...base.health.filter((row) => row.name !== MITO),
      healthRow(HEMOPHILIA, xr, 'XR'),
      healthRow(MITO, mt, 'MT'),
      healthRow('Unlisted Condition', unlisted, null),
    ],
  });
}

/** Reports by short name: the five samples and the synthetic cases the samples lack. */
const REPORTS: Readonly<Record<string, () => Promise<Report>>> = {
  a: () => sample('a'),
  b: () => sample('b'),
  c: () => sample('c'),
  d: () => sample('d'),
  e: () => sample('e'),
  // The nose question: TYRP1 bd 1 + bc 1 (b/b or B/b).
  q: () => synthetic('a', { name: 'Sample Q', copies: { TYRP1: { ...NO_TYRP1, bc: 1, bd: 1 } } }),
  // ASIP ay 1 + at 1: ay/at or ayt/aw, which no question settles.
  x: () => synthetic('b', { name: 'Sample X', copies: { ASIP: { ay: 1, a: 0, at: 1 } } }),
  // TYRP1 missing from the report.
  m: async () => {
    const base = await synthetic('b', { name: 'Sample M' });
    const { TYRP1: _missing, ...colour } = base.colour;
    return { ...base, colour, missingLoci: ['TYRP1'] };
  },
  // Black merle, dilute carriers with a bobtail, carrying the same recessive
  // condition: the warning panel, and the health section's sub-rows and lists.
  w: async () =>
    synthetic('b', {
      name: 'Sample W',
      shortTail: 1,
      health: [
        ...(await sample('b')).health,
        healthRow(PRCD, 1, 'AR', { knownInBreed: true }),
        healthRow(HEMOPHILIA, 1, 'XR'),
        healthRow('Primary Lens Luxation', 0, 'AR'),
      ],
      copies: { TYRP1: NO_TYRP1, PMEL: { M: 1 }, MLPH: { d1: 1, d2: 0, d3: 0 }, MITF: { sp: 0 } },
    }),
  v: async () =>
    synthetic('a', {
      name: 'Sample V',
      shortTail: 1,
      health: [...(await sample('a')).health, healthRow(PRCD, 1, 'AR', { knownInBreed: true }), healthRow(HEMOPHILIA, 0, 'XR')],
      copies: { TYRP1: NO_TYRP1, PMEL: { M: 1 }, MLPH: { d1: 1, d2: 0, d3: 0 }, MITF: { sp: 0 }, MC1R: { Em: 0, e1: 0, e2: 0, e3: 0, eH: 0, eA: 0, eG: 0 } },
    }),
  // Two females: the X-linked and mitochondrial odds are unknown.
  h: () => healthCase('a', 'Sample H', 'female', [1, 1, 1]),
  k: () => healthCase('b', 'Sample K', 'female', [2, 0, 1]),
  // Sample H's and Sample K's health with the sex unread: n with h infers one
  // sex, u with n has neither, and its X-linked chance is a range.
  u: () => healthCase('a', 'Sample U', null, [1, 1, 1]),
  n: () => healthCase('b', 'Sample N', null, [2, 0, 1]),
};

export const REPORT_NAMES = Object.keys(REPORTS);

const empty = (error: Message | null = null): SlotState => ({ kind: 'empty', error });

async function card(name: string, nose?: NoseAnswer, alert: Message | null = null): Promise<SlotState> {
  const build = REPORTS[name];
  if (build === undefined) {
    throw new Error(`no report ${name}; choose from ${REPORT_NAMES.join(', ')}`);
  }
  return { kind: 'loaded', report: await build(), nose, replacing: false, alert };
}

async function slots(first: Promise<SlotState> | SlotState, second: Promise<SlotState> | SlotState, pageAlert: string | null = null): Promise<AppState> {
  return { slots: [await first, await second], pageAlert };
}

/** The approved mockup's states, by its names. */
const STATES: Readonly<Record<string, () => Promise<AppState>>> = {
  'slot-empty': () => slots(empty(), empty()),
  'results-hidden': () => slots(card('q', 'brown'), empty()),
  'slot-reading': () => slots(card('q', 'brown'), { kind: 'reading', fileName: 'wisdom-report.pdf' }),
  'slot-error': () => slots(card('q', 'brown'), empty(REJECTIONS['adobe-pdf-printer'])),
  'slot-loaded': () => slots(card('q', 'brown'), card('b')),
  'slot-questions': () => slots(card('q'), card('b')),
  'slot-unanswerable': () => slots(card('x'), card('b')),
  'slot-replace-error': () => slots(card('q', 'brown', replacementRejected(REJECTIONS['not-wisdom-dog'])), card('b')),
  'page-drop-error': () => slots(card('q', 'brown'), card('b'), DROP_FULL),
  'slot-missing': () => slots(card('q', 'brown'), card('m')),
  'pair-duplicate': () => slots(card('a'), card('a')),
  'results-populated': () => slots(card('q', 'brown'), card('b')),
  'results-ranges': () => slots(card('q'), card('b')),
  'results-warnings': () => slots(card('w'), card('v')),
  'results-partial': () => slots(card('q', 'brown'), card('m')),
  'results-health-unknown': () => slots(card('h'), card('k')),
};

export const STATE_NAMES = Object.keys(STATES);

export async function stateFromQuery(params: URLSearchParams): Promise<AppState> {
  const state = params.get('state');
  if (state !== null) {
    const build = STATES[state];
    if (build === undefined) {
      throw new Error(`no state ${state}; choose from ${STATE_NAMES.join(', ')}`);
    }
    return build();
  }
  const [first = 'a', second = 'b'] = (params.get('fixtures') ?? '').split(',');
  return slots(card(first), card(second));
}
