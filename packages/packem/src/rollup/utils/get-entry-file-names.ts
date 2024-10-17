import type { PreRenderedAsset } from "rollup";

const isWindows = process.platform === "win32";

const getEntryFileNames = (chunkInfo: PreRenderedAsset, extension: "cjs" | "mjs"): string => {
    const pathSeperator = isWindows ? "\\" : "/";

    const firstName = chunkInfo.names[0]; // @see https://github.com/rollup/rollup/pull/5686#issuecomment-2418464909 -> should be most of the time only one entry

    if (firstName?.includes("node_modules" + pathSeperator + ".pnpm")) {
        const name = firstName.replace("node_modules" + pathSeperator + ".pnpm", "external") + "." + extension;

        return name.replace("node_modules" + pathSeperator, "");
    }

    if (firstName?.includes("node_modules")) {
        return firstName.replace("node_modules", "external") + "." + extension;
    }

    return "[name]." + extension;
};

export default getEntryFileNames;
