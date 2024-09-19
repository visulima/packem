import { isAccessibleSync, readFileSync, readJsonSync, writeFileSync, writeJsonSync } from "@visulima/fs";
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

    readonly #memoryCache = new Map<string>();

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

        this.createOrUpdateKeyStorage(hashKey, logger);
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

        if (isJson(fileData)) {
            const value = JSON.parse(fileData);

            this.#memoryCache.set(filePath, value);

            return value as unknown as R;
        }

        this.#memoryCache.set(filePath, fileData);

        return fileData as unknown as R;
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

        return join(this.#cachePath as string, this.#hashKey, subDirectory?.replaceAll(":", "-") ?? "", toNamespacedPath(optimizedName));
    }

    private createOrUpdateKeyStorage(hashKey: string, logger: Pail): void {
        try {
            let keyStore: Record<string, string> = {};

            const keyStorePath = join(this.#cachePath as string, "keystore.json");

            if (isAccessibleSync(keyStorePath)) {
                keyStore = readJsonSync(keyStorePath);
            }

            // eslint-disable-next-line security/detect-object-injection
            if (keyStore[hashKey] === undefined) {
                // eslint-disable-next-line security/detect-object-injection
                keyStore[hashKey] = new Date().toISOString();
            }

            writeJsonSync(keyStorePath, keyStore, {
                overwrite: true,
            });
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (error: any) {
            logger.debug({
                context: error,
                message: error.message,
                prefix: "file-cache",
            });
        }
    }
}

export default FileCache;
