import { describe, expect, it } from 'vitest';
import { FIXTURE_LETTERS } from '../../scripts/extract-fixtures.ts';
import { COLOUR_VARIANTS } from '../../src/report/loci.ts';
import { findHealthRows, parseReport, type SourcedHealthRow } from '../../src/report/parse.ts';
import {
  MAX_TEXT_ITEMS_PER_DOCUMENT,
  MAX_TEXT_ITEMS_PER_PAGE,
  type DocumentInfo,
  type Line,
  type PdfText,
} from '../../src/report/pdfText.ts';
import type { ReadResult, Report } from '../../src/report/types.ts';
import { fixtureText } from './fixtures.ts';
import { line } from './lines.ts';
import { fastestRunMs, PASS_BUDGET_MS } from './timing.ts';

const NO_INFO: DocumentInfo = { creator: null, producer: null };
const ADOBE_PRINTER: DocumentInfo = { creator: 'PScript5.dll Version 5.2.2', producer: null };
const DISTILLER: DocumentInfo = { creator: null, producer: 'Acrobat Distiller 26.0 (Windows)' };

const CURRENT_FOOTER = line(1, 13, [34, 'Wisdom Panel™ Genetics Report'], [519, 'page 1 of 27']);
const MYDOGDNA_TITLE = line(1, 712, [222, 'DNA Test Report']);
const MYDOGDNA_BRAND = line(1, 716, [531, 'MyDogDNA']);

function text(lines: readonly Line[], info = NO_INFO): PdfText {
  return { lines, info };
}

async function parsed(lines: readonly Line[], info = NO_INFO): Promise<Report> {
  const result = await parseReport(text(lines, info));
  if (!result.ok) {
    throw new Error(`expected a report, got the rejection ${result.kind}`);
  }
  return result.report;
}

async function rejection(lines: readonly Line[], info = NO_INFO): Promise<string> {
  const result: ReadResult = await parseReport(text(lines, info));
  return result.ok ? 'accepted' : result.kind;
}

const currentHeader = (sex = 'M', profile = 'Sample Call', registered = 'Sample Registered') => [
  line(1, 771, [34, 'Breed: Spanish Water Dog'], [210, 'Registration number: XX00000/00']),
  line(1, 747, [34, 'Birth date: 2000-01-01'], [210, 'ID kit: KIT000A']),
  line(1, 694, [34, `${profile}’s Profile`]),
  line(1, 622, [34, 'Registered name'], [209, 'Sex']),
  line(1, 610, [34, registered], [209, sex]),
  line(1, 586, [34, 'Owner reported breed']),
  line(1, 574, [34, 'Spanish Water Dog']),
];

const currentTraitHeader = (y: number) =>
  line(6, y, [306, 'Gene'], [355, 'Variant'], [407, 'Copies'], [455, 'Result']);

describe('parseReport: rejections', () => {
  it('rejects a document without any text as no-text', async () => {
    expect(await rejection([])).toBe('no-text');
  });

  it('rejects text-free output of the Windows Adobe PDF printer as adobe-pdf-printer', async () => {
    expect(await rejection([], ADOBE_PRINTER)).toBe('adobe-pdf-printer');
  });

  it('rejects scrambled glyph codes as unreadable-text', async () => {
    const scrambled = [line(1, 751, [58, '\u0000\u0002\u0003\u0004\u0003\u0005\u0006\u0002'])];
    expect(await rejection(scrambled)).toBe('unreadable-text');
  });

  it('rejects scrambled glyph codes from PScript5 as adobe-pdf-printer', async () => {
    const scrambled = [line(1, 751, [58, '\u0000\u0002\u0003!"#\u0004\u0003\u0005\u0006\u0002'])];
    expect(await rejection(scrambled, ADOBE_PRINTER)).toBe('adobe-pdf-printer');
  });

  it('rejects scrambled glyph codes from Acrobat Distiller as adobe-pdf-printer', async () => {
    const scrambled = [line(1, 751, [58, '\u0000\u0002\u0003\u0004\u0003\u0005\u0006\u0002'])];
    expect(await rejection(scrambled, DISTILLER)).toBe('adobe-pdf-printer');
  });

  it('rejects a readable document that is not a Wisdom report as not-wisdom-dog', async () => {
    const invoice = [
      line(1, 700, [36, 'Invoice 2024-117']),
      line(1, 680, [36, 'ASIP'], [100, 'at'], [140, '2']),
    ];
    expect(await rejection(invoice)).toBe('not-wisdom-dog');
  });

  it('does not blame the Adobe printer for a readable non-Wisdom document', async () => {
    expect(await rejection([line(1, 700, [36, 'Meeting notes'])], ADOBE_PRINTER)).toBe(
      'not-wisdom-dog',
    );
  });

  it('rejects a MyDogDNA report in a layout it does not know as unrecognised-layout', async () => {
    const finnish = [
      line(1, 684, [86, 'Rekisterinimi:'], [150, 'Sample']),
      line(1, 541, [62, 'Tulokset - Rodussa tunnetut perinnölliset sairaudet']),
      line(1, 111, [62, 'Lisätietoja osoitteesta: www.mydogdna.com/legal-notices']),
    ];
    expect(await rejection(finnish)).toBe('unrecognised-layout');
  });

  it('rejects a report with the format marker but no rows it knows as unrecognised-layout', async () => {
    expect(await rejection([...currentHeader(), CURRENT_FOOTER])).toBe('unrecognised-layout');
  });
});

