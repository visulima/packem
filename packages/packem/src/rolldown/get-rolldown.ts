import type { BuildOutputItem } from "../utils/collect-build-entries";

export type RolldownBuildResult = {
    output: BuildOutputItem[];
};

export type RolldownBuild = (options: unknown) => Promise<RolldownBuildResult>;

const tryImport = async (load: () => Promise<unknown>): Promise<RolldownBuild | undefined> => {
    try {
        const mod = (await load()) as { build?: RolldownBuild };

        return typeof mod.build === "function" ? mod.build : undefined;
    } catch {
        return undefined;
    }
};

/**
 * Resolve Rolldown's build function from either '@rolldown/node' (preferred)
 * or 'rolldown'. Both packages are optional peer deps so they're not declared
 * in package.json — type imports are suppressed via ts-ignore.
 */
export async function getRolldownBuild(): Promise<RolldownBuild> {
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
}
