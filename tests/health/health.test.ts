import { describe, expect, it } from 'vitest';
import { fraction, ONE, ZERO } from '../../src/health/fraction.ts';
import { analyseHealth, type ConditionRow, type HealthAnalysis, type HealthParent } from '../../src/health/health.ts';
import { parseReport } from '../../src/report/parse.ts';
import type { HealthRow, Inheritance, Report, Sex } from '../../src/report/types.ts';
import { fixtureText } from '../report/fixtures.ts';
import { healthRow } from './rows.ts';

const CDDY = 'Chondrodystrophy (CDDY) and Intervertebral Disc Disease (IVDD) Risk';
const DM = 'Degenerative Myelopathy';
const MT_CONDITION = 'Sensory Ataxic Neuropathy';
const CONFIDENTIAL = ['Amelogenesis Imperfecta (Discovered in the Lancashire Heeler)', 'Hypophosphatasia'];
const VWF = ["von Willebrand's Disease, type 1", "von Willebrand's Disease, type 3 (Discovered in the Kooiker Hound)"];

async function sample(letter: string): Promise<Report> {
  const result = await parseReport(fixtureText(letter));
  if (!result.ok) {
    throw new Error(`fixture ${letter} was rejected as ${result.kind}`);
  }
  return result.report;
}

/** The report as the older format would print it: no Inheritance column. */
function asOlderFormat(report: Report): HealthParent {
  return { ...report, health: report.health.map((row) => ({ ...row, inheritance: null })) };
}

function parent(sex: Sex | null, health: readonly HealthRow[], shortTail: number | null = 0): HealthParent {
  return { sex, shortTail, health };
}

const condition = (inheritance: Inheritance | null, copies: number, extra: Parameters<typeof healthRow>[3] = {}) =>
  healthRow('Test Condition', copies, inheritance, extra);

function onlyRow(analysis: HealthAnalysis): ConditionRow {
  expect(analysis.rows).toHaveLength(1);
  const [row] = analysis.rows;
  if (!row) {
    throw new Error('no row');
  }
  return row;
}

const names = (items: readonly { name: string }[]) => items.map(({ name }) => name);

