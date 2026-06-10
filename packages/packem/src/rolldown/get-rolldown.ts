import type { BuildOutputItem } from "../utils/collect-build-entries";

type RolldownBundle = {
    close?: () => Promise<void>;
    generate: (options?: unknown) => Promise<{ output: BuildOutputItem[] }>;
    write: (options?: unknown) => Promise<{ output: BuildOutputItem[] }>;
};

type RolldownBuild = (options: unknown) => Promise<RolldownBundle>;

/** Minimal structural view of rolldown's `RolldownWatcher` (mirrors RollupWatcher). */
type RolldownWatcher = {
    close: () => Promise<void>;
    on: (event: string, listener: (...arguments_: never[]) => unknown) => unknown;
};

type RolldownWatch = (options: unknown) => RolldownWatcher;

const tryImport = async <T>(
    load: () => Promise<unknown>,
    pick: (module_: { rolldown?: RolldownBuild; watch?: RolldownWatch }) => T | undefined,
): Promise<T | undefined> => {
    try {
        return pick((await load()) as { rolldown?: RolldownBuild; watch?: RolldownWatch });
    } catch {
        return undefined;
    }
};

const NOT_INSTALLED_MESSAGE = "Rolldown is not installed. Please install '@rolldown/node' or 'rolldown' to use bundler: 'rolldown'.";

/**
 * Resolve Rolldown's `rolldown()` factory from either '@rolldown/node' (preferred)
 * or 'rolldown'. The factory returns a bundle with `.write()` / `.generate()` —
 * matching Rollup's two-step API. The top-level `build()` is a one-shot helper
 * that returns the output directly and is not what we want here.
 */
export const getRolldownBuild = async (): Promise<RolldownBuild> => {
    // Literal-string imports keep packem's own bundler (rollup-plugin-dynamic-import-vars)
    // happy when self-building.
    // @ts-ignore optional peer dependency
    const fromNode = await tryImport(() => import("@rolldown/node"), (m) => (typeof m.rolldown === "function" ? m.rolldown : undefined));

    if (fromNode) {
        return fromNode;
    }

    // @ts-ignore optional peer dependency
    const fromCore = await tryImport(() => import("rolldown"), (m) => (typeof m.rolldown === "function" ? m.rolldown : undefined));

    if (fromCore) {
        return fromCore;
    }

    throw new Error(NOT_INSTALLED_MESSAGE);
};

/**
 * Resolve Rolldown's `watch()` factory from either '@rolldown/node' (preferred)
 * or 'rolldown'. `watch(options)` returns a watcher with the same `.on(event, …)`
 * / `.close()` shape as Rollup's, so packem's watch handler is reused as-is.
 */
export const getRolldownWatch = async (): Promise<RolldownWatch> => {
    // @ts-ignore optional peer dependency
    const fromNode = await tryImport(() => import("@rolldown/node"), (m) => (typeof m.watch === "function" ? m.watch : undefined));

    if (fromNode) {
        return fromNode;
    }

    // @ts-ignore optional peer dependency
    const fromCore = await tryImport(() => import("rolldown"), (m) => (typeof m.watch === "function" ? m.watch : undefined));

    if (fromCore) {
        return fromCore;
    }

    throw new Error(NOT_INSTALLED_MESSAGE);
};

export type { RolldownBuild, RolldownBundle, RolldownWatch, RolldownWatcher };
