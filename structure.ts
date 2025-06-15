import {
  type DefaultPrimitive,
  type DefaultSplitChar,
  getInnerProp,
  type KeyPath,
  type PropType,
} from "./exports.ts";

import { z } from "zod/v4";
export type zStructure<Idx extends z.ZodType, T extends z.ZodType> =
  & z.ZodCustom<Structure<z.infer<Idx>, z.infer<T>>>
  & { index: Idx; value: T };
export function zStructure<Idx extends z.ZodType, T extends z.ZodType>(
  indexSchema: Idx,
  valueSchema: T,
): zStructure<Idx, T> {
  const schema = z.instanceof(Structure<z.infer<Idx>, z.infer<T>>).check(
    z.superRefine((val, ctx) => {
      for (const [index, value] of val) {
        const indexResult = indexSchema.safeParse(index);
        const valueResult = valueSchema.safeParse(value);
        if (!indexResult.success) {
          for (const issue of indexResult.error.issues) {
            ctx.addIssue({
              ...issue,
              message: `[Structure Key @ ${
                JSON.stringify(index)
              }] ${issue.message}`,
            });
          }
        }
        if (!valueResult.success) {
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
    }),
  );
  return Object.assign(schema, {
    index: indexSchema,
    value: valueSchema,
  });
}
export abstract class Structure<Idx, T> {
  abstract get(index: Idx): T;
  abstract [Symbol.iterator](): Iterator<[Idx, T]>;
  abstract add(index: Idx, value: T): void;
  getValues(): T[] {
    const values: T[] = [];
    for (const [, value] of this) {
      values.push(value);
    }
    return values;
  }
  getIndexs(): Array<Idx> {
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
}

type zPreIndexedStructure<Idx extends z.ZodType, T extends z.ZodType> =
  & z.ZodCustom<PreIndexedStructure<z.infer<Idx>, z.infer<T>>>
  & { index: Idx; value: T };
export function zPreIndexedStructure<
  Idx extends z.ZodType,
  T extends z.ZodType,
>(
  indexSchema: Idx,
  valueSchema: T,
): zPreIndexedStructure<Idx, T> {
  const schema = z.instanceof(PreIndexedStructure<z.infer<Idx>, z.infer<T>>)
    .check(z.superRefine((val, ctx) => {
      for (const [index, value] of val) {
        const indexResult = indexSchema.safeParse(index);
        const valueResult = valueSchema.safeParse(value);
        if (!indexResult.success) {
          for (const issue of indexResult.error.issues) {
            ctx.addIssue({
              ...issue,
              message: `[Structure Key @ ${
                JSON.stringify(index)
              }] ${issue.message}`,
            });
          }
        }
        if (!valueResult.success) {
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
    }));
  return Object.assign(schema, {
    index: indexSchema,
    value: valueSchema,
  });
}
export class PreIndexedStructure<Idx, T> extends Structure<Idx, T> {
  protected size: number;
  protected indexes: Array<Idx>;
  protected values: Array<T>;
  constructor(size: number, indexes: Array<Idx>, values: Array<T>) {
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
  override add(_: Idx, __: O): void {
    throw new Error("Cannot add on mapped structure");
  }
  *[Symbol.iterator](): Iterator<[Idx, O]> {
    for (const [index, value] of this.structure) {
      yield [index, this.mapper(value, index)];
    }
  }
}

type zHashStructure<Idx extends z.ZodType, T extends z.ZodType> =
  & z.ZodCustom<HashStructure<z.infer<Idx>, z.infer<T>>>
  & { index: Idx; value: T };
export function zHashStructure<Idx extends z.ZodType, T extends z.ZodType>(
  indexSchema: Idx,
  valueSchema: T,
): zHashStructure<Idx, T> {
  const map = z.map(indexSchema, valueSchema);
  const schema = z.instanceof(HashStructure<z.infer<Idx>, z.infer<T>>).check(
    z.superRefine((val, ctx) => {
      const mapResult = map.safeParse(val.getHash());
      if (!mapResult.success) {
        for (const issue of mapResult.error.issues) {
          ctx.addIssue({
            ...issue,
            message: `[Hash] ${issue.message}`,
          });
        }
      }
    }),
  );
  return Object.assign(schema, {
    index: indexSchema,
    value: valueSchema,
  });
}
export class HashStructure<Idx, T> extends Structure<Idx, T> {
  protected hash: Map<Idx, T>;
  constructor(hash: Map<Idx, T>) {
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
  *[Symbol.iterator](): Iterator<[Idx, T]> {
    for (const [index, value] of this.hash) {
      yield [index, value];
    }
  }
  getHash(): Map<Idx, T> {
    return new Map(this.hash);
  }
}
type zIndexOneToOne<
  Idx extends z.ZodType,
  T extends z.ZodType,
  D extends boolean = false,
> = z.ZodCustom<IndexOneToOne<z.infer<Idx>, z.infer<T>, D>> & {
  index: Idx;
  value: T;
  defaultUndefined: D;
};
export function zIndexOneToOne<
  Idx extends z.ZodType,
  T extends z.ZodType,
  D extends boolean = false,
>(
  indexSchema: Idx,
  valueSchema: z.ZodType<T>,
  defaultUndefined?: D,
): zIndexOneToOne<Idx, T, D> {
  const schema = z.instanceof(IndexOneToOne<z.infer<Idx>, z.infer<T>, D>).check(
    z.superRefine((val, ctx) => {
      if (
        (val.getDefaultUndefined() ?? false) !== (defaultUndefined ?? false)
      ) {
        ctx.addIssue({
          code: "custom",
          message:
            `[IndexOneToOne] defaultUndefined must be ${(defaultUndefined ??
              false)}`,
        });
      }
      const list = val.getList();
      for (let i = 0; i < list.length; i++) {
        const item = list[i];
        const mapResult = valueSchema.safeParse(item);
        if (!mapResult.success) {
          for (const issue of mapResult.error.issues) {
            ctx.addIssue({
              ...issue,
              message: `[IndexOneToOne Value @${i}] ${issue.message}`,
            });
          }
        }
        const indexResult = indexSchema.safeParse(val.getIndex(item));
        if (!indexResult.success) {
          for (const issue of indexResult.error.issues) {
            ctx.addIssue({
              ...issue,
              message: `[IndexOneToOne Index @${i}] ${issue.message}`,
            });
          }
        }
      }
    }),
  );
  return Object.assign(schema, {
    index: indexSchema,
    value: valueSchema,
    defaultUndefined: defaultUndefined ?? false as D,
  }) as never;
}
export abstract class IndexOneToOne<Idx, T, D extends boolean = false>
  extends Structure<Idx, D extends true ? T | undefined : T> {
  protected list: Array<T>;
  protected defaultUndefined?: D;
  constructor(list: Array<T>, defaultUndefined?: D) {
    super();
    this.list = list;
    this.defaultUndefined = defaultUndefined;
  }
  abstract getIndex(value: T): Idx;
  override get(index: Idx): D extends true ? T | undefined : T {
    for (let i = 0; i < this.list.length; i++) {
      const value = this.list[i];
      const key = this.getIndex(value);
      if (key === index) {
        return value;
      }
    }
    if (this.defaultUndefined) return undefined as never;
    throw new Error(`Index ${index} not found`);
  }
  override add(index: Idx, value: T): void {
    if (index !== this.getIndex(value)) {
      throw new Error(`Index ${index} does not match value ${value}`);
    }
    this.list.push(value);
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
  getDefaultUndefined(): D {
    return this.defaultUndefined ?? (false as D);
  }
}
/**
 * @example
 * ```ts
 * const rows = await pg.query(`SELECT * FROM users WHERE ID IN ($1, $2, $3)`, [1, 2, 3]);
 * const users = new IndexKeyOneToOne(rows, "id", true); // third arg tells if to return undefined on missing index
 * const user1 = users.get(1); // User { id: 1, name: 'John' }
 * const user10 = users.get(10); // undefined
 * ```
 */
export class IndexKeyOneToOne<
  T,
  K extends keyof T,
  D extends boolean = false,
> extends IndexOneToOne<T[K], T, D> {
  protected indexKey: K;
  constructor(list: T[], indexKey: K, defaultUndefined?: D) {
    super(list, defaultUndefined);
    this.indexKey = indexKey;
  }
  override getIndex(value: T): T[K] {
    return value[this.indexKey];
  }
}

/**
 * @example
 * ```ts
 * const rows = await pg.query(`SELECT * FROM sensors WHERE device_id = $1`, [1]);
 * const sensors = new IndexInnerKeyOneToOne(rows, "options.parameter.key");
 * const co2Sensor = sensors.get('CO2');
 * ```
 */
export class IndexInnerKeyOneToOne<
  T,
  K extends KeyPath<T, S, DefaultPrimitive>,
  S extends string = DefaultSplitChar,
  D extends boolean = false,
> extends IndexOneToOne<PropType<T, S, K>, T, D> {
  protected keyPath: K;
  protected split?: S;
  constructor(list: Array<T>, keyPath: K, split?: S, defaultUndefined?: D) {
    super(list, defaultUndefined);
    this.keyPath = keyPath;
    this.split = split;
  }
  override getIndex(value: T): PropType<T, S, K> {
    return getInnerProp(value, this.keyPath, this.split);
  }
}
export type zIndexOneToMany<
  Idx extends z.ZodType,
  T extends z.ZodType,
> = z.ZodCustom<IndexOneToMany<z.infer<Idx>, z.infer<T>>> & {
  index: Idx;
  value: z.ZodType<T>;
  defaultEmptyArr?: boolean;
};
export function zIndexOneToMany<
  Idx extends z.ZodType,
  T extends z.ZodType,
>(
  indexSchema: Idx,
  valueSchema: z.ZodType<T>,
  defaultEmptyArr?: boolean,
): zIndexOneToMany<Idx, T> {
  const schema = z.instanceof(IndexOneToMany<z.infer<Idx>, z.infer<T>>).check(
    z.superRefine((val, ctx) => {
      if ((val.getDefaultEmptyArr() ?? false) !== (defaultEmptyArr ?? false)) {
        ctx.addIssue({
          code: "custom",
          message:
            `[IndexOneToMany] defaultEmptyArr must be ${(defaultEmptyArr ??
              false)}`,
        });
      }
      const list = val.getList();
      for (let i = 0; i < list.length; i++) {
        const item = list[i];
        const mapResult = valueSchema.safeParse(item);
        if (!mapResult.success) {
          for (const issue of mapResult.error.issues) {
            ctx.addIssue({
              ...issue,
              message: `[IndexOneToMany Value @${i}] ${issue.message}`,
            });
          }
        }
        const indexResult = indexSchema.safeParse(val.getIndex(item));
        if (!indexResult.success) {
          for (const issue of indexResult.error.issues) {
            ctx.addIssue({
              ...issue,
              message: `[IndexOneToMany Index @${i}] ${issue.message}`,
            });
          }
        }
      }
    }),
  );
  return Object.assign(schema, {
    index: indexSchema,
    value: valueSchema,
    defaultEmptyArr,
  });
}
export abstract class IndexOneToMany<Idx, T> extends Structure<Idx, Array<T>> {
  protected list: Array<T>;
  protected defaultEmptyArr?: boolean;
  constructor(list: Array<T>, defaultEmptyArr?: boolean) {
    super();
    this.list = list;
    this.defaultEmptyArr = defaultEmptyArr;
  }
  abstract getIndex(value: T): Idx;
  override get(index: Idx): Array<T> {
    const arr = [];
    for (let i = 0; i < this.list.length; i++) {
      const value = this.list[i];
      const key = this.getIndex(value);
      if (key === index) {
        arr.push(value);
      }
    }
    if (arr.length === 0) {
      if (this.defaultEmptyArr) return arr;
      throw new Error(`Index ${index} not found`);
    }
    return arr;
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
  *[Symbol.iterator](): Iterator<[Idx, Array<T>]> {
    for (const ele of this.getIndexs()) {
      yield [ele, this.get(ele)];
    }
  }
  mapIndexKeyOneToOne<D extends boolean = false>(
    indexKey: keyof T,
    defaultEmptyArr?: D,
  ): MappedStructure<Idx, T[], IndexKeyOneToOne<T, keyof T, D>, this> {
    return this.map((list) =>
      new IndexKeyOneToOne(list, indexKey, defaultEmptyArr)
    );
  }
  mapIndexInnerOneToOne<
    K extends KeyPath<T, S, DefaultPrimitive>,
    S extends string = DefaultSplitChar,
    D extends boolean = false,
  >(
    indexKey: K,
    splitChar?: S,
    defaultEmptyArr?: D,
  ): MappedStructure<Idx, T[], IndexInnerKeyOneToOne<T, K, S, D>, this> {
    return this.map((list) =>
      new IndexInnerKeyOneToOne(list, indexKey, splitChar, defaultEmptyArr)
    );
  }
  mapIndexKeyOneToMany(
    indexKey: keyof T,
    defaultEmptyArr?: boolean,
  ): MappedStructure<Idx, T[], IndexKeyOneToMany<T, keyof T>, this> {
    return this.map((list) =>
      new IndexKeyOneToMany(list, indexKey, defaultEmptyArr)
    );
  }
  mapIndexInnerOneToMany<
    K extends KeyPath<T, S, DefaultPrimitive>,
    S extends string = DefaultSplitChar,
  >(
    indexKey: K,
    splitChar?: S,
    defaultEmptyArr?: boolean,
  ): MappedStructure<Idx, T[], IndexInnerKeyOneToMany<T, K, S>, this> {
    return this.map((list) =>
      new IndexInnerKeyOneToMany(list, indexKey, splitChar, defaultEmptyArr)
    );
  }
  getList(): Array<T> {
    return [...this.list];
  }
  getDefaultEmptyArr(): boolean {
    return this.defaultEmptyArr ?? false;
  }
}

/**
 * @example
 * ```ts
 * const rows = await pg.query(`SELECT * FROM sensors WHERE device_id IN ($1, $2)`, [1, 2]);
 * const sensors = new IndexKeyOneToMany(rows, "device_id");
 * const device1Sensors = sensors.get(1);
 * ```
 */
export class IndexKeyOneToMany<T, K extends keyof T>
  extends IndexOneToMany<T[K], T> {
  protected indexKey: K;
  constructor(list: T[], indexKey: K, defaultEmptyArr?: boolean) {
    super(list, defaultEmptyArr);
    this.indexKey = indexKey;
  }
  override getIndex(value: T): T[K] {
    return value[this.indexKey];
  }
}

/**
 * @example
 * ```ts
 * const rows = await pg.query(`SELECT * FROM sensors WHERE device_id IN ($1, $2)`, [1, 2]);
 * const sensors = new IndexInnerKeyOneToMany(rows, "options.parameter.key").mapIndexKeyOneToOne("device_id");
 * const device1CO2Sensor = sensors.get('CO2').get(1);
 * const PM25Sensors = sensors.get('PM2.5').getList();
 * ```
 */
export class IndexInnerKeyOneToMany<
  T,
  K extends KeyPath<T, S, DefaultPrimitive>,
  S extends string = DefaultSplitChar,
> extends IndexOneToMany<PropType<T, S, K>, T> {
  protected keyPath: K;
  protected split?: S;
  constructor(
    list: Array<T>,
    keyPath: K,
    split?: S,
    defaultEmptyArr?: boolean,
  ) {
    super(list, defaultEmptyArr);
    this.keyPath = keyPath;
    this.split = split;
  }
  override getIndex(value: T): PropType<T, S, K> {
    return getInnerProp(value, this.keyPath, this.split);
  }
}
