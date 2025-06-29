import { fileURLToPath } from "node:url";

import { normalize, resolve } from "@visulima/path";
import type { RawSourceMap } from "source-map-js";

// `[drive_letter]:\` + `\\[server]\[sharename]\`
const IS_NATIVE_WIN32_PATH = /^[a-z]:[/\\]|^\\\\/i;
const ABSOLUTE_SCHEME = /^[A-Z0-9+\-.]+:/i;

const getURLType = (source: string): "absolute" | "path-absolute" | "path-relative" | "scheme-relative" => {
    if (source.startsWith("/")) {
        if (source.length > 1 && source[1] === "/") {
            return "scheme-relative";
        }

        return "path-absolute";
    }

    if (IS_NATIVE_WIN32_PATH.test(source)) {
        return "path-absolute";
    }

    return ABSOLUTE_SCHEME.test(source) ? "absolute" : "path-relative";
};

const normalizeSourceMap = (map: RawSourceMap): RawSourceMap => {
    const newMap = map;

    // result.map.file is an optional property that provides the output filename.
    // Since we don't know the final filename in the webpack build chain yet, it makes no sense to have it.

    if (newMap.file !== undefined) {
        delete newMap.file;
    }

    newMap.sourceRoot = "";

    return newMap;
};

export default normalizeSourceMap;
