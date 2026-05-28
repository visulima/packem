// index.d.ts
// #region tests/rollup-plugin-dts/call-signature/index.d.ts
interface I {
    (argument: string): string;
    staticProp: string;
}
declare const function_: {
    (argument: string): string;
    staticProp: string;
};
// #endregion
export { function_ as fn, I };
