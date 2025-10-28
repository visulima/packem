import { stat } from "node:fs/promises";

import { readFile } from "@visulima/fs";
import { arrayify } from "@visulima/packem-share/utils";
import { basename, dirname, join, normalize, relative } from "@visulima/path";
import globParent from "glob-parent";
import type { Plugin, PluginContext } from "rollup";
import { glob } from "tinyglobby";

export type CopyPluginOptions = {
    /**
     * Copy items once. Useful in watch mode.
     * @default false
     */
    copyOnce?: boolean;
    exactFileNames?: boolean;

    /**
     * Remove the directory structure of copied files.
     * @default true
     */
    flatten?: boolean;
    targets: MultipleTargetsDesc;
};

type FileDesc = { copied: string[]; dest: string[]; timestamp: number; transform?: (content: Buffer, filename: string) => Buffer | string };

type MultipleTargetsDesc = SingleTargetDesc | SingleTargetDesc[] | string[] | string;

type SingleTargetDesc = {
    dest?: string;
    exclude?: string[] | string;
    src: string[] | string;
};

export const copyPlugin = (options: CopyPluginOptions, logger: Console): Plugin => {
    const files = new Map<string, FileDesc>();
    const config = {
        copyOnce: true,
        exactFileNames: true,
        flatten: false,
        ...options,
    };

    let { targets } = config;

    if (Array.isArray(targets)) {
        targets = targets
            .map((item) => {
                if (typeof item === "string") {
                    return { src: item };
                }

                if (typeof item === "object" && "src" in item) {
                    return item;
                }

                return undefined;
            })
            .filter(Boolean) as SingleTargetDesc[];
    } else if (typeof targets === "string") {
        targets = [{ src: targets }];
    }

    return <Plugin>{
        async buildStart() {
            const results = await Promise.all(
                (targets as SingleTargetDesc[])
                    .flatMap((target) =>
                        Array.isArray(target.src)
                            ? target.src.map((itemSource) => {
                                  return {
                                      ...target,
                                      src: itemSource,
                                  };
                              })
                            : target,
                    )
                    .map(
                        async (target) =>
                            await glob(arrayify(target.src), { ignore: arrayify(target.exclude).filter(Boolean) }).then((result) => {
                                return {
                                    dest: target.dest ?? "",
                                    parent: globParent(target.src as string),
                                    src: result,
                                };
                            }),
                    ),
            );

            for (const result of results) {
                for (const file of result.src) {
                    let fileDesc: FileDesc;

                    if (files.has(file)) {
                        fileDesc = files.get(file) as FileDesc;
                    } else {
                        fileDesc = {
                            copied: [],
                            dest: [],
                            timestamp: 0,
                        };
                        files.set(file, fileDesc);
                    }

                    const destination = config.flatten ? normalize(result.dest) : join(result.dest, relative(result.parent, dirname(file)));

                    if (!fileDesc.dest.includes(destination)) {
                        fileDesc.dest.push(destination);
                    }

                    (this as unknown as PluginContext).addWatchFile(file);
                }
            }

            logger.info({
                message: "Copying files...",
                prefix: "plugin:copy",
            });

            await Promise.all(
                [...files].map(async ([fileName, fileDesc]) => {
                    let source: Uint8Array | undefined;

                    try {
                        const fileStat = await stat(fileName);

                        if (!fileStat.isFile()) {
                            return;
                        }

                        const timestamp = fileStat.mtime.getTime();

                        if (timestamp > fileDesc.timestamp) {
                            // eslint-disable-next-line no-param-reassign
                            fileDesc.timestamp = timestamp;
                            // eslint-disable-next-line no-param-reassign
                            fileDesc.copied = [];
                        }

                        source = (await readFile(fileName, {
                            buffer: true,
                        })) as unknown as Uint8Array;
                    } catch (error: unknown) {
                        logger.error({
                            context: [error],
                            message: `error reading file ${fileName}`,
                            prefix: "plugin:copy",
                        });

                        return;
                    }

                    for (const destination of fileDesc.dest) {
                        if (config.copyOnce && fileDesc.copied.includes(destination)) {
                            continue;
                        }

                        const baseName = basename(fileName);

                        // path.join removes ./ from the beginning, that's needed for rollup name/fileName fields
                        const destinationFileName = join(destination, baseName);

                        try {
                            (this as unknown as PluginContext).emitFile({
                                [config.exactFileNames ? "fileName" : "name"]: destinationFileName,
                                source,
                                type: "asset",
                            });

                            logger.debug({
                                message: `copied ${fileName} → ${destinationFileName}`,
                                prefix: "plugin:copy",
                            });

                            fileDesc.copied.push(destination);
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        } catch (error: any) {
                            logger.error({
                                context: [error],
                                message: `error copying file ${fileName} → ${destinationFileName}`,
                                prefix: "plugin:copy",
                            });
                        }
                    }
                }),
            );
        },
        name: "packem:copy",
    };
};
