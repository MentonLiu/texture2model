/** Shared by image decoding and planning so superseded dialog work can stop. */
export class TaskCancelledError extends Error {
  constructor() {
    super('Task cancelled');
    this.name = 'TaskCancelledError';
  }
}

export class CancellationToken {
  private cancelledValue = false;
  private readonly listeners = new Set<() => void>();

  get cancelled(): boolean {
    return this.cancelledValue;
  }

  cancel(): void {
    if (this.cancelledValue) return;
    this.cancelledValue = true;
    for (const listener of this.listeners) listener();
    this.listeners.clear();
  }

  throwIfCancelled(): void {
    if (this.cancelledValue) throw new TaskCancelledError();
  }

  onCancel(listener: () => void): () => void {
    if (this.cancelledValue) {
      listener();
      return () => undefined;
    }
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