describe('analyseHealth: samples', () => {
  it('Sample A × Sample B: CDDY at risk in every puppy, DM carriers, the rest clear in both, no warnings', async () => {
    const analysis = analyseHealth(await sample('a'), await sample('b'));
    expect(analysis.rows).toEqual([
      {
        name: CDDY,
        gene: 'FGF4 retrogene',
        variant: 'Insertion',
        inheritance: 'AD',
        knownInBreed: true,
        parents: [
          { copies: 2, result: 'At Risk' },
          { copies: 2, result: 'At Risk' },
        ],
        odds: { kind: 'puppies', puppies: { atRisk: ONE, carrier: null } },
      },
      {
        name: DM,
        gene: 'SOD1',
        variant: 'G>A',
        inheritance: 'AR',
        knownInBreed: false,
        parents: [
          { copies: 0, result: 'Clear' },
          { copies: 1, result: 'Carrier' },
        ],
        odds: { kind: 'puppies', puppies: { atRisk: ZERO, carrier: fraction(1, 2) } },
      },
    ]);
    expect(analysis.clearInBoth).toHaveLength(7);
    expect(analysis.oneParentOnly).toEqual([]);
    expect(analysis.warnings).toEqual([]);
  });

  it('gives the same odds with the parent slots swapped', async () => {
    const a = await sample('a');
    const b = await sample('b');
    const forward = analyseHealth(a, b);
    const swapped = analyseHealth(b, a);
    expect(swapped.rows.map(({ name, odds }) => ({ name, odds }))).toEqual(forward.rows.map(({ name, odds }) => ({ name, odds })));
    expect(swapped.clearInBoth).toEqual(forward.clearInBoth);
  });

  it('Sample A × Sample C: the MT condition only the sire was tested for is listed under one parent', async () => {
    const analysis = analyseHealth(await sample('a'), await sample('c'));
    expect(analysis.oneParentOnly).toEqual([
      {
        name: MT_CONDITION,
        gene: 'tRNATyr',
        variant: 'Deletion',
        inheritance: 'MT',
        knownInBreed: false,
        parent: 0,
        tested: { copies: 0, result: 'Clear' },
      },
    ]);
    expect(names(analysis.rows)).toEqual([CDDY]);
    expect(analysis.rows[0]?.odds).toEqual({ kind: 'puppies', puppies: { atRisk: ONE, carrier: null } });
  });

  it('Sample C × Sample B: the MT condition only the dam was tested for is still computed', async () => {
    const analysis = analyseHealth(await sample('c'), await sample('b'));
    const mt = analysis.rows.find((row) => row.name === MT_CONDITION);
    expect(mt?.parents).toEqual([null, { copies: 0, result: 'Clear' }]);
    expect(mt?.odds).toEqual({ kind: 'puppies', puppies: { atRisk: ZERO, carrier: null } });
    expect(analysis.oneParentOnly).toEqual([]);
  });

  it('pairs a current-format and an older-format report: its confidential and VWF G>A conditions and their modes', async () => {
    for (const [first, second] of [
      [await sample('a'), asOlderFormat(await sample('b'))],
      [asOlderFormat(await sample('a')), await sample('b')],
    ] as const) {
      const analysis = analyseHealth(first, second);
      expect(analysis.oneParentOnly).toEqual([]);
      const listed = [...analysis.rows, ...analysis.clearInBoth];
      for (const name of [...CONFIDENTIAL, ...VWF]) {
        expect(listed.filter((item) => item.name === name), name).toHaveLength(1);
      }
      expect(listed.filter(({ name }) => VWF.includes(name)).map(({ inheritance }) => inheritance)).toEqual(['AD', 'AR']);
      expect(analysis.rows.find(({ name }) => name === DM)?.inheritance).toBe('AR');
    }
  });

  it('takes the mode from the catalogue for an older-format dam in slot 2 that alone tests the MT condition', async () => {
    const analysis = analyseHealth(await sample('c'), asOlderFormat(await sample('b')));
    const mt = analysis.rows.find((row) => row.name === MT_CONDITION);
    expect(mt).toMatchObject({ inheritance: 'MT', parents: [null, { copies: 0, result: 'Clear' }] });
    expect(mt?.odds).toEqual({ kind: 'puppies', puppies: { atRisk: ZERO, carrier: null } });
    expect(analysis.oneParentOnly).toEqual([]);
  });

  it('takes the modes of two older-format reports from the catalogue', async () => {
    const analysis = analyseHealth(asOlderFormat(await sample('a')), asOlderFormat(await sample('b')));
    expect(analysis.rows.map(({ name, inheritance }) => [name, inheritance])).toEqual([
      [CDDY, 'AD'],
      [DM, 'AR'],
    ]);
  });
});

