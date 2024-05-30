import { createHash } from "node:crypto";

import { isAccessibleSync, readFileSync, writeFileSync } from "@visulima/fs";
import { findCacheDirectorySync } from "@visulima/package";
import type { Pail } from "@visulima/pail";
import { join, toNamespacedPath } from "@visulima/path";

class FileCache {
    readonly #cwd: string;

    readonly #cachePath: undefined | string;

    readonly #packemVersion: string;

    #isEnabled = true;

    readonly #memoryCache = new Map<string, unknown>();

    public constructor(cwd: string, packemVersion: string, logger: Pail<never, string>) {
        this.#cwd = cwd;
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

    public set isEnabled(value: boolean) {
        this.#isEnabled = value;
    }

    public has(name: string, subDirectory?: string): boolean {
        if (!this.#isEnabled) {
            return false;
        }

        if (this.#cachePath === undefined) {
            return false;
        }

        return isAccessibleSync(this.getFilePath(name, subDirectory));
    }

    public get<R>(name: string, subDirectory?: string): R | undefined {
        if (!this.#isEnabled) {
            return undefined;
        }

        if (this.#cachePath === undefined) {
            return undefined;
        }

        const filePath = this.getFilePath(name, subDirectory);

        if (this.#memoryCache.has(filePath)) {
            return this.#memoryCache.get(filePath) as R;
        }

        if (!isAccessibleSync(filePath)) {
            return undefined;
        }

        const fileData = readFileSync(filePath);

        const value = JSON.parse(fileData);

        this.#memoryCache.set(filePath, value);

        return value as unknown as R;
    }

    public set(name: string, data: ArrayBuffer | ArrayBufferView | string | undefined, subDirectory?: string): void {
        if (!this.#isEnabled) {
            return;
        }

        if (this.#cachePath === undefined || data === undefined) {
            return;
        }

        const filePath = this.getFilePath(name, subDirectory);

        if (typeof data === "object") {
            // eslint-disable-next-line no-param-reassign
            data = JSON.stringify(data);
        }

        writeFileSync(filePath, data, {
            overwrite: true,
        });
    }

    private getFilePath(name: string, subDirectory?: string): string {
        return join(this.#cachePath as string, this.#packemVersion, subDirectory ?? "", toNamespacedPath(name.replace(this.#cwd, "")));
    }
}

export default FileCache;
