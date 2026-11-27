// Dev-only: reaches every state of the page from the committed fixtures and
// synthetic reports built from them, without real PDFs. Loaded only when
// __FIXTURES__ is true, so the production build carries none of it.
//
//   ?state=<name>        one of STATE_NAMES, as in the approved mockups
//   ?fixtures=<a>,<b>    any two reports from REPORT_NAMES, saved and chosen, unanswered
//   &note=hidden         either of them with the breeding note dismissed
//
// The saved dogs go into an in-memory storage through the store, with the
// reports' short names as IDs, so a state never touches window.localStorage.

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
import { READER_VERSION } from '../report/version.ts';
import { openSavedDogs, SAVED_DOGS_KEY } from '../saved/store.ts';
import { EMPTY_SLOT, NOTE_HIDDEN_KEY, type AppOptions, type AppState, type NoteStorage, type SlotState } from './app.ts';
import { DROP_FULL, REJECTIONS, sameDogNotice, type Message } from './messages.ts';

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

/** What a fixture state starts the page with, besides its storage. */
export interface FixtureStart {
  readonly initial: AppState;
  readonly predictPuppies?: NonNullable<AppOptions['predictPuppies']>;
}

/** Saves reports into the storage through the store, each with its short name as its ID. */
interface Seeder {
  save(name: string, nose?: NoseAnswer): Promise<string>;
  /** Rewrites a saved dog's stored entry, as an older page or a damaged storage would leave it. */
  alter(id: string, change: (entry: Record<string, unknown>) => Record<string, unknown>): void;
}

function seeder(storage: NoteStorage): Seeder {
  let nextId = '';
  const store = openSavedDogs({ storage: () => storage, newId: () => nextId, locale: 'en' });
  return {
    async save(name, nose) {
      const build = REPORTS[name];
      if (build === undefined) {
        throw new Error(`no report ${name}; choose from ${REPORT_NAMES.join(', ')}`);
      }
      // A report without a kit ID saved twice is two dogs, so the second takes another ID.
      nextId = store.dog(name) === undefined ? name : `${name}-2`;
      const { outcome } = store.add(await build());
      if (nose !== undefined) {
        store.setNose(outcome.id, nose);
      }
      return outcome.id;
    },
    alter(id, change) {
      const stored = JSON.parse(storage.getItem(SAVED_DOGS_KEY) ?? '{"dogs":[]}') as { dogs: Record<string, unknown>[] };
      stored.dogs = stored.dogs.map((entry) => (entry['id'] === id ? change(entry) : entry));
      storage.setItem(SAVED_DOGS_KEY, JSON.stringify(stored));
    },
  };
}

/** Read by the reader version before this one: a stale dog. */
const stale = (entry: Record<string, unknown>): Record<string, unknown> => ({ ...entry, readerVersion: READER_VERSION - 1 });
/** A Short Tail count no report has: an unusable dog that still shows its name and sex. */
const unusable = (entry: Record<string, unknown>): Record<string, unknown> => ({
  ...entry,
  report: { ...(entry['report'] as Record<string, unknown>), shortTail: 1.5 },
});

const slot = (chosen: string | null = null, changes: Partial<SlotState> = {}): SlotState => ({ ...EMPTY_SLOT, chosen, ...changes });
const warning = (message: Message): Partial<SlotState> => ({ notice: { tone: 'warning', message } });
const sameDog: Partial<SlotState> = { notice: { tone: 'info', message: sameDogNotice('Sample A', 'Parent 1') } };
const start = (first: SlotState, second: SlotState, pageAlert: string | null = null): FixtureStart => ({
  initial: { slots: [first, second], pageAlert },
});

/** Four dogs: two males (A, C) and two females (B, D). */
async function four(seed: Seeder): Promise<void> {
  for (const name of ['a', 'b', 'c', 'd']) {
    await seed.save(name);
  }
}

/** Every report: fourteen dogs, enough for the filter field. */
async function every(seed: Seeder): Promise<void> {
  for (const name of REPORT_NAMES) {
    await seed.save(name);
  }
}

