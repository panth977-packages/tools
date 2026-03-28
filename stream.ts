export class PStream<T> {
  private controller: ReadableStreamDefaultController<T> | null = null;
  private abort?: ((reason?: any) => void)[] = [];
  private abortReason?: any;
  readonly stream: ReadableStream<T> = new ReadableStream<T>({
    start: this.onStart.bind(this),
    cancel: this.onCancel.bind(this),
  });
  private onStart(controller: ReadableStreamDefaultController<T>) {
    this.controller = controller;
  }
  private onCancel(reason?: any): void {
    for (const fn of this.abort ?? []) {
      fn(reason);
    }
    delete this.abort;
    this.controller = null;
    this.abortReason = reason;
  }
  emit(data: T): void {
    this.controller?.enqueue(data);
  }
  close(): void {
    this.controller?.close();
    for (const fn of this.abort ?? []) {
      fn();
    }
    delete this.abort;
    this.controller = null;
  }
  error(e?: any) {
    this.controller?.error(e);
    for (const fn of this.abort ?? []) {
      fn(e);
    }
    delete this.abort;
    this.controller = null;
    this.abortReason = e;
  }
  onAbort(fn: (reason?: any) => void) {
    if (this.abort) {
      this.abort.push(fn);
    } else {
      fn(this.abortReason);
    }
  }

  static async TransferStream<L, P>(
    stream: ReadableStream<L>,
    port: PStream<P>,
    { listen, onError = port.error.bind(port), onEnd = port.close.bind(port) }:
      {
        listen: (data: L) => void;
        onError?: (err: unknown) => void;
        onEnd?: "none" | (() => void);
      },
  ) {
    try {
      const reader = stream.getReader();
      const abortedSymbol = Symbol("aborted");
      const aborted = new Promise<typeof abortedSymbol>((resolve) =>
        port.onAbort(resolve.bind(null, abortedSymbol))
      );
      let isCanceled = false;
      port.onAbort(() => (isCanceled = true));
      while (true) {
        const result = await Promise.race([
          reader.read(),
          aborted,
        ]);
        if (result === abortedSymbol) {
          reader.releaseLock();
          stream.cancel();
          break;
        }
        if (result.done) break;
        listen(result.value);
      }
      if (!isCanceled) {
        if (onEnd != "none") onEnd();
      }
    } catch (err) {
      onError(err);
    }
  }
}
