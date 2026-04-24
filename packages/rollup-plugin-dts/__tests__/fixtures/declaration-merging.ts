// Function + namespace (yaml/visit pattern)
export function visit(node: unknown, visitor: (n: unknown) => void): void {
    visitor(node);
}

export namespace visit {
    export const BREAK: unique symbol = Symbol("BREAK");
    export const SKIP: unique symbol = Symbol("SKIP");
    export const REMOVE: unique symbol = Symbol("REMOVE");
}

// Interface + const (zod/ZodError pattern: type shape + runtime value under same name)
export interface ZodError<T = unknown> {
    issues: T[];
    format(): string;
}

export const ZodError: new <T>(issues: T[]) => ZodError<T> = class<T> {
    issues: T[];
    constructor(issues: T[]) {
        this.issues = issues;
    }
    format() {
        return JSON.stringify(this.issues);
    }
} as unknown as new <T>(issues: T[]) => ZodError<T>;

// Class + namespace (static members via namespace merging)
export class Box<T> {
    constructor(public value: T) {}
}

export namespace Box {
    export const empty = new Box<null>(null);
}
