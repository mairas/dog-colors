import { describe, expect, it } from 'vitest';
import { resolveDog } from '../../src/genetics/dog.ts';
import { predictPuppies } from '../../src/genetics/results.ts';
import type { AppState, LoadedSlot } from '../../src/ui/app.ts';
import { STATE_NAMES, stateFromQuery } from '../../src/ui/dev.ts';

const state = (name: string): Promise<AppState> => stateFromQuery(new URLSearchParams({ state: name }));

function loaded(app: AppState): LoadedSlot[] {
  return app.slots.filter((slot): slot is LoadedSlot => slot.kind === 'loaded');
}

describe('the dev-only fixture states', () => {
  it.each(STATE_NAMES)('builds %s', async (name) => {
    await expect(state(name)).resolves.toBeDefined();
  });

  it('reaches the nose question with a synthetic bd 1 + bc 1 parent', async () => {
    const [first] = loaded(await state('slot-questions'));
    expect(first && resolveDog(first.report).questions).toHaveLength(1);
  });

  it('reaches the ASIP ambiguity no question settles', async () => {
    const [first] = loaded(await state('slot-unanswerable'));
    expect(first && resolveDog(first.report).unsettled).toEqual(['ASIP']);
  });

  it('reaches a colour warning', async () => {
    const [first, second] = loaded(await state('results-warnings'));
    expect(first && second && predictPuppies(resolveDog(first.report), resolveDog(second.report)).warnings).toHaveLength(1);
  });

  it('loads any two reports by name', async () => {
    const app = await stateFromQuery(new URLSearchParams({ fixtures: 'c,m' }));
    expect(loaded(app).map((slot) => slot.report.missingLoci)).toEqual([[], ['TYRP1']]);
  });
});
