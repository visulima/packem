type Strings = [string, string];
type Numbers = [number, number];
export type StrStrNumNumBool = [...Strings, ...Numbers, boolean];

type Array_ = ReadonlyArray<any>;
export function concat<T extends Array_, U extends Array_>(array1: T, array2: U): [...T, ...U];
