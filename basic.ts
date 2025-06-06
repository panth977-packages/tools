type Prop<T, K> = K extends [
  infer K1 extends string,
  ...infer Ks extends string[],
] ? T extends { [k in K1]: infer V } ? Prop<V, Ks>
  : T extends { [k in K1]?: infer V } ? Prop<V, Ks> | undefined
  : never
  : T;
type PropExe<T, K> = K extends [
  infer K1 extends string,
  ...infer Ks extends string[],
] ? T extends { [k in K1]: infer V } ? PropExe<V, Ks>
  : T extends { [k in K1]?: infer V } ? PropExe<V, Ks>
  : never
  : T;
type KeyOf<T> = Exclude<{ [k in keyof T]: k }[keyof T], undefined>;
type ValueOf<T> = T[KeyOf<T>];
export type DefaultPrimitive =
  | null
  | symbol
  | undefined
  | number
  | string
  | boolean
  | ((...arg: any[]) => any);
type KeyTree<T, P> = ValueOf<
  {
    [K in KeyOf<T>]: T extends { [k_ in K]: P } ? [K]
      : T extends { [k_ in K]?: P } ? [K]
      : [K] | [K, ...KeyTree<Exclude<T[K], undefined>, P>];
  }
>;
type _Join<A, S extends string> = A extends [
  infer E1 extends string | number,
  ...infer Es,
] ? `${E1}${S}${_Join<Es, S>}`
  : ``;
type Join<A, S extends string> = _Join<A, S> extends `${infer E}${S}` ? E
  : never;
type _Split<A, S extends string> = A extends `${infer E1}${S}${infer Es}`
  ? [E1, ..._Split<Es, S>]
  : [];
type Split<A, S extends string> = A extends string ? _Split<`${A}${S}`, S>
  : never;

/**
 * type template to get all possible key paths
 * @example
 * ```ts
 * type SomeObj = { prop1?: { subProp1: number; subProp2: boolean }; prop2: string };
 * type PossibleKeyPaths = KeyPath<SomeObj, '.'>; // 'prop1.subProp1' | 'prop1.subProp2' | 'prop2'
 * ```
 */ export type KeyPath<T, S extends string, P> =
  | Join<KeyTree<T, P>, S>
  | (string & Record<never, never>);
/**
 * type template to get type of the keyPath of given type
 * @example
 * ```ts
 * type SomeObj = { prop1?: { subProp1: number; subProp2: boolean }; prop2: string };
 * type TypeOfProp1SubProp2 = PropType<SomeObj, '.', 'prop1.subProp2'>; // boolean | undefined
 * ```
 */ export type PropType<T, S extends string, K> = Prop<T, Split<K, S>>;
/**
 * type template to get type of the keyPath of given type ensuring the parent types will exist!
 * @example
 * ```ts
 * type SomeObj = { prop1?: { subProp1: number; subProp2: boolean }; prop2: string };
 * type TypeOfProp1SubProp2 = PropTypeExe<SomeObj, '.', 'prop1.subProp2'>; // boolean
 * ```
 */ export type PropTypeExe<T, S extends string, K> = PropExe<T, Split<K, S>>;
/**
 * DefaultSplitChar is the default char used in [getInnerProp, setInnerProp] functions.
 */ export type DefaultSplitChar = ".";
/**
 * DefaultSplitChar is the default char used in [getInnerProp, setInnerProp] functions.
 */ export const DefaultSplitChar: DefaultSplitChar = ".";

/**
 * To access an inner property of a object!
 *
 * @example
 * ```ts
 * type SomeObj = { prop1?: { subProp1: number; subProp2: boolean }; prop2: string };
 * const Obj1: SomObj = { prop2: 'value2' };
 * TOOLS.getInnerProp({ obj: Obj1, keyPath: 'prop1.subProp2' }); // undefined
 * Obj1.prop1 = { subProp1: 10, subProp2: false };
 * TOOLS.getInnerProp({ obj: Obj1, keyPath: 'prop1.subProp2' }); // false
 * ```
 */ export function getInnerProp<
  T,
  K extends KeyPath<T, S, P>,
  S extends string = DefaultSplitChar,
  P = DefaultPrimitive,
>(
  obj: T,
  keyPath: K,
  split?: S,
): PropType<T, S, K> {
  for (const p of keyPath.split(split ?? DefaultSplitChar)) {
    if (!obj) return undefined as never;
    obj = obj[p as never] as never;
  }
  return obj as never;
}

/**
 * To set an inner property of a object!
 *
 * @example
 * ```ts
 * type SomeObj = { prop1?: { subProp1: number; subProp2: boolean }; prop2: string };
 * const Obj1: SomObj = { prop2: 'value2' };
 * TOOLS.getInnerProp({ obj: Obj1, keyPath: 'prop1.subProp2'}); // undefined
 * TOOLS.setInnerProp({ obj: Obj1, keyPath: 'prop1.subProp1', value: true }); // [throw Err] because prop1 dose not exists!
 * Obj1.prop1 = { subProp1: 10, subProp2: false };
 * TOOLS.getInnerProp({ obj: Obj1, keyPath: 'prop1.subProp2'}); // false
 * TOOLS.setInnerProp({ obj: Obj1, keyPath: 'prop1.subProp1', value: true });
 * TOOLS.getInnerProp({ obj: Obj1, keyPath: 'prop1.subProp2'}); // true
 * ```
 */ export function setInnerProp<
  T,
  K extends KeyPath<T, S, P>,
  S extends string = DefaultSplitChar,
  P = DefaultPrimitive,
>(
  obj: T,
  keyPath: K,
  value: PropTypeExe<T, S, K>,
  split?: S,
): void {
  const paths = keyPath.split(split ?? DefaultSplitChar);
  const lst = paths.pop();
  for (const p of paths) {
    if (!obj) throw new Error(`Object is undefined`);
    obj = obj[p as never] as never;
  }
  if (obj[lst as never] === undefined) {
    throw new Error(`Property ${lst} does not exist`);
  }
  obj[lst as never] = value as never;
}
