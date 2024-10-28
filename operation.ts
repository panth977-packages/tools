import { DefaultSplitChar, getInnerProp, type KeyPath } from "./basic.ts";
/**
 * @param rows list of objects
 * @param mode order
 * @param keyPath {@link keyPath} from {@link getInnerProp}
 * @param split {@link split} from {@link getInnerProp}
 * @returns lost of object sorted as required
 *
 * @example
 * ```ts
 * type SomeObj = { prop1?: { subProp1: number; subProp2: boolean }; prop2: string };
 * const objArr: SomeObj[] = [];
 * objArr.push({prop1: {subProp1: 10, subProp2: true}, prop2: 'val-w'});
 * objArr.push({prop1: {subProp1: 5, subProp2: false}, prop2: 'val-x'});
 * objArr.push({prop1: {subProp1: 7, subProp2: true}, prop2: 'val-y'});
 * objArr.push({prop1: {subProp1: 2, subProp2: true}, prop2: 'val-z'});
 * const sortedObjArr = TOOLS.sortList(objArr, 'ASC', 'prop1.subProp1');
 * sortedObjArr.map(x => x.prop2); // ['z', 'x', 'y, 'w']
 * ```
 */ export function sortList<
  T,
  K extends KeyPath<T, S>,
  S extends string = DefaultSplitChar,
>(
  rows: T[],
  mode: "ASC" | "DESC",
  keyPath: K,
  split: S = DefaultSplitChar as never,
): T[] {
  if (rows.length < 2) return rows;
  if (mode === "ASC") {
    return rows
      .map((r) => ({ r, v: getInnerProp(r as T, keyPath, split) as number }))
      .sort((a, b) => a.v - b.v)
      .map((x) => x.r);
  }
  if (mode === "DESC") {
    return rows
      .map((r) => ({ r, v: getInnerProp(r as T, keyPath, split) as number }))
      .sort((a, b) => b.v - a.v)
      .map((x) => x.r);
  }
  throw new Error("unimplemented mode found!");
}

/**
 * @param rows list of objects
 * @param mode order
 * @param keyPath {@link keyPath} from {@link getInnerProp}
 * @param split {@link split} from {@link getInnerProp}
 * @returns lost of object sorted as required
 *
 * @example
 * ```ts
 * type SomeObj = { 'prop1.subProp1': number; 'prop1.subProp2': boolean; prop2: string };
 * type DestructuredSomeObj = { prop1: { subProp1: number; subProp2: boolean }; prop2: string };
 * const objArr: SomeObj[] = [];
 * objArr.push({'prop1.subProp1': 10, 'prop1.subProp2': true, prop2: 'val-w'});
 * objArr.push({'prop1.subProp1': 5, 'prop1.subProp2': false, prop2: 'val-x'});
 * objArr.push({'prop1.subProp1': 7, 'prop1.subProp2': true, prop2: 'val-y'});
 * objArr.push({'prop1.subProp1': 2, 'prop1.subProp2': true, prop2: 'val-z'});
 * const destructuredObjArr = TOOLS.destructure(objArr, 'ASC', 'prop1.subProp1') as DestructuredSomeObj[];
 * destructuredObjArr; // [{prop1: {subProp1: 10, subProp2: true}, prop2: 'val-w'}, {prop1: {subProp1: 5, subProp2: false}, prop2: 'val-x'}, {prop1: {subProp1: 7, subProp2: true}, prop2: 'val-y'}, {prop1: {subProp1: 2, subProp2: true}, prop2: 'val-z'}]
 * ```
 */ export function destructure(
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
