import type { z } from "zod/v4";

/**
 * a "zod" schema compatible pubsub with strong type Internal PubSub
 *
 * @example
 * ```ts
 * const onUserChange = new PubSub(z.object({ userId: z.number(), name: z.string() }));
 * async function updateUserName(userId: number, name: string) {
 *   ...
 *   await onUserChange.publish('async', {userId, name});
 * }
 * function getUser(userId: number) {
 *   let userObj = cache.get(`USER_${userId}`);
 *   if (!userObj) {
 *     userObj = ...
 *     cache.set(`USER_${userId}`, userObj);
 *   }
 *   return userObj;
 * }
 * onUserChange.subscribe('cb', function (event, cb) {
 *  cache.del(`USER_${event.userId}`, cb);
 * })
 * ```
 */
export class PubSub<Z extends z.ZodType> {
  readonly eventSchema: Z;
  private asyncListners: Array<(event: z.infer<Z>) => Promise<void>>;
  private cbListners: Array<(event: z.infer<Z>, cb: VoidFunction) => void>;
  constructor(eventSchema: Z) {
    this.eventSchema = eventSchema;
    this.asyncListners = [];
    this.cbListners = [];
  }

  private createOnComplete(l: number, cb: VoidFunction) {
    return () => {
      l--;
      if (l === 0) {
        cb!();
      }
    };
  }

  /**
   * publish the event.
   * this assumes the all callbacks, are error handled, and so no error shall be expected from publish
   * - `WARNING`: If you expect subscribers function to throw error, then keep it 'async' & subscribe under 'async'
   * - `NOTE`: you can pass async handler and callback handler, and will be invoked by any form of publish.
   */
  publish(type: "async", _event: z.infer<Z>): Promise<void>;
  publish(type: "cb", _event: z.infer<Z>, cb: VoidFunction): void;
  publish(
    type: "async" | "cb",
    _event: z.infer<Z>,
    cb?: VoidFunction,
  ): Promise<void> | void {
    if (this.asyncListners.length === 0 && this.cbListners.length === 0) {
      if (type === "async") {
        return Promise.resolve();
      } else {
        cb!();
        return;
      }
    }
    const event = this.eventSchema.parse(_event);
    if (type === "async") {
      const jobs = [];
      for (const cb of this.asyncListners) {
        jobs.push(cb(event));
      }
      if (this.cbListners.length) {
        const job = new Promise<void>((res) => {
          const onComplete = this.createOnComplete(this.cbListners.length, res);
          for (const cb of this.cbListners) {
            cb(event, onComplete);
          }
        });
        jobs.push(job);
      }
      return Promise.allSettled(jobs) as Promise<any>;
    } else if (type === "cb") {
      const onComplete = this.createOnComplete(
        this.cbListners.length + (this.asyncListners.length ? 1 : 0),
        cb!,
      );
      if (this.asyncListners.length) {
        const jobs = [];
        for (const cb of this.asyncListners) {
          jobs.push(cb(event));
        }
        Promise.allSettled(jobs).then(onComplete);
      }
      for (const cb of this.cbListners) {
        cb(event, onComplete);
      }
    }
  }

  private createUnlisten(type: "async" | "cb", cb: any): VoidFunction {
    if (type === "async") {
      return () => {
        const i = this.asyncListners.findIndex(cb);
        if (i !== -1) {
          this.asyncListners.splice(i, 1);
        }
      };
    } else if (type === "cb") {
      return () => {
        const i = this.cbListners.findIndex(cb);
        if (i !== -1) {
          this.cbListners.splice(i, 1);
        }
      };
    } else {
      throw new Error("Invalid type");
    }
  }