describe('parseReport: colour rows', () => {
  it('reads gene + code + copies triples into copies per gene, whatever the column positions', async () => {
    const report = await parsed([
      ...currentHeader(),
      currentTraitHeader(632),
      line(6, 602, [43, 'Fawn'], [307, 'ASIP'], [365, 'ay'], [417, '0'], [455, 'No effect']),
      line(6, 576, [43, 'Recessive Black'], [280, 'ASIP'], [330, 'a'], [400, '0']),
      line(6, 550, [43, 'Tan Points'], [307, 'ASIP'], [366, 'at'], [418, '1'], [455, 'Tan points']),
      CURRENT_FOOTER,
    ]);
    expect(report.format).toBe('current');
    expect(report.colour.ASIP).toEqual({ ay: 0, a: 0, at: 1 });
  });

  it('reads a wrapped result as one row, not two', async () => {
    const report = await parsed([
      ...currentHeader(),
      currentTraitHeader(424),
      line(7, 404, [43, 'Chocolate (bc)'], [304, 'TYRP1'], [365, 'bc'], [418, '1'], [455, 'Black features likely,']),
      line(7, 392, [455, 'chocolate possible']),
      CURRENT_FOOTER,
    ]);
    expect(report.colour.TYRP1).toEqual({ bc: 1 });
  });

  it('lists a gene as missing when any of its variants has no row, and never fills in 0', async () => {
    const report = await parsed([
      ...currentHeader(),
      line(6, 602, [307, 'ASIP'], [365, 'ay'], [417, '0']),
      line(6, 576, [307, 'ASIP'], [365, 'at'], [417, '2']),
      CURRENT_FOOTER,
    ]);
    expect(report.colour.ASIP).toEqual({ ay: 0, at: 2 });
    expect(report.colour.TYRP1).toBeUndefined();
    expect(report.missingLoci).toContain('ASIP');
    expect(report.missingLoci).toContain('TYRP1');
  });

  it('requires the gene as a whole cell', async () => {
    const report = await parsed([
      ...currentHeader(),
      line(6, 602, [307, 'pre-ASIP'], [365, 'ay'], [417, '1']),
      line(6, 576, [307, 'ASIP'], [365, 'at'], [417, '2']),
      CURRENT_FOOTER,
    ]);
    expect(report.colour.ASIP).toEqual({ at: 2 });
  });

  it('reads a copy count that abuts its result text', async () => {
    const report = await parsed([
      MYDOGDNA_TITLE,
      MYDOGDNA_BRAND,
      line(16, 114, [36, 'Chocolate (bc)'], [245, 'TYRP1'], [332, 'bc'], [410, '1 Black features likely']),
    ]);
    expect(report.colour.TYRP1).toEqual({ bc: 1 });
  });

  it('reads the older format’s Cocker sable row by its name, and its EG and Tr spellings', async () => {
    const report = await parsed([
      MYDOGDNA_TITLE,
      MYDOGDNA_BRAND,
      line(16, 501, [36, 'Sable (Discovered in the Cocker Spaniel)'], [224, 'Confidential'], [334, '—'], [408, '1']),
      line(16, 349, [249, 'MC1R'], [331, 'EG'], [408, '0']),
      line(17, 370, [36, 'Roan (Linkage test)'], [242, 'USH2A'], [333, 'Tr'], [408, '0']),
    ]);
    expect(report.format).toBe('mydogdna');
    expect(report.colour.MC1R).toEqual({ eH: 1, eG: 0 });
    expect(report.colour.USH2A).toEqual({ TRr: 0 });
  });

  it('does not read a confidential health row as the Cocker sable row', async () => {
    const report = await parsed([
      MYDOGDNA_TITLE,
      MYDOGDNA_BRAND,
      line(3, 621, [36, 'Genetic Condition'], [373, 'Gene'], [417, 'Risk Variant'], [492, 'Copies'], [551, 'Result']),
      line(3, 266, [36, 'Amelogenesis Imperfecta (Discovered in the Lancashire Heeler)'], [348, 'Confidential'], [457, '—'], [513, '2'], [556, 'At Risk']),
    ]);
    expect(report.colour.MC1R).toBeUndefined();
  });

  it('reads the Short Tail row, and null when it is absent', async () => {
    const tail = line(11, 623, [43, 'Short Tail'], [304, 'T-box'], [364, 'T'], [416, '1']);
    expect((await parsed([...currentHeader(), tail, CURRENT_FOOTER])).shortTail).toBe(1);
    const other = line(6, 602, [307, 'ASIP'], [365, 'ay'], [417, '0']);
    expect((await parsed([...currentHeader(), other, CURRENT_FOOTER])).shortTail).toBeNull();
  });
});

