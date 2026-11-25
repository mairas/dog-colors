import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

// pdf.js 4.2.67 fixed CVE-2024-4367 by honouring isEvalSupported: false.
// Later releases dropped the option along with their last eval path, so the
// reader cannot set it; this test fails if an upgrade brings eval back.
const require = createRequire(import.meta.url);
const packageRoot = dirname(require.resolve('pdfjs-dist/package.json'));
const BUILDS = ['legacy/build/pdf.mjs', 'legacy/build/pdf.worker.min.mjs'];
// core-js reaches its Function('return this') fallback only where globalThis is missing.
const GLOBAL_THIS_FALLBACK = /Function\((['"])return this\1\)/g;

describe('pdf.js', () => {
  it('is at least 4.2.67', () => {
    const { version } = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')) as {
      version: string;
    };
    const [major = 0, minor = 0, patch = 0] = version.split('.').map(Number);
    expect(major * 1e6 + minor * 1e3 + patch).toBeGreaterThanOrEqual(4_002_067);
  });

  it.each(BUILDS)('%s compiles no code at run time', (build) => {
    const source = readFileSync(join(packageRoot, build), 'utf8').replace(GLOBAL_THIS_FALLBACK, '');
    expect(source).not.toMatch(/(?<![\w$.])eval\s*\(/);
    expect(source).not.toMatch(/(?<![\w$.])(new\s+)?Function\s*\(/);
  });
});
