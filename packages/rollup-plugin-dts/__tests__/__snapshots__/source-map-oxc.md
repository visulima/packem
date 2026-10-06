## index.d.ts

```ts
declare const foo: number;
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
export { mod_d as Mod, Ns, Obj, a, b, fn };
//# sourceMappingURL=index.d.ts.map

```

## index.d.ts.map

```map
{"version":3,"file":"index.d.ts","sources":["../../fixtures/source-map/mod.ts","../../fixtures/source-map/index.ts"],"names":[],"mappings":"AAAO,IAAA,CAAA,GAAA,CAAA,GAAA,CAAA,CAAM,EAAA,MAAA,EAAA,EAAA,EAAA,CAAA;;;;;;;ACAN,IAAA,CAAA,CAAA,CAAA,GAAA,CAAA,CAAA,EAAM,MAAA,EAAA,EAAA,EAAA;AAEN,IAAA,CAAA,CAAA,CAAA,GAAA,CAAA,CAAA,EAAM,MAAA,EAAA,EAAA,EAAA;AAIR,IAAA,CAAA,GAAA,CAAA,GAAA,CAAA,CAAA,EAAA,MAAA,EAAA,EAAA,EAAA,CAAA;AACE,IAAA,CAAA,EAAA,CAAA,GAAA,CAAA,CAAA,EAAA,MAAY,CAAA,GAAA,CAAA,EAAO,CAAA,EAAA,EAAA,EAAA,CAAA;AAI1B,IAAA,CAAA,GAAA,CAAA,GAAiB,CAAA,CAAI,EAAA,MAAA,EAAA,EAAA,CAAA,EAAA,EAAA,EAAA,EAAA,EAAA,EAAA,EAAA,CAAA;AACX,IAAA,CAAA,EAAA,CAAA,GAAA,CAAA,CAAA,EAAA,CAAA,CAAA,KAAA,CAAA,CAAA,CAAA,EAAA,CAAA,EAAA,EAAA,EAAA,EAAA,EAAA,EAAA,EAAA,EAAA,EAAA,EAAA,EAAA,CAAA;;"}
```

## index.js.map

```map
{"version":3,"file":"index.js","sources":[],"sourcesContent":[],"names":[],"mappings":""}
```