describe('analyseHealth: autosomal modes', () => {
  it('AR carrier × carrier: 1 in 4 affected, 1 in 2 carriers, and a warning naming the condition', () => {
    const analysis = analyseHealth(parent('male', [condition('AR', 1)]), parent('female', [condition('AR', 1)]));
    expect(onlyRow(analysis).odds).toEqual({ kind: 'puppies', puppies: { atRisk: fraction(1, 4), carrier: fraction(1, 2) } });
    expect(analysis.warnings).toEqual([
      {
        kind: 'affected-puppies',
        condition: { name: 'Test Condition', gene: 'GENE', variant: 'G>A', inheritance: 'AR', knownInBreed: false },
        among: 'puppies',
        chance: fraction(1, 4),
      },
    ]);
  });

  it('AR at risk × carrier: half affected, half carriers, with a warning', () => {
    const analysis = analyseHealth(parent('male', [condition('AR', 2)]), parent('female', [condition('AR', 1)]));
    expect(onlyRow(analysis).odds).toEqual({ kind: 'puppies', puppies: { atRisk: fraction(1, 2), carrier: fraction(1, 2) } });
    expect(analysis.warnings).toMatchObject([{ kind: 'affected-puppies', chance: fraction(1, 2) }]);
  });

  it('AR at risk × clear: every puppy a carrier, none affected, no warning', () => {
    const analysis = analyseHealth(parent('male', [condition('AR', 2)]), parent('female', [condition('AR', 0)]));
    expect(onlyRow(analysis).odds).toEqual({ kind: 'puppies', puppies: { atRisk: ZERO, carrier: ONE } });
    expect(analysis.warnings).toEqual([]);
  });

  it('AD: at risk with one copy from either parent, no carrier state, and never a warning', () => {
    const one = analyseHealth(parent('male', [condition('AD', 1)]), parent('female', [condition('AD', 0)]));
    expect(onlyRow(one).odds).toEqual({ kind: 'puppies', puppies: { atRisk: fraction(1, 2), carrier: null } });
    const both = analyseHealth(parent('male', [condition('AD', 1)]), parent('female', [condition('AD', 1)]));
    expect(onlyRow(both).odds).toEqual({ kind: 'puppies', puppies: { atRisk: fraction(3, 4), carrier: null } });
    expect([...one.warnings, ...both.warnings]).toEqual([]);
  });

  it('marks the condition known in the breed when either report does', () => {
    const known = condition('AD', 1, { knownInBreed: true });
    expect(onlyRow(analyseHealth(parent('male', [known]), parent('female', [condition('AD', 0)]))).knownInBreed).toBe(true);
    expect(onlyRow(analyseHealth(parent('male', [condition('AD', 0)]), parent('female', [known]))).knownInBreed).toBe(true);
  });
});

describe('analyseHealth: X-linked modes', () => {
  it('XR, carrier dam × clear sire: half the sons affected, half the daughters carriers, no warning', () => {
    const dam = parent('female', [condition('XR', 1)]);
    const sire = parent('male', [condition('XR', 0)]);
    const expected = {
      kind: 'by-sex',
      sons: { atRisk: fraction(1, 2), carrier: null },
      daughters: { atRisk: ZERO, carrier: fraction(1, 2) },
    };
    expect(onlyRow(analyseHealth(dam, sire)).odds).toEqual(expected);
    expect(onlyRow(analyseHealth(sire, dam)).odds).toEqual(expected);
    expect(analyseHealth(dam, sire).warnings).toEqual([]);
  });

  it('XR, clear dam × sire with the variant: every daughter a carrier, sons clear', () => {
    const analysis = analyseHealth(parent('female', [condition('XR', 0)]), parent('male', [condition('XR', 1)]));
    expect(onlyRow(analysis).odds).toEqual({
      kind: 'by-sex',
      sons: { atRisk: ZERO, carrier: null },
      daughters: { atRisk: ZERO, carrier: ONE },
    });
    expect(analysis.warnings).toEqual([]);
  });

  it('XR, carrier dam × sire with the variant: affected daughters, with a warning', () => {
    for (const sireCopies of [1, 2]) {
      const analysis = analyseHealth(parent('female', [condition('XR', 1)]), parent('male', [condition('XR', sireCopies)]));
      expect(onlyRow(analysis).odds).toEqual({
        kind: 'by-sex',
        sons: { atRisk: fraction(1, 2), carrier: null },
        daughters: { atRisk: fraction(1, 2), carrier: fraction(1, 2) },
      });
      expect(analysis.warnings).toMatchObject([{ kind: 'affected-puppies', among: 'daughters', chance: fraction(1, 2) }]);
    }
  });

  it('XD: sons at risk from the dam only, daughters from either parent, no carrier state', () => {
    const fromDam = analyseHealth(parent('female', [condition('XD', 1)]), parent('male', [condition('XD', 0)]));
    expect(onlyRow(fromDam).odds).toEqual({
      kind: 'by-sex',
      sons: { atRisk: fraction(1, 2), carrier: null },
      daughters: { atRisk: fraction(1, 2), carrier: null },
    });
    const fromSire = analyseHealth(parent('female', [condition('XD', 0)]), parent('male', [condition('XD', 1)]));
    expect(onlyRow(fromSire).odds).toEqual({
      kind: 'by-sex',
      sons: { atRisk: ZERO, carrier: null },
      daughters: { atRisk: ONE, carrier: null },
    });
    expect([...fromDam.warnings, ...fromSire.warnings]).toEqual([]);
  });

  it('XD, both parents with the variant: no warning, since one copy is enough', () => {
    const analysis = analyseHealth(parent('female', [condition('XD', 1)]), parent('male', [condition('XD', 1)]));
    expect(onlyRow(analysis).odds).toEqual({
      kind: 'by-sex',
      sons: { atRisk: fraction(1, 2), carrier: null },
      daughters: { atRisk: ONE, carrier: null },
    });
    expect(analysis.warnings).toEqual([]);
  });
});

