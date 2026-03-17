import type { z } from "zod";
import { AccessKey } from "./basic.ts";

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
  private listners: Array<(event: z.infer<Z>) => PromiseLike<void>>;
  constructor(eventSchema: Z) {
    this.eventSchema = eventSchema;
    this.listners = [];
  }
  static debug = false;
  protected static onError(error: unknown) {
    if (this.debug) {
      console.error(error);
    }
  }

  async publish(event: z.infer<Z>): Promise<void> {
    const parsed = this.eventSchema.safeParse(event);
    if (!parsed.success) {
      throw parsed.error;
    }
    const jobs: PromiseLike<void>[] = [];
    for (const cb of this.listners) {
      try {
        jobs.push(cb(event));
      } catch (err) {
        PubSub.onError(err);
      }
    }
    await Promise.allSettled(jobs);
  }

  private unlisten(cb: (event: z.infer<Z>) => PromiseLike<any>): void {
    const i = this.listners.indexOf(cb);
    if (i !== -1) {
      this.listners.splice(i, 1);
    }
  }

  subscribe(cb: (event: z.infer<Z>) => PromiseLike<any>): VoidFunction {
    this.listners.push(cb);
    return this.unlisten.bind(this, cb);
  }
}

type Deferred<R> = {
  promise: Promise<R>;
  resolve: (value: R) => void;
  reject: (reason: unknown) => void;
};

function deferred<R>(): Deferred<R> {
  let resolve!: (value: R) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<R>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
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
  protected queue: (readonly [A, Deferred<R>])[] = [];
  protected timer: null | ReturnType<typeof setTimeout> = null;
  constructor(
    protected implementation: (arg: A[]) => PromiseLike<R[]>,
    protected delayInMs: number,
  ) {}
  private then(deferreds: Deferred<R>[], data: R[]) {
    for (let i = 0; i < deferreds.length; i++) {
      deferreds[i].resolve(data[i]);
    }
  }
  private catch(deferreds: Deferred<R>[], error: unknown) {
    for (const d of deferreds) {
      d.reject(error);
    }
  }
  protected processQueue() {
    const args = this.queue.map(AccessKey("0"));
    const deferreds = this.queue.map(AccessKey("1"));
    this.queue = [];
    this.timer = null;
    try {
      this.implementation(args).then(
        this.then.bind(this, deferreds),
        this.catch.bind(this, deferreds),
      );
    } catch (error) {
      this.catch(deferreds, error);
    }
  }
  runJob(arg: A): Promise<R> {
    const d = deferred<R>();
    const ele = [arg, d] as const;
    this.queue.push(ele);
    this.timer ??= setTimeout(this.processQueue.bind(this), this.delayInMs);
    return d.promise;
  }
  $(): this["runJob"] {
    return this.runJob.bind(this);
  }
}
