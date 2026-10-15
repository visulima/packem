import type { Shape } from "./shape";

export interface Options {
    name: string;
    nested: {
        depth: number;
    };
    run(input: string): void;
}

export interface Options {
    extra: boolean;
}

export class Widget {
    constructor(public size: number) {}

    label: string = "";

    render(): string {
        return "";
    }
}

export enum Mode {
    Fast = 1,
    Slow = 2,
}

export namespace Ns {
    export type Id = string;

    export interface Entry {
        key: Id;
    }
}

export type Point = {
    x: number;
    y: number;
    norm(): number;
};

export function parse(input: string): number;
export function parse(input: number): string;
export function parse(input: string | number): string | number {
    return input;
}

export interface Polygon {
    shape: Shape;
    title: string;
}