describe('analyseHealth: mitochondrial mode', () => {
  it('dam at risk × clear sire: every puppy at risk', () => {
    const analysis = analyseHealth(parent('male', [condition('MT', 0)]), parent('female', [condition('MT', 1)]));
    expect(onlyRow(analysis).odds).toEqual({ kind: 'puppies', puppies: { atRisk: ONE, carrier: null } });
    expect(analysis.warnings).toEqual([]);
  });

  it('dam and sire both at risk: every puppy at risk from the dam alone, no warning', () => {
    const analysis = analyseHealth(parent('male', [condition('MT', 1)]), parent('female', [condition('MT', 1)]));
    expect(onlyRow(analysis).odds).toEqual({ kind: 'puppies', puppies: { atRisk: ONE, carrier: null } });
    expect(analysis.warnings).toEqual([]);
  });

  it('clear dam × sire at risk: every puppy clear', () => {
    const analysis = analyseHealth(parent('female', [condition('MT', 0)]), parent('male', [condition('MT', 1)]));
    expect(onlyRow(analysis).odds).toEqual({ kind: 'puppies', puppies: { atRisk: ZERO, carrier: null } });
  });

  it('tested in the dam only: still computed; in the sire only: listed under one parent', () => {
    const damOnly = analyseHealth(parent('male', []), parent('female', [condition('MT', 1)]));
    expect(onlyRow(damOnly).parents).toEqual([null, { copies: 1, result: 'Carrier' }]);
    expect(onlyRow(damOnly).odds).toEqual({ kind: 'puppies', puppies: { atRisk: ONE, carrier: null } });
    const sireOnly = analyseHealth(parent('male', [condition('MT', 1)]), parent('female', []));
    expect(sireOnly.rows).toEqual([]);
    expect(sireOnly.oneParentOnly).toMatchObject([{ name: 'Test Condition', parent: 0 }]);
  });
});

