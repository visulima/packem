import type { Input2 } from "./input2";
import { input2 } from "./input2";

export interface Input1 extends Input2 {
    input1: string;
}

export const input1: Input1 = {
    ...input2,
    input1: "input1",
};
