import { describe, expect, it } from 'vitest';
import {
  buildLines,
  MAX_TEXT_ITEMS_PER_DOCUMENT,
  MAX_TEXT_ITEMS_PER_PAGE,
  type TextItem,
} from '../../src/report/pdfText.ts';
import { fastestRunMs, PASS_BUDGET_MS } from './timing.ts';

const BODY = 8;
const OLD_SUPERSCRIPT = { size: 5.3, rise: 5.3 };
const CURRENT_SUPERSCRIPT = { size: 5.2, rise: 1.5 };

function item(str: string, x: number, y: number, width: number, size = BODY): TextItem {
  return { str, x, y, width, size };
}

function texts(lines: ReturnType<typeof buildLines>): string[][] {
  return lines.map((line) => line.cells.map((cell) => cell.text));
}

describe('buildLines', () => {
  it('groups items on one baseline into a line ordered by x, dropping whitespace', () => {
    const lines = buildLines([
      [
        item('0', 408.6, 597, 5.4),
        item('ASIP', 251.7, 597, 18.3),
        item(' ', 270, 597, 63.2),
        item('No effect', 542.4, 597, 33.6),
      ],
    ]);
    expect(texts(lines)).toEqual([['ASIP', '0', 'No effect']]);
    expect(lines[0]?.page).toBe(1);
  });

  it('orders lines by page, then from the top of the page down', () => {
    const lines = buildLines([
      [item('lower', 36, 100, 20), item('upper', 36, 700, 20)],
      [item('next page', 36, 750, 40)],
    ]);
    expect(texts(lines)).toEqual([['upper'], ['lower'], ['next page']]);
    expect(lines.map((line) => line.page)).toEqual([1, 1, 2]);
  });

  it('attaches an older-format superscript raised above the baseline to its code letter', () => {
    const { size, rise } = OLD_SUPERSCRIPT;
    const lines = buildLines([
      [
        item('ASIP', 251.7, 597, 18.3),
        item('a', 333.2, 597, 4.4),
        item(' ', 337.7, 597, 1),
        item('y', 338.7, 597 + rise, 2.9, size),
        item('0', 408.6, 597, 5.4),
      ],
    ]);
    expect(texts(lines)).toEqual([['ASIP', 'ay', '0']]);
  });

  it('attaches a current-format superscript, raised only slightly', () => {
    const { size, rise } = CURRENT_SUPERSCRIPT;
    const lines = buildLines([
      [
        item('CBD103', 301.1, 498.6, 30),
        item('K', 364.4, 498.6, 5.7),
        item('B', 370, 498.6 + rise, 3.5, size),
        item(' ', 373.5, 498.6 + rise, 58.9, size),
        item('2', 417.7, 498.6, 4.6),
      ],
    ]);
    expect(texts(lines)).toEqual([['CBD103', 'KB', '2']]);
  });

  it('reads a superscript digit as part of the code, not as the copy count', () => {
    const { size, rise } = OLD_SUPERSCRIPT;
    const lines = buildLines([
      [
        item('MC1R', 249, 429, 21),
        item('e', 333, 429, 4.5),
        item(' ', 337.4, 429, 1),
        item('2', 338.4, 429 + rise, 3.1, size),
        item('0', 408.6, 429, 5.4),
      ],
    ]);
    expect(texts(lines)).toEqual([['MC1R', 'e2', '0']]);
  });

  it('keeps the three older-format ASIP codes distinct', () => {
    const { size, rise } = OLD_SUPERSCRIPT;
    const lines = buildLines([
      [
        item('ASIP', 251.7, 597, 18.3),
        item('a', 333.2, 597, 4.4),
        item('y', 338.7, 597 + rise, 2.9, size),
        item('0', 408.6, 597, 5.4),
        item('ASIP', 251.7, 573, 18.3),
        item('a', 337.6, 573, 4.4),
        item('0', 408.6, 573, 5.4),
        item('ASIP', 251.7, 549, 18.3),
        item('a', 334.3, 549, 4.6),
        item('t', 339.7, 549 + rise, 2.1, size),
        item('2', 409.2, 549, 4.8),
      ],
    ]);
    expect(texts(lines)).toEqual([
      ['ASIP', 'ay', '0'],
      ['ASIP', 'a', '0'],
      ['ASIP', 'at', '2'],
    ]);
  });

  it('keeps a wrapped fragment in full-size type on its own line', () => {
    const lines = buildLines([
      [
        item('Widow’s Peak (Discovered in Ancient', 36, 385, 138.6),
        item('dogs)', 36, 374.6, 21.8),
        item('MC1R', 249, 381, 21),
        item('0', 408.6, 381, 5.4),
      ],
    ]);
    expect(texts(lines)).toEqual([
      ['Widow’s Peak (Discovered in Ancient'],
      ['MC1R', '0'],
      ['dogs)'],
    ]);
  });

  it('puts a heading in a slightly larger font on the line of the column headers beside it', () => {
    const lines = buildLines([
      [
        item('Hyperuricosuria', 34, 356.9, 71.1, 9),
        item('Gene', 286.3, 357.6, 19.6),
        item('Result', 523.3, 357.6, 23.8),
      ],
    ]);
    expect(texts(lines)).toEqual([['Hyperuricosuria', 'Gene', 'Result']]);
  });

  it('joins a label and its value separated by one space into one cell', () => {
    const lines = buildLines([
      [
        item('ID kit:', 210.2, 746.9, 22.8),
        item(' ', 233.1, 746.9, 2.2),
        item('KIT0000', 234.8, 746.9, 41.9),
        item('Test date:', 400, 746.9, 38.6),
      ],
    ]);
    expect(texts(lines)).toEqual([['ID kit: KIT0000', 'Test date:']]);
  });

  it(`attaches superscripts on a page of ${MAX_TEXT_ITEMS_PER_PAGE} items without comparing every pair`, () => {
    const { size, rise } = CURRENT_SUPERSCRIPT;
    const perLine = 50;
    const items = Array.from({ length: MAX_TEXT_ITEMS_PER_PAGE / 2 }, (_, index) => {
      const x = 30 + (index % perLine) * 10;
      const y = 800 - Math.floor(index / perLine) * 7;
      return [item('a', x, y, 4), item('y', x + 4.2, y + rise, 3, size)];
    }).flat();
    let lines: ReturnType<typeof buildLines> = [];
    const elapsed = fastestRunMs(() => {
      lines = buildLines([items]);
    });
    // Comparing every pair takes about 900 ms here; the band scan about 10 ms.
    expect(elapsed).toBeLessThan(PASS_BUDGET_MS);
    expect(lines).toHaveLength(MAX_TEXT_ITEMS_PER_PAGE / 2 / perLine);
    expect(texts(lines).flat().every((text) => text === Array(perLine).fill('ay').join(' '))).toBe(true);
  });

  it('attaches a raised item of at least 0.4 of its base’s size, and leaves a smaller one apart', () => {
    const raisedBeside = (size: number) =>
      texts(buildLines([[item('A', 100, 500, 12, 20), item('y', 115, 502, 3, size)]]));
    expect(raisedBeside(9)).toEqual([['Ay']]);
    expect(raisedBeside(7)).toEqual([['A y']]);
  });

  it('attaches superscripts quickly on full pages that each carry one outsized item', () => {
    const { size, rise } = CURRENT_SUPERSCRIPT;
    const perLine = 50;
    const outlierSize = 1000;
    const pages = Math.floor(MAX_TEXT_ITEMS_PER_DOCUMENT / MAX_TEXT_ITEMS_PER_PAGE);
    const pairsPerPage = (MAX_TEXT_ITEMS_PER_PAGE - 1) >> 1;
    // Far enough below the rows to stay a line of its own.
    const page = [
      item('X', 0, -outlierSize, 10, outlierSize),
      ...Array.from({ length: pairsPerPage }, (_, index) => {
        const x = 30 + (index % perLine) * 10;
        const y = 800 - Math.floor(index / perLine) * 7;
        return [item('a', x, y, 4), item('y', x + 4.2, y + rise, 3, size)];
      }).flat(),
    ];
    let lines: ReturnType<typeof buildLines> = [];
    const elapsed = fastestRunMs(() => {
      lines = buildLines(Array.from({ length: pages }, () => page));
    });
    // A band as deep as the outlier's rise took seconds here.
    expect(elapsed).toBeLessThan(PASS_BUDGET_MS);
    const pairs = texts(lines).flat().filter((text) => text !== 'X').join(' ').split(' ');
    expect(pairs).toHaveLength(pages * pairsPerPage);
    expect(pairs.every((text) => text === 'ay')).toBe(true);
  });

  it('keeps a copy count apart from result text a few points to its right', () => {
    const lines = buildLines([
      [
        item('1', 410.8, 114, 3.2),
        item(' ', 414, 114, 7.3),
        item('Black features likely, chocolate possible', 421.3, 114, 154.7),
      ],
    ]);
    expect(texts(lines)).toEqual([['1', 'Black features likely, chocolate possible']]);
  });
});