describe('analyseHealth: parent sex', () => {
  const pair = (first: Sex | null, second: Sex | null) =>
    analyseHealth(
      parent(first, [healthRow('X', 1, 'XR'), healthRow('M', 1, 'MT'), healthRow('A', 1, 'AR'), healthRow('Y', 0, 'XD')]),
      parent(second, [healthRow('X', 0, 'XR'), healthRow('M', 0, 'MT'), healthRow('A', 1, 'AR'), healthRow('Y', 0, 'XD')]),
    );

  it('same-sex parents: X-linked and MT rows unknown, the other modes computed, clear X-linked conditions counted clear', () => {
    for (const sex of ['male', 'female'] as const) {
      const analysis = pair(sex, sex);
      expect(analysis.rows.map(({ name, odds }) => [name, odds])).toEqual([
        ['X', { kind: 'unknown', reason: 'same-sex-parents' }],
        ['M', { kind: 'unknown', reason: 'same-sex-parents' }],
        ['A', { kind: 'puppies', puppies: { atRisk: fraction(1, 4), carrier: fraction(1, 2) } }],
      ]);
      expect(names(analysis.clearInBoth)).toEqual(['Y']);
    }
  });

  it('same-sex parents that both carry an XR variant: unknown odds and no warning', () => {
    for (const sex of ['male', 'female'] as const) {
      const analysis = analyseHealth(parent(sex, [condition('XR', 1)]), parent(sex, [condition('XR', 2)]));
      expect(onlyRow(analysis).odds).toEqual({ kind: 'unknown', reason: 'same-sex-parents' });
      expect(analysis.warnings).toEqual([]);
    }
  });

  it('a parent of unknown sex, in either slot: X-linked and MT rows unknown for that reason', () => {
    for (const analysis of [pair(null, 'female'), pair('female', null)]) {
      expect(analysis.rows.slice(0, 2).map(({ odds }) => odds)).toEqual([
        { kind: 'unknown', reason: 'sex-unknown' },
        { kind: 'unknown', reason: 'sex-unknown' },
      ]);
    }
  });

  describe('both parents carry an XR variant and a sex is unreadable', () => {
    const sexes = [
      [null, 'female'],
      ['male', null],
      [null, null],
    ] as const;
    const xr = { name: 'Test Condition', gene: 'GENE', variant: 'G>A', inheritance: 'XR', knownInBreed: false };

    it('odds stay unknown, and the daughters warning spans the two possible dams', () => {
      for (const [firstSex, secondSex] of sexes) {
        for (const [firstCopies, secondCopies] of [
          [1, 2],
          [2, 1],
        ] as const) {
          const analysis = analyseHealth(
            parent(firstSex, [condition('XR', firstCopies)]),
            parent(secondSex, [condition('XR', secondCopies)]),
          );
          expect(onlyRow(analysis).odds).toEqual({ kind: 'unknown', reason: 'sex-unknown' });
          expect(analysis.warnings).toEqual([
            { kind: 'affected-puppies', condition: xr, among: 'daughters', chance: { low: fraction(1, 2), high: ONE } },
          ]);
        }
      }
    });

    it('a single chance when either parent as the dam gives the same', () => {
      for (const [firstSex, secondSex] of sexes) {
        const analysis = analyseHealth(parent(firstSex, [condition('XR', 1)]), parent(secondSex, [condition('XR', 1)]));
        expect(analysis.warnings).toEqual([
          { kind: 'affected-puppies', condition: xr, among: 'daughters', chance: fraction(1, 2) },
        ]);
      }
    });

    it('no warning when only one parent carries it', () => {
      for (const [firstSex, secondSex] of sexes) {
        expect(analyseHealth(parent(firstSex, [condition('XR', 1)]), parent(secondSex, [condition('XR', 0)])).warnings).toEqual([]);
      }
    });
  });

  it('an MT condition tested in one parent of unknown sex is listed under that parent', () => {
    const analysis = analyseHealth(parent(null, []), parent('female', [condition('MT', 1)]));
    expect(analysis.rows).toEqual([]);
    expect(analysis.oneParentOnly).toMatchObject([{ parent: 1, tested: { copies: 1, result: 'Carrier' } }]);
  });
});