/** The approved mockups' states, by their names. */
const STATES: Readonly<Record<string, (seed: Seeder) => Promise<FixtureStart>>> = {
  'slot-empty': async () => start(slot(), slot()),
  'results-hidden': async (seed) => start(slot(await seed.save('q', 'brown')), slot()),
  'slot-reading': async (seed) => start(slot(await seed.save('q', 'brown')), slot(null, { reading: 'wisdom-report.pdf' })),
  'slot-error': async (seed) => start(slot(await seed.save('q', 'brown')), slot(null, warning(REJECTIONS['adobe-pdf-printer']))),
  'slot-loaded': async (seed) => start(slot(await seed.save('q', 'brown')), slot(await seed.save('b'))),
  'slot-questions': async (seed) => start(slot(await seed.save('q')), slot(await seed.save('b'))),
  'slot-unanswerable': async (seed) => start(slot(await seed.save('x')), slot(await seed.save('b'))),
  'page-drop-error': async (seed) => start(slot(await seed.save('q', 'brown')), slot(await seed.save('b')), DROP_FULL),
  'slot-missing': async (seed) => start(slot(await seed.save('q', 'brown')), slot(await seed.save('m'))),
  'list-none-chosen': async (seed) => {
    await four(seed);
    return start(slot(), slot());
  },
  'list-chosen': async (seed) => {
    await four(seed);
    return start(slot('a'), slot());
  },
  'list-narrowed': async (seed) => {
    await four(seed);
    return start(slot(), slot('b'));
  },
  'list-all-shown': async (seed) => {
    await four(seed);
    return start(slot('a'), slot(null, { showAll: true }));
  },
  'list-no-match': async (seed) => {
    await every(seed);
    return start(slot('a'), slot(null, { filter: 'zz' }));
  },
  'list-many': async (seed) => {
    await every(seed);
    return start(slot('x'), slot());
  },
  'list-reading': async (seed) => {
    await four(seed);
    return start(slot('a', { reading: 'wisdom-report.pdf' }), slot());
  },
  'list-rejected': async (seed) => {
    await four(seed);
    return start(slot('a', warning(REJECTIONS['not-wisdom-dog'])), slot());
  },
  'list-same-dog': async (seed) => {
    await four(seed);
    return start(slot('a'), slot(null, sameDog));
  },
  'open-same-dog': async (seed) => start(slot(await seed.save('a')), slot(null, sameDog)),
  'list-stale': async (seed) => {
    await four(seed);
    seed.alter('b', stale);
    seed.alter('c', unusable);
    return start(slot(), slot());
  },
  'stale-chosen': async (seed) => {
    await four(seed);
    seed.alter('b', stale);
    return start(slot('a'), slot('b'));
  },
  'results-populated': async (seed) => start(slot(await seed.save('q', 'brown')), slot(await seed.save('b'))),
  'results-ranges': async (seed) => start(slot(await seed.save('q')), slot(await seed.save('b'))),
  'results-warnings': async (seed) => start(slot(await seed.save('w')), slot(await seed.save('v'))),
  'results-partial': async (seed) => start(slot(await seed.save('q', 'brown')), slot(await seed.save('m'))),
  'results-health-unknown': async (seed) => start(slot(await seed.save('h')), slot(await seed.save('k'))),
  'results-failed': async (seed) => {
    await four(seed);
    return {
      ...start(slot('a'), slot('b')),
      // Stored data that passes the check never makes the genetics throw, so the failure is staged.
      predictPuppies: () => {
        throw new Error('the genetics reject this pair');
      },
    };
  },
};

export const STATE_NAMES = Object.keys(STATES);

/** Saves the state's dogs into the storage and returns what the page starts with. */
export async function stateFromQuery(params: URLSearchParams, storage: NoteStorage): Promise<FixtureStart> {
  const seed = seeder(storage);
  const state = params.get('state');
  if (state !== null) {
    const build = STATES[state];
    if (build === undefined) {
      throw new Error(`no state ${state}; choose from ${STATE_NAMES.join(', ')}`);
    }
    return build(seed);
  }
  const [first = 'a', second = 'b'] = (params.get('fixtures') ?? '').split(',');
  const firstId = await seed.save(first);
  const secondId = await seed.save(second);
  // The same report twice is one saved dog, which only one slot can hold.
  return start(slot(firstId), slot(secondId === firstId ? null : secondId));
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * A fixture state's storage: in memory, so its dogs and a dismissal of the
 * breeding note on the dev origin never reach other states, with the note
 * dismissed from the start with note=hidden.
 */
function storageFromQuery(params: URLSearchParams): NoteStorage {
  const items = new Map<string, string>();
  if (params.get('note') === 'hidden') {
    items.set(NOTE_HIDDEN_KEY, String(Date.now() + DAY_MS));
  }
  return {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => {
      items.set(key, value);
    },
    removeItem: (key) => {
      items.delete(key);
    },
  };
}

/** What a fixture URL starts the app with: its slots, its storage and any staged failure. */
export async function fixtureOptions(params: URLSearchParams): Promise<Pick<AppOptions, 'initial' | 'storage' | 'predictPuppies'>> {
  const storage = storageFromQuery(params);
  return { storage, ...(await stateFromQuery(params, storage)) };
}
