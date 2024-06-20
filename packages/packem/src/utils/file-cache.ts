import { rmSync } from "node:fs";

import { isAccessibleSync, readFileSync, writeFileSync } from "@visulima/fs";
import { findCacheDirSync } from "@visulima/find-cache-dir";
import type { Pail } from "@visulima/pail";
import { join, toNamespacedPath } from "@visulima/path";

class FileCache {
    readonly #cwd: string;

    readonly #cachePath: undefined | string;

    readonly #packageJsonHash: string;

    #isEnabled = true;

    readonly #memoryCache = new Map<string, unknown>();

    readonly #logger: Pail<never, string>;

    public constructor(cwd: string, packageJsonHash: string, logger: Pail<never, string>) {
        this.#cwd = cwd;
        this.#cachePath = findCacheDirSync("@visulima/packem", {
            cwd,
        });

        this.#packageJsonHash = packageJsonHash;
        this.#logger = logger;

        if (this.#cachePath === undefined) {
            logger.debug("Could not create cache directory.");
        } else {
            logger.debug(`Cache path is: ${this.#cachePath}`);
        }
    }

    public set isEnabled(value: boolean) {
        this.#isEnabled = value;
    }

    public get cachePath(): string | undefined {
        return this.#cachePath;
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

        try {
            const value = JSON.parse(fileData);

            this.#memoryCache.set(filePath, value);

            return value as unknown as R;

        } catch {
            this.#logger.warn(`Could not parse cache file: ${filePath}, deleting the broken cache file.`);

            this.#memoryCache.delete(filePath);

            rmSync(filePath, {
                force: true,
            });

            return undefined;
        }
    }

    public set(name: string, data: object | ArrayBuffer | ArrayBufferView | string | undefined, subDirectory?: string): void {
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
        let optimizedName = name.replaceAll(toNamespacedPath(this.#cwd), "");

        optimizedName = optimizedName.replaceAll(":", "-");

        return join(this.#cachePath as string, this.#packageJsonHash, subDirectory?.replaceAll(":", "-") ?? "", toNamespacedPath(optimizedName));
    }
}

export default FileCache;
