export class PStream<T> {
  private controller: ReadableStreamDefaultController<T> | null = null;
  private abort: AbortController = new AbortController();
  readonly stream: ReadableStream<T> = new ReadableStream<T>({
    start: PStream.onStart.bind(PStream, this),
    cancel: PStream.onCancel.bind(PStream, this),
  });
  private static onStart<T>(
    stream: PStream<T>,
    c: ReadableStreamDefaultController<T>,
  ) {
    stream.controller = c;
  }
  private static onCancel<T>(stream: PStream<T>): void {
    stream.abort.abort();
    stream.controller = null;
  }
  emit(data: T): void {
    this.controller?.enqueue(data);
  }
  close(): void {
    this.controller?.close();
    this.abort.abort();
  }
  error(e?: any) {
    this.controller?.error(e);
    this.abort.abort();
  }
  onAbort(fn: VoidFunction) {
    if (!this.controller) {
      fn();
      return;
    }
    this.abort.signal.addEventListener("abort", fn, { once: true });
  }

  static async TransferStream<L, P>(
    stream: ReadableStream<L>,
    port: PStream<P>,
    {
      listen,
      onError = port.error.bind(port),
      onEnd = port.close.bind(port),
    }: {
      listen: (data: L) => void;
      onError?: (err: unknown) => void;
      onEnd?: "none" | (() => void);
    },
  ) {
    try {
      const reader = stream.getReader();
      const aborted = new Promise<void>((resolve) => port.onAbort(resolve));
      let isCanceled = false;
      port.onAbort(() => (isCanceled = true));
      while (true) {
        const result = await Promise.race([
          reader.read().then((data) => ["data", data] as const),
          aborted.then(() => ["aborted"] as const),
        ]);
        if (result[0] === "aborted") {
          reader.releaseLock();
          stream.cancel();
          break;
        }
        if (result[1].done) break;
        listen(result[1].value);
      }
      if (!isCanceled) {
        if (onEnd != "none") onEnd();
      }
    } catch (err) {
      onError(err);
    }
  }
}
