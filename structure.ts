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
  map?: (val: T) => R;
}): Record<KEY, R> {
  const result: Record<KEY, R> = {};
  for (const row of rows) {
    if (row) {
      const keyValue = getInnerProp({ obj: row as T, keyPath, split }) as
        | string
        | undefined;
      if (keyValue !== undefined) {
        result[keyValue] = map ? map(row) : (row as R);
      }
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
  map?: (val: T) => R;
}): Record<KEY, R[]> {
  const result: Record<KEY, R[]> = {};
  for (const row of rows) {
    if (row) {
      const keyValue = getInnerProp({ obj: row as T, keyPath, split }) as
        | string
        | undefined;
      if (keyValue !== undefined) {
        (result[keyValue] ??= []).push(map ? map(row) : (row as R));
      }
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
 * const mappedRecord = TOOLS.oneToOneToOneMapping(objArr, 'prop1.subProp1', 'prop2');
 * mappedRecord[10]['val-w']; // {prop1: {subProp1: 10, subProp2: true}, prop2: 'val-w'}
 * mappedRecord[10]['val-x']; // {prop1: {subProp1: 10, subProp2: false}, prop2: 'val-x'}
 * mappedRecord[7]['val-x']; // undefined
 * mappedRecord[7]['val-y']; // {prop1: {subProp1: 7, subProp2: true}, prop2: 'val-y'}
 * ```
 */ export function oneToOneToOneMapping<
  T,
  K1 extends KeyPath<T, S>,
  K2 extends KeyPath<T, S>,
  S extends string = DefaultSplitChar,
  R = T
>({
  rows,
  keyPath1,
  keyPath2,
  split = DefaultSplitChar as never,
  map,
}: {
  rows: (T | undefined)[];
  keyPath1: K1;
  keyPath2: K2;
  split?: S;
  map?: (val: T) => R;
}): Record<KEY, Record<KEY, R>> {
  const result: Record<KEY, Record<KEY, R>> = {};
  for (const row of rows) {
    if (row) {
      const keyValue1 = getInnerProp({
        obj: row as T,
        keyPath: keyPath1,
        split,
      }) as string | undefined;
      const keyValue2 = getInnerProp({
        obj: row as T,
        keyPath: keyPath2,
        split,
      }) as string | undefined;
      if (keyValue1 !== undefined && keyValue2 !== undefined) {
        (result[keyValue1] ??= {})[keyValue2] = map ? map(row) : (row as R);
      }
    }
  }
  return result;
}
