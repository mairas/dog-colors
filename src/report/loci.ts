// The colour variants each report format tests, keyed on gene + variant code
// as printed. Codes are canonicalised to the current format's spelling; the
// older MyDogDNA format prints three of them differently.

export type ReportFormat = 'current' | 'mydogdna';

export const COLOUR_GENES = [
  'ASIP',
  'CBD103',
  'MC1R',
  'HPS3',
  'MFSD12',
  'MLPH',
  'TYRP1',
  'MITF',
  'PMEL',
  'PSMB7',
  'RALY',
  'USH2A',
  'SLC45A2',
] as const;

export type ColourGene = (typeof COLOUR_GENES)[number];

export interface ColourVariant {
  readonly gene: ColourGene;
  readonly code: string;
}

export const COLOUR_VARIANTS: readonly ColourVariant[] = [
  { gene: 'ASIP', code: 'ay' },
  { gene: 'ASIP', code: 'a' },
  { gene: 'ASIP', code: 'at' },
  { gene: 'CBD103', code: 'KB' },
  { gene: 'MC1R', code: 'Em' },
  { gene: 'MC1R', code: 'e1' },
  { gene: 'MC1R', code: 'e2' },
  { gene: 'MC1R', code: 'e3' },
  { gene: 'MC1R', code: 'eH' },
  { gene: 'MC1R', code: 'eA' },
  { gene: 'MC1R', code: 'eG' },
  { gene: 'HPS3', code: 'co' },
  { gene: 'MFSD12', code: 'i' },
  { gene: 'MLPH', code: 'd1' },
  { gene: 'MLPH', code: 'd2' },
  { gene: 'MLPH', code: 'd3' },
  { gene: 'TYRP1', code: 'basd' },
  { gene: 'TYRP1', code: 'bc' },
  { gene: 'TYRP1', code: 'bd' },
  { gene: 'TYRP1', code: 'be' },
  { gene: 'TYRP1', code: 'bh' },
  { gene: 'TYRP1', code: 'bs' },
  { gene: 'MITF', code: 'sp' },
  { gene: 'PMEL', code: 'M' },
  { gene: 'PSMB7', code: 'H' },
  // Saddle tan has no allele code; the report prints a dash.
  { gene: 'RALY', code: '-' },
  { gene: 'USH2A', code: 'TRr' },
  { gene: 'SLC45A2', code: 'cal' },
];

/** How a variant's row is printed: gene and code cells, plus the trait name when they are not unique. */
export interface PrintedRow {
  readonly gene: string;
  readonly code: string;
  readonly name?: string;
}

const MYDOGDNA_PRINTED: ReadonlyMap<string, PrintedRow> = new Map([
  // The Cocker sable row hides its gene and code, so only its name identifies it.
  [
    'MC1R eH',
    { gene: 'Confidential', code: '-', name: 'Sable (Discovered in the Cocker Spaniel)' },
  ],
  ['MC1R eG', { gene: 'MC1R', code: 'EG' }],
  ['USH2A TRr', { gene: 'USH2A', code: 'Tr' }],
]);

export function printedRow(format: ReportFormat, variant: ColourVariant): PrintedRow {
  const key = `${variant.gene} ${variant.code}`;
  return (format === 'mydogdna' ? MYDOGDNA_PRINTED.get(key) : undefined) ?? variant;
}

export const SHORT_TAIL: PrintedRow = { gene: 'T-box', code: 'T' };
