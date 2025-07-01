/**
 * Modified copy of https://github.com/rollup/plugins/blob/master/packages/url/src/index.js
 *
 * The MIT License (MIT)
 *
 * Copyright (c) 2019 RollupJS Plugin Contributors (https://github.com/rollup/plugins/graphs/contributors)
 */
import crypto from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";

import type { FilterPattern } from "@rollup/pluginutils";
import { createFilter } from "@rollup/pluginutils";
import { ensureDir } from "@visulima/fs";
import { basename, dirname, extname, join, relative } from "@visulima/path";
import mime from "mime";
import type { Plugin } from "rollup";

import { svgEncoder } from "../utils";

const copy = async (source: string, destination: string): Promise<void> => {
    await new Promise((resolve, reject) => {
        const read = createReadStream(source);

        read.on("error", reject);

        const write = createWriteStream(destination);

        write.on("error", reject);
        write.on("finish", () => resolve(undefined));

        read.pipe(write);
    });
};

export interface UrlOptions {
    /**
     * The destination dir to copy assets, usually used to rebase the assets according to HTML files.
     * @type {string}
     */
    destDir?: string;
    /**
     * If false, will prevent files being emitted by this plugin. This is useful for when you are using Rollup to emit both a client-side and server-side bundle.
     * @type {boolean}
     * @default true
     */
    emitFiles: boolean;
    /**
     * A picomatch pattern, or array of patterns, which specifies the files in the build the plugin
     * should _ignore_.
     *
     * By default, no files are ignored.
     * @type {FilterPattern}
     */
    exclude?: FilterPattern;
    /**
     * If emitFiles is true, this option can be used to rename the emitted files. It accepts the following string replacements:
     * [hash] - The hash value of the file's contents
     * [name] - The name of the imported file (without its file extension)
     * [extname] - The extension of the imported file (including the leading .)
     * [dirname] - The parent directory name of the imported file (including trailing /)
     * @type {string}
     * @default [hash][extname]
     */
    fileName: string;
    /**
     * A picomatch pattern, or array of patterns, which specifies the files in the build the plugin
     * should operate on.
     * By default, the png,jpg,jpeg,gif,svg,webp files are targeted.
     * @type {FilterPattern}
     */
    include?: FilterPattern;
    /**
     * The file size limit for inline files.
     * If a file exceeds this limit, it will be copied to the destination folder and the hashed filename will be provided instead.
     * If limit is set to 0 all files will be copied.
     * @type {number}
     * @default 14336 (14kb)
     */
    limit: number;
    /**
     * A string which will be added in front of filenames when they are not inlined but are copied.
     * @type {string}
     */
    publicPath?: string;

    /**
     * When using the [dirname] replacement in fileName, use this directory as the source directory from which to create the file path rather than the parent directory of the imported file. For example:
     * @example
     * ```js
     *    src/path/to/file.js
     *
     *    import png from './image.png';
     *    rollup.config.js
     *
     *    url({
     *      fileName: '[dirname][hash][extname]',
     *      sourceDir: path.join(__dirname, 'src')
     *    });
     *
     *    Emitted File: path/to/image.png
     * ```
     */
    sourceDir?: string;
}

export const urlPlugin = ({
    destDir: destinationDirectory,
    emitFiles,
    exclude,
    fileName,
    include,
    limit,
    publicPath,
    sourceDir: sourceDirectory,
}: UrlOptions): Plugin => {
    const filter = createFilter(include, exclude);
    const copies: Record<string, string> = {};

    return <Plugin>{
        async generateBundle(outputOptions: { dir?: string; file?: string }) {
            if (!emitFiles) {
                return;
            }

            const base = destinationDirectory ?? outputOptions.dir ?? dirname(outputOptions.file ?? "");

            await ensureDir(base);

            await Promise.all(
                Object.keys(copies).map(async (name) => {
                    const output = copies[name] as string;
                    const outputDirectory = join(base, dirname(output));

                    await ensureDir(outputDirectory);
                    await copy(name, join(base, output));
                }),
            );
        },

        async load(id: string) {
            if (!filter(id)) {
                return undefined;
            }

            this.addWatchFile(id);

            const [stats, buffer] = await Promise.all([stat(id), readFile(id)]);

            let data: string;

            if ((limit && stats.size > limit) || limit === 0) {
                const hash = crypto.createHash("sha1").update(buffer).digest("hex").slice(0, 16);
                const extension = extname(id);
                const name = basename(id, extension);
                const relativeDirectory = sourceDirectory ? relative(sourceDirectory, dirname(id)) : basename(dirname(id));

                const outputFileName = fileName
                    .replaceAll("[hash]", hash)
                    .replaceAll("[extname]", extension)
                    .replaceAll("[dirname]", relativeDirectory === "" ? "" : `${relativeDirectory}/`)
                    .replaceAll("[name]", name);

                data = join(publicPath ?? "", outputFileName);

                copies[id] = outputFileName;
            } else {
                const mimetype = mime.getType(id);

                if (mimetype === undefined) {
                    throw new Error(`Could not determine mimetype for ${id}`);
                }

                const isSVG = mimetype === "image/svg+xml";

                data = isSVG ? svgEncoder(buffer) : buffer.toString("base64");

                data = `data:${mimetype};base64,${data}`;
            }

            return `export default "${data}"`;
        },
        name: "packem:url",
    };
};
