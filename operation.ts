import { DefaultSplitChar } from "./basic.ts";

const SortMode = {
  numberASC: (
    a: [undefined | null | number, any],
    b: [undefined | null | number, any],
  ) => a[0] == null ? 1 : b[0] == null ? -1 : a[0] - b[0],
  numberDESC: (
    a: [undefined | null | number, any],
    b: [undefined | null | number, any],
  ) => a[0] == null ? 1 : b[0] == null ? -1 : b[0] - a[0],
  stringASC: (
    a: [undefined | null | string, any],
    b: [undefined | null | string, any],
  ) => a[0] == null ? 1 : b[0] == null ? -1 : a[0].localeCompare(b[0]),
  stringDESC: (
    a: [undefined | null | string, any],
    b: [undefined | null | string, any],
  ) => a[0] == null ? 1 : b[0] == null ? -1 : b[0].localeCompare(a[0]),
  DateASC: (
    a: [undefined | null | Date, any],
    b: [undefined | null | Date, any],
  ) => a[0] == null ? 1 : b[0] == null ? -1 : a[0].getTime() - b[0].getTime(),
  DateDESC: (
    a: [undefined | null | Date, any],
    b: [undefined | null | Date, any],
  ) => a[0] == null ? 1 : b[0] == null ? -1 : b[0].getTime() - a[0].getTime(),
  booleanASC: (
    a: [undefined | null | boolean, any],
    b: [undefined | null | boolean, any],
  ) => a[0] == null ? 1 : b[0] == null ? -1 : Number(a[0]) - Number(b[0]),
  booleanDESC: (
    a: [undefined | null | boolean, any],
    b: [undefined | null | boolean, any],
  ) => a[0] == null ? 1 : b[0] == null ? -1 : Number(b[0]) - Number(a[0]),
};
const SortAlgo = {
  default: (
    data: any[],
    comp: (a: any, b: any) => number,
    acc: (data: any) => any,
  ) => data.map((x) => [acc(x), x]).sort((a, b) => comp(a, b)).map((x) => x[1]),
  bucket: (
    data: any[],
    comp: (a: any, b: any) => number,
    acc: (data: any) => any,
  ) => {
    const bucket: Map<any, any[]> = new Map();
    for (const r of data) {
      const k = acc(r);
      let val = bucket.get(k);
      if (!val) {
        val = [r];
        bucket.set(k, val);
      } else {
        val.push(r);
      }
    }
    return [...bucket.keys()].sort((a, b) => comp(a, b)).map((x) =>
      bucket.get(x)!
    ).flat();
  },
};
/**
 * @example
 * ```ts
 * type SomeObj = { prop1?: { subProp1: number; subProp2: boolean }; prop2: string };
 * const objArr: SomeObj[] = [];
 * objArr.push({prop1: {subProp1: 10, subProp2: true}, prop2: 'val-w'});
 * objArr.push({prop1: {subProp1: 5, subProp2: false}, prop2: 'val-x'});
 * objArr.push({prop1: {subProp1: 7, subProp2: true}, prop2: 'val-y'});
 * objArr.push({prop1: {subProp1: 2, subProp2: true}, prop2: 'val-z'});
 * const sortedObjArr = TOOLS.sortList({rows: objArr, mode: 'ASC', keyPath: 'prop1.subProp1'});
 * sortedObjArr.map(x => x.prop2); // ['z', 'x', 'y, 'w']
 * ```
 */
export function sortList<
  T extends Record<string, any>,
  K extends keyof typeof SortMode,
>(
  rows: T[],
  mode: K,
  getVal: (
    val: T,
  ) => typeof SortMode[K] extends
    (a: [infer R, any], b: [infer R, any]) => number ? R : never,
  algorithm: keyof typeof SortAlgo = "default",
): T[] {
  if (rows.length < 2) return rows;
  const comp = SortMode[mode] as any;
  if (!comp) throw new Error("Unknown mode found");
  const algo = SortAlgo[algorithm];
  if (!algo) throw new Error("Unknown algorithm found");
  return algo(rows, comp, getVal);
}

/**
 * @example
 * ```ts
 * type SomeObj = { 'prop1.subProp1': number; 'prop1.subProp2': boolean; prop2: string };
 * type DestructuredSomeObj = { prop1: { subProp1: number; subProp2: boolean }; prop2: string };
 * const objArr: SomeObj[] = [];
 * objArr.push({'prop1.subProp1': 10, 'prop1.subProp2': true, prop2: 'val-w'});
 * objArr.push({'prop1.subProp1': 5, 'prop1.subProp2': false, prop2: 'val-x'});
 * objArr.push({'prop1.subProp1': 7, 'prop1.subProp2': true, prop2: 'val-y'});
 * objArr.push({'prop1.subProp1': 2, 'prop1.subProp2': true, prop2: 'val-z'});
 * const destructuredObjArr = TOOLS.destructure({rows: objArr}) as DestructuredSomeObj[];
 * destructuredObjArr; // [{prop1: {subProp1: 10, subProp2: true}, prop2: 'val-w'}, {prop1: {subProp1: 5, subProp2: false}, prop2: 'val-x'}, {prop1: {subProp1: 7, subProp2: true}, prop2: 'val-y'}, {prop1: {subProp1: 2, subProp2: true}, prop2: 'val-z'}]
 * ```
 */
export function destructure(
  rows: Record<string, unknown>[],
  split = DefaultSplitChar,
): Record<string, unknown>[] {
  const newRows: Record<string, unknown>[] = [];
  for (const row of rows) {
    const newRow = {};
    Object.entries(row).forEach(([key, value]) => {
      const parts = key.split(split);
      const lastKey = parts.pop() as string;
      let current: any = newRow;
      for (const key of parts) {
        current = current[key] ??= {};
      }
      current[lastKey] = value;
    });
    newRows.push(newRow);
  }
  return newRows;
}

export function oneToOneMapping<T = any, R = T>(
  row: T[],
  keyPath: (obj: T) => any,
  map?: (val: T, key: string) => R,
): Record<string, R> {
  const ret: Record<string, T> = {};
  for (const a of row) {
    ret[keyPath(a)] = a;
  }
  if (!map) return ret as never as Record<string, R>;
  const mapped: Record<string, R> = {};
  for (const k in ret) {
    mapped[k] = map(ret[k], k);
  }
  return mapped;
}
export function oneToManyMapping<T = any, R = T[]>(
  row: T[],
  keyPath: (obj: T) => any,
  map?: (val: T[], key: string) => R,
): Record<string, R> {
  const ret: Record<string, T[]> = {};
  for (const a of row) {
    (ret[keyPath(a)] ??= []).push(a);
  }
  if (!map) return ret as Record<string, R>;
  const mapped: Record<string, R> = {};
  for (const k in ret) {
    mapped[k] = map(ret[k], k);
  }
  return mapped;
}

