// Regression fixture for sxzz/rolldown-plugin-dts#258/#259: a get/set accessor
// inside a type literal that is the return type of a function-like node used to
// crash the tsc-mode `afterDeclarations` transform with
// "Lexical environment is suspended".
export function createCounter(): { get count(): number; set count(value: number) } {
    let count = 0;

    return {
        get count(): number {
            return count;
        },
        set count(value: number) {
            count = value;
        },
    };
}

export interface Box {
    readonly handle: {
        get value(): string;
        set value(next: string);
    };
}
