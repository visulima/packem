// index.d.ts
// #region tests/rollup-plugin-dts/remapped-mapped-types/foo.d.ts
type Getters<T> = { [K in keyof T as `get${Capitalize<K & string>}`]: () => T[K] };
type MyExclude<T, U> = T extends U ? never : T;
// #endregion
// #region tests/rollup-plugin-dts/remapped-mapped-types/index.d.ts
interface Person {
    age: number;
    location: string;
    name: string;
}
type LazyPerson = Getters<Person>;
type RemoveKindField<T> = { [K in keyof T as MyExclude<K, "kind">]: T[K] };
interface Circle {
    kind: "circle";
    radius: number;
}
type KindlessCircle = RemoveKindField<Circle>;
// #endregion
export { KindlessCircle, LazyPerson };
