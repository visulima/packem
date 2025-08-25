// index.d.ts
//#region tests/rollup-plugin-dts/type-simple/index.d.ts
declare const A: "string";
declare const B: 8;
declare const C: void;
declare const D: unknown;
declare const E: any;
declare const F: boolean;
declare const G: number;
declare const H: string;
declare const I: object;
declare const J: null;
declare const K: undefined;
declare const L: symbol;
declare const M: never;
interface N {
  foo(): this;
}
declare const O: bigint;
//#endregion
export { A, B, C, D, E, F, G, H, I, J, K, L, M, N, O };