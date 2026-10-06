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
  'foo-bar': number;
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
{"version":3,"file":"index.d.ts","sources":["../../fixtures/source-map/mod.ts","../../fixtures/source-map/index.ts"],"names":[],"mappings":"AAAA,IAAA,CAAA,GAAO,CAAA,GAAA,CAAA,CAAM,EAAA,MAAK,EAAA,EAAW,EAAA,CAAA;;;;;;;ACA7B,IAAA,CAAA,CAAA,CAAA,GAAO,CAAA,CAAA,EAAM,MAAG,EAAA,EAAW,EAAA;AAE3B,IAAA,CAAA,CAAA,CAAA,GAAO,CAAA,CAAA,EAAM,MAAG,EAAA,EAAW,EAAA;AAI3B,IAAA,CAAK,GAAG,CAAA,GAAG,CAAA,CAAA,EAAA,MAAM,EAAA,EAAA,EAAA,CAAA;AACjB,IAAA,CAAA,EAAA,CAAA,GAAA,CAAA,CAAA,EAAA,MAAmB,CAAA,GAAK,GAAE,CAAA,EAAG,EAAG;YAIf,CAAG,CAAA,EAAA,MAAA,EAAA,EAAA,CAAA,EAAA,EAAA,EAAA,EAAA,EAAA,EAAA,EAAA,CAAA;AACZ,IAAA,CAAE,EAAA,CAAA,GAAA,CAAA,CAAA,EAAA,CAAA,CAAA,KAAA,CAAA,CAAA,CAAA,EAAA,CAAA,EAAA,EAAA,EAAA,EAAA,EAAA,EAAA,EAAA,EAAA,EAAA,EAAA,EAAA,CAAA;;"}
```

## index.js.map

```map
{"version":3,"file":"index.js","sources":[],"sourcesContent":[],"names":[],"mappings":""}
```
