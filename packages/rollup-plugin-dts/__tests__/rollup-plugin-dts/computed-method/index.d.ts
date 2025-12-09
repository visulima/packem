import { inspect } from "node:util";

import { b } from "./b";
import { deep } from "./mod";

declare class Test {
    [inspect.custom](): string;
    [b](): string;
    [deep.deep.a]: string;
}

export { Test };
