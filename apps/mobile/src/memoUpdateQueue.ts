export class MemoUpdateQueue {
  private tail: Promise<void> = Promise.resolve();

  enqueue(update: () => Promise<void>) {
    const queued = this.tail.catch(() => undefined).then(update);
    this.tail = queued;
    return queued;
  }

  waitForIdle() {
    return this.tail;
  }
}
