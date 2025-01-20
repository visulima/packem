import { existsSync } from "node:fs";
import { stat } from "node:fs/promises";

import { dirname, resolve } from "@visulima/path";

import resolveFile from "./resolve-file";

const resolvedIdCache = async (
    resolveIdCache: Map<string, string | null>,
    // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
    { filter, id, importer, isEntry }: { filter: (id: string | unknown) => boolean; id: string; importer: string | undefined; isEntry: boolean },
    extensions: string[],
): Promise<string | null> => {
    if (!importer || isEntry || !filter(id) || id.startsWith("\0")) {
        return null;
    }
    const hashKey = `${importer}:${id}`;

    // Some plugins sometimes cause the resolver to be called multiple times for the same id,
    // so we cache our results for faster response when this happens.
    // (undefined = not seen before, null = not handled by us, string = resolved)
    const resolvedId = resolveIdCache.get(hashKey);

    if (resolvedId !== undefined) {
        return resolvedId as string | null;
    }

    if (importer && id.startsWith(".")) {
        const resolved = resolve(importer ? dirname(importer) : process.cwd(), id);

        let file = resolveFile(extensions, resolved);

        if (file) {
            resolveIdCache.set(id, file);

            return file as string;
        }

        // eslint-disable-next-line security/detect-non-literal-fs-filename,unicorn/no-await-expression-member
        if (!file && existsSync(resolved) && (await stat(resolved)).isDirectory()) {
            file = resolveFile(extensions, resolved, true);

            if (file) {
                resolveIdCache.set(id, file);

                return file as string;
            }
        }
    }

    resolveIdCache.set(hashKey, null);

    return null;
};

export default resolvedIdCache;
