// index.d.ts
// #region tests/rollup-plugin-dts/namespace-definition-rename/a.d.ts
declare function function_(argument: string): string;
declare namespace function_ {
    var staticProp: string;
}
// #endregion
// #region tests/rollup-plugin-dts/namespace-definition-rename/b.d.ts
declare function function$1(argument: string): string;
declare namespace function$1 {
    var staticProp: string;
}
// #endregion
export { function_ as a, function$1 as b };
