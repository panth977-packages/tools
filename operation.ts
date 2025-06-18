import { DefaultSplitChar } from "./basic.ts";
import { IndexOneToMany } from "./structure.ts";

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
export function sortList<T extends Record<string, any>>(
  rows: T[],
  getVal: (val: T) => number,
  mode:
    | "ASC"
    | "DESC"
    | ((a: number, b: number) => number),
  algorithm?: "default" | "bucket",
): T[] {
  if (rows.length < 2) return rows;
  if (!algorithm || algorithm === "default") {
    return rows.map((x) => [getVal(x), x] as const)
      .sort(
        mode === "DESC"
          ? (a, b) => b[0] - a[0]
          : mode === "ASC"
          ? (a, b) => a[0] - b[0]
          : (a, b) => mode(a[0], b[0]),
      )
      .map((x) => x[1]);
  }
  if (algorithm === "bucket") {
    return [...new IndexOneToMany(rows, getVal)]
      .sort(
        mode === "DESC"
          ? (a, b) => b[0] - a[0]
          : mode === "ASC"
          ? (a, b) => a[0] - b[0]
          : (a, b) => mode(a[0], b[0]),
      )
      .flatMap((x) => x[1]);
  }
  throw new Error("unimplemented operation found!");
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
