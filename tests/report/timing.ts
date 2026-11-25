const RUNS = 3;

// Generous: the crafted inputs take a few tens of milliseconds, and the
// passes they guard against take seconds.
export const PASS_BUDGET_MS = 500;

/** The fastest of three runs of `work`, in milliseconds: a loaded CI runner slows some runs, rarely all three. */
export function fastestRunMs(work: () => void): number {
  let fastest = Number.POSITIVE_INFINITY;
  for (let run = 0; run < RUNS; run++) {
    const start = performance.now();
    work();
    fastest = Math.min(fastest, performance.now() - start);
  }
  return fastest;
}
