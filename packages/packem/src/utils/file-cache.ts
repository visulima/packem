import { createHash } from "node:crypto";

import { isAccessibleSync, readJsonSync, writeJsonSync } from "@visulima/fs";
import { findCacheDirectorySync } from "@visulima/package";
import type { Pail } from "@visulima/pail";
import type { RollupCache } from "rollup";

class FileCache {
    readonly #cachePath: undefined | string;

    readonly #packemVersion: string;

    public constructor(cwd: string, packemVersion: string, logger: Pail<never, string>) {
        this.#cachePath = findCacheDirectorySync("visulima-packem", {
            create: true,
            cwd,
        });

        const hash = createHash("md5");

        hash.update(packemVersion);

        this.#packemVersion = hash.digest("hex");

        if (this.#cachePath === undefined) {
            logger.debug("Could not create cache directory.");
        } else {
            logger.debug(`Cache path is: ${this.#cachePath}`);
        }
    }

    public get(name: string): RollupCache | undefined {
        if (this.#cachePath === undefined) {
            return undefined;
        }

        const filePath = `${this.#cachePath}/${name}-${this.#packemVersion}.json`;

        if (!isAccessibleSync(filePath)) {
            return undefined;
        }

        return readJsonSync(filePath) as unknown as RollupCache;
    }

    public set(name: string, data: RollupCache | undefined): void {
        if (this.#cachePath === undefined || data === undefined) {
            return;
        }

        writeJsonSync(`${this.#cachePath}/${name}-${this.#packemVersion}.json`, data, {
            indent: 2,
            overwrite: true,
        });
    }
}

export default FileCache;
