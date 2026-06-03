import { describe, expect, it } from 'vitest';
import { formatHandoffCode, hashHandoffCode, normalizeHandoffCode } from './handoff';

describe('handoff code helpers', () => {
  it('normalizes user-entered codes before lookup', () => {
    expect(normalizeHandoffCode(' abcd1-efgh2 ')).toBe('ABCD1EFGH2');
    expect(formatHandoffCode('abcd1efgh2')).toBe('ABCD1-EFGH2');
  });

  it('hashes equivalent formatted codes to the same value', async () => {
    await expect(hashHandoffCode('ABCD1-EFGH2', 'pepper')).resolves.toBe(
      await hashHandoffCode('abcd1efgh2', 'pepper'),
    );
  });
});