  /**
   * subscribe to the event.
   * this expects a callback that has error handling inside
   * - `WARNING`: If you expect function to throw error, then keep it 'async' & publish under 'async'
   * - `NOTE`: you can pass async handler and callback handler, and will be invoked by any form of publish.
   */
  subscribe(
    type: "async",
    cb: (event: z.infer<Z>) => Promise<void>,
  ): VoidFunction;
  subscribe(
    type: "cb",
    cb: (event: z.infer<Z>, cb: VoidFunction) => void,
  ): VoidFunction;
  subscribe(type: "async" | "cb", cb: any): VoidFunction {
    if (type === "async") {
      this.asyncListners.push(cb);
      return this.createUnlisten("async", cb);
    } else if (type === "cb") {
      this.cbListners.push(cb);
      return this.createUnlisten("cb", cb);
    } else {
      throw new Error("Invalid type");
    }
  }
}

/**
 * Allows different location of code to call same implementation and runs in batch
 * @param delayInMs wait for other exe to come through
 * @param implementation batch implementation
 * @returns a individual argument callie
 *
 * @example
 * ```ts
 * const start = Date.now();
 * const myFunc = new CreateBatch<number, string>((args, cb) => {
 *   cb(["Data", args.map((x) => `${x} => ${x ** 2}`)]);
 * }, 5000).$();
 * myFunc("async", 10); // 100, after 5 sec
 * myFunc("async", 20); // 400, after 5 sec
 * myFunc("cb", 5, console.log); // 25, after 5 sec
 * setTimeout(() => myFunc("async", 3), 1000); // 9, after 5 sec
 * setTimeout(() => myFunc("async", 4), 6000); // 16, after 11 sec
 * setTimeout(() => myFunc("async", 8), 10000); // 64, after 11 sec
 * ```
 */
export class CreateBatch<A, R> {
  protected queue: [A, (r: ["Error", unknown] | ["Data", R]) => void][] = [];
  protected timer: null | ReturnType<typeof setTimeout> = null;
  constructor(
    protected implementation: (
      arg: A[],
      cb: (r: ["Error", unknown] | ["Data", R[]]) => void,
    ) => void,
    protected delayInMs: number,
  ) {
  }
  protected processQueue() {
    const args = this.queue.map((i) => i[0]);
    const cbs = this.queue.map((i) => i[1]);
    this.queue = [];
    this.timer = null;
    try {
      this.implementation(args, (r) => {
        if (r[0] === "Data") {
          cbs.forEach((cb, index) => cb(["Data", r[1][index]]));
        } else {
          cbs.forEach((cb) => cb(["Error", r[1]]));
        }
      });
    } catch (error) {
      cbs.forEach((cb) => cb(["Error", error]));
    }
  }

  private static promisify<R>(
    res: (value: R) => void,
    rej: (error: unknown) => void,
    r: ["Error", unknown] | ["Data", R],
  ) {
    if (r[0] === "Data") {
      res(r[1]);
    } else {
      rej(r[1]);
    }
  }
  private promisify(
    arg: A,
    res: (value: R) => void,
    rej: (error: unknown) => void,
  ) {
    this.queue.push([
      arg,
      (CreateBatch.promisify<R>).bind(CreateBatch, res, rej),
    ]);
    this.timer ??= setTimeout(this.processQueue.bind(this), this.delayInMs);
  }
  runJob(type: "async", arg: A): Promise<R>;
  runJob(
    type: "cb",
    arg: A,
    cb: (r: ["Error", unknown] | ["Data", R]) => void,
  ): void;
  runJob(
    type: "async" | "cb",
    arg: A,
    cb?: (r: ["Error", unknown] | ["Data", R]) => void,
  ): Promise<R> | void {
    if (type === "async") {
      return new Promise(this.promisify.bind(this, arg));
    } else {
      if (!cb) throw new Error("Need [cb] in cb mode.");
      this.queue.push([arg, cb]);
      this.timer ??= setTimeout(this.processQueue.bind(this), this.delayInMs);
    }
  }
  $(): this["runJob"] {
    return this.runJob.bind(this);
  }
}