const currentHealthHeader = (page: number, y: number) =>
  line(page, y, [43, 'Genetic Condition'], [302, 'Gene'], [356, 'Risk Variant'], [421, 'Copies'], [467, 'Inheritance'], [529, 'Result']);
const mydogdnaHealthHeader = (page: number, y: number) =>
  line(page, y, [36, 'Genetic Condition'], [373, 'Gene'], [417, 'Risk Variant'], [492, 'Copies'], [551, 'Result']);

describe('parseReport: health rows', () => {
  it('reads current-format rows with inheritance, joining a name wrapped above and below its values', async () => {
    const report = await parsed([
      ...currentHeader(),
      line(12, 694, [34, 'Other health conditions tested']),
      currentHealthHeader(12, 654),
      line(12, 627, [43, '2,8-dihydroxyadenine (DHA) Urolithiasis'], [301, 'APRT'], [370, 'G>A'], [431, '0'], [482, 'AR'], [531, 'Clear']),
      line(12, 494, [43, 'Amelogenesis Imperfecta (Discovered in the Lancashire']),
      line(12, 488, [290, 'Confidential'], [377, '-'], [431, '1'], [482, 'AR'], [529, 'Carrier']),
      line(12, 482, [43, 'Heeler)']),
      CURRENT_FOOTER,
    ]);
    expect(report.health).toEqual([
      {
        name: '2,8-dihydroxyadenine (DHA) Urolithiasis',
        gene: 'APRT',
        variant: 'G>A',
        copies: 0,
        result: 'Clear',
        inheritance: 'AR',
        knownInBreed: false,
      },
      {
        name: 'Amelogenesis Imperfecta (Discovered in the Lancashire Heeler)',
        gene: 'Confidential',
        variant: '-',
        copies: 1,
        result: 'Carrier',
        inheritance: 'AR',
        knownInBreed: false,
      },
    ]);
  });

  it('reads a current-format "known in the breed" block, whose name shares the column-header line', async () => {
    const report = await parsed([
      ...currentHeader(),
      line(3, 694, [34, 'Health conditions known in the breed']),
      line(3, 649, [34, 'Early-Onset Progressive Retinal Atrophy,'], [286, 'Gene'], [334, 'Risk Variant'], [401, 'Copies'], [454, 'Inheritance'], [523, 'Result']),
      line(3, 638, [34, '(Discovered in the Spanish Water Dog)']),
      line(3, 625, [282, 'PDE6B'], [341, 'Deletion'], [412, '0'], [469, 'AR'], [525, 'Clear']),
      line(3, 596, [50, 'Information about the genetic condition']),
      line(3, 577, [50, 'Early-Onset Progressive Retinal Atrophy in Spanish Water Dogs is typically diagnosed']),
      line(3, 357, [34, 'Hyperuricosuria'], [286, 'Gene'], [334, 'Risk Variant'], [401, 'Copies'], [454, 'Inheritance'], [523, 'Result']),
      line(3, 344, [281, 'SLC2A9'], [348, 'G>T'], [412, '2'], [469, 'AR'], [525, 'At Risk']),
      CURRENT_FOOTER,
    ]);
    expect(report.health.map(({ name, gene, knownInBreed }) => ({ name, gene, knownInBreed }))).toEqual([
      {
        name: 'Early-Onset Progressive Retinal Atrophy, (Discovered in the Spanish Water Dog)',
        gene: 'PDE6B',
        knownInBreed: true,
      },
      { name: 'Hyperuricosuria', gene: 'SLC2A9', knownInBreed: true },
    ]);
  });

  it('reads older-format rows, joining a gene wrapped around the row and normalising dashes', async () => {
    const report = await parsed([
      MYDOGDNA_TITLE,
      MYDOGDNA_BRAND,
      line(3, 649, [36, 'Health Conditions Known in This Breed']),
      mydogdnaHealthHeader(3, 621),
      line(3, 601, [370, 'FGF4']),
      line(3, 597, [36, 'Chondrodystrophy (CDDY) and Intervertebral Disc Disease (IVDD) Risk'], [430, 'Insertion'], [514, '2'], [548, 'At Risk']),
      line(3, 590, [356, 'retrogene']),
      line(3, 462, [36, 'Other Conditions Tested']),
      mydogdnaHealthHeader(3, 434),
      line(3, 266, [36, 'Amelogenesis Imperfecta (Discovered in the Lancashire Heeler)'], [348, 'Confidential'], [457, '—'], [513, '0'], [556, 'Clear']),
      line(5, 700, [36, 'Hemophilia A (Discovered in the German Shepherd Dog – Variant 1)'], [370, 'FVIII'], [448, 'G>A'], [513, '0'], [556, 'Clear']),
    ]);
    expect(report.health).toEqual([
      {
        name: 'Chondrodystrophy (CDDY) and Intervertebral Disc Disease (IVDD) Risk',
        gene: 'FGF4 retrogene',
        variant: 'Insertion',
        copies: 2,
        result: 'At Risk',
        inheritance: null,
        knownInBreed: true,
      },
      {
        name: 'Amelogenesis Imperfecta (Discovered in the Lancashire Heeler)',
        gene: 'Confidential',
        variant: '-',
        copies: 0,
        result: 'Clear',
        inheritance: null,
        knownInBreed: false,
      },
      {
        name: 'Hemophilia A (Discovered in the German Shepherd Dog - Variant 1)',
        gene: 'FVIII',
        variant: 'G>A',
        copies: 0,
        result: 'Clear',
        inheritance: null,
        knownInBreed: false,
      },
    ]);
  });

  it('reads the X-linked dominant inheritance mode', async () => {
    const report = await parsed([
      ...currentHeader(),
      currentHealthHeader(18, 654),
      line(18, 627, [43, 'X-Linked Hereditary Nephropathy'], [301, 'COL4A5'], [370, 'C>T'], [431, '0'], [482, 'XD'], [531, 'Clear']),
      CURRENT_FOOTER,
    ]);
    expect(report.health.map(({ gene, inheritance }) => ({ gene, inheritance }))).toEqual([
      { gene: 'COL4A5', inheritance: 'XD' },
    ]);
  });

  it('keeps two conditions with the same gene and variant apart by name', async () => {
    const report = await parsed([
      ...currentHeader(),
      currentHealthHeader(20, 654),
      line(20, 627, [43, 'Von Willebrand Disease Type I'], [301, 'VWF'], [370, 'G>A'], [431, '0'], [482, 'AD'], [531, 'Clear']),
      line(20, 600, [43, 'Von Willebrand Disease Type II'], [301, 'VWF'], [370, 'G>A'], [431, '0'], [482, 'AR'], [531, 'Clear']),
      CURRENT_FOOTER,
    ]);
    expect(report.health.map(({ name, inheritance }) => [name, inheritance])).toEqual([
      ['Von Willebrand Disease Type I', 'AD'],
      ['Von Willebrand Disease Type II', 'AR'],
    ]);
  });

  it('does not join text from the next page to a row at the bottom of a page', async () => {
    const report = await parsed([
      ...currentHeader(),
      currentHealthHeader(12, 120),
      line(12, 60, [43, 'Xanthinuria'], [301, 'MOCOS'], [370, 'G>A'], [431, '0'], [482, 'AR'], [531, 'Clear']),
      line(12, 13, [34, 'Wisdom Panel™ Genetics Report'], [519, 'page 12 of 27']),
      line(13, 62, [43, 'Information about the genetic condition']),
      line(13, 13, [34, 'Wisdom Panel™ Genetics Report'], [519, 'page 13 of 27']),
    ]);
    expect(report.health.map(({ name, gene }) => ({ name, gene }))).toEqual([{ name: 'Xanthinuria', gene: 'MOCOS' }]);
  });

  it('pairs wrapped fragments with their rows quickly on full pages of interleaved rows and fragments', () => {
    const rowCells = 6;
    const fragmentCells = 1;
    const pages = Math.floor(MAX_TEXT_ITEMS_PER_DOCUMENT / MAX_TEXT_ITEMS_PER_PAGE);
    const rowsPerPage = Math.floor(MAX_TEXT_ITEMS_PER_PAGE / (rowCells + fragmentCells));
    // Each fragment sits a quarter point below its own row and three quarters above the next.
    const lines = Array.from({ length: pages }, (_, pageIndex) => {
      const page = pageIndex + 1;
      return [
        currentHealthHeader(page, 800),
        ...Array.from({ length: rowsPerPage }, (_, index) => [
          line(page, 790 - index, [43, `Condition ${index}`], [301, 'GENE'], [370, 'G>A'], [431, '0'], [482, 'AR'], [531, 'Clear']),
          line(page, 790 - index - 0.25, [43, 'wrapped']),
        ]).flat(),
      ];
    }).flat();
    let rows: SourcedHealthRow[] = [];
    const elapsed = fastestRunMs(() => {
      rows = findHealthRows(lines, 'current');
    });
    // Scanning every row for every fragment line took minutes here.
    expect(elapsed).toBeLessThan(PASS_BUDGET_MS);
    expect(rows).toHaveLength(pages * rowsPerPage);
    expect(rows.every(({ row }) => /^Condition \d+ wrapped$/.test(row.name))).toBe(true);
  });

  it('does not read trait rows as health rows', async () => {
    const report = await parsed([
      ...currentHeader(),
      currentTraitHeader(652),
      line(10, 600, [43, 'Short Legs (Chondrodystrophy, CDDY)'], [304, 'FGF4'], [365, '-'], [417, '2'], [455, 'Shortened legs likely']),
      line(6, 602, [307, 'ASIP'], [365, 'ay'], [417, '0']),
      CURRENT_FOOTER,
    ]);
    expect(report.health).toEqual([]);
  });
});

