import * as SecureStore from 'expo-secure-store';
import { secureStoreKey } from './secureStoreKeys';

const OFFLINE_SYNC_KEY = secureStoreKey('ieumlog', 'offline', 'sync', 'v1');

export type OfflineSyncSnapshot = {
  loginId: string;
  caseId: string;
  memo: string;
  step: number;
  submitted: boolean;
  updatedAt: string;
};

export class SecureOfflineSyncStore {
  async read(): Promise<OfflineSyncSnapshot | null> {
    const raw = await SecureStore.getItemAsync(OFFLINE_SYNC_KEY);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as Partial<OfflineSyncSnapshot>;
      return isOfflineSyncSnapshot(parsed) ? parsed : null;
    } catch {
      await this.clear();
      return null;
    }
  }

  write(snapshot: OfflineSyncSnapshot): Promise<void> {
    return SecureStore.setItemAsync(OFFLINE_SYNC_KEY, JSON.stringify(snapshot));
  }

  clear(): Promise<void> {
    return SecureStore.deleteItemAsync(OFFLINE_SYNC_KEY);
  }
}

function isOfflineSyncSnapshot(value: Partial<OfflineSyncSnapshot>): value is OfflineSyncSnapshot {
  const step = value.step;
  return typeof value.loginId === 'string'
    && typeof value.caseId === 'string'
    && typeof value.memo === 'string'
    && Number.isInteger(step)
    && typeof step === 'number'
    && step >= 0
    && step <= 5
    && typeof value.submitted === 'boolean'
    && typeof value.updatedAt === 'string'
    && !Number.isNaN(Date.parse(value.updatedAt));
}
