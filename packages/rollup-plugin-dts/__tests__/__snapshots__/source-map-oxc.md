## index.d.ts

```ts
declare const foo: number;
//#endregion
//#region __tests__/fixtures/source-map/index.d.ts
declare const a: string;
declare const b: string;
type Str = string;
declare function fn(param: Str): string;
interface Obj {
  nested: {
    key: string;
  };
  method(): void;
  "foo-bar": number;
}
declare namespace Ns {
  type Str = string;
  type Foo<T> = T;
  type Obj = {
    id: string;
  };
}
//#endregion
export { mod_d_exports as Mod, Ns, Obj, a, b, fn };
//# sourceMappingURL=index.d.ts.map
```

## index.d.ts.map

```map
{"version":3,"file":"index.d.ts","names":[],"sources":["../../fixtures/source-map/mod.ts","../../fixtures/source-map/index.ts"],"sourcesContent":[],"mappings":"cAAa;;;cCAA;cAEA;KAIR,GAAA;iBACW,EAAA,QAAU;UAIT,GAAA;;;;;;;kBAQA,EAAA;;gBAEM"}
```
