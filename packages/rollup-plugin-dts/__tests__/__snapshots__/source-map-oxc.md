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
{"version":3,"file":"index.d.ts","sources":["../../fixtures/source-map/mod.ts","../../fixtures/source-map/index.ts"],"names":[],"mappings":"cAAaA,GAAA;AAAA,cCAAC,CAAA;AAAA,cAEAC,CAAA;AAAA,KAIRC,GAAA;AAAA,iBACWC,GAAGC,KAAO,EAAAF,GAAA;AAAA,UAITG,GAAA;EACfC,MAAA;IACEC,GAAA;EAAA;EAEFC,MAAA;EACA,SAAA;AAAA;AAAA,kBAGeC,EAAA;EAAA,KACHP,GAAA;EAAA,KACAQ,GAAA,MAASC,CAAA;EAAA,KACTN,GAAA;IACVO,EAAA;EAAA;AAAA;"}
```

## index.js.map

```map
{"version":3,"file":"index.js","sources":[],"sourcesContent":[],"names":[],"mappings":""}
```
