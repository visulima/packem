import type { RollupBuild, RollupOptions, RollupWatcher } from "rollup";

type RollupBuildFactory = (options: RollupOptions) => Promise<RollupBuild>;
type RollupWatchFactory = (options: RollupOptions | RollupOptions[]) => RollupWatcher;

const tryImport = async <T>(load: () => Promise<unknown>, pick: (module_: unknown) => T | undefined): Promise<T | undefined> => {
    try {
        return pick(await load());
    } catch {
        return undefined;
    }
};

const NOT_INSTALLED_MESSAGE = "Rollup is not installed. Please install 'rollup' to use bundler: 'rollup' or DTS generation with the rollup driver.";

export const getRollupBuild = async (): Promise<RollupBuildFactory> => {
    const factory = await tryImport(
        // @ts-ignore optional peer dependency
        () => import("rollup"),
        (m) => (m as { rollup?: RollupBuildFactory }).rollup,
    );

    if (!factory) {
        throw new Error(NOT_INSTALLED_MESSAGE);
    }

    return factory;
};

export const getRollupWatch = async (): Promise<RollupWatchFactory> => {
    const factory = await tryImport(
        // @ts-ignore optional peer dependency
        () => import("rollup"),
        (m) => (m as { watch?: RollupWatchFactory }).watch,
    );

    if (!factory) {
        throw new Error(NOT_INSTALLED_MESSAGE);
    }

    return factory;
};

export const getRollupVersion = async (): Promise<string | undefined> =>
    tryImport(
        // @ts-ignore optional peer dependency
        () => import("rollup"),
        (m) => (m as { VERSION?: string }).VERSION,
    );

export type { RollupBuildFactory, RollupWatchFactory };
