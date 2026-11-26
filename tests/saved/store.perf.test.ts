import { describe, expect, it } from 'vitest';
import conditions from '../../src/health/conditions.json' with { type: 'json' };
import type { HealthRow, Report } from '../../src/report/types.ts';
import { READER_VERSION } from '../../src/report/version.ts';
import { openSavedDogs, SAVED_DOGS_KEY } from '../../src/saved/store.ts';
import { fixtureReport } from '../report/fixtures.ts';
import { fastestRunMs } from '../report/timing.ts';
import { MemoryStorage, withNoseQuestion } from './storage.ts';

const DOGS = 100;
// Measured at about 30 ms for the 4.6 MB this stores; the budget leaves room for a loaded CI runner.
const BUDGET_MS = 500;

describe('saved-dog store: performance', () => {
  it(`loads ${DOGS} dogs with a full health panel each and writes one nose answer within ${BUDGET_MS} ms`, async () => {
    // A current-format report carries a row for every condition on the panel.
    const health: HealthRow[] = conditions.map(({ name, gene, variant, inheritance }) => ({
      name,
      gene,
      variant,
      copies: 0,
      result: 'Clear',
      inheritance: inheritance as HealthRow['inheritance'],
      knownInBreed: false,
    }));
    const base: Report = { ...withNoseQuestion(await fixtureReport('a')), health };
    const dogs = Array.from({ length: DOGS }, (_, index) => ({
      id: `dog-${index}`,
      readerVersion: READER_VERSION,
      savedAt: index,
      nose: null,
      report: { ...base, name: `Dog ${index}`, kitIdHash: (index + 1).toString(16).padStart(64, 'f') },
    }));
    const storage = new MemoryStorage();
    storage.setItem(SAVED_DOGS_KEY, JSON.stringify({ version: 1, dogs }));

    const elapsed = fastestRunMs(() => {
      const store = openSavedDogs({ storage: () => storage, locale: 'en' });
      store.setNose('dog-50', 'brown');
    });
    const reloaded = openSavedDogs({ storage: () => storage, locale: 'en' });
    expect(reloaded.dogs()).toHaveLength(DOGS);
    expect(reloaded.dog('dog-50')?.nose).toBe('brown');
    expect(reloaded.dog('dog-50')?.status).toBe('current');
    expect(elapsed, `${elapsed.toFixed(0)} ms`).toBeLessThan(BUDGET_MS);
  });
});
