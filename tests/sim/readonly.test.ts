import { describe, expectTypeOf, it } from 'vitest';
import type { DeepReadonly } from '../../src/sim/readonly';
import type { Simulation } from '../../src/sim/simulation';
import type { SimState } from '../../src/sim/state';

// Pure type tests: they are checked by `npm run typecheck` (tsc), at runtime
// `expectTypeOf` does nothing.

interface Sample {
  count: number;
  name: string;
  nested: { deeper: { value: number } };
  list: { id: number }[];
  lookup: Map<string, { amount: number }>;
  tags: Set<string>;
  callback: (value: number) => string;
}

describe('DeepReadonly', () => {
  it('macht Objekte auf jeder Ebene schreibgeschützt', () => {
    expectTypeOf<DeepReadonly<Sample>['nested']>().toEqualTypeOf<{ readonly deeper: { readonly value: number } }>();
    expectTypeOf<DeepReadonly<Sample>>().toHaveProperty('count').toEqualTypeOf<number>();
  });

  it('macht Arrays, Maps und Sets schreibgeschützt', () => {
    expectTypeOf<DeepReadonly<Sample>['list']>().toEqualTypeOf<readonly { readonly id: number }[]>();
    expectTypeOf<DeepReadonly<Sample>['lookup']>().toEqualTypeOf<ReadonlyMap<string, { readonly amount: number }>>();
    expectTypeOf<DeepReadonly<Sample>['tags']>().toEqualTypeOf<ReadonlySet<string>>();
  });

  it('lässt einfache Werte und Funktionen unverändert', () => {
    expectTypeOf<DeepReadonly<number>>().toEqualTypeOf<number>();
    expectTypeOf<DeepReadonly<string>>().toEqualTypeOf<string>();
    expectTypeOf<DeepReadonly<Sample['callback']>>().toEqualTypeOf<(value: number) => string>();
  });

  it('verbietet Zuweisungen', () => {
    const mutate = (sample: DeepReadonly<Sample>): void => {
      // @ts-expect-error – read-only property
      sample.count = 1;
      // @ts-expect-error – read-only at depth
      sample.nested.deeper.value = 2;
      // @ts-expect-error – read-only array elements
      sample.list[0] = { id: 3 };
      // @ts-expect-error – a read-only array is no mutable array
      const list: { id: number }[] = sample.list;
      // @ts-expect-error – a read-only map is no mutable map
      const lookup: Map<string, { amount: number }> = sample.lookup;
      return void [list, lookup];
    };
    expectTypeOf(mutate).toBeFunction();
  });

  it('ist der Typ der Zustandssicht der Simulation', () => {
    expectTypeOf<Simulation['state']>().toEqualTypeOf<DeepReadonly<SimState>>();
  });
});
