/**
 * Modified copy of https://github.com/unplugin/unplugin-isolated-decl/blob/main/src/index.ts
 *
 * The MIT License (MIT)
 *
 * Copyright © 2024-PRESENT 三咲智子 (https://github.com/sxzz)
 */
import type { ExportAllDeclaration, ExportNamedDeclaration, ImportDeclaration, StringLiteral } from "@oxc-project/types";
import type { FilterPattern } from "@rollup/pluginutils";
import { createFilter } from "@rollup/pluginutils";
import { readFile } from "@visulima/fs";
import type { Pail } from "@visulima/pail";
import { basename, dirname, extname, join, relative, toNamespacedPath } from "@visulima/path";
import type { TsConfigResult } from "@visulima/tsconfig";
import { parseAsync } from "oxc-parser";
import type { NormalizedInputOptions, NormalizedOutputOptions, Plugin, PluginContext, PreRenderedChunk } from "rollup";

import { ENDING_REGEX } from "../../../constants";
import type { IsolatedDeclarationsTransformer } from "../../../types";
import patchCjsDefaultExport from "../typescript/utils/patch-cjs-default-export";
import extendString from "./utils/extend-string";
import lowestCommonAncestor from "./utils/lowest-common-ancestor";

const appendMapUrl = (map: string, filename: string) => `${map}\n//# sourceMappingURL=${basename(filename)}.map\n`;

const generateDtsMap = (mappings: string, source: string, dts: string): string =>
    JSON.stringify({
        file: basename(dts),
        mappings,
        names: [],
        sourceRoot: "",
        sources: [relative(dirname(dts), source)],
        version: 3,
    });

type OxcImport = {
    source: StringLiteral;
    suffix?: string;
} & (ImportDeclaration | ExportAllDeclaration | ExportNamedDeclaration);

export type IsolatedDeclarationsOptions = {
    exclude?: FilterPattern;
    ignoreErrors?: boolean;
    include?: FilterPattern;
};

