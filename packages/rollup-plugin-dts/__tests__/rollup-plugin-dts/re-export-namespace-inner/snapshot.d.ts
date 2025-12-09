// index.d.ts
declare namespace module_d_exports {
    export { inner };
}
declare namespace inner {
    type Ty = number;
    const number_: number;
}
// #endregion
export { module_d_exports as outer };
