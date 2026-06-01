import { describe, expect, it } from 'vitest';
import {
  DRAFT_CHUNK_SIZE,
  MAX_DRAFT_CHUNKS,
  joinDraftSnapshot,
  parseDraftChunkCount,
  splitDraftSnapshot,
  utf8ByteLength,
} from './draftChunks';

describe('draftChunks', () => {
  it('splits and restores a valid student draft', () => {
    const draft = {
      memo: '가'.repeat(1000),
      step: 2,
      updatedAt: '2026-06-01T00:00:00.000Z',
    };
    const chunks = splitDraftSnapshot(draft);

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => utf8ByteLength(chunk) <= DRAFT_CHUNK_SIZE)).toBe(true);
    expect(joinDraftSnapshot(chunks)).toEqual(draft);
  });

  it('rejects malformed, incomplete, or oversized draft data', () => {
    expect(joinDraftSnapshot(['{not-json'])).toBeNull();
    expect(joinDraftSnapshot(['{"memo":"메모",', null])).toBeNull();
    expect(joinDraftSnapshot([JSON.stringify({
      memo: 'x'.repeat(1001),
      step: 2,
      updatedAt: '2026-06-01T00:00:00.000Z',
    })])).toBeNull();
    expect(joinDraftSnapshot([JSON.stringify({
      memo: '메모',
      step: 6,
      updatedAt: '2026-06-01T00:00:00.000Z',
    })])).toBeNull();
  });

  it('accepts only bounded positive chunk counts', () => {
    expect(parseDraftChunkCount('2')).toBe(2);
    expect(parseDraftChunkCount(null)).toBeNull();
    expect(parseDraftChunkCount('0')).toBeNull();
    expect(parseDraftChunkCount('1.5')).toBeNull();
    expect(parseDraftChunkCount(String(MAX_DRAFT_CHUNKS + 1))).toBeNull();
  });

  it('counts Korean and supplementary Unicode code points as UTF-8 bytes', () => {
    expect(utf8ByteLength('A가😀')).toBe(8);
  });
});
