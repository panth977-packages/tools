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
 * setTimeout(transformed.cancel.bind(transformed), 1000);
 * transformed.listen(console.log, console.error);
 * ```
 */
export function $stream<T>(): readonly [PStreamPort<T>, PStream<T>] {
  const promise = new PStream<T>();
  const port: PStreamPort<T> = PStream.createPort(promise);
  return [port, promise] as const;
}

export interface PStreamPort<T> {
  emit(data: T): void;
  return(): void;
  throw(error: unknown): void;
  oncancel(cb: () => void): void;
}

export class PStream<T> {
  // 0 => pending
  // 1 => yielded
  // 2 => error
  // 3 => canceled
  // 4 => completed
  private unflusedData?: T[] = [];
  private result: [0] | [1] | [2, unknown] | [3] | [4] = [0];
  private nextCb?: ((data: T) => void)[] = [];
  private errorCb?: ((error: unknown) => void)[] = [];
  private completedCb?: (() => void)[] = [];
  private cancelCb?: (() => void)[] = [];
  private endCb?: (() => void)[] = [];
  static debug = false;
  private static onError(error: unknown) {
    if (this.debug) {
      console.error(error);
    }
  }
  private shrinkMemory(): void {
    if (this.unflusedData === undefined) {
      delete this.nextCb;
    }
    delete this.errorCb;
    delete this.endCb;
    delete this.cancelCb;
    Object.freeze(this);
    Object.freeze(this.result);
  }
  // --- controller ---
  static createPort<T>(promise: PStream<T>): PStreamPort<T> {
    return {
      emit: promise.emit.bind(promise),
      return: promise.resolve.bind(promise),
      throw: promise.reject.bind(promise),
      oncancel: promise.oncancel.bind(promise),
    };
  }
  private emit(data: T): void {
    if (this.nextCb === undefined) return;
    if (this.result[0] === 0) this.result = [1];
    if (this.unflusedData !== undefined) {
      this.unflusedData.push(data);
    } else {
      if (this.nextCb !== undefined) {
        const nextCb = this.nextCb;
        this.nextCb = [];
        for (const cb of nextCb) {
          try {
            cb(data);
          } catch (err) {
            PStream.onError(err);
          }
        }
      }
    }
  }
  private resolve(): void {
    if (this.completedCb === undefined) return;
    this.result = [4];
    for (const cb of this.completedCb) {
      try {
        cb();
      } catch (error) {
        PStream.onError(error);
      }
    }
    if (this.endCb !== undefined) {
      for (const cb of this.endCb) {
        try {
          cb();
        } catch (error) {
          PStream.onError(error);
        }
      }
    }
    this.shrinkMemory();
  }
  private reject(error: unknown): void {
    if (this.errorCb === undefined) return;
    this.result = [2, error];
    for (const cb of this.errorCb) {
      try {
        cb(error);
      } catch (error) {
        PStream.onError(error);
      }
    }
    if (this.endCb !== undefined) {
      for (const cb of this.endCb) {
        try {
          cb();
        } catch (error) {
          PStream.onError(error);
        }
      }
    }
    this.shrinkMemory();
  }
  cancel(): void {
    if (this.cancelCb === undefined) return;
    this.result = [3];
    for (const cb of this.cancelCb) {
      try {
        cb();
      } catch (error) {
        PStream.onError(error);
      }
    }
    if (this.endCb !== undefined) {
      for (const cb of this.endCb) {
        try {
          cb();
        } catch (error) {
          PStream.onError(error);
        }
      }
    }
    this.shrinkMemory();
  }
  // --- events ---
  onnext(cb: (data: T) => void): this {
    if (this.nextCb !== undefined) {
      this.nextCb.push(cb);
    }
    return this;
  }
  onerror(cb: (error: unknown) => void): this {
    if (this.errorCb === undefined) {
      if (this.result[0] === 2) {
        try {
          cb(this.result[1]);
        } catch (error) {
          PStream.onError(error);
        }
      }
      return this;
    }
    this.errorCb.push(cb);
    return this;
  }
  oncancel(cb: () => void): this {
    if (this.cancelCb === undefined) {
      if (this.result[0] === 3) {
        try {
          cb();
        } catch (error) {
          PStream.onError(error);
        }
      }
      return this;
    }
    this.cancelCb.push(cb);
    return this;
  }
  onfinish(cb: () => void): this {
    if (this.completedCb === undefined) {
      if (this.result[0] === 4) {
        try {
          cb();
        } catch (error) {
          PStream.onError(error);
        }
      }
      return this;
    }
    this.completedCb.push(cb);
    return this;
  }
  onend(cb: () => void): this {
    if (this.endCb === undefined) {
      if (this.result[0] !== 0 && this.result[0] !== 1) {
        try {
          cb();
        } catch (error) {
          PStream.onError(error);
        }
      }
      return this;
    }
    this.endCb.push(cb);
    return this;
  }
  flushData(): this {
    if (this.unflusedData === undefined) return this;
    if (this.nextCb === undefined) return this;
    for (const data of this.unflusedData) {
      const nextCb = this.nextCb;
      this.nextCb = [];
      for (const cb of nextCb) {
        try {
          cb(data);
        } catch (err) {
          PStream.onError(err);
        }
      }
    }
    delete this.unflusedData;
    if (this.result[0] !== 0 && this.result[0] !== 1) {
      this.shrinkMemory();
    }
    return this;
  }
  // --- values ---
  get __error__(): unknown {
    if (this.result[0] === 2) return this.result[1];
    throw new Error("PPromise did not reject.");
  }
  get __status__():
    | "Pending"
    | "Emmiting"
    | "Resolved"
    | "Rejected"
    | "Canceled" {
    switch (this.result[0]) {
      case 0:
        return "Pending";
      case 1:
        return "Emmiting";
      case 2:
        return "Rejected";
      case 3:
        return "Canceled";
      case 4:
        return "Resolved";
      default:
        throw new Error("Unknown case occured!");
    }
  }
  // --- pipe ---
  private _listen(cb: (data: T, i: number) => void, i: number, data: T) {
    this.onnext(this._listen.bind(this, cb, i + 1));
    cb(data, i);
  }
  listen(cb: (data: T, i: number) => void): this {
    if (this.unflusedData === undefined) {
      throw new Error("This stream has already started flushing...");
    }
    this.onnext(this._listen.bind(this, cb, 0));
    this.flushData();
    return this;
  }
  private static _map<T, TResult1>(
    stream: PStream<TResult1>,
    cb: (data: T, i: number) => TResult1,
    onerror: undefined | ((reason: any) => void),
    data: T,
    i: number,
  ) {
    try {
      stream.emit(cb(data, i));
    } catch (err) {
      onerror?.(err);
    }
  }
  map<TResult1>(
    map: (data: T, i: number) => TResult1,
    onerror?: (reason: any) => void,
    bindCancel = true,
  ): PStream<TResult1> {
    if (this.unflusedData === undefined) {
      throw new Error("This stream has already started flushing...");
    }
    const stream = new PStream<TResult1>();
    this.oncancel(stream.cancel.bind(stream));
    this.onfinish(stream.resolve.bind(stream));
    this.onerror(stream.reject.bind(stream));
    if (bindCancel) {
      stream.oncancel(this.cancel.bind(this));
    }
    const listner = (PStream._map<T, TResult1>).bind(
      PStream,
      stream,
      map,
      onerror,
    );
    this.onnext(this._listen.bind(this, listner, 0));
    return stream;
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
