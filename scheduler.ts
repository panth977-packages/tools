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
export class PubSub<T, Z extends { parse(event: unknown): T }> {
  readonly eventSchema: Z;
  private asyncListners: Array<(event: T) => Promise<void>>;
  private cbListners: Array<(event: T, cb: VoidFunction) => void>;
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
  publish(type: "async", _event: T): Promise<void>;
  publish(type: "cb", _event: T, cb: VoidFunction): void;
  publish(
    type: "async" | "cb",
    _event: T,
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
  subscribe(type: "async", cb: (event: T) => Promise<void>): VoidFunction;
  subscribe(type: "cb", cb: (event: T, cb: VoidFunction) => void): VoidFunction;
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
 * const myFunc = TOOLS.CreateBatchProcessor(5000, async function (args: number[]) {
 *   return arg.map(x => x ** 2);
 * })
 * myFunc(10); // 100, after 5 sec
 * myFunc(20); // 400, after 5 sec
 * myFunc(5); // 25, after 5 sec
 * setTimeout(() => myFunc(3), 1000); // 9, after 5 sec
 * setTimeout(() => myFunc(4), 6000); // 16, after 11 sec
 * setTimeout(() => myFunc(8), 10000); // 64, after 11 sec
 * ```
 */
export function CreateBatchProcessor<A, R>({
  delayInMs,
  implementation,
}: {
  delayInMs: number;
  implementation: (arg: A[]) => Promise<R[]>;
}): (arg: A) => Promise<R> {
  let queue: {
    arg: A;
    resolve: (result: R) => void;
    reject: (error: unknown) => void;
  }[] = [];
  let timer: any = null;

  const processQueue = async () => {
    const currentQueue = [...queue];
    queue = []; // Clear the queue
    timer = null;

    try {
      const args = currentQueue.map((item) => item.arg);
      const results = await implementation(args); // Process batch
      currentQueue.forEach((item, index) => item.resolve(results[index])); // Resolve individual promises
    } catch (error) {
      currentQueue.forEach((item) => item.reject(error)); // Reject if error occurs
    }
  };

  return function (arg: A): Promise<R> {
    return new Promise<R>((resolve, reject) => {
      queue.push({ arg, resolve, reject });

      if (!timer) {
        timer = setTimeout(processQueue, delayInMs); // Set timer if not already set
      }
    });
  };
}
