// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from 'vitest';
import { resolveDog } from '../../src/genetics/dog.ts';
import { predictPuppies, type PuppyPrediction } from '../../src/genetics/results.ts';
import { fraction } from '../../src/health/fraction.ts';
import { renderResults } from '../../src/ui/results.ts';
import { sampleReport } from './app.ts';

const SETTLE_NOTE = "Some figures are ranges because the report can't settle a parent's genotype.";

let prediction: PuppyPrediction;

beforeAll(async () => {
  const [a, b] = await Promise.all([sampleReport('a'), sampleReport('b')]);
  prediction = predictPuppies(resolveDog(a), resolveDog(b));
});

function text(ranges: PuppyPrediction['ranges']): string {
  const root = document.createElement('div');
  root.append(...renderResults({ names: ['Sample A', 'Sample B'], prediction: { ...prediction, ranges }, openQuestion: false }));
  return root.textContent ?? '';
}

describe('the ranges note', () => {
  it('shows when a figure reads as a range', () => {
    expect(text([{ min: fraction(0), max: fraction(1, 4) }])).toContain(SETTLE_NOTE);
  });

  it('does not show when every range reads as one figure', () => {
    const collapsed = [
      { min: fraction(127, 256), max: fraction(1, 2) },
      { min: fraction(0), max: fraction(1, 256) },
      { min: fraction(255, 256), max: fraction(1) },
    ];
    expect(text(collapsed)).not.toContain('Some figures are ranges');
  });
});

describe('the same-sex card', () => {
  const render = (sameSex?: 'male' | 'female') => {
    const root = document.createElement('div');
    root.append(...renderResults({ names: ['Sample A', 'Sample B'], prediction, openQuestion: false, sameSex }));
    return root;
  };

  it('sits above the heading, which it describes, for two females', () => {
    const root = render('female');
    const card = root.querySelector<HTMLElement>('.same-sex');
    expect(card?.textContent).toBe('Both parents are female. Successful breeding of two female dogs may be difficult. The results are shown anyway.');
    expect(card?.nextElementSibling?.id).toBe('results-h');
    expect(root.querySelector('#results-h')?.getAttribute('aria-describedby')).toBe(card?.id);
  });

  it('is absent when no shared sex is given', () => {
    const root = render();
    expect(root.querySelector('.same-sex')).toBeNull();
    expect(root.querySelector('#results-h')?.hasAttribute('aria-describedby')).toBe(false);
  });
});
