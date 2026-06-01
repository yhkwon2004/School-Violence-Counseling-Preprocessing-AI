import type { DraftSnapshot } from '@ieumlog/domain';

export const DRAFT_CHUNK_SIZE = 1400;
export const MAX_DRAFT_CHUNKS = 16;

export function parseDraftChunkCount(raw: string | null): number | null {
  if (raw === null) return null;
  const count = Number(raw);
  return Number.isInteger(count) && count >= 1 && count <= MAX_DRAFT_CHUNKS ? count : null;
}

export function splitDraftSnapshot(draft: DraftSnapshot): string[] {
  if (!isDraftSnapshot(draft)) throw new Error('초안 형식이 올바르지 않습니다.');
  const serialized = JSON.stringify(draft);
  const chunks: string[] = [];
  let current = '';
  let currentBytes = 0;
  for (const character of serialized) {
    const characterBytes = utf8ByteLength(character);
    if (current && currentBytes + characterBytes > DRAFT_CHUNK_SIZE) {
      chunks.push(current);
      current = '';
      currentBytes = 0;
    }
    current += character;
    currentBytes += characterBytes;
  }
  if (current) chunks.push(current);
  if (chunks.length > MAX_DRAFT_CHUNKS) throw new Error('초안 저장 한도를 넘었습니다.');
  return chunks;
}

export function utf8ByteLength(value: string): number {
  let bytes = 0;
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    bytes += codePoint <= 0x7f ? 1 : codePoint <= 0x7ff ? 2 : codePoint <= 0xffff ? 3 : 4;
  }
  return bytes;
}

export function joinDraftSnapshot(chunks: Array<string | null>): DraftSnapshot | null {
  if (!chunks.length || chunks.some((chunk) => chunk === null)) return null;
  try {
    const draft = JSON.parse(chunks.join('')) as unknown;
    return isDraftSnapshot(draft) ? draft : null;
  } catch {
    return null;
  }
}

function isDraftSnapshot(value: unknown): value is DraftSnapshot {
  if (!value || typeof value !== 'object') return false;
  const draft = value as Partial<DraftSnapshot>;
  return typeof draft.memo === 'string'
    && draft.memo.length <= 1000
    && Number.isInteger(draft.step)
    && Number(draft.step) >= 0
    && Number(draft.step) <= 5
    && typeof draft.updatedAt === 'string'
    && !Number.isNaN(Date.parse(draft.updatedAt));
}
