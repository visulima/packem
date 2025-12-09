// common-BCs1CRq6.d.ts
// #region tests/rollup-plugin-dts/multiple-entries/common.d.ts
// main-a.d.ts
import { A } from "./common-BCs1CRq6.js";
// main-b.d.ts
import { B } from "./common-BCs1CRq6.js";

interface A {}
interface B {}
// #endregion
export { A, B };
export { A };

export { B };
