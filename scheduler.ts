/**
 * a "zod" schema compatible pubsub with strong type Internal PubSub
 * @param eventSchema a schema instance with [parse] type
 * @returns a publish & subscribe methods to the pubsub!
 *
 * @example
 * ```ts
 * const onUserChange = TOOLS.CreatePubsub(z.object({ userId: z.number(), name: z.string() }));
 * function updateUserName(userId: number, name: string) {
 *   ...
 *   onUserChange.publish({userId, name});
 * }
 * function getUser(userId: number) {
 *   let userObj = cache.get(`USER_${userId}`);
 *   if (!userObj) {
 *     userObj = ...
 *     cache.set(`USER_${userId}`, userObj);
 *   }
 *   return userObj;
 * }
 * onUserChange.subscribe(function (event) {
 *  cache.del(`USER_${event.userId}`);
 * })
 * ```
 */ export function CreatePubsub<Z extends { parse(event: unknown): any }>(
  eventSchema: Z
): {
  eventSchema: Z;
  cbs: Set<(event: ReturnType<Z["parse"]>) => void>;
  publish(_event: ReturnType<Z["parse"]>): Promise<void>;
  subscribe(cb: (event: ReturnType<Z["parse"]>) => Promise<void> | void): {
    unsubscribe(): void;
  };
} {
  return {
    eventSchema,
    cbs: new Set(),
    async publish(_event) {
      const { cbs, eventSchema } = this;
      const event = eventSchema.parse(_event);
      await Promise.allSettled([...cbs].map((cb) => cb(event)));
    },
    subscribe(cb) {
      const { cbs } = this;
      cbs.add(cb);
      return {
        unsubscribe() {
          cbs.delete(cb);
        },
      };
    },
  };
}

/**
 * function builder that can be call any number of time and will only allow [maxParallelExecution] exe run at any instance at max
 * @param maxParallelExecution maximum number of executions you like to do in parallel
 * @param implementation function implementation
 * @returns parallel execution managed function
 *
 * @example
 * ```ts
 * const start = Date.now();
 * const myFunc = TOOLS.CreateParallelTaskManager(2, async function (arg: number) {
 *   await new Promise((res) => setTimeout(res, 5000));
 *   return arg ** 2;
 * })
 * myFunc(10); // 100, after 5 sec
 * myFunc(20); // 400, after 5 sec
 * myFunc(5); // 25, after 10 sec
 * myFunc(3); // 9, after 10 sec
 * myFunc(4); // 16, after 15 sec
 * ```
 */ export function CreateParallelTaskManager<
  A extends [] | [unknown, ...unknown[]],
  R
>({
  implementation,
  maxParallelExecution,
}: {
  maxParallelExecution: number;
  implementation: (...arg: A) => Promise<R>;
}): (...arg: A) => Promise<R> {
  let running = 0;
  const queue: Array<() => void> = [];
  function dequeue() {
    running--;
    if (running < maxParallelExecution && queue.length) {
      running++;
      const nextTask = queue.shift();
      if (nextTask) nextTask();
    }
  }

  return function (...arg) {
    return new Promise((resolve, reject) => {
      async function runTask() {
        try {
          const result = await implementation(...arg);
          resolve(result);
        } catch (error) {
          reject(error);
        } finally {
          dequeue();
        }
      }

      if (running < maxParallelExecution) {
        running++;
        runTask();
      } else {
        queue.push(runTask);
      }
    });
  };
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
 */ export function CreateBatchProcessor<A, R>({
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
