// index.d.ts


import * as C from "c";
import { E as E3 } from "e";

export { default as A } from "a";
export { type B } from "b";

// #region tests/rollup-plugin-dts/type-only-import-export/foo.d.ts
interface Foo {}
// #endregion
// #region tests/rollup-plugin-dts/type-only-import-export/bar.d.ts
declare class BarType {}
declare class BarValue {}
// #endregion
// #region tests/rollup-plugin-dts/type-only-import-export/index.d.ts

interface O$1 {}
declare class X {}
interface Foo$1 {
    inline: string;
}
// #endregion

export {
    
    
    BarType,
    BarValue,
    C,
    C as C1,
    type E3 as E2,
    E3,
    type Foo,
    type Foo$1 as FooInlne,
    O$1 as O1,
    type X,
};

export { type default as D } from "d";
export { E as default } from "e";
export { E as E4 } from "e3";
export * as F from "f";
export { G } from "g";
export { G1 } from "g1";
export { H as H1 } from "h1";
export * as I from "i";
export * from "i1";
export { type J } from "j";
export { type K as K1 } from "k1";
export { type L } from "l";
export { type M as M1 } from "m1";
export * from "n";
export * as O from "o";

export {type B as B2, type B as B3} from "b1";
