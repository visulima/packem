interface Foo {
    id: number;
}

type Maybe = Foo | undefined;

declare function makeFoo(): Foo;

declare const VERSION: string;
