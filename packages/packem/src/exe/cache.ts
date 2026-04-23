import { homedir } from "node:os";
import { platform as processPlatform } from "node:process";

import { join } from "@visulima/path";

import type { ExeTarget } from "./platform";

const getCacheDirectory = (): string => {
    const home = homedir();

    if (processPlatform === "darwin") {
        return join(home, "Library/Caches/packem");
    }

    if (processPlatform === "win32") {
        const localAppData = process.env.LOCALAPPDATA;

        if (localAppData) {
            return join(localAppData, "packem/Caches");
        }

        return join(home, "AppData/Local/packem/Caches");
    }

    const xdgCache = process.env.XDG_CACHE_HOME;

    if (xdgCache) {
        return join(xdgCache, "packem");
    }

    return join(home, ".cache/packem");
};

const getCachedBinaryPath = (target: ExeTarget): string => {
    const cacheDirectory = getCacheDirectory();
    const binaryName = target.platform === "win" ? "node.exe" : "node";

    return join(
        cacheDirectory,
        "node",
        `v${target.nodeVersion}`,
        `${target.platform}-${target.arch}`,
        binaryName,
    );
};

export { getCachedBinaryPath, getCacheDirectory };
