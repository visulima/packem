// index.d.ts
declare namespace example_d_exports {
    export { dog, Example };
}
interface Example<S extends string> {
    example: S;
}
declare const dog: Example<"hi">;
// #endregion
export { example_d_exports as types };
