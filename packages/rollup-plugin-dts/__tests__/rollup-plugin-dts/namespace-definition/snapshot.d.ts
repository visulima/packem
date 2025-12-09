// index.d.ts
// #region tests/rollup-plugin-dts/namespace-definition/index.d.ts
declare function function_(argument: string): string;
declare namespace function_ {
    var staticProp: string;
}
// #endregion
export { function_ as fn };
