import type { B, C, D, E } from "./foo";
import { A } from "./foo";

export default class Foo extends A {
    b: B;
    constructor(c: C);
    method(d: D): E;
}
