import {
  type DefaultPrimitive,
  getInnerProp,
  type KeyPath,
  type PropType,
} from "./exports.ts";

import { z } from "zod/v4";
export abstract class Structure<Idx, T> {
  abstract get(index: Idx): T;
  abstract has(index: Idx): boolean;
  abstract [Symbol.iterator](): Iterator<[Idx, T]>;
  abstract add(index: Idx, value: T): void;
  getValues(): T[] {
    const values: T[] = [];
    for (const [, value] of this) {
      values.push(value);
    }
    return values;
  }
  getIndexs(): Idx[] {
    const uniqueIndices = new Set<Idx>();
    for (const [index] of this) {
      uniqueIndices.add(index);
    }
    return Array.from(uniqueIndices);
  }
  map<O>(mapper: (value: T, key: Idx) => O): MappedStructure<Idx, T, O, this> {
    return new MappedStructure(this, mapper);
  }
  toHash(): HashStructure<Idx, T> {
    const hash: Map<Idx, T> = new Map();
    for (const [index, value] of this) {
      hash.set(index, value);
    }
    return new HashStructure(hash);
  }
  toRecord(): Record<string, T> {
    const record: Record<string, T> = {};
    for (const [index, value] of this) {
      record["" + index] = value;
    }
    return record;
  }
  toPreIndexed(forIndexes?: Idx[]): PreIndexedStructure<Idx, T> {
    let size = 0;
    const indexes = [];
    const values = [];
    if (forIndexes !== undefined) {
      for (const index of forIndexes) {
        const value = this.get(index);
        if (value !== undefined) {
          indexes.push(index);
          values.push(value);
          size++;
        }
      }
    } else {
      for (const [index, value] of this) {
        indexes.push(index);
        values.push(value);
        size++;
      }
    }
    return new PreIndexedStructure(size, indexes, values);
  }
  static fromRecord<T>(
    record: Record<string, T>,
  ): PreIndexedStructure<string, T> {
    const keys = Object.keys(record);
    return new PreIndexedStructure(
      keys.length,
      keys,
      keys.map((x) => record[x]),
    );
  }
  static oneToOne<Idx, T>(
    list: Array<T>,
    getIndex: (obj: T) => Idx,
  ): IndexOneToOne<Idx, T> {
    return new IndexOneToOne(list, getIndex);
  }
  static oneToMany<Idx, T>(
    list: Array<T>,
    getIndex: (obj: T) => Idx,
  ): IndexOneToMany<Idx, T> {
    return new IndexOneToMany(list, getIndex);
  }
  static build<Idx, T>(): PreIndexedStructure<Idx, T> {
    return new PreIndexedStructure<Idx, T>(0, [], []);
  }
}

export type zPreIndexedStructure<Idx extends z.ZodType, T extends z.ZodType> =
  & z.ZodPipe<
    z.ZodCustom<PreIndexedStructure<z.infer<Idx>, z.infer<T>>>,
    z.ZodTransform<
      PreIndexedStructure<z.infer<Idx>, z.infer<T>>,
      PreIndexedStructure<z.infer<Idx>, z.infer<T>>
    >
  >
  & { index: Idx; value: T };
