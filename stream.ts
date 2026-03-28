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
  static Iterable<T>(
    stream: ReadableStream<T>,
    cancelHook?: (cancel: VoidFunction) => void,
  ): IterableStream<T> {
    return new IterableStream(stream, cancelHook);
  }
}

class IterableStream<T> implements AsyncIterableIterator<T> {
  constructor(
    private stream: ReadableStream<T>,
    cancelHook?: (cancel: VoidFunction) => void,
  ) {
    this.reader = this.stream.getReader();
    cancelHook?.(this.cancel.bind(this));
  }
  private reader?: ReadableStreamDefaultReader<T>;
  async next(): Promise<{ done: boolean; value: T }> {
    if (!this.reader) return { done: true, value: undefined as never };
    const { done, value } = await this.reader.read();
    return { done, value: value! };
  }
  return(): Promise<{ done: true; value: undefined }> {
    if (this.reader) {
      this.reader.releaseLock();
      delete this.reader
    }
    return Promise.resolve({ done: true, value: undefined });
  }
  private cancel() {
    if (this.reader) {
      this.reader.releaseLock();
      delete this.reader
      this.stream.cancel();
    }
  }
  [Symbol.asyncIterator](): IterableStream<T> {
    return this;
  }
}
