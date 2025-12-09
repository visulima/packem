// index.d.ts
// #region tests/rollup-plugin-dts/variadic-tuple-types/index.d.ts
type Strings = [string, string];
type Numbers = [number, number];
type StringNumberBool = [...Strings, ...Numbers, boolean];
type Array_ = ReadonlyArray<any>;
declare function concat<T extends Array_, U extends Array_>(array1: T, array2: U): [...T, ...U];
// #endregion
export { concat, StringNumberBool as StrStrNumNumBool };