export const isolatedDeclarationsPlugin = (
    sourceDirectory: string,
    transformer: IsolatedDeclarationsTransformer,
    declaration: boolean | "compatible" | "node16" | undefined,
    cjsInterop: boolean,
    logger: Pail,
    options: IsolatedDeclarationsOptions,
    sourceMap: boolean,
    tsconfig?: TsConfigResult,
    // eslint-disable-next-line sonarjs/cognitive-complexity
): Plugin => {
    const filter = createFilter(options.include, options.exclude);

    let outputFiles: Record<string, { ext: string; map?: string; source: string }> = Object.create(null);

    const addOutput = (filename: string, output: { map?: string; source: string }) => {
        outputFiles[filename.replace(ENDING_REGEX, "")] = { ...output, ext: extname(filename) };
    };

    let tsconfigPathPatterns: RegExp[] = [];

    if (tsconfig?.config.compilerOptions) {
        tsconfigPathPatterns = Object.entries(tsconfig.config.compilerOptions.paths ?? {}).map(([key]) =>
            (key.endsWith("*") ? new RegExp(`^${key.replace("*", "(.*)")}$`) : new RegExp(`^${key}$`)),
        );
    }

    // eslint-disable-next-line func-style
    async function transform(this: PluginContext, code: string, id: string): Promise<undefined> {
        if (!filter(id)) {
            return;
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let program: { body: any[] } | undefined;

        try {
            const result = await parseAsync(id, code);

            program = result.program;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (error: any) {
            logger.debug({
                message: error.message,
                prefix: "packem:isolated-declarations",
            });
        }

        if (program) {
            const imports = program.body.filter(
                (node): node is OxcImport =>
                    (node.type === "ImportDeclaration" || node.type === "ExportAllDeclaration" || node.type === "ExportNamedDeclaration") && !!node.source,
            );

            for await (const node of imports) {
                if (basename(node.source.value).includes(".")) {
                    // eslint-disable-next-line no-continue
                    continue;
                }

                const resolved = await this.resolve(node.source.value, id);

                if (!resolved || resolved.external) {
                    // eslint-disable-next-line no-continue
                    continue;
                }

                if (
                    resolved.id.endsWith(".ts") ||
                    resolved.id.endsWith(".cts") ||
                    resolved.id.endsWith(".mts") ||
                    resolved.id.endsWith(".tsx") ||
                    resolved.id.endsWith(".ctsx") ||
                    resolved.id.endsWith(".mtsx")
                ) {
                    const resolvedId = resolved.id.replace(sourceDirectory + "/", "");

                    let extendedSourceValue = node.source.value;

                    if (tsconfigPathPatterns.some((pattern) => pattern.test(node.source.value)) && !node.source.value.startsWith(".")) {
                        extendedSourceValue = "./" + node.source.value;
                    }

                    // eslint-disable-next-line no-param-reassign
                    code = code.replaceAll('from "' + node.source.value + '"', 'from "' + extendString(extendedSourceValue, resolvedId) + '"');
                }
            }
        }

        // @ts-expect-error - the ts transformer is getting 4 arguments
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        const { errors, map, sourceText } = await transformer(id, code, sourceMap, tsconfig?.config?.compilerOptions);

        if (errors.length > 0) {
            if (options.ignoreErrors) {
                this.warn(errors[0] as string);

                return;
            }

            // eslint-disable-next-line consistent-return
            return this.error(errors[0] as string);
        }

        addOutput(id, { map, source: sourceText });

        if (!program) {
            return;
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const typeImports = program.body.filter((node: any) => {
            if (node.type === "ImportDeclaration") {
                if (node.importKind === "type") {
                    return true;
                }

                return node.specifiers?.every(
                    (specifier: { importKind: string; type: string }) => specifier.type === "ImportSpecifier" && specifier.importKind === "type",
                );
            }

            if (node.type === "ExportNamedDeclaration" || node.type === "ExportAllDeclaration") {
                if (node.exportKind === "type") {
                    return true;
                }

                return (
                    node.type === "ExportNamedDeclaration" &&
                    node.specifiers?.every(
                        (specifier: { exportKind: string; type: string }) => specifier.type === "ExportSpecifier" && specifier.exportKind === "type",
                    )
                );
            }

            return false;
        });

        for await (const typeImport of typeImports) {
            if (!typeImport.source) {
                // eslint-disable-next-line no-continue
                continue;
            }

            const resolved = await this.resolve(typeImport.source.value, id);

            if (!resolved) {
                return;
            }

            const resolvedId = resolved.id;

            if (filter(resolvedId) && !outputFiles[resolvedId.replace(ENDING_REGEX, "")]) {
                try {
                    const source = await readFile(resolvedId);

                    await transform.call(this, source, resolvedId);
                } catch {
                    // empty
                }
            }
        }
    }

    return <Plugin>{
        buildStart() {
            outputFiles = Object.create(null);
        },

        name: "packem:isolated-declarations",

        async renderStart(outputOptions: NormalizedOutputOptions, { input }: NormalizedInputOptions): Promise<void> {
            const inputBase = lowestCommonAncestor(...(Array.isArray(input) ? input : Object.values(input)));

            logger.debug({
                message: "Input base:" + inputBase,
                prefix: "packem:isolated-declarations",
            });

            if (typeof outputOptions.entryFileNames === "function") {
                // eslint-disable-next-line no-param-reassign
                outputOptions.entryFileNames = outputOptions.entryFileNames({ name: outputOptions.name } as unknown as PreRenderedChunk);
            }


            const entryFileName = outputOptions.entryFileNames.replace(/\.(.)?[jt]sx?$/, (_, s) => `.d.${s || ""}ts`);

            // eslint-disable-next-line prefer-const
            for await (let [filename, { ext, map, source }] of Object.entries(outputFiles)) {
                if (cjsInterop && outputOptions.format === "cjs") {
                    const patched = patchCjsDefaultExport(source);

                    if (patched !== null) {
                        source = patched.code;
                    }
                }

                const quote = source.includes("from '") ? "'" : '"';
                const originalFileName = filename + ext;

                if ((declaration === true || declaration === "compatible") && outputOptions.format === "cjs") {
                    logger.debug({
                        message: "Emit compatible dts file: " + filename,
                        prefix: "packem:isolated-declarations",
                    });

                    const emitName = entryFileName.replace("[name]", toNamespacedPath(filename).replace(sourceDirectory + "/", "")).replace(".cts", ".ts");

                    let compatibleSource = source;

                    if (sourceMap && map) {
                        compatibleSource = appendMapUrl(compatibleSource.trim(), emitName);

                        this.emitFile({
                            fileName: `${emitName}.map`,
                            originalFileName,
                            source: generateDtsMap(map, originalFileName, join(outputOptions.dir as string, emitName)),
                            type: "asset",
                        });
                    }

                    this.emitFile({
                        fileName: emitName,
                        originalFileName,
                        source: compatibleSource.replaceAll(
                            // eslint-disable-next-line regexp/no-misleading-capturing-group,regexp/no-super-linear-backtracking
                            /(from\s)['|"]((.*)\..+|['|"].*)['|"];?/g,

                            (_, group1, group2, group3) => group1 + quote + (group3 || group2) + ".d.ts" + quote + ";",
                        ),
                        type: "asset",
                    });
                }

                logger.debug({
                    message: "Emit dts file: " + filename,
                    prefix: "packem:isolated-declarations",
                });

                const emitName = entryFileName.replace("[name]", toNamespacedPath(filename).replace(sourceDirectory + "/", ""));

                if (sourceMap && map) {
                    source = appendMapUrl(source.trim(), emitName);

                    this.emitFile({
                        fileName: `${emitName}.map`,
                        originalFileName,
                        source: generateDtsMap(map, originalFileName, join(outputOptions.dir as string, emitName)),
                        type: "asset",
                    });
                }

                this.emitFile({
                    fileName: emitName,
                    originalFileName,
                    source: source.replaceAll(
                        // eslint-disable-next-line regexp/no-misleading-capturing-group,regexp/no-super-linear-backtracking
                        /(from\s)['|"]((.*)\..+|['|"].*)['|"];?/g,
                        (_, group1, group2, group3) =>

                            group1 + quote + (group3 || group2) + (outputOptions.format === "cjs" ? ".d.cts" : ".d.mts") + quote + ";",
                    ),
                    type: "asset",
                });
            }
        },

        transform,
    };
};
