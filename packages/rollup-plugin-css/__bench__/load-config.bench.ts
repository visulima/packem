import { findMonorepoRoot, findPackageRoot } from "@visulima/package";
import { bench, describe } from "vitest";

// loadConfig runs once per CSS file and (pre-optimization) called
// resolveStopDirectory(cwd) -> findMonorepoRoot(cwd) on every invocation, even
// though cwd is constant for the whole build. The optimization memoizes the
// result per cwd. This bench compares the repeated FS directory-tree walk
// ("before") against the memoized lookup ("after") for a fixed cwd.
const cwd = process.cwd();

const computeStopDirectory = async (directory: string): Promise<string | undefined> => {
    try {
        const found = await findMonorepoRoot(directory);

        return found.path;
    } catch {
        try {
            return await findPackageRoot(directory);
        } catch {
            return undefined;
        }
    }
};

// Mirror the optimized memoization in load-config.ts.
const stopDirectoryCache = new Map<string, Promise<string | undefined>>();

const resolveStopDirectoryMemoized = async (directory: string): Promise<string | undefined> => {
    let cached = stopDirectoryCache.get(directory);

    if (!cached) {
        cached = computeStopDirectory(directory);
        stopDirectoryCache.set(directory, cached);
    }

    return cached;
};

describe("loadConfig - stop directory resolution (per CSS file)", () => {
    bench("before: findMonorepoRoot FS walk every file", async () => {
        await computeStopDirectory(cwd);
    });

    bench("after: memoized stop directory per cwd", async () => {
        await resolveStopDirectoryMemoized(cwd);
    });
});
