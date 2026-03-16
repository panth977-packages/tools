/**
 * ```ts
 * function traditionalAsyncCb(id: number, cb: (error: unknown, data: Record<string, number> | null) => void) {
 *   const process = someApi(id);
 *   process.ondata = (data) => cb(null, data);
 *   process.onerror = (error) => cb(error, null);
 *   process.start();
 *   return {
 *     stop() {
 *       process.stop();
 *     }
 *   }
 * }
 * traditionalAsyncCb(124, (error, data) => !data ? console.error(error) : console.log(data));
 *
 * function newAsyncCb(id: number): PStream<Record<string, number>> {
 *   const [port, stream] = $stream<Record<string, number>>();
 *   const process = someApi(id);
 *   process.ondata = port.emit;
 *   process.onerror = port.throw;
 *   port.oncancel(process.stop);
 *   process.start();
 *   process.oncompleted = port.return;
 *   return stream;
 * }
 * const stream = newAsyncCb(124);
 * const transformed = stream.map((d) => d['prop'], () => 0);
 * setTimeout(() => transformed.cancel(), 1000);
 * transformed.listen(console.log, console.error);
 * ```
 */
export function $stream<T>(): readonly [PStreamPort<T>, PStream<T>] {
  const stream = new PStream<T>();
  const port: PStreamPort<T> = new PStreamPort(stream);
  return [port, stream] as const;
}

export class PStream<T> {
  // _state values:
  // 0 => pending (no data emitted yet)
  // 1 => emitting (data has been emitted, stream still open)
  // 2 => error (terminal)
  // 3 => canceled (terminal)
  // 4 => completed/resolved (terminal)
  private _state: 0 | 1 | 2 | 3 | 4 = 0;
  private _error: unknown; // only set when _state === 2

  // Buffer for data emitted before .listen() is called.
  // Initialized to []. Set to undefined once flushing starts (listen() called).
  private _buf: T[] | undefined = [];

  // Active data listeners for the current emission slot.
  // Replaced each time data flows (rotating listener pattern).
  // Set to undefined once the stream reaches a terminal state.
  private _next?: ((data: T) => void)[];

  // Flat callbacks array: [tag, fn, tag, fn, ...]
  // Tags: 2=error, 3=cancel, 4=completed, 5=end
  // (tag 1 is reserved for data — handled separately via _next)
  private _callbacks?: any[];

  static port() {
    return class PStreamPort<T> {
      constructor(private stream: PStream<T>) {}
      emit(data: T): void {
        this.stream.emit(data);
      }
      return(): void {
        this.stream.resolve();
      }
      throw(error: unknown): void {
        this.stream.reject(error);
      }
      oncancel(cb: () => void): void {
        this.stream.oncancel(cb);
      }
      get canceled(): boolean {
        return this.stream._state === 3;
      }
    };
  }

  // --- controller ---
  private emit(data: T): void {
    if (this._state > 1) return; // terminal state — drop
    if (this._state === 0) this._state = 1;
    if (this._buf !== undefined) {
      // Not yet flushing — buffer the data
      this._buf.push(data);
    } else {
      // Flushing in progress — dispatch to current listeners
      const next = this._next;
      if (next) {
        this._next = [];
        for (let i = 0; i < next.length; i++) {
          try {
            next[i](data);
          } catch (err) {
            console.error(err);
          }
        }
      }
    }
  }

  private resolve(): void {
    if (this._state > 1) return;
    this._state = 4;
    const cbs = this._callbacks;
    if (cbs) {
      for (let i = 0; i < cbs.length; i += 2) {
        const tag = cbs[i];
        if (tag === 4 || tag === 5) {
          try {
            cbs[i + 1]();
          } catch (error) {
            console.error(error);
          }
        }
      }
    }
    this._callbacks = undefined;
    this._next = undefined;
  }

  private reject(error: unknown): void {
    if (this._state > 1) return;
    this._state = 2;
    this._error = error;
    const cbs = this._callbacks;
    if (cbs) {
      for (let i = 0; i < cbs.length; i += 2) {
        const tag = cbs[i];
        if (tag === 2 || tag === 5) {
          try {
            tag === 2 ? cbs[i + 1](error) : cbs[i + 1]();
          } catch (error) {
            console.error(error);
          }
        }
      }
    }
    this._callbacks = undefined;
    this._next = undefined;
  }

  cancel(): void {
    if (this._state > 1) return;
    this._state = 3;
    const cbs = this._callbacks;
    if (cbs) {
      for (let i = 0; i < cbs.length; i += 2) {
        const tag = cbs[i];
        if (tag === 3 || tag === 5) {
          try {
            cbs[i + 1]();
          } catch (error) {
            console.error(error);
          }
        }
      }
    }
    this._callbacks = undefined;
    this._next = undefined;
  }

  // --- events ---
  onnext(cb: (data: T) => void): this {
    if (this._next !== undefined) {
      this._next.push(cb);
    }
    return this;
  }

  onerror(cb: (error: unknown) => void): this {
    if (this._state === 2) {
      try {
        cb(this._error);
      } catch (error) {
        console.error(error);
      }
    } else if (this._state <= 1) {
      if (this._callbacks) this._callbacks.push(2, cb);
      else this._callbacks = [2, cb];
    }
    return this;
  }

