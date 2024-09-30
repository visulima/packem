import { isAccessibleSync, readFileSync } from "@visulima/fs";
import { dirname, resolve } from "@visulima/path";
import type { RawSourceMap } from "source-map-js";
import { SourceMapConsumer } from "source-map-js";

import { dataURIRe } from "../loaders/postcss/common";
import { isAbsolutePath, normalizePath, relativePath, resolvePath } from "./path";

// eslint-disable-next-line regexp/no-misleading-capturing-group,regexp/no-super-linear-backtracking
const mapBlockRe = /(?:\n|\r\n)?\/\*[#*@]+\s*sourceMappingURL\s*=\s*(\S+)\s*\*+\//g;
const mapLineRe = /(?:\n|\r\n)?\/\/[#@]+\s*sourceMappingURL\s*=\s*(\S+)\s*?$/gm;

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

        if (this.map.sources) {
            this.map.sources = this.map.sources.map((s) => op(s));
        }

        return this;
    }

    public resolve(directory: string = process.cwd()): this {
        return this.modifySources((source) => {
            if (source === "<no source>") {
                return source;
            }

            return resolvePath(directory, source);
        });
    }

    public relative(directory: string = process.cwd()): this {
        return this.modifySources((source) => {
            if (source === "<no source>") {
                return source;
            }

            if (isAbsolutePath(source)) {
                return relativePath(directory, source);
            }

            return normalizePath(source);
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

export const getMap = async (code: string, id?: string): Promise<string | undefined> => {
    const [, data] = mapBlockRe.exec(code) ?? mapLineRe.exec(code) ?? [];

    if (!data) {
        return undefined;
    }

    const [, uriMap] = dataURIRe.exec(data) ?? [];

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

export const mm = (map?: RawSourceMap | string): MapModifier => new MapModifier(map);
