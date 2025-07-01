import type { PreRenderedAsset } from "rollup";

const isWindows = process.platform === "win32";

/**
 * Generates appropriate file names for entry files, handling special cases for node_modules.
 * @param chunkInfo The pre-rendered asset information from Rollup
 * @param extension The file extension to use
 * @returns The generated filename pattern for the entry file
 */
const getEntryFileNames = (chunkInfo: PreRenderedAsset, extension: string): string => {
    const pathSeparator = isWindows ? "\\" : "/";

    // @see https://github.com/rollup/rollup/pull/5686#issuecomment-2418464909 -> should be most of the time only one entry
    for (let name of Array.isArray(chunkInfo.names) ? chunkInfo.names : []) {
        if (name.includes(`node_modules${pathSeparator}.pnpm`)) {
            // eslint-disable-next-line sonarjs/updated-loop-counter
            name = `${name.replace(`node_modules${pathSeparator}.pnpm`, "external")}.${extension}`;

            return name.replace(`node_modules${pathSeparator}`, "");
        }

        if (name.includes("node_modules")) {
            return `${name.replace("node_modules", "external")}.${extension}`;
        }
    }

    return `[name].${extension}`;
};

export default getEntryFileNames;
