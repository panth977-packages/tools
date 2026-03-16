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
export function $async<T>(): readonly [PPromisePort<T>, PPromise<T>] {
  const promise = new PPromise<T>();
  const port: PPromisePort<T> = new PPromisePort(promise);
  return [port, promise] as const;
}

export class PPromise<T> implements PromiseLike<T> {
  // 0 => pending
  // 1 => done
  // 2 => error
  // 3 => canceled
  private _state: 0 | 1 | 2 | 3 = 0;
  private _value: any; // reuse for data and error
  // [tag, cb, tag, cb, ...]
  // 1: data, 2: error, 3: cancel, 4: end
  private callbacks?: any[];
  constructor(process?: (port: PPromisePort<T>) => void) {
    if (process) {
      const port = new PPromisePort(this);
      try {
        process(port);
      } catch (err) {
        port.throw(err);
      }
    }
  }
  static port() {
    return class PPromisePort<T> {
      constructor(private promise: any) {}
      return(data: T | PromiseLike<T>): void {
        this.promise.resolve(data);
      }
      throw(error: unknown): void {
        this.promise.reject(error);
      }
      oncancel(cb: () => void): void {
        this.promise.oncancel(cb);
      }
      get canceled(): boolean {
        return this.promise._state === 3;
      }
    };
  }
  // --- controller ---
  private resolve(data: T | PromiseLike<T>): void {
    if (this._state !== 0) return;
    if (isPromiseLike(data)) {
      data.then(this.resolve.bind(this), this.reject.bind(this));
      return;
    }
    this._state = 1;
    this._value = data;
    const cbs = this.callbacks;
    if (cbs) {
      for (let i = 0; i < cbs.length; i += 2) {
        const tag = cbs[i];
        if (tag === 1) {
          try {
            cbs[i + 1](data);
          } catch (error) {
            console.error(error);
          }
        } else if (tag === 4) {
          try {
            cbs[i + 1]();
          } catch (error) {
            console.error(error);
          }
        }
      }
    }
    this.callbacks = undefined;
  }
  private reject(error: unknown): void {
    if (this._state !== 0) return;
    this._state = 2;
    this._value = error;
    const cbs = this.callbacks;
    if (cbs) {
      for (let i = 0; i < cbs.length; i += 2) {
        const tag = cbs[i];
        if (tag === 2) {
          try {
            cbs[i + 1](error);
          } catch (error) {
            console.error(error);
          }
        } else if (tag === 4) {
          try {
            cbs[i + 1]();
          } catch (error) {
            console.error(error);
          }
        }
      }
    }
    this.callbacks = undefined;
  }
  cancel(): void {
    if (this._state !== 0) return;
    this._state = 3;
    const cbs = this.callbacks;
    if (cbs) {
      for (let i = 0; i < cbs.length; i += 2) {
        const tag = cbs[i];
        if (tag === 3 || tag === 4) {
          try {
            cbs[i + 1]();
          } catch (error) {
            console.error(error);
          }
        }
      }
    }
    this.callbacks = undefined;
  }
  // --- events ---
  ondata(cb: (data: T) => void): this {
    if (this._state === 1) {
      try {
        cb(this._value);
      } catch (error) {
        console.error(error);
      }
    } else if (this._state === 0) {
      if (this.callbacks) this.callbacks.push(1, cb);
      else this.callbacks = [1, cb];
    }
    return this;
  }
  onerror(cb: (error: unknown) => void): this {
    if (this._state === 2) {
      try {
        cb(this._value);
      } catch (error) {
        console.error(error);
      }
    } else if (this._state === 0) {
      if (this.callbacks) this.callbacks.push(2, cb);
      else this.callbacks = [2, cb];
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
    } else if (this._state === 0) {
      if (this.callbacks) this.callbacks.push(3, cb);
      else this.callbacks = [3, cb];
    }
    return this;
  }
  onend(cb: () => void): this {
    if (this._state !== 0) {
      try {
        cb();
      } catch (error) {
        console.error(error);
      }
    } else {
      if (this.callbacks) this.callbacks.push(4, cb);
      else this.callbacks = [4, cb];
    }
    return this;
  }
  // --- values ---
  get __value__(): T {
    if (this._state === 1) return this._value;
    throw new Error("PPromise did not resolve.");
  }
  get __error__(): unknown {
    if (this._state === 2) return this._value;
    throw new Error("PPromise did not reject.");
  }
  get __status__(): "Pending" | "Resolved" | "Rejected" | "Canceled" {
    switch (this._state) {
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
  private static _map(
    port: PPromisePort<any>,
    fn: (data: any) => any,
    data: any,
  ) {
    try {
      const r = fn(data);
      if (isPromiseLike(r)) {
        const p = PPromise.resolve(r);
        p.ondata(port.return);
        p.onerror(port.throw);
        port.oncancel(p.cancel);
      } else {
        port.return(r);
      }
    } catch (err) {
      port.throw(err);
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
    oncanceled?:
      | ((cancel: void) => TResult3 | PromiseLike<TResult3>)
      | null
      | undefined,
    bindCancel?: boolean,
  ): PPromise<TResult1 | TResult2 | TResult3> {
    const promise = new PPromise<any>();
    const port = new PPromisePort(promise);
    if (onfulfilled) {
      this.ondata(PPromise._map.bind(PPromise, port, onfulfilled));
    } else {
      this.ondata(port.return);
    }
    if (onrejected) {
      this.onerror(PPromise._map.bind(PPromise, port, onrejected));
    } else {
      this.onerror(port.throw);
    }
    if (oncanceled) {
      this.oncancel(PPromise._map.bind(PPromise, port, oncanceled, undefined));
    } else {
      this.oncancel(promise.cancel.bind(promise));
    }
    if (bindCancel) port.oncancel(this.cancel.bind(this));
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
  ): PPromise<T | TResult2> {
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
      if (args[0] instanceof PPromise) return args[0];
      const promise = new PPromise<T>();
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
      const promise = new PPromise<T>();
      promise.reject(args[0]);
      return promise;
    } else {
      args[0].reject(args[1]);
      return args[0];
    }
  }
  // --- merge ---

  private static allUtils = {
    onData(
      state: { cnt: number | null; result: any },
      port: PPromisePort<any>,
      key: number | string,
      data: any,
    ) {
      if (state.cnt == null) return;
      state.result[key] = data;
      state.cnt--;
      if (state.cnt === 0) {
        state.cnt = null;
        port.return(state.result);
      }
    },
    onError(
      state: { cnt: number | null; result: any },
      port: PPromisePort<any>,
      err: unknown,
    ) {
      if (state.cnt == null) return;
      state.result = null;
      state.cnt = null;
      port.throw(err);
    },
    onCancel(
      state: { cnt: number | null; result: any },
      port: PPromisePort<any>,
    ) {
      if (state.cnt == null) return;
      state.result = null;
      state.cnt = null;
      port.throw(new Error("Some of this promise was canceled!"));
    },
    bindData(
      p: PPromise<any>,
      state: { cnt: number | null; result: any },
      port: PPromisePort<any>,
      key: number | string,
      bindCancel: boolean,
    ) {
      p.ondata(PPromise.allUtils.onData.bind(PPromise, state, port, key));
      p.onerror(PPromise.allUtils.onError.bind(PPromise, state, port));
      p.oncancel(PPromise.allUtils.onCancel.bind(PPromise, state, port));
      if (bindCancel) port.oncancel(p.cancel.bind(p));
    },
    bindEnd(
      p: PPromise<any>,
      state: { cnt: number | null; result: any },
      port: PPromisePort<any>,
      key: number | string,
      bindCancel: boolean,
    ) {
      const onData = PPromise.allUtils.onData.bind(
        PPromise,
        state,
        port,
        key,
        null,
      );
      p.ondata(onData);
      p.onerror(onData);
      p.oncancel(onData);
      if (bindCancel) port.oncancel(p.cancel.bind(p));
    },
  };
  /**
   * ```ts
   * const [a, b, c] = await AsyncCbReceiver.all([
   *   Promise.resolve(0),
   *   PPromise.resolve(Promise.resolve("1")),
   *   PPromise.resolve({ t: 3 }).then((x) => x.t).catchError(() => 0).then((x) => AsyncCbReceiver.resolve(`${x}`)),
   * ]);
   * ```
   */
  static all<T extends readonly any[] | []>(
    data: T,
    bindCancel?: boolean,
  ): PPromise<{ -readonly [P in keyof T]: Awaited<T[P]> }>;
  static all<T extends Record<string, any>>(
    data: T,
    bindCancel?: boolean,
  ): PPromise<{ readonly [P in keyof T]: Awaited<T[P]> }>;
  static all(data: any, bindCancel = true): PPromise<any> {
    if (Array.isArray(data)) {
      const state: { cnt: number | null; result: any } = {
        cnt: data.length,
        result: Array(data.length),
      };
      if (state.cnt === 0) return PPromise.resolve(state.result);
      const promise = new PPromise<any>();
      const port = new PPromisePort(promise);
      for (let i = 0; i < data.length; i++) {
        const p = PPromise.resolve(data[i]);
        PPromise.allUtils.bindData(p, state, port, i, bindCancel);
      }
      return promise;
    }
    if (typeof data === "object" && data) {
      const state: { cnt: number | null; result: any } = {
        cnt: Object.keys(data).length,
        result: {},
      };
      if (state.cnt === 0) return PPromise.resolve(state.result);
      const promise = new PPromise<any>();
      const port = new PPromisePort(promise);
      for (const key in data) {
        const p = PPromise.resolve(data[key]);
        PPromise.allUtils.bindData(p, state, port, key, bindCancel);
      }
      return promise;
    }
    throw new Error("Unknown Data");
  }
  static allCompleted(
    data: any[] | Record<string, any>,
    bindCancel = true,
  ): PPromise<void> {
    if (Array.isArray(data)) {
      const state: { cnt: number | null; result: any } = {
        cnt: data.length,
        result: Array(data.length),
      };
      if (state.cnt === 0) return PPromise.resolve(state.result);
      const promise = new PPromise<any>();
      const port = new PPromisePort(promise);
      for (let i = 0; i < data.length; i++) {
        const p = PPromise.resolve(data[i]);
        PPromise.allUtils.bindEnd(p, state, port, i, bindCancel);
      }
      return promise.then(VoidFn);
    }
    if (typeof data === "object" && data) {
      const state: { cnt: number | null; result: any } = {
        cnt: Object.keys(data).length,
        result: {},
      };
      if (state.cnt === 0) return PPromise.resolve(state.result);
      const promise = new PPromise<any>();
      const port = new PPromisePort(promise);
      for (const key in data) {
        const p = PPromise.resolve(data[key]);
        PPromise.allUtils.bindEnd(p, state, port, key, bindCancel);
      }
      return promise.then(VoidFn);
    }
    throw new Error("Unknown Data");
  }
  // --- conversion ---
  static from<T>(promiseLike: PromiseLike<T>): PPromise<T> {
    if (!isPromiseLike(promiseLike)) {
      throw new Error("Only Promise Like are allowed");
    }
    return PPromise.resolve(promiseLike);
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

export const PPromisePort = PPromise.port();
export type PPromisePort<T> = InstanceType<typeof PPromisePort<T>>;

class CancelError extends Error {
  constructor() {
    super("Process Was Canceled!");
  }
}
