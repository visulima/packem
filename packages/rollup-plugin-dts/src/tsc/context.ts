import { createHash } from "node:crypto";

import { resolve } from "@visulima/path";
import { createDebug } from "obug";
import type ts from "typescript";

const debug = createDebug("rollup-plugin-dts:tsc-context");

// Program caches, keyed by the build identity (see `getConfigKey` and `getLanguageFingerprint`). Builds share a cache only
// when both their language set and their tsconfig are the same. The least recently used cache is dropped beyond the cap.
const sharedContexts = new Map<string, TscContext>();

// Enough for the distinct tsconfig and language combinations one process builds; the cap keeps a long watch session from
// growing the map without bound.
const MAX_SHARED_CONTEXTS = 8;

// The hash of each `tsconfigRaw` object. `tscEmit` runs once per module with the same object, so it is hashed once.
const configHashes = new WeakMap<object, string | undefined>();

// Each value becomes a tagged array, so no two kinds of value can encode to the same text.
const encodePrimitive = (value: unknown): unknown[] | undefined => {
    switch (typeof value) {
        case "bigint": {
            return ["bigint", value.toString()];
        }

        case "boolean": {
            return ["boolean", value];
        }

        case "number": {
            return ["number", Object.is(value, -0) ? "-0" : String(value)];
        }

        case "string": {
            return ["string", value];
        }

        case "undefined": {
            return ["undefined"];
        }

        default: {
            // Functions and symbols have no faithful text form.
            return undefined;
        }
    }
};

// The entries to encode: an array's items by index, or an object's own properties sorted by key. Returns `undefined` for an
// object with no faithful encoding: a non-plain object (such as a Map, a Date or a class instance) or one with symbol keys.
const childrenOf = (object: object): [string, unknown][] | undefined => {
    const record = object as Record<string, unknown>;

    if (Array.isArray(object)) {
        return Object.entries(record);
    }

    const prototype: unknown = Object.getPrototypeOf(object);

    if ((prototype !== Object.prototype && prototype !== null) || Object.getOwnPropertySymbols(object).length > 0) {
        return undefined;
    }

    return Object.keys(record)
        .toSorted((left, right) => left.localeCompare(right))
        .map((key): [string, unknown] => [key, record[key]]);
};

const encodeValue = (value: unknown, ancestors: object[]): unknown[] | undefined => {
    if (value === null) {
        return ["null"];
    }

    if (typeof value !== "object") {
        return encodePrimitive(value);
    }

    // A cycle has no finite encoding.
    if (ancestors.includes(value)) {
        return undefined;
    }

    if (value instanceof RegExp) {
        return ["regexp", value.source, value.flags];
    }

    const children = childrenOf(value);

    if (children === undefined) {
        return undefined;
    }

    const path = [...ancestors, value];
    const encoded: [string, unknown[]][] = [];

    for (const [key, child] of children) {
        const text = encodeValue(child, path);

        if (text === undefined) {
            return undefined;
        }

        encoded.push([key, text]);
    }

    return [Array.isArray(value) ? "array" : "object", encoded];
};

export interface ParsedProject {
    parsedConfig: ts.ParsedCommandLine;
    tsconfigPath: string;
}

// A map of a source file to the project it belongs to. This makes it faster to
// find the project for a source file.
export type SourceFileToProjectMap = Map<string, ParsedProject>;

export interface TscContext {
    files: Map<string, string>;
    programs: ts.Program[];

    // A map of a root tsconfig to all projects referenced from it.
    projects: Map<string, SourceFileToProjectMap>;
}

export const createContext = (): TscContext => {
    const programs: ts.Program[] = [];
    const files = new Map<string, string>();
    const projects = new Map<string, SourceFileToProjectMap>();

    return { files, programs, projects };
};

export const invalidateContextFile = (context: TscContext, file: string): void => {
    const normalizedFile = resolve(file).replaceAll("\\", "/");

    debug(`invalidating context file: ${normalizedFile}`);
    context.files.delete(normalizedFile);
    context.programs = context.programs.filter((program) => program.getSourceFiles().every((sourceFile) => sourceFile.fileName !== normalizedFile));
    context.projects.clear();
};

export const globalContext: TscContext = createContext();

/**
 * Encodes a value as JSON text that tells apart what `JSON.stringify` conflates: `undefined` and a missing key, `NaN` and `null`,
 * a RegExp and a plain object, and a string and a RegExp with the same text. Object keys are sorted, so key order does not matter.
 * Returns `undefined` for a value with no faithful encoding: functions, symbols, class instances (such as `Map` or `Date`) and
 * cyclic objects.
 */
export const stableKey = (value: unknown): string | undefined => {
    const encoded = encodeValue(value, []);

    return encoded === undefined ? undefined : JSON.stringify(encoded);
};

/**
 * Identity of the TypeScript configuration a build runs with: the tsconfig file it was read from (or the working directory when
 * there is none), and a hash of the whole raw configuration. That raw configuration already holds the merged `compilerOptions`,
 * so builds with different compiler options never share a program. Returns `undefined` when the configuration has no faithful
 * encoding, in which case the build must not share a cache.
 */
export const getConfigKey = ({ cwd, tsconfig, tsconfigRaw }: { cwd: string; tsconfig?: string; tsconfigRaw: object }): string | undefined => {
    if (!configHashes.has(tsconfigRaw)) {
        const key = stableKey(tsconfigRaw);

        configHashes.set(tsconfigRaw, key === undefined ? undefined : createHash("sha256").update(key).digest("hex"));
    }

    const hash = configHashes.get(tsconfigRaw);

    if (hash === undefined) {
        return undefined;
    }

    const location = tsconfig ? `tsconfig:${resolve(tsconfig)}` : `cwd:${resolve(cwd)}`;

    return JSON.stringify([location, hash]);
};

/**
 * The shared cache for a build identity, such as a language fingerprint combined with `getConfigKey`. A cache that is
 * used moves to the end of the map, so the least recently used one is dropped when the cap is exceeded.
 */
export const getSharedContext = (key: string): TscContext => {
    let context = sharedContexts.get(key);

    if (context) {
        sharedContexts.delete(key);
    } else {
        context = createContext();
    }

    sharedContexts.set(key, context);

    for (const oldest of sharedContexts.keys()) {
        if (sharedContexts.size <= MAX_SHARED_CONTEXTS) {
            break;
        }

        sharedContexts.delete(oldest);
    }

    return context;
};

export const invalidateSharedContextFile = (file: string): void => {
    for (const context of [globalContext, ...sharedContexts.values()]) {
        invalidateContextFile(context, file);
    }
};

// Test helpers: drop every shared cache, and count the programs the shared caches retain.
export const resetSharedContexts = (): void => {
    sharedContexts.clear();
};

export const countSharedPrograms = (): number => [...sharedContexts.values()].reduce((total, context) => total + context.programs.length, 0);
