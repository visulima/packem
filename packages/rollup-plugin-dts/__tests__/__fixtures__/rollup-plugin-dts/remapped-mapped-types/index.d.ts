import type { Getters, MyExclude } from "./foo";

interface Person {
    age: number;
    location: string;
    name: string;
}

export type LazyPerson = Getters<Person>;

type RemoveKindField<T> = {
    [K in keyof T as MyExclude<K, "kind">]: T[K];
};

interface Circle {
    kind: "circle";
    radius: number;
}

export type KindlessCircle = RemoveKindField<Circle>;
