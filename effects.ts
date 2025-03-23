export async function tryCatchPromise<T, E = any>(
  promise: Promise<T>
): Promise<[T, null, false] | [null, E, true]> {
  try {
    return [await promise, null, false] as const;
  } catch (error) {
    return [null, error as E, true] as const;
  }
}

export function tryCatch<T, E = any>(
  fn: () => Promise<T>
): Promise<[Awaited<T>, null, false] | [null, Awaited<E>, true]>;
export function tryCatch<T, E = any>(
  fn: () => T
): [Awaited<T>, null, false] | [null, Awaited<E>, true];
export function tryCatch(fn: () => any): any {
  try {
    const result = fn();
    if (result instanceof Promise) {
      return tryCatchPromise(result);
    }
    return [result, null, false];
  } catch (error) {
    return [null, error, true];
  }
}
