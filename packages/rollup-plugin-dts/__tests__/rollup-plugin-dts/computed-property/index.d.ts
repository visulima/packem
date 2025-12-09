declare const Aprop: "a";
declare const Dprop: unique symbol;

interface A {}
interface B {}
interface C {}
interface D {}

export type Klass = {
    [0]: C;
    [Aprop]?: A[];
    ["B"]: B;
    [Dprop]: D;
};
