/**
 * Modified copy of https://github.com/unplugin/unplugin-isolated-decl/blob/main/src/index.ts
 *
 * The MIT License (MIT)
 *
 * Copyright 2024-PRESENT 三咲智子 (https://github.com/sxzz)
 */
import { dirname, sep, toNamespacedPath } from "@visulima/path";

const lowestCommonAncestor = (...filepaths: string[]): string => {
    if (filepaths.length === 0) {
        return "";
    }

    if (filepaths.length === 1) {
        return dirname(filepaths[0] as string);
    }

    // Normalize paths to use forward slashes
    // eslint-disable-next-line no-param-reassign
    filepaths = filepaths.map((p) => toNamespacedPath(p).split(sep).join("/"));

    const [first, ...rest] = filepaths;

    let ancestor = (first as string).split("/");

    for (const filepath of rest) {
        const directories = filepath.split("/", ancestor.length);

        let index = 0;

        for (const directory of directories) {
            // eslint-disable-next-line security/detect-object-injection
            if (directory === ancestor[index]) {
                index += 1;
            } else {
                ancestor = ancestor.slice(0, index);
                break;
            }
        }

        ancestor = ancestor.slice(0, index);
    }

    // Convert back to platform-specific separator
    const result = ancestor.length <= 1 && ancestor[0] === "" ? `/${ancestor[0]}` : ancestor.join("/");
    return result.split("/").join(sep);
};

export default lowestCommonAncestor;
