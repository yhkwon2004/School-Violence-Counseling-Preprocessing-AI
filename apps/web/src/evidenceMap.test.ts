import { describe, expect, it } from 'vitest';
import { evidenceFactLabel } from './evidenceMap';

describe('evidenceFactLabel', () => {
  it('shows every FactBlock sequence linked to an evidence asset', () => {
    expect(evidenceFactLabel('evidence-1', [
      { sequence: 1, evidenceIds: ['evidence-1'] },
      { sequence: 2, evidenceIds: ['evidence-2'] },
      { sequence: 3, evidenceIds: ['evidence-1', 'evidence-3'] },
    ])).toBe('진술 1, 진술 3');
  });

  it('does not invent a sequence for an unlinked asset', () => {
    expect(evidenceFactLabel('evidence-4', [
      { sequence: 1, evidenceIds: ['evidence-1'] },
    ])).toBe('연결 확인');
  });
});
