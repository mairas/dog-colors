import type { Line } from '../../src/report/pdfText.ts';

// Wide enough for label/value pairing tests; parsing never relies on widths
// beyond ordering and overlap.
const POINTS_PER_CHARACTER = 4;

export function line(page: number, y: number, ...cells: readonly [number, string][]): Line {
  return {
    page,
    y,
    cells: cells.map(([x, text]) => ({ text, x, width: text.length * POINTS_PER_CHARACTER })),
  };
}