/** Every catalogue code at 0 copies, except the given ones. */
function colourWith(overrides: Readonly<Record<string, number>>): Record<string, Record<string, number>> {
  const colour: Record<string, Record<string, number>> = {};
  for (const { gene, code } of COLOUR_VARIANTS) {
    colour[gene] = { ...colour[gene], [code]: overrides[`${gene} ${code}`] ?? 0 };
  }
  return colour;
}

const sample = async (letter: string, edit = (lines: readonly Line[]): readonly Line[] => lines) =>
  parsed(edit(fixtureText(letter).lines));

function withCopies(gene: string, code: string, copies: number) {
  return (lines: readonly Line[]): Line[] =>
    lines.map((original) => {
      const index = original.cells.findIndex((cell, i) => cell.text === gene && original.cells[i + 1]?.text === code);
      if (index === -1) {
        return original;
      }
      return {
        ...original,
        cells: original.cells.map((cell, i) => (i === index + 2 ? { ...cell, text: String(copies) } : cell)),
      };
    });
}

describe('parseReport: sample reports', () => {
  it('reads Sample A (Wisdom PDF server)', async () => {
    const report = await sample('a');
    expect(report.format).toBe('current');
    expect(report.colour).toEqual(
      colourWith({ 'ASIP at': 1, 'CBD103 KB': 2, 'MC1R e1': 1, 'TYRP1 bc': 1, 'TYRP1 bs': 1, 'MFSD12 i': 2, 'MITF sp': 2 }),
    );
    expect(report.missingLoci).toEqual([]);
    expect(report.shortTail).toBe(0);
    expect(report.sex).toBe('male');
    expect(report.name).toBe('Sample A');
    expect(report.breed).toBe('Spanish Water Dog');
  });

  it('reads Sample B (iOS print)', async () => {
    const report = await sample('b');
    expect(report.colour).toEqual(
      colourWith({ 'ASIP at': 2, 'CBD103 KB': 1, 'MC1R Em': 1, 'TYRP1 bc': 2, 'TYRP1 bd': 1, 'MFSD12 i': 1, 'MITF sp': 1 }),
    );
    expect(report.missingLoci).toEqual([]);
    expect(report.sex).toBe('female');
    expect(report.name).toBe('Sample B');
  });

  it('reads Sample C (macOS print)', async () => {
    const report = await sample('c');
    expect(report.colour).toEqual(
      colourWith({ 'ASIP at': 2, 'CBD103 KB': 1, 'TYRP1 bc': 1, 'TYRP1 bs': 1, 'MFSD12 i': 1 }),
    );
    expect(report.missingLoci).toEqual([]);
    expect(report.shortTail).toBe(0);
    expect(report.sex).toBe('male');
  });

  it.each([
    ['d', 'female'],
    ['e', 'male'],
  ] as const)('reads older-format Sample %s, counting the confidential Cocker sable row as tested', async (letter, sex) => {
    const report = await sample(letter);
    expect(report.format).toBe('mydogdna');
    expect(report.colour.ASIP).toEqual({ ay: 0, a: 0, at: 2 });
    expect(report.colour.CBD103).toEqual({ KB: 1 });
    expect(report.colour.TYRP1).toEqual({ basd: 0, bc: 1, bd: 0, be: 0, bh: 0, bs: 1 });
    expect(report.colour.MC1R?.eH).toBe(0);
    expect(report.missingLoci).toEqual([]);
    expect(report.shortTail).toBe(0);
    expect(report.sex).toBe(sex);
    expect(report.name).toBe(`Sample ${letter.toUpperCase()}`);
    expect(report.health).toEqual([]);
  });

  it('assigns one older-format eA copy to eA, with the Cocker sable row before Mask', async () => {
    const report = await sample('d', withCopies('MC1R', 'eA', 1));
    expect(report.colour.MC1R).toEqual({ eH: 0, Em: 0, e1: 1, e2: 0, e3: 0, eA: 1, eG: 0 });
  });

  it('lists TYRP1 as missing when its rows are removed, and still reads the other loci', async () => {
    const report = await sample('a', (lines) => lines.filter((kept) => !kept.cells.some((cell) => cell.text === 'TYRP1')));
    expect(report.missingLoci).toEqual(['TYRP1']);
    expect(report.colour.TYRP1).toBeUndefined();
    expect(report.colour.ASIP).toEqual({ ay: 0, a: 0, at: 1 });
  });

  it('keeps the two confidential conditions and the two VWF G>A conditions apart, each with its own name', async () => {
    const { health } = await sample('a');
    const confidential = health.filter((row) => row.gene === 'Confidential').map((row) => row.name);
    expect(confidential).toEqual([
      'Amelogenesis Imperfecta (Discovered in the Lancashire Heeler)',
      'Hypophosphatasia',
    ]);
    const vwf = health
      .filter((row) => row.gene === 'VWF' && row.variant === 'G>A')
      .map(({ name, inheritance }) => [name, inheritance]);
    expect(vwf).toEqual([
      ["von Willebrand's Disease, type 1", 'AD'],
      ["von Willebrand's Disease, type 3 (Discovered in the Kooiker Hound)", 'AR'],
    ]);
  });

  it('reads the "known in the breed" CDDY block and a carrier', async () => {
    const a = await sample('a');
    expect(a.health.find((row) => row.gene === 'FGF4 retrogene')).toEqual({
      name: 'Chondrodystrophy (CDDY) and Intervertebral Disc Disease (IVDD) Risk',
      gene: 'FGF4 retrogene',
      variant: 'Insertion',
      copies: 2,
      result: 'At Risk',
      inheritance: 'AD',
      knownInBreed: true,
    });
    const b = await sample('b');
    expect(b.health.find((row) => row.name === 'Degenerative Myelopathy')).toMatchObject({
      gene: 'SOD1',
      copies: 1,
      result: 'Carrier',
      inheritance: 'AR',
      knownInBreed: false,
    });
  });

  it('reads the X-linked recessive and mitochondrial inheritance modes', async () => {
    const { health } = await sample('a');
    const inheritanceOf = (name: string) => health.find((row) => row.name === name)?.inheritance;
    expect(inheritanceOf('Hemophilia A (Discovered in the German Shepherd Dog - Variant 1)')).toBe('XR');
    expect(inheritanceOf('Sensory Ataxic Neuropathy')).toBe('MT');
  });

  it('gives each report its own kit-ID hash, and the same report the same hash', async () => {
    const hashes = await Promise.all(FIXTURE_LETTERS.map(async (letter) => (await sample(letter)).kitIdHash));
    expect(new Set(hashes).size).toBe(FIXTURE_LETTERS.length);
    expect((await sample('a')).kitIdHash).toBe(hashes[0]);
  });
});

