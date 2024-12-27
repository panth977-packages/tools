import { DefaultSplitChar, getInnerProp, type KeyPath } from "./basic.ts";
export type KEY = string | number;
/**
 * one-to-one mapping of unique value against given keyPath to the row.
 * @param rows list of records
 * @param keyPath the {@link keyPath} from {@link getInnerProp}
 * @param split the {@link split} from {@link getInnerProp}
 * @returns a mapped record on the keyPath value
 *
 * @example
 * ```ts
 * type SomeObj = { prop1?: { subProp1: number; subProp2: boolean }; prop2: string };
 * const objArr: SomeObj[] = [];
 * objArr.push({prop1: {subProp1: 10, subProp2: true}, prop2: 'val-w'});
 * objArr.push({prop1: {subProp1: 5, subProp2: false}, prop2: 'val-x'});
 * objArr.push({prop1: {subProp1: 7, subProp2: true}, prop2: 'val-y'});
 * objArr.push({prop1: {subProp1: 2, subProp2: true}, prop2: 'val-z'});
 * const mappedRecord = TOOLS.oneToOneMapping(objArr, 'prop1.subProp1');
 * mappedRecord[10]; // {prop1: {subProp1: 10, subProp2: true}, prop2: 'val-w'}
 * mappedRecord[7]; // {prop1: {subProp1: 7, subProp2: true}, prop2: 'val-y'}
 * ```
 */ export function oneToOneMapping<
  T,
  K extends KeyPath<T, S>,
  S extends string = DefaultSplitChar,
  R = T
>({
  rows,
  keyPath,
  split = DefaultSplitChar as never,
  map,
}: {
  rows: (T | undefined)[];
  keyPath: K;
  split?: S;
  map?: (val: T, key: KEY) => R;
}): Record<KEY, R> {
  const result: Record<KEY, any> = {};
  for (const row of rows) {
    if (row) {
      const keyValue = getInnerProp({ obj: row as T, keyPath, split }) as
        | string
        | undefined;
      if (keyValue !== undefined) result[keyValue] = row;
    }
  }
  if (map) {
    for (const id in result) {
      result[id] = map(result[id], id);
    }
  }
  return result;
}

/**
 * one-to-many mapping of unique value against given keyPath to the row.
 * @param rows list of records
 * @param keyPath the {@link keyPath} from {@link getInnerProp}
 * @param split the {@link split} from {@link getInnerProp}
 * @returns a mapped record on the keyPath value
 *
 * @example
 * ```ts
 * type SomeObj = { prop1?: { subProp1: number; subProp2: boolean }; prop2: string };
 * const objArr: SomeObj[] = [];
 * objArr.push({prop1: {subProp1: 10, subProp2: true}, prop2: 'val-w'});
 * objArr.push({prop1: {subProp1: 10, subProp2: false}, prop2: 'val-x'});
 * objArr.push({prop1: {subProp1: 7, subProp2: true}, prop2: 'val-y'});
 * objArr.push({prop1: {subProp1: 2, subProp2: true}, prop2: 'val-z'});
 * const mappedRecord = TOOLS.oneToManyMapping(objArr, 'prop1.subProp1');
 * mappedRecord[10]; // [{prop1: {subProp1: 10, subProp2: true}, prop2: 'val-w'}, {prop1: {subProp1: 10, subProp2: false}, prop2: 'val-x'}]
 * mappedRecord[7]; // [{prop1: {subProp1: 7, subProp2: true}, prop2: 'val-y'}]
 * ```
 */ export function oneToManyMapping<
  T,
  K extends KeyPath<T, S>,
  S extends string = DefaultSplitChar,
  R = T[]
>({
  rows,
  keyPath,
  split = DefaultSplitChar as never,
  map,
}: {
  rows: (T | undefined)[];
  keyPath: K;
  split?: S;
  map?: (val: T[], key: KEY) => R;
}): Record<KEY, R> {
  const result: Record<KEY, any> = {};
  for (const row of rows) {
    if (row) {
      const keyValue = getInnerProp({ obj: row as T, keyPath, split }) as
        | string
        | undefined;
      if (keyValue !== undefined) (result[keyValue] ??= []).push(row);
    }
  }
  if (map) {
    for (const id in result) {
      result[id] = map(result[id], id);
    }
  }
  return result;
}
