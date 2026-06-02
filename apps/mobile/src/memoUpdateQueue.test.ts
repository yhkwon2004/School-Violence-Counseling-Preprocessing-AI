import { describe, expect, it } from 'vitest';
import { MemoUpdateQueue } from './memoUpdateQueue';

describe('MemoUpdateQueue', () => {
  it('runs memo updates in request order', async () => {
    const queue = new MemoUpdateQueue();
    const calls: string[] = [];
    let releaseFirst: () => void = () => undefined;
    let markFirstStarted: () => void = () => undefined;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const firstStarted = new Promise<void>((resolve) => {
      markFirstStarted = resolve;
    });

    const first = queue.enqueue(async () => {
      calls.push('first:start');
      markFirstStarted();
      await firstGate;
      calls.push('first:end');
    });
    const second = queue.enqueue(async () => {
      calls.push('second');
    });

    await firstStarted;
    expect(calls).toEqual(['first:start']);
    releaseFirst();
    await Promise.all([first, second, queue.waitForIdle()]);
    expect(calls).toEqual(['first:start', 'first:end', 'second']);
  });

  it('continues with the newest update after an earlier request fails', async () => {
    const queue = new MemoUpdateQueue();
    await expect(queue.enqueue(async () => {
      throw new Error('offline');
    })).rejects.toThrow('offline');

    let recovered = false;
    await queue.enqueue(async () => {
      recovered = true;
    });
    expect(recovered).toBe(true);
  });
});
