import { isAccessibleSync, readFileSync, writeFileSync } from "@visulima/fs";
import type { Pail } from "@visulima/pail";
import { join, toNamespacedPath } from "@visulima/path";

const isJson = (value: string): boolean => {
    try {
        JSON.parse(value);
    } catch {
        return false;
    }

    return true;
};

class FileCache {
    readonly #cwd: string;

    readonly #cachePath: undefined | string;

    readonly #hashKey: string;

    #isEnabled = true;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    readonly #memoryCache = new Map<string, any>();

    public constructor(cwd: string, cachePath: string | undefined, hashKey: string, logger: Pail) {
        this.#cwd = cwd;
        this.#hashKey = hashKey;

        if (cachePath === undefined) {
            logger.debug({
                message: "Could not create cache directory.",
                prefix: "file-cache",
            });
        } else {
            this.#cachePath = cachePath;

            logger.debug({
                message: "Cache path is: " + this.#cachePath,
                prefix: "file-cache",
            });
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

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
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

        const fileData = readFileSync(filePath) as unknown as string;

        if (isJson(fileData)) {
            const value = JSON.parse(fileData);

            this.#memoryCache.set(filePath, value);

            return value as unknown as R;
        }

        this.#memoryCache.set(filePath, fileData);

        return fileData as unknown as R;
    }

    public set(name: string, data: object | ArrayBuffer | ArrayBufferView | string | undefined | number | null | boolean, subDirectory?: string): void {
        if (!this.#isEnabled) {
            return;
        }

        if (this.#cachePath === undefined || data === undefined) {
            return;
        }

        const filePath = this.getFilePath(name, subDirectory);

        if (typeof data === "object" || typeof data === "number" || typeof data === "boolean") {
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

        return join(this.#cachePath as string, this.#hashKey, subDirectory?.replaceAll(":", "-") ?? "", toNamespacedPath(optimizedName));
    }
}

export default FileCache;