describe('parseReport: header', () => {
  it('names the dog by its profile name when it differs from the registered name', async () => {
    const report = await parsed([...currentHeader('M', 'Sample A', 'Sample A Registered'), line(6, 602, [307, 'ASIP'], [365, 'ay'], [417, '0']), CURRENT_FOOTER]);
    expect(report.name).toBe('Sample A');
  });

  it('names the dog by its registered name when the profile carries the same name', async () => {
    const report = await parsed([...currentHeader('F', 'Sample B', 'Sample B'), line(6, 602, [307, 'ASIP'], [365, 'ay'], [417, '0']), CURRENT_FOOTER]);
    expect(report.name).toBe('Sample B');
  });

  it('falls back to the registered name when there is no other name', async () => {
    const report = await parsed([
      MYDOGDNA_TITLE,
      MYDOGDNA_BRAND,
      line(1, 554, [36, 'Registered Name']),
      line(1, 540, [36, 'SAMPLE REGISTERED']),
      line(16, 597, [251, 'ASIP'], [333, 'ay'], [408, '0']),
    ]);
    expect(report.name).toBe('SAMPLE REGISTERED');
  });

  it.each([
    ['M', 'male'],
    ['F', 'female'],
    ['Male', 'male'],
    ['Female', 'female'],
  ] as const)('reads sex %s as %s', async (printed, sex) => {
    const report = await parsed([...currentHeader(printed), line(6, 602, [307, 'ASIP'], [365, 'ay'], [417, '0']), CURRENT_FOOTER]);
    expect(report.sex).toBe(sex);
  });

  it.each(['Uros', 'X', 'Male/Female'])('leaves an unexpected sex value %s unparsed', async (printed) => {
    const report = await parsed([...currentHeader(printed), line(6, 602, [307, 'ASIP'], [365, 'ay'], [417, '0']), CURRENT_FOOTER]);
    expect(report.sex).toBeNull();
  });

  it('keeps the kit ID only as its SHA-256 hash', async () => {
    const report = await parsed([...currentHeader(), line(6, 602, [307, 'ASIP'], [365, 'ay'], [417, '0']), CURRENT_FOOTER]);
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('KIT000A'));
    expect(report.kitIdHash).toBe(Buffer.from(digest).toString('hex'));
    expect(JSON.stringify(report)).not.toContain('KIT000A');
  });

  it('reads the breed', async () => {
    const report = await parsed([...currentHeader(), line(6, 602, [307, 'ASIP'], [365, 'ay'], [417, '0']), CURRENT_FOOTER]);
    expect(report.breed).toBe('Spanish Water Dog');
  });
});
