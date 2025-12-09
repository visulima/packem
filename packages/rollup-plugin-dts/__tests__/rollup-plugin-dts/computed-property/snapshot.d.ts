// index.d.ts
// #region tests/rollup-plugin-dts/computed-property/index.d.ts
declare const Aprop: "a";
declare const Dprop: unique symbol;
interface A {}
interface B {}
interface C {}
interface D {}
type Klass = {
    [0]: C;
    [Aprop]?: A[];
    ["B"]: B;
    [Dprop]: D;
};
// #endregion
export { Klass };
