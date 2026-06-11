import type { PreRenderedAsset } from "rollup";

// Matches the pnpm virtual store (`node_modules/.pnpm`) with either path
// separator; rollup can hand back forward-slash names even on Windows.
const PNPM_STORE_REGEX = /node_modules([/\\])\.pnpm/;

/**
 * Generates appropriate file names for entry files, handling special cases for node_modules.
 * @param chunkInfo The pre-rendered asset information from Rollup
 * @param extension The file extension to use
 * @returns The generated filename pattern for the entry file
 */
const getEntryFileNames = (chunkInfo: PreRenderedAsset, extension: string): string => {
    // @see https://github.com/rollup/rollup/pull/5686#issuecomment-2418464909 -> should be most of the time only one entry
    for (const name of Array.isArray(chunkInfo.names) ? chunkInfo.names : []) {
        // Detect the pnpm virtual store regardless of which separator the name
        // uses; keying off `process.platform` would miss forward-slash names on
        // Windows.
        const pnpmMatch = PNPM_STORE_REGEX.exec(name);

        if (pnpmMatch) {
            const separator = pnpmMatch[1] as string;
            const withoutStore = `${name.replace(`node_modules${separator}.pnpm`, "external")}.${extension}`;

            return withoutStore.replace(`node_modules${separator}`, "");
        }

        if (name.includes("node_modules")) {
            return `${name.replace("node_modules", "external")}.${extension}`;
        }
    }

    return `[name].${extension}`;
};

export default getEntryFileNames;
