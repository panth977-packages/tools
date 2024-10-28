import { DefaultSplitChar, getInnerProp, type KeyPath } from "./basic.ts";

/**
 * one-to-one mapping of unique value against given keyPath to the row.
 * @param rows list of records
 * @param keyPath the [keyPath] from [getInnerProp]
 * @param split the [split] from [getInnerProp]
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
>(
  rows: (T | undefined)[],
  keyPath: K,
  split: S = DefaultSplitChar as never,
): Record<string, T> {
  const result: Record<string, T> = {};
  for (const row of rows) {
    if (row) {
      const keyValue = getInnerProp(row as T, keyPath, split) as
        | string
        | undefined;
      if (keyValue !== undefined) {
        result[keyValue] = row as T;
      }
    }
  }
  return result;
}

/**
 * one-to-many mapping of unique value against given keyPath to the row.
 * @param rows list of records
 * @param keyPath the [keyPath] from [getInnerProp]
 * @param split the [split] from [getInnerProp]
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
>(
  rows: (T | undefined)[],
  keyPath: K,
  split: S = DefaultSplitChar as never,
): Record<string, T[]> {
  const result: Record<string, T[]> = {};
  for (const row of rows) {
    if (row) {
      const keyValue = getInnerProp(row as T, keyPath, split) as
        | string
        | undefined;
      if (keyValue !== undefined) {
        if (!result[keyValue]) {
          result[keyValue] = [];
        }
        result[keyValue].push(row);
      }
    }
  }
  return result;
}
