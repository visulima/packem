/**
 * Modified copy of https://github.com/unplugin/unplugin-isolated-decl/blob/main/src/index.ts
 *
 * The MIT License (MIT)
 *
 * Copyright © 2024-PRESENT 三咲智子 (https://github.com/sxzz)
 */
import type { FilterPattern } from "@rollup/pluginutils";
import { createFilter } from "@rollup/pluginutils";
import { readFile } from "@visulima/fs";
import { basename, relative } from "@visulima/path";
import { parseAsync } from "oxc-parser";
import type { NormalizedInputOptions, NormalizedOutputOptions, Plugin, PluginContext, PreRenderedChunk } from "rollup";

import { ENDING_RE } from "../../../constants";
import type { IsolatedDeclarationsResult } from "../../../types";
import patchCjsDefaultExport from "../typescript/utils/patch-cjs-default-export";
import extendString from "./extend-string";
import lowestCommonAncestor from "./lowest-common-ancestor";

export type IsolatedDeclarationsOptions = {
    exclude?: FilterPattern;
    ignoreErrors?: boolean;
    include?: FilterPattern;
};

export const isolatedDeclarationsPlugin = (
    sourceDirectory: string,
    transformer: (code: string, id: string) => Promise<IsolatedDeclarationsResult>,
    declaration: boolean | "compatible" | "node16" | undefined,
    cjsInterop: boolean,
    options: IsolatedDeclarationsOptions = {},
): Plugin => {
    const filter = createFilter(options.include, options.exclude);

    const outputFiles: Record<string, string> = {};

    const addOutput = (filename: string, source: string) => {
        outputFiles[filename.replace(ENDING_RE, "")] = source;
    };

    // eslint-disable-next-line func-style,sonarjs/cognitive-complexity
    async function transform(this: PluginContext, code: string, id: string): Promise<undefined> {
        if (!filter(id)) {
            return;
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let program: { body: any[] } | undefined;

        try {
            const result = await parseAsync(code, { sourceFilename: id });

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            program = JSON.parse(result.program) as { body: any[] };
        } catch {
            // empty
        }

        if (program) {
            const imports = program.body.filter(
                (node) => node.type === "ImportDeclaration" || node.type === "ExportAllDeclaration" || node.type === "ExportNamedDeclaration",
            );

            for (const node of imports) {
                if (!node.source || basename(node.source.value).includes(".")) {
                    // eslint-disable-next-line no-continue
                    continue;
                }

                // eslint-disable-next-line no-await-in-loop
                const resolved = await this.resolve(node.source.value, id);

                if (!resolved || resolved.external) {
                    // eslint-disable-next-line no-continue
                    continue;
                }

                if (resolved.id.endsWith(".ts") || resolved.id.endsWith(".cts") || resolved.id.endsWith(".mts") || resolved.id.endsWith(".tsx")) {
                    const resolvedId = resolved.id.replace(sourceDirectory + "/", "");

                    // eslint-disable-next-line no-param-reassign,@typescript-eslint/restrict-plus-operands
                    code = code.replaceAll('from "' + node.source.value + '"', 'from "' + extendString(node.source.value, resolvedId) + '"');
                }
            }
        }

        const { errors, sourceText } = await transformer(id, code);

        if (errors.length > 0) {
            if (options.ignoreErrors) {
                this.warn(errors[0] as string);

                return;
            }

            // eslint-disable-next-line consistent-return
            return this.error(errors[0] as string);
        }

        addOutput(id, sourceText);

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

            if (filter(resolvedId) && !outputFiles[resolvedId.replace(ENDING_RE, "")]) {
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
        name: "packem:isolated-declarations",

        // eslint-disable-next-line sonarjs/cognitive-complexity
        async renderStart(outputOptions: NormalizedOutputOptions, { input }: NormalizedInputOptions): Promise<void> {
            const outBase = lowestCommonAncestor(...(Array.isArray(input) ? input : Object.values(input)));

            if (typeof outputOptions.entryFileNames === "function") {
                // eslint-disable-next-line no-param-reassign
                outputOptions.entryFileNames = outputOptions.entryFileNames({ name: outputOptions.name } as unknown as PreRenderedChunk);
            }

            // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
            const entryFileNames = outputOptions.entryFileNames.replace(/\.(.)?[jt]sx?$/, (_, s) => `.d.${s || ""}ts`);

            // eslint-disable-next-line prefer-const
            for await (let [filename, source] of Object.entries(outputFiles)) {
                if (cjsInterop && outputOptions.format === "cjs") {
                    const patched = patchCjsDefaultExport(source);

                    if (patched !== null) {
                        source = patched.code;
                    }
                }

                const quote = source.includes("from '") ? "'" : '"';

                if ((declaration === true || declaration === "compatible") && outputOptions.format === "cjs") {
                    this.emitFile({
                        fileName: entryFileNames.replace("[name]", relative(outBase, filename)).replace(".cts", ".ts"),
                        // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
                        source: source.replaceAll(/(from\s)['|"](.*)['|"];?/g, (_, group1, group2) => group1 + quote + group2 + ".d.ts" + quote + ";"),
                        type: "asset",
                    });
                }

                this.emitFile({
                    fileName: entryFileNames.replace("[name]", relative(outBase, filename)),
                    source: source.replaceAll(
                        /(from\s)['|"](.*)['|"];?/g,
                        // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
                        (_, group1, group2) => group1 + quote + group2 + (outputOptions.format === "cjs" ? ".d.cts" : ".d.mts") + quote + ";",
                    ),
                    type: "asset",
                });
            }
        },

        transform,
    };
};
