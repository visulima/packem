import { createHash } from "node:crypto";

import { resolve } from "@visulima/path";
import { createDebug } from "obug";
import type ts from "typescript";

const debug = createDebug("rollup-plugin-dts:tsc-context");

// Program caches, keyed by the build identity (see `getConfigKey` and `getLanguageFingerprint`). Builds share a cache only
// when both their language set and their tsconfig are the same. The least recently used cache is dropped beyond the budget.
const sharedContexts = new Map<string, TscContext>();

// The hash of each `tsconfigRaw` object. `tscEmit` runs once per module with the same object, so it is hashed once. An
// object with no faithful encoding is keyed by identity instead (see `identityKey`).
const configHashes = new WeakMap<object, string>();

// Identity of an object the serialiser cannot encode: the same reference always gets the same key, so a build that repeats
// with the same options still shares a cache, while another object — even one that holds equal values — never collides with
// it. Reached for a tsconfig or vue option that holds a function, a class instance or a cycle.
const identities = new WeakMap<object, number>();

let nextIdentity = 0;

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

// The programs the caches retain together. Each cache bounds itself to `MAX_RETAINED_PROGRAMS` (see `emit-compiler.ts`), so
// eight warm caches — the number of caches a process used to keep — stay inside the budget. Bounding the programs instead of
// the caches lets a process alternate among more tsconfigs without evicting one, as long as they retain only a few programs
// each; a cache that holds none is free. Exported for the cache tests.
export const MAX_SHARED_PROGRAMS = 64;

/** Identity of an object the serialiser cannot encode (see `identities`). Stable per reference, never for equal values. */
export const identityKey = (value: object): string => {
    let identity = identities.get(value);

    if (identity === undefined) {
        identity = nextIdentity;
        nextIdentity += 1;
        identities.set(value, identity);
    }

    return `identity:${String(identity)}`;
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

    // A map of a root tsconfig — and the flags the build ran with — to all projects referenced from it (see `emit-build.ts`).
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
 * there is none), a hash of the whole raw configuration, and the hash of the config files that configuration was merged from
 * (`tsconfigChainKey`, see `readTsconfigChain`). The raw configuration already holds the merged `compilerOptions`, so builds
 * with different compiler options never share a program; the chain key covers what that merge drops, such as `references`.
 * A configuration that has no faithful encoding — one that holds a function or a class instance — falls back to its own
 * identity: builds that repeat with the same object share a program, builds with different objects never do.
 */
export const getConfigKey = ({
    cwd,
    tsconfig,
    tsconfigChainKey,
    tsconfigRaw,
}: {
    cwd: string;
    tsconfig?: string;
    tsconfigChainKey?: string;
    tsconfigRaw: object;
}): string => {
    if (!configHashes.has(tsconfigRaw)) {
        const key = stableKey(tsconfigRaw);

        configHashes.set(tsconfigRaw, key === undefined ? identityKey(tsconfigRaw) : createHash("sha256").update(key).digest("hex"));
    }

    const location = tsconfig ? `tsconfig:${resolve(tsconfig)}` : `cwd:${resolve(cwd)}`;

    // `undefined` is what an absent chain key serialises to, so a build without a tsconfig file gets the same key as one whose
    // configuration was never merged from another file.
    return JSON.stringify([location, configHashes.get(tsconfigRaw), tsconfigChainKey]);
};

/**
 * The shared cache for a build identity, such as a language fingerprint combined with `getConfigKey`. A cache that is used
 * moves to the end of the map, so the least recently used one is dropped first once the caches retain more programs than
 * `MAX_SHARED_PROGRAMS`.
 */
export const getSharedContext = (key: string): TscContext => {
    let context = sharedContexts.get(key);

    if (context) {
        sharedContexts.delete(key);
    } else {
        context = createContext();
    }

    sharedContexts.set(key, context);

    // Bound what the caches hold together. The cache the caller asked for keeps its place, so a build identity that retains
    // more than the budget on its own is not evicted from under the build that is using it.
    let retained = 0;

    for (const cached of sharedContexts.values()) {
        retained += cached.programs.length;
    }

    for (const [oldest, cached] of sharedContexts) {
        if (retained <= MAX_SHARED_PROGRAMS) {
            break;
        }

        if (oldest === key) {
            continue;
        }

        retained -= cached.programs.length;
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