  oncancel(cb: () => void): this {
    if (this._state === 3) {
      try {
        cb();
      } catch (error) {
        console.error(error);
      }
    } else if (this._state <= 1) {
      if (this._callbacks) this._callbacks.push(3, cb);
      else this._callbacks = [3, cb];
    }
    return this;
  }

  onfinish(cb: () => void): this {
    if (this._state === 4) {
      try {
        cb();
      } catch (error) {
        console.error(error);
      }
    } else if (this._state <= 1) {
      if (this._callbacks) this._callbacks.push(4, cb);
      else this._callbacks = [4, cb];
    }
    return this;
  }

  onend(cb: () => void): this {
    if (this._state > 1) {
      // Already in terminal state — fire immediately
      try {
        cb();
      } catch (error) {
        console.error(error);
      }
    } else {
      if (this._callbacks) this._callbacks.push(5, cb);
      else this._callbacks = [5, cb];
    }
    return this;
  }

  private flushBuffer(): this {
    const buf = this._buf;
    if (buf === undefined) return this;
    this._buf = undefined;
    for (let i = 0; i < buf.length; i++) {
      const next = this._next;
      if (!next) break; // became terminal mid-flush
      this._next = [];
      for (let j = 0; j < next.length; j++) {
        try {
          next[j](buf[i]);
        } catch (err) {
          console.error(err);
        }
      }
    }
    // If stream ended while buffering, finalize now
    if (this._state > 1) {
      this._next = undefined;
    }
    return this;
  }

  // --- values ---
  get __error__(): unknown {
    if (this._state === 2) return this._error;
    throw new Error("PStream did not reject.");
  }

  get __status__():
    | "Pending"
    | "Emitting"
    | "Resolved"
    | "Rejected"
    | "Canceled" {
    switch (this._state) {
      case 0:
        return "Pending";
      case 1:
        return "Emitting";
      case 2:
        return "Rejected";
      case 3:
        return "Canceled";
      case 4:
        return "Resolved";
      default:
        throw new Error("Unknown state!");
    }
  }

  // --- pipe ---
  // listen registers a handler that re-registers itself on every emission
  // (so each new value is dispatched to the registered handler chain).
  private _listenStep(cb: (data: T, i: number) => void, i: number, data: T) {
    this.onnext(this._listenStep.bind(this, cb, i + 1));
    cb(data, i);
  }

  listen(cb: (data: T, i: number) => void): this {
    if (this._buf === undefined) {
      throw new Error("This stream has already started flushing...");
    }
    // Initialise the rotating nextCb slot
    this._next = [];
    this.onnext(this._listenStep.bind(this, cb, 0));
    this.flushBuffer();
    return this;
  }

  private static _mapStep<T, TResult1>(
    stream: PStream<TResult1>,
    mapFn: (data: T, i: number) => TResult1,
    onErr: undefined | ((reason: any) => void),
    data: T,
    i: number,
  ) {
    try {
      stream.emit(mapFn(data, i));
    } catch (err) {
      onErr?.(err);
    }
  }

  map<TResult1>(
    mapFn: (data: T, i: number) => TResult1,
    onErr?: (reason: any) => void,
    bindCancel = true,
  ): PStream<TResult1> {
    if (this._buf === undefined) {
      throw new Error("This stream has already started flushing...");
    }
    const child = new PStream<TResult1>();
    this.oncancel(child.cancel.bind(child));
    this.onfinish(child.resolve.bind(child));
    this.onerror(child.reject.bind(child));
    if (bindCancel) child.oncancel(this.cancel.bind(this));
    this.listen((PStream._mapStep<T, TResult1>).bind(PStream, child, mapFn, onErr));
    return child;
  }

  // --- statics ---
  static emit<T>(stream: PStream<T>, value: T): PStream<T>;
  static emit<T>(value: T): PStream<T>;
  static emit<T>(...args: [PStream<T>, T] | [T]): PStream<T> {
    if (args.length === 1) {
      const stream = new PStream<T>();
      stream.emit(args[0]);
      stream.resolve();
      return stream;
    } else {
      args[0].emit(args[1]);
      return args[0];
    }
  }

  static resolve<T>(stream: PStream<T>): PStream<T>;
  static resolve<T>(): PStream<T>;
  static resolve<T>(...args: [PStream<T>] | []): PStream<T> {
    if (args.length === 0) {
      const stream = new PStream<T>();
      stream.resolve();
      return stream;
    } else {
      args[0].resolve();
      return args[0];
    }
  }

  static reject<T>(stream: PStream<T>, error: unknown): PStream<T>;
  static reject<T>(error: unknown): PStream<T>;
  static reject<T>(...args: [PStream<T>, unknown] | [unknown]): PStream<T> {
    if (args.length === 1) {
      const stream = new PStream<T>();
      stream.reject(args[0]);
      return stream;
    } else {
      args[0].reject(args[1]);
      return args[0];
    }
  }
}
export const PStreamPort = PStream.port();
export type PStreamPort<T> = InstanceType<typeof PStreamPort<T>>;
