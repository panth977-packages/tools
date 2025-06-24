import { isPromiseLike, VoidFn } from "./utils.ts";

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
 * function newAsyncCb(id: number): PPromise<Record<string, number>> {
 *   const [port, promise] = $async<Record<string, number>>();
 *   const process = someApi(id);
 *   process.ondata = port.return;
 *   process.onerror = port.throw;
 *   port.oncancel(process.stop);
 *   process.start();
 *   return promise;
 * }
 * const promise = newAsyncCb(124);
 * const transformed = promise.then(console.log, console.error, () => console.debug('Process was canceled!'), true);
 * setTimeout(transformed.cancel.bind(transformed), 1000);
 * await transformed;
 * ```
 */
export function $async<T>(
  cancelable: boolean,
): readonly [PPromisePort<T>, PPromise<T>] {
  const promise = new PPromise<T>(cancelable);
  const port: PPromisePort<T> = PPromise.createPort(promise);
  return [port, promise] as const;
}

export interface PPromisePort<T> {
  return(data: T): void;
  throw(error: unknown): void;
  oncancel(cb: () => void): void;
}

export class PPromise<T> implements PromiseLike<T> {
  // 0 => pending
  // 1 => done
  // 2 => error
  // 3 => canceled
  private result: [0] | [1, T] | [2, unknown] | [3] = [0];
  private dataCb?: ((data: T) => void)[] = [];
  private errorCb?: ((error: unknown) => void)[] = [];
  private cancelCb?: (() => void)[] = [];
  private endCb?: (() => void)[] = [];
  constructor(private readonly cancelable: boolean) {}
  static debug = false;
  private static onError(error: unknown) {
    if (this.debug) {
      console.error(error);
    }
  }
  private shrinkMemory(): void {
    delete this.dataCb;
    delete this.errorCb;
    delete this.endCb;
    delete this.cancelCb;
    Object.freeze(this);
    Object.freeze(this.result);
  }
  // --- controller ---b
  static createPort<T>(promise: PPromise<T>): PPromisePort<T> {
    return {
      return: promise.resolve.bind(promise),
      throw: promise.reject.bind(promise),
      oncancel: promise.oncancel.bind(promise),
    };
  }
  private resolve(data: T | PromiseLike<T>): void {
    if (this.dataCb === undefined) return;
    if (isPromiseLike(data)) {
      data.then(this.resolve.bind(this), this.reject.bind(this));
      return;
    }
    this.result = [1, data];
    for (const cb of this.dataCb) {
      try {
        cb(data);
      } catch (error) {
        PPromise.onError(error);
      }
    }
    if (this.endCb !== undefined) {
      for (const cb of this.endCb) {
        try {
          cb();
        } catch (error) {
          PPromise.onError(error);
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
        PPromise.onError(error);
      }
    }
    if (this.endCb !== undefined) {
      for (const cb of this.endCb) {
        try {
          cb();
        } catch (error) {
          PPromise.onError(error);
        }
      }
    }
    this.shrinkMemory();
  }
  cancel(): void {
    if (!this.cancelable) return;
    if (this.cancelCb === undefined) return;
    this.result = [3];
    for (const cb of this.cancelCb) {
      try {
        cb();
      } catch (error) {
        PPromise.onError(error);
      }
    }
    if (this.endCb !== undefined) {
      for (const cb of this.endCb) {
        try {
          cb();
        } catch (error) {
          PPromise.onError(error);
        }
      }
    }
    this.shrinkMemory();
  }
  // --- events ---
  ondata(cb: (data: T) => void): this {
    if (this.dataCb === undefined) {
      if (this.result[0] === 1) {
        try {
          cb(this.result[1]);
        } catch (error) {
          PPromise.onError(error);
        }
      }
      return this;
    }
    this.dataCb.push(cb);
    return this;
  }
  onerror(cb: (error: unknown) => void): this {
    if (this.errorCb === undefined) {
      if (this.result[0] === 2) {
        try {
          cb(this.result[1]);
        } catch (error) {
          PPromise.onError(error);
        }
      }
      return this;
    }
    this.errorCb.push(cb);
    return this;
  }
  oncancel(cb: () => void): this {
    if (!this.cancelable) return this;
    if (this.cancelCb === undefined) {
      if (this.result[0] === 3) {
        try {
          cb();
        } catch (error) {
          PPromise.onError(error);
        }
      }
      return this;
    }
    this.cancelCb.push(cb);
    return this;
  }
  onend(cb: () => void): this {
    if (this.endCb === undefined) {
      if (this.result[0] !== 0) {
        try {
          cb();
        } catch (error) {
          PPromise.onError(error);
        }
      }
      return this;
    }
    this.endCb.push(cb);
    return this;
  }
  // --- values ---
  get __value__(): T {
    if (this.result[0] === 1) return this.result[1];
    throw new Error("PPromise did not resolve.");
  }
  get __error__(): unknown {
    if (this.result[0] === 2) return this.result[1];
    throw new Error("PPromise did not reject.");
  }
  get __status__(): "Pending" | "Resolved" | "Rejected" | "Canceled" {
    switch (this.result[0]) {
      case 0:
        return "Pending";
      case 1:
        return "Resolved";
      case 2:
        return "Rejected";
      case 3:
        return "Canceled";
      default:
        throw new Error("Unknown case occured!");
    }
  }
  // --- pipe ---
  private static _pipe(
    ondata: (data: any) => any,
    onerror: ((reason: any) => any) | null | undefined,
    promise: PPromise<any>,
    data: any,
  ): void {
    try {
      const result = ondata(data);
      if (isPromiseLike(result)) {
        result.then(
          promise.resolve.bind(promise),
          onerror
            ? PPromise._pipe.bind(PPromise, onerror, null, promise)
            : promise.reject.bind(promise),
        );
      } else {
        promise.resolve(result);
      }
    } catch (error) {
      if (onerror) {
        PPromise._pipe(onerror, null, promise, error);
      } else {
        promise.reject(error);
      }
    }
  }
  map<TResult1 = T, TResult2 = never, TResult3 = never>(
    onfulfilled?:
      | ((value: T) => TResult1 | PromiseLike<TResult1>)
      | null
      | undefined,
    onrejected?:
      | ((reason: any) => TResult2 | PromiseLike<TResult2>)
      | null
      | undefined,
    oncanceled?: (() => TResult3 | PromiseLike<TResult3>) | null | undefined,
    bindCancel?: boolean,
  ): PPromise<TResult1 | TResult2 | TResult3> {
    const promise = new PPromise<TResult1 | TResult2 | TResult3>(
      this.cancelable,
    );
    if (onfulfilled) {
      this.ondata(
        PPromise._pipe.bind(PPromise, onfulfilled, onrejected, promise),
      );
    } else {
      this.ondata((promise as PPromise<any>).resolve.bind(promise));
    }
    if (onrejected) {
      this.onerror(PPromise._pipe.bind(PPromise, onrejected, null, promise));
    } else {
      this.onerror(promise.reject.bind(promise));
    }
    if (oncanceled) {
      this.oncancel(
        PPromise._pipe.bind(
          PPromise,
          oncanceled,
          onrejected,
          promise,
          undefined,
        ),
      );
    } else {
      this.oncancel(promise.cancel.bind(promise));
    }
    if (bindCancel) {
      promise.oncancel(this.cancel.bind(this));
    }
    return promise;
  }
  then<TResult1 = T, TResult2 = never>(
    onfulfilled?:
      | ((value: T) => TResult1 | PromiseLike<TResult1>)
      | null
      | undefined,
    onrejected?:
      | ((reason: any) => TResult2 | PromiseLike<TResult2>)
      | null
      | undefined,
  ): PPromise<TResult1 | TResult2> {
    return this.map(onfulfilled, onrejected, PPromise.ThrowCancel, true);
  }
  catch<TResult2 = never>(
    onrejected?:
      | ((reason: any) => TResult2 | PromiseLike<TResult2>)
      | null
      | undefined,
  ): PromiseLike<T | TResult2> {
    return this.map(null, onrejected, PPromise.ThrowCancel, true);
  }
  catchCancel<TResult = never>(
    oncanceled?: (() => TResult | PromiseLike<TResult>) | undefined | null,
    bindCancel: boolean = true,
  ): PPromise<T | TResult> {
    return this.map(null, null, oncanceled, bindCancel);
  }
  // --- statics ---
  static resolve<T>(
    promise: PPromise<T>,
    value: T | PromiseLike<T>,
  ): PPromise<T>;
  static resolve<T>(value: T | PromiseLike<T>): PPromise<T>;
  static resolve<T>(
    ...args: [PPromise<T>, T | PromiseLike<T>] | [T | PromiseLike<T>]
  ): PPromise<T> {
    if (args.length === 1) {
      const promise = new PPromise<T>(false);
      promise.resolve(args[0]);
      return promise;
    } else {
      args[0].resolve(args[1]);
      return args[0];
    }
  }
  static reject<T>(promise: PPromise<T>, error: unknown): PPromise<T>;
  static reject<T>(error: unknown): PPromise<T>;
  static reject<T>(...args: [PPromise<T>, unknown] | [unknown]): PPromise<T> {
    if (args.length === 1) {
      const promise = new PPromise<T>(false);
      promise.reject(args[0]);
      return promise;
    } else {
      args[0].reject(args[1]);
      return args[0];
    }
  }
  // --- merge ---
  private static _allState(len: number) {
    return {
      cnt: 0,
      finalCnt: (len * (len + 1)) / 2,
      err: false,
      result: new Array(len),
      promise: new PPromise<any>(true),
    };
  }
  private static _allResolveCb(
    state: ReturnType<typeof this._allState>,
    i: number,
    value: any,
  ) {
    if (state.err) return;
    state.cnt += i;
    state.result[i] = value;
    if (state.cnt >= state.finalCnt) {
      state.promise.resolve(state.result);
      const _s = state as Partial<typeof state>;
      delete _s.result;
      delete _s.promise;
      delete _s.cnt;
      delete _s.finalCnt;
    }
  }
  private static _allRejectCb(
    state: ReturnType<typeof this._allState>,
    _i: number,
    error: unknown,
  ) {
    if (state.err) return;
    state.err = true;
    state.promise.reject(error);
    const _s = state as Partial<typeof state>;
    delete _s.result;
    delete _s.promise;
    delete _s.cnt;
    delete _s.finalCnt;
  }
  /**
   * ```ts
   * const [a, b, c] = await AsyncCbReceiver.all([
   *   Promise.resolve(0),
   *   PPromise.from(Promise.resolve("1")),
   *   PPromise.resolve({ t: 3 }).then((x) => x.t).catchError(() => 0).then((x) => AsyncCbReceiver.resolve(`${x}`)),
   * ]);
   * ```
   */
  static all<T extends readonly any[] | []>(
    data: T,
    bindCancel = true,
  ): PPromise<{ -readonly [P in keyof T]: Awaited<T[P]> }> {
    const state = PPromise._allState(data.length);
    const promise = state.promise;
    for (let i = 0; i < data.length; i++) {
      let process = data[i];
      if (process instanceof PPromise) {
        if (bindCancel) promise.oncancel(process.cancel.bind(process));
        process = process.catchCancel(PPromise.ThrowCancel);
      }
      if (isPromiseLike(process)) {
        process.then(
          PPromise._allResolveCb.bind(PPromise, state, i),
          PPromise._allRejectCb.bind(PPromise, state, i),
        );
      } else {
        PPromise._allResolveCb(state, i, process);
      }
    }
    return promise;
  }
  static allCompleted(data: any[], bindCancel = true): PPromise<void> {
    const state = PPromise._allState(data.length);
    const promise = state.promise;
    for (let i = 0; i < data.length; i++) {
      let process = data[i];
      if (process instanceof PPromise) {
        if (bindCancel) promise.oncancel(process.cancel.bind(process));
        process = process.catchCancel(PPromise.ThrowCancel);
      }
      if (isPromiseLike(process)) {
        process.then(
          PPromise._allResolveCb.bind(PPromise, state, i),
          PPromise._allResolveCb.bind(PPromise, state, i),
        );
      } else {
        PPromise._allResolveCb(state, i, process);
      }
    }
    const out = promise.then(VoidFn);
    return out;
  }
  // --- conversion ---
  static from<T>(promiseLike: PromiseLike<T>): PPromise<T> {
    if (promiseLike instanceof PPromise) return promiseLike;
    const promise = new PPromise<T>(false);
    promiseLike.then(
      promise.resolve.bind(promise),
      promise.reject.bind(promise),
    );
    return promise;
  }
  promisified(): Promise<T> {
    return new Promise((resolve, reject) => {
      this.ondata(resolve).onerror(reject);
    });
  }
  // --- utils ---
  static ThrowCancel(): never {
    throw new CancelError();
  }
  static VoidCancel(): void {}
}

class CancelError extends Error {
  constructor() {
    super("Process Was Canceled!");
  }
}
