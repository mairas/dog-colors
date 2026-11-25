import { describe, expect, it } from 'vitest';
import { predictPuppies } from '../../src/genetics/results.ts';
import { HETEROZYGOUS, parentLoci } from './genotypes.ts';

describe('predictPuppies: performance', () => {
  it('computes 256 scenarios of a pair heterozygous at every pigment locus in under 500 ms', () => {
    // This file runs on its own after the other tests (the perf project in
    // vite.config.ts), so no parallel test file loads the machine. After a
    // warm-up run, the fastest of three measures the cost.
    const parent = { loci: parentLoci(HETEROZYGOUS) };
    expect(predictPuppies(parent, parent).scenarios).toBe(256);
    const timings = [0, 1, 2].map(() => {
      const start = performance.now();
      predictPuppies(parent, parent);
      return performance.now() - start;
    });
    expect(Math.min(...timings), `timings ${timings.map((ms) => ms.toFixed(0)).join(', ')} ms`).toBeLessThan(500);
  });
});
