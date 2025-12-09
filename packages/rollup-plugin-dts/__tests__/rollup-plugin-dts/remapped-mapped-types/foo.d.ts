export type Getters<T> = {
    [K in keyof T as `get${Capitalize<K & string>}`]: () => T[K];
};

export type MyExclude<T, U> = T extends U ? never : T;