export class PreIndexedStructure<Idx, T> extends Structure<Idx, T> {
  protected size: number;
  protected indexes: Array<Idx>;
  protected values: Array<T>;
  static zStructure<Idx extends z.ZodType, T extends z.ZodType>(
    zIndex: Idx,
    zValue: T,
  ): zPreIndexedStructure<Idx, T> {
    const schema = z.instanceof(PreIndexedStructure<z.infer<Idx>, z.infer<T>>)
      .transform((val, ctx) => {
        let newVal = new PreIndexedStructure<z.infer<Idx>, z.infer<T>>();
        for (const [index, value] of val) {
          const indexResult = zIndex.safeParse(index);
          const valueResult = zValue.safeParse(value);
          if (indexResult.success && valueResult.success) {
            if (newVal instanceof PreIndexedStructure) {
              newVal.add(indexResult.data, valueResult.data);
            }
            continue;
          }
          if (!indexResult.success) {
            for (const issue of indexResult.error.issues) {
              newVal = z.NEVER;
              ctx.addIssue({
                ...issue,
                message: `[Structure Key @ ${
                  JSON.stringify(index)
                }] ${issue.message}`,
              });
            }
          }
          if (!valueResult.success) {
            newVal = z.NEVER;
            for (const issue of valueResult.error.issues) {
              ctx.addIssue({
                ...issue,
                message: `[Structure Value @ ${
                  JSON.stringify(index)
                }] ${issue.message}`,
              });
            }
          }
        }
        return newVal;
      });
    return Object.assign(schema, { index: zIndex, value: zValue });
  }
  constructor();
  constructor(size: number, indexes: Array<Idx>, values: Array<T>);
  constructor(
    size: number = 0,
    indexes: Array<Idx> = [],
    values: Array<T> = [],
  ) {
    super();
    this.size = size;
    this.indexes = indexes;
    this.values = values;
  }
  override get(index: Idx): T {
    for (let i = 0; i < this.size; i++) {
      if (this.indexes[i] === index) {
        return this.values[i];
      }
    }
    throw new Error(`Index ${index} not found`);
  }
  override *[Symbol.iterator](): Iterator<[Idx, T]> {
    for (let i = 0; i < this.size; i++) {
      yield [this.indexes[i], this.values[i]];
    }
  }
  override has(index: Idx): boolean {
    return this.indexes.includes(index);
  }
  override getIndexs(): Idx[] {
    return [...this.indexes];
  }
  override getValues(): T[] {
    return [...this.values];
  }
  override add(index: Idx, value: T): void {
    this.indexes.push(index);
    this.values.push(value);
    this.size++;
  }
  set(index: Idx, value: T): void {
    const i = this.indexes.findIndex((i) => i === index);
    if (i === -1) {
      this.indexes.push(index);
      this.values.push(value);
      this.size++;
    } else {
      this.values[i] = value;
    }
  }
  getSize(): number {
    return this.size;
  }
}

export class MappedStructure<Idx, I, O, S extends Structure<Idx, I>>
  extends Structure<Idx, O> {
  protected structure: S;
  protected mapper: (value: I, key: Idx) => O;
  constructor(structure: S, mapper: (value: I, key: Idx) => O) {
    super();
    this.structure = structure;
    this.mapper = mapper;
  }
  override get(index: Idx): O {
    return this.mapper(this.structure.get(index), index);
  }
  override getIndexs(): Array<Idx> {
    return this.structure.getIndexs();
  }
  override has(index: Idx): boolean {
    return this.structure.has(index);
  }
  override add(_i: Idx, _v: O): void {
    throw new Error("Cannot add on mapped structure");
  }
  *[Symbol.iterator](): Iterator<[Idx, O]> {
    for (const [index, value] of this.structure) {
      yield [index, this.mapper(value, index)];
    }
  }
}

export class HashStructure<Idx, T> extends Structure<Idx, T> {
  protected hash: Map<Idx, T>;
  constructor(hash: Map<Idx, T> = new Map()) {
    super();
    this.hash = hash;
  }
  override get(index: Idx): T {
    if (this.hash.has(index)) {
      return this.hash.get(index)!;
    }
    throw new Error(`Index ${index} not found`);
  }
  override getIndexs(): Array<Idx> {
    return Array.from(this.hash.keys());
  }
  override add(index: Idx, value: T): void {
    this.hash.set(index, value);
  }
  override has(index: Idx): boolean {
    return this.hash.has(index);
  }
  *[Symbol.iterator](): Iterator<[Idx, T]> {
    for (const [index, value] of this.hash) {
      yield [index, value];
    }
  }
  getHash(): Map<Idx, T> {
    return new Map(this.hash);
  }
}
/**
 * @example
 * ```ts
 * const rows = await pg.query(`SELECT * FROM users WHERE ID IN ($1, $2, $3)`, [1, 2, 3]);
 * const users = new IndexOneToOne(rows, AccessKey("id")); // third arg tells if to return undefined on missing index
 * const user1 = users.get(1); // User { id: 1, name: 'John' }
 * const user10 = users.get(10); // undefined
 * ```
 */
