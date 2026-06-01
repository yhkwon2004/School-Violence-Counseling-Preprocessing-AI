import * as SecureStore from 'expo-secure-store';
import type { DraftSnapshot, DraftStore } from '@ieumlog/domain';
import {
  MAX_DRAFT_CHUNKS,
  joinDraftSnapshot,
  parseDraftChunkCount,
  splitDraftSnapshot,
} from './draftChunks';

export class SecureDraftStore implements DraftStore {
  async read(caseId: string): Promise<DraftSnapshot | null> {
    const rawCount = await SecureStore.getItemAsync(this.countKey(caseId));
    if (rawCount === null) return null;
    const count = parseDraftChunkCount(rawCount);
    if (count === null) {
      await this.clearChunks(caseId, MAX_DRAFT_CHUNKS);
      return null;
    }

    const chunks = await Promise.all(
      Array.from({ length: count }, (_, index) => SecureStore.getItemAsync(this.chunkKey(caseId, index))),
    );
    const draft = joinDraftSnapshot(chunks);
    if (!draft) await this.clearChunks(caseId, count);
    return draft;
  }

  async write(caseId: string, draft: DraftSnapshot): Promise<void> {
    const chunks = splitDraftSnapshot(draft);
    const rawPreviousCount = await SecureStore.getItemAsync(this.countKey(caseId));
    const previousCount = parseDraftChunkCount(rawPreviousCount);
    const cleanupCount = rawPreviousCount === null ? 0 : previousCount ?? MAX_DRAFT_CHUNKS;

    await Promise.all(chunks.map((chunk, index) => SecureStore.setItemAsync(this.chunkKey(caseId, index), chunk)));
    await SecureStore.setItemAsync(this.countKey(caseId), String(chunks.length));
    await Promise.all(
      Array.from({ length: Math.max(0, cleanupCount - chunks.length) }, (_, index) =>
        SecureStore.deleteItemAsync(this.chunkKey(caseId, chunks.length + index)),
      ),
    );
  }

  async clear(caseId: string): Promise<void> {
    const rawCount = await SecureStore.getItemAsync(this.countKey(caseId));
    const count = rawCount === null ? 0 : parseDraftChunkCount(rawCount) ?? MAX_DRAFT_CHUNKS;
    await this.clearChunks(caseId, count);
  }

  private async clearChunks(caseId: string, count: number) {
    await Promise.all(
      Array.from({ length: count }, (_, index) => SecureStore.deleteItemAsync(this.chunkKey(caseId, index))),
    );
    await SecureStore.deleteItemAsync(this.countKey(caseId));
  }

  private countKey(caseId: string) {
    return `ieumlog:${caseId}:draft-count`;
  }

  private chunkKey(caseId: string, index: number) {
    return `ieumlog:${caseId}:draft-${index}`;
  }
}
