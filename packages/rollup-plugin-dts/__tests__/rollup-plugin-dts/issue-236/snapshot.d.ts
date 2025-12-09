// index.d.ts
import type { MouseEventHandler } from "react";
import type React from "react";

// #region tests/rollup-plugin-dts/issue-236/index.d.ts
type Props = {
    onClick: MouseEventHandler<HTMLButtonElement>;
};
declare const Button: React.FC<Props>;
// #endregion
export { Button };