export class IndexOneToOne<Idx, T> extends Structure<Idx, T> {
  constructor(protected list: Array<T>, protected getIndex: (obj: T) => Idx) {
    super();
  }
  static Key<T, K extends keyof T>(key: K): (obj: T) => T[K] {
    return (this._Key<T, K>).bind(this, key);
  }
  private static _Key<T, K extends keyof T>(key: K, obj: T): T[K] {
    return obj[key];
  }
  static InnerKey<
    T,
    S extends string,
    K extends KeyPath<T, S, DefaultPrimitive>,
  >(split: S, keyPath: K): (obj: T) => PropType<T, S, K> {
    return (this._InnerKey<T, S, K>).bind(this, split, keyPath);
  }
  private static _InnerKey<
    T,
    S extends string,
    K extends KeyPath<T, S, DefaultPrimitive>,
  >(split: S, keyPath: K, obj: T): PropType<T, S, K> {
    return getInnerProp(obj, keyPath, split);
  }
  override get(index: Idx): T {
    const val = this.oGet(index);
    if (val === undefined) {
      throw new Error(`Index ${index} not found`);
    }
    return val;
  }
  oGet(index: Idx): T | undefined {
    for (let i = 0; i < this.list.length; i++) {
      const value = this.list[i];
      const key = this.getIndex(value);
      if (key === index) {
        return value;
      }
    }
    return undefined;
  }
  override add(index: Idx, value: T): void {
    if (index !== this.getIndex(value)) {
      throw new Error(`Index ${index} does not match value ${value}`);
    }
    this.list.push(value);
  }
  override has(index: Idx): boolean {
    for (const ele of this.list) {
      if (this.getIndex(ele) === index) {
        return true;
      }
    }
    return false;
  }
  override getValues(): Array<T> {
    return [...this.list];
  }
  override getIndexs(): Idx[] {
    const indexes = new Array(this.list.length);
    for (let i = 0; i < this.list.length; i++) {
      indexes[i] = this.getIndex(this.list[i]);
    }
    return indexes;
  }
  *[Symbol.iterator](): Iterator<[Idx, T]> {
    for (const ele of this.list) {
      yield [this.getIndex(ele), ele];
    }
  }
  getList(): Array<T> {
    return [...this.list];
  }
}

/**
 * @example
 * ```ts
 * const rows = await pg.query(`SELECT * FROM sensors WHERE device_id IN ($1, $2)`, [1, 2]);
 * const sensors = new IndexOneToMany(rows, AccessKey("device_id"));
 * const device1Sensors = sensors.get(1);
 * ```
 */
export class IndexOneToMany<Idx, T> extends Structure<Idx, Array<T>> {
  constructor(protected list: Array<T>, protected getIndex: (obj: T) => Idx) {
    super();
  }
  oGet(index: Idx): Array<T> {
    const arr = [];
    for (let i = 0; i < this.list.length; i++) {
      const value = this.list[i];
      const key = this.getIndex(value);
      if (key === index) {
        arr.push(value);
      }
    }
    return arr;
  }
  override get(index: Idx): T[] {
    const arr = this.oGet(index);
    if (arr.length === 0) {
      throw new Error(`Index ${index} not found`);
    }
    return arr;
  }
  override has(index: Idx): boolean {
    for (const ele of this.list) {
      if (this.getIndex(ele) === index) {
        return true;
      }
    }
    return false;
  }
  override getIndexs(): Array<Idx> {
    const indexSet = new Set<Idx>();
    for (let i = 0; i < this.list.length; i++) {
      const value = this.list[i];
      const key = this.getIndex(value);
      indexSet.add(key);
    }
    return Array.from(indexSet);
  }
  override add(index: Idx, value: Array<T>): void {
    for (const item of value) {
      if (index !== this.getIndex(item)) {
        throw new Error(`Index ${index} does not match value ${value}`);
      }
    }
    this.list.push(...value);
  }
  [Symbol.iterator](): Iterator<[Idx, Array<T>]> {
    const entries: [Idx, T[]][] = [];
    loop: for (const ele of this.list) {
      const id = this.getIndex(ele);
      for (let i = 0; i < entries.length; i++) {
        if (entries[i][0] === id) {
          entries[i][1].push(ele);
          continue loop;
        }
      }
      entries.push([id, [ele]]);
    }
    return entries[Symbol.iterator]();
  }
  private static _mapIndexOneToOne<T, Idx>(
    getIndex: (obj: T) => Idx,
    list: Array<T>,
  ) {
    return new IndexOneToOne(list, getIndex);
  }
  private static _mapIndexOneToMany<T, Idx>(
    getIndex: (obj: T) => Idx,
    list: Array<T>,
  ) {
    return new IndexOneToMany(list, getIndex);
  }
  mapIndexOneToOne<Idx2>(
    getIndex: (obj: T) => Idx2,
  ): MappedStructure<Idx, T[], IndexOneToOne<Idx2, T>, this> {
    const mapper = (IndexOneToMany._mapIndexOneToOne<T, Idx2>).bind(
      IndexOneToMany,
      getIndex,
    );
    return this.map(mapper);
  }
  mapIndexOneToMany<Idx2>(
    getIndex: (obj: T) => Idx2,
  ): MappedStructure<Idx, T[], IndexOneToMany<Idx2, T>, this> {
    const mapper = (IndexOneToMany._mapIndexOneToMany<T, Idx2>).bind(
      IndexOneToMany,
      getIndex,
    );
    return this.map(mapper);
  }
  getList(): Array<T> {
    return [...this.list];
  }
}