describe('analyseHealth: matching and inheritance', () => {
  it('lists a condition tested in one report only under that parent, with its result and no odds', () => {
    const analysis = analyseHealth(
      parent('male', [condition('AR', 0)]),
      parent('female', [condition('AR', 0), healthRow('Only Here', 1, 'AR', { knownInBreed: true })]),
    );
    expect(analysis.oneParentOnly).toEqual([
      {
        name: 'Only Here',
        gene: 'GENE',
        variant: 'G>A',
        inheritance: 'AR',
        knownInBreed: true,
        parent: 1,
        tested: { copies: 1, result: 'Carrier' },
      },
    ]);
    expect(names(analysis.clearInBoth)).toEqual(['Test Condition']);
    expect(analysis.rows).toEqual([]);
  });

  it('a condition the catalogue lacks, carried by both: copies and results only, and an "inheritance unknown" warning', () => {
    const analysis = analyseHealth(parent('male', [condition(null, 1)]), parent('female', [condition(null, 2)]));
    expect(onlyRow(analysis)).toMatchObject({
      inheritance: null,
      parents: [
        { copies: 1, result: 'Carrier' },
        { copies: 2, result: 'At Risk' },
      ],
      odds: { kind: 'unknown', reason: 'inheritance-unknown' },
    });
    expect(analysis.warnings).toEqual([
      {
        kind: 'inheritance-unknown',
        condition: { name: 'Test Condition', gene: 'GENE', variant: 'G>A', inheritance: null, knownInBreed: false },
      },
    ]);
  });

  it('a condition the catalogue lacks, carried by one parent: unknown odds and no warning', () => {
    const analysis = analyseHealth(parent('male', [condition(null, 1)]), parent('female', [condition(null, 0)]));
    expect(onlyRow(analysis).odds).toEqual({ kind: 'unknown', reason: 'inheritance-unknown' });
    expect(analysis.warnings).toEqual([]);
  });

  it("prefers the reports' mode over the catalogue's", () => {
    const dm = (copies: number, inheritance: Inheritance | null) => healthRow(DM, copies, inheritance, { gene: 'SOD1' });
    const analysis = analyseHealth(parent('male', [dm(1, 'AD')]), parent('female', [dm(0, null)]));
    expect(onlyRow(analysis)).toMatchObject({ inheritance: 'AD', odds: { kind: 'puppies', puppies: { atRisk: fraction(1, 2), carrier: null } } });
  });

  it('two reports that print different modes: unknown odds, and a warning when both carry', () => {
    const analysis = analyseHealth(parent('male', [condition('AR', 1)]), parent('female', [condition('AD', 1)]));
    expect(onlyRow(analysis)).toMatchObject({ inheritance: null, odds: { kind: 'unknown', reason: 'inheritance-conflict' } });
    expect(analysis.warnings).toMatchObject([{ kind: 'inheritance-unknown' }]);
  });

  it('names a matched condition by the report that prints its gene and variant', () => {
    const older = healthRow('Thrombopathia (Discovered in the Eskimo Spitz)', 1, null, { gene: 'RASGRP1', variant: '-' });
    const current = healthRow(older.name, 0, 'AR', { gene: 'RASGRP1', variant: 'Insertion' });
    expect(onlyRow(analyseHealth(parent('male', [older]), parent('female', [current])))).toMatchObject({
      gene: 'RASGRP1',
      variant: 'Insertion',
      inheritance: 'AR',
    });
  });

  it('accounts for every distinct condition once: rows, one-parent list and the clear count', () => {
    const analysis = analyseHealth(
      parent('male', [healthRow('P', 1, 'AR'), healthRow('Q', 0, 'AD'), healthRow('R', 0, 'XR'), healthRow('S', 0, 'AR')]),
      parent('female', [healthRow('P', 0, 'AR'), healthRow('Q', 0, 'AD'), healthRow('R', 1, 'XR'), healthRow('T', 0, 'AR')]),
    );
    expect(names(analysis.rows)).toEqual(['P', 'R']);
    expect(names(analysis.clearInBoth)).toEqual(['Q']);
    expect(names(analysis.oneParentOnly)).toEqual(['S', 'T']);
  });
});

describe('analyseHealth: bobtail', () => {
  const tails = (first: number | null, second: number | null) =>
    analyseHealth(parent('male', [], first), parent('female', [], second)).warnings;

  it('T × T: about 1 in 4 embryos T/T, which is not viable', () => {
    expect(tails(1, 1)).toEqual([{ kind: 'bobtail', embryosTT: fraction(1, 4), twoCopyParents: [] }]);
  });

  it('gives the T/T fraction for the actual copies, and names a parent reported with two copies', () => {
    expect(tails(2, 1)).toEqual([{ kind: 'bobtail', embryosTT: fraction(1, 2), twoCopyParents: [0] }]);
    expect(tails(2, 2)).toEqual([{ kind: 'bobtail', embryosTT: ONE, twoCopyParents: [0, 1] }]);
  });

  it('no warning when either parent lacks the variant or its Short Tail row', () => {
    expect(tails(1, 0)).toEqual([]);
    expect(tails(null, 1)).toEqual([]);
  });
});
