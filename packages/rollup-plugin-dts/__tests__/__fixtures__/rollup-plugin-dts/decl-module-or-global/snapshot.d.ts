// index.d.ts
// #region tests/rollup-plugin-dts/decl-module-or-global/index.d.ts
declare module "babel__core" {
    var function1: any;
}
declare global {
    namespace React {}
}
declare let test: any;
// #endregion
export { test };
