import { isAccessibleSync, readFileSync } from "@visulima/fs";
import { dirname, isAbsolute, normalize, relative, resolve } from "@visulima/path";
import type { RawSourceMap } from "source-map-js";
import { SourceMapConsumer } from "source-map-js";

import { DATA_URI_REGEXP } from "../loaders/postcss/constants";

// The capturing group is consumed by `getMap` below via a `.source`-cloned regex,
// which the regexp plugin cannot trace, so no-unused-capturing-group is a false positive.
// eslint-disable-next-line regexp/no-misleading-capturing-group, regexp/no-super-linear-backtracking, regexp/no-unused-capturing-group, sonarjs/super-linear-regex
const mapBlockRe = /(?:\n|\r\n)?\/\*[#*@]+\s*sourceMappingURL\s*=\s*(\S+)\s*\*+\//g;
// eslint-disable-next-line regexp/no-unused-capturing-group -- group consumed via the `.source`-cloned regex in getMap
const mapLineRe = /(?:\n|\r\n)?\/\/[#@]+\s*sourceMappingURL\s*=\s*(\S+)\s*/g;

class MapModifier {
    private readonly map?: RawSourceMap;

    public constructor(map?: RawSourceMap | string) {
        if (typeof map === "string") {
            try {
                this.map = JSON.parse(map) as RawSourceMap;
            } catch {
                /* noop */
            }
        } else {
            this.map = map;
        }
    }

    public modify(f: (m: RawSourceMap) => void): this {
        if (!this.map) {
            return this;
        }

        f(this.map);

        return this;
    }

    public modifySources(op: (source: string) => string): this {
        if (!this.map) {
            return this;
        }

        this.map.sources = this.map.sources.map((s) => op(s));

        return this;
    }

    public resolve(directory: string = process.cwd()): this {
        return this.modifySources((source) => {
            if (source === "<no source>") {
                return source;
            }

            return resolve(directory, source);
        });
    }

    public relative(directory: string = process.cwd()): this {
        return this.modifySources((source) => {
            if (source === "<no source>") {
                return source;
            }

            if (isAbsolute(source)) {
                return relative(directory, source);
            }

            return normalize(source);
        });
    }

    public toObject(): RawSourceMap | undefined {
        return this.map;
    }

    public toString(): string | undefined {
        if (!this.map) {
            return this.map;
        }

        return JSON.stringify(this.map);
    }

    public toConsumer(): SourceMapConsumer | undefined {
        if (!this.map) {
            return this.map;
        }

        return new SourceMapConsumer(this.map);
    }

    public toCommentData(): string {
        const map = this.toString();

        if (!map) {
            return "";
        }

        const sourceMapData = Buffer.from(map).toString("base64");

        return `\n/*# sourceMappingURL=data:application/json;base64,${sourceMapData} */`;
    }

    public toCommentFile(fileName: string): string {
        if (!this.map) {
            return "";
        }

        return `\n/*# sourceMappingURL=${fileName} */`;
    }
}

export const getMap = (code: string, id?: string): string | undefined => {
    // Use non-global clones for the single-match `.exec` so the module-level
    // `/g` regexes' `lastIndex` does not persist across `getMap` calls (which
    // would otherwise cause it to skip or miss matches on subsequent invocations).
    // eslint-disable-next-line regexp/no-misleading-capturing-group, regexp/no-super-linear-backtracking -- re-analysis of the same intentional mapBlockRe pattern (already accepted at its definition)
    const blockRe = new RegExp(mapBlockRe.source, mapBlockRe.flags.replace("g", ""));
    const lineRe = new RegExp(mapLineRe.source, mapLineRe.flags.replace("g", ""));

    const [, data] = blockRe.exec(code) ?? lineRe.exec(code) ?? [];

    if (!data) {
        return undefined;
    }

    const [, uriMap] = DATA_URI_REGEXP.exec(data) ?? [];

    if (uriMap) {
        return Buffer.from(uriMap, "base64").toString();
    }

    if (!id) {
        throw new Error("Extracted map detected, but no ID is provided");
    }

    const mapFileName = resolve(dirname(id), data);
    const exists = isAccessibleSync(mapFileName);

    if (!exists) {
        return undefined;
    }

    return readFileSync(mapFileName);
};

export const stripMap = (code: string): string => code.replaceAll(mapBlockRe, "").replaceAll(mapLineRe, "");

/**
 * Creates a MapModifier instance for source map manipulation.
 *
 * This utility function provides a convenient way to create MapModifier instances
 * for working with source maps in CSS processing pipelines. The MapModifier class
 * offers comprehensive source map manipulation capabilities including:
 * - Path resolution and relativization
 * - Source map merging and modification
 * - Format conversion (object, string, consumer)
 * - Comment generation for inline or external maps
 * @param map Source map input (raw object or JSON string)
 * @returns MapModifier instance for source map operations
 * @example
 * ```typescript
 * // Working with source map objects
 * const modifier = mm(rawSourceMap);
 * modifier.resolve('/project/src').relative('/project');
 *
 * // Converting to different formats
 * const mapString = modifier.toString();
 * const consumer = modifier.toConsumer();
 * ```
 */
export const mm = (map?: RawSourceMap | string): MapModifier => new MapModifier(map);
