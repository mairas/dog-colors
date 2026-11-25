import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { findFixtureMarkers, readBuild } from '../scripts/fixture-check.ts';

const CLEAN = new Map([
  ['index.html', '<!doctype html><script type="module" src="/dog-colors/assets/index.js"></script>'],
  ['assets/index.js', 'const e=document.querySelector("#app");console.log("Puppy colours")'],
]);

const withFile = (path: string, text: string): Map<string, string> => new Map([...CLEAN, [path, text]]);

describe('findFixtureMarkers', () => {
  it('accepts a build without fixture code', () => {
    expect(findFixtureMarkers(CLEAN)).toEqual([]);
  });

  it.each([
    ['the fixture module’s entry point', 'export{a as stateFromQuery}', 'stateFromQuery'],
    ['a fixture state name', 'const t={"slot-unanswerable":()=>s()}', 'slot-unanswerable'],
    ['a placeholder sample name', '{name:"Sample Q"}', 'Sample Q'],
    ['a placeholder kit ID', '"KIT000D"', 'KIT000'],
    ['a placeholder microchip number', '"000000000000000"', '000000000000000'],
  ])('rejects %s', (_kind, text, marker) => {
    expect(findFixtureMarkers(withFile('assets/dev-1a2b.js', text))).toEqual([`assets/dev-1a2b.js contains "${marker}"`]);
  });

  it('names every file and marker it finds', () => {
    const files = new Map([...withFile('assets/a.js', 'stateFromQuery;"Sample A"'), ['assets/b.js', 'results-warnings']]);
    expect(findFixtureMarkers(files)).toEqual([
      'assets/a.js contains "stateFromQuery"',
      'assets/a.js contains "Sample A"',
      'assets/b.js contains "results-warnings"',
    ]);
  });

  it('rejects a build with no script, which proves nothing', () => {
    expect(findFixtureMarkers(new Map([['index.html', '<!doctype html>']]))).toEqual(['no JavaScript file in the build']);
  });
});

describe('readBuild', () => {
  let directory = '';

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  it('reads every text file under the directory by its relative path, skipping fonts', () => {
    directory = mkdtempSync(join(tmpdir(), 'fixture-check-'));
    mkdirSync(join(directory, 'assets'));
    mkdirSync(join(directory, 'fonts'));
    writeFileSync(join(directory, 'index.html'), '<html>');
    writeFileSync(join(directory, 'assets', 'index.js'), 'stateFromQuery');
    writeFileSync(join(directory, 'assets', 'pdf.worker.min.mjs'), 'worker');
    writeFileSync(join(directory, 'fonts', 'archivo.woff2'), Buffer.from([0x77, 0x4f, 0x46, 0x32]));
    expect(readBuild(directory)).toEqual(
      new Map([
        ['assets/index.js', 'stateFromQuery'],
        ['assets/pdf.worker.min.mjs', 'worker'],
        ['index.html', '<html>'],
      ]),
    );
  });
});
