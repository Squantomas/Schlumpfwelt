/**
 * Recursively read-only version of `T`: objects, arrays, maps and sets can
 * not be changed through it at any depth. Used for the view on the
 * simulation state that scenes and UI get.
 *
 * Purely a compile-time guarantee – the values themselves are not frozen.
 */
export type DeepReadonly<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends ReadonlyMap<infer K, infer V>
    ? ReadonlyMap<DeepReadonly<K>, DeepReadonly<V>>
    : T extends ReadonlySet<infer U>
      ? ReadonlySet<DeepReadonly<U>>
      : T extends readonly (infer U)[]
        ? readonly DeepReadonly<U>[]
        : T extends object
          ? { readonly [P in keyof T]: DeepReadonly<T[P]> }
          : T;
