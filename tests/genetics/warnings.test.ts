import { describe, expect, it } from 'vitest';
import { DOUBLE_MERLE_WHITE, FLAG_INFO, FLAGS } from '../../src/genetics/phenotype.ts';
import { CAVEAT_TEXT, caveatText, COLOUR_WARNING_TEXT, CROSS_CAVEATS } from '../../src/genetics/warnings.ts';

describe('caveatText', () => {
  it("gives a cross caveat's own text and a flag's caveat", () => {
    expect(caveatText('deafness')).toBe(CAVEAT_TEXT.deafness);
    expect(caveatText('mask')).toBe(FLAG_INFO.mask.caveat);
  });

  it('has a text for every caveat id', () => {
    for (const id of [...CROSS_CAVEATS, ...FLAGS]) {
      expect(caveatText(id), id).not.toBe('');
    }
  });
});

describe('double merle wording', () => {
  it('describes the whiteness of double merle in the same words everywhere', () => {
    for (const text of [
      COLOUR_WARNING_TEXT['double-merle'].text,
      COLOUR_WARNING_TEXT['double-merle-unknown'].text,
      caveatText('white-piebald-only'),
      caveatText('mostly-white'),
    ]) {
      expect(text).toContain(DOUBLE_MERLE_WHITE);
    }
  });
});

describe('merle allele length', () => {
  // Murphy 2018: unsized merle alleles range from faint to harlequin-length.
  it('says an unsized merle may show weaker or stronger than predicted', () => {
    expect(caveatText('merle-allele-length')).toMatch(/weaker or stronger than shown/);
  });
});

describe('unknown-locus warnings', () => {
  it.each(['double-merle-unknown', 'harlequin-lethal-unknown'] as const)(
    '%s reads true when neither parent has a known result',
    (kind) => {
      const { text } = COLOUR_WARNING_TEXT[kind];
      expect(text).not.toMatch(/one parent carries/i);
      expect(text).toMatch(/neither parent is known to be free of/);
    },
  );
});
