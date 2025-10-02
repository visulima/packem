const a = 3;
const b = a;

export { a as c, b as d };
export { a, b } from "./mod";
