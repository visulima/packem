import type { BuildOutputItem } from "../utils/collect-build-entries";

type RolldownBundle = {
    close?: () => Promise<void>;
    generate: (options?: unknown) => Promise<{ output: BuildOutputItem[] }>;
    write: (options?: unknown) => Promise<{ output: BuildOutputItem[] }>;
};

type RolldownBuild = (options: unknown) => Promise<RolldownBundle>;

const tryImport = async (load: () => Promise<unknown>): Promise<RolldownBuild | undefined> => {
    try {
        const loaded = (await load()) as { rolldown?: RolldownBuild };

        return typeof loaded.rolldown === "function" ? loaded.rolldown : undefined;
    } catch {
        return undefined;
    }
};

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
    const fromNode = await tryImport(() => import("@rolldown/node"));

    if (fromNode) {
        return fromNode;
    }

    // @ts-ignore optional peer dependency
    const fromCore = await tryImport(() => import("rolldown"));

    if (fromCore) {
        return fromCore;
    }

    throw new Error("Rolldown is not installed. Please install '@rolldown/node' or 'rolldown' to use bundler: 'rolldown'.");
};

export type { RolldownBuild, RolldownBundle };
