// index.d.ts
// #region tests/rollup-plugin-dts/ts48/index.d.ts
type MyNumber = number;
type SomeNumber = "100" extends `${infer U extends MyNumber}` ? U : never;
// #endregion
export { SomeNumber as SomeNum };
