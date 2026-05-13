import type { RollupBuild, RollupOptions, RollupWatcher } from "rollup";

export type RollupBuildFactory = (options: RollupOptions) => Promise<RollupBuild>;
export type RollupWatchFactory = (options: RollupOptions | RollupOptions[]) => RollupWatcher;

const tryImport = async <T>(load: () => Promise<unknown>, pick: (mod: unknown) => T | undefined): Promise<T | undefined> => {
    try {
        return pick(await load());
    } catch {
        return undefined;
    }
};

const NOT_INSTALLED_MESSAGE
    = "Rollup is not installed. Please install 'rollup' to use bundler: 'rollup' or DTS generation with the rollup driver.";

export const getRollupBuild = async (): Promise<RollupBuildFactory> => {
    // @ts-ignore optional peer dependency
    const fn = await tryImport(() => import("rollup"), (m) => (m as { rollup?: RollupBuildFactory }).rollup);

    if (!fn) {
        throw new Error(NOT_INSTALLED_MESSAGE);
    }

    return fn;
};

export const getRollupWatch = async (): Promise<RollupWatchFactory> => {
    // @ts-ignore optional peer dependency
    const fn = await tryImport(() => import("rollup"), (m) => (m as { watch?: RollupWatchFactory }).watch);

    if (!fn) {
        throw new Error(NOT_INSTALLED_MESSAGE);
    }

    return fn;
};

export const getRollupVersion = async (): Promise<string | undefined> =>
    // @ts-ignore optional peer dependency
    tryImport(() => import("rollup"), (m) => (m as { VERSION?: string }).VERSION);
