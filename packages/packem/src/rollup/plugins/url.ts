import crypto from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";

import type { FilterPattern } from "@rollup/pluginutils";
import { createFilter } from "@rollup/pluginutils";
import { ensureDir } from "@visulima/fs";
import { basename, dirname, extname, join, relative, sep } from "@visulima/path";
import mime from "mime";
import type { Plugin } from "rollup";

export interface UrlOptions {
    destDir?: string;
    emitFiles: boolean;
    exclude?: FilterPattern;
    fileName: string;
    include?: FilterPattern;
    limit: number;
    publicPath?: string;
    sourceDir?: string;
}

const copy = async (source: string, destination: string): Promise<void> => {
    await new Promise((resolve, reject) => {
        const read = createReadStream(source);
        read.on("error", reject);

        const write = createWriteStream(destination);
        write.on("error", reject);
        write.on("finish", resolve);

        read.pipe(write);
    });
};

const encodeSVG = (buffer: Buffer): string =>
    encodeURIComponent(
        buffer
            .toString("utf8")
            .replaceAll(/[\n\r]/g, "")
            .replaceAll("\t", " ")
            .replaceAll(/<!--(.*(?=-->))-->/g, "")
            .replaceAll("'", "\\i"),
    )
        .replaceAll("(", "%28")
        .replaceAll(")", "%29");

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
        // eslint-disable-next-line sonarjs/cognitive-complexity
        async load(id: string) {
            if (!filter(id)) {
                return null;
            }

            this.addWatchFile(id);

            const [stats, buffer] = await Promise.all([stat(id), readFile(id)]);

            let data: string;

            if ((limit && stats.size > limit) || limit === 0) {
                const hash = crypto.createHash("sha1").update(buffer).digest("hex").slice(0, 16);
                const extension = extname(id);
                const name = basename(id, extension);
                const relativeDirectory = sourceDirectory ? relative(sourceDirectory, dirname(id)) : (dirname(id).split(sep).pop() ?? "");

                const outputFileName = fileName
                    .replaceAll("[hash]", hash)
                    .replaceAll("[extname]", extension)
                    .replaceAll("[dirname]", relativeDirectory === "" ? "" : `${relativeDirectory}${sep}`)
                    .replaceAll("[name]", name);

                data = `${publicPath ?? ""}${outputFileName.split(sep).join(sep)}`;

                copies[id] = outputFileName;
            } else {
                const mimetype = mime.getType(id);

                if (mimetype === null) {
                    throw new Error(`Could not determine mimetype for ${id}`);
                }

                const isSVG = mimetype === "image/svg+xml";

                data = isSVG ? encodeSVG(buffer) : buffer.toString("base64");

                const encoding = isSVG ? "" : ";base64";

                data = `data:${mimetype}${encoding},${data}`;
            }

            return `export default "${data}"`;
        },
        name: "url",
    };
};
