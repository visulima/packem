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
import { relative } from "@visulima/path";
import { parseAsync } from "oxc-parser";
import type { NormalizedInputOptions, NormalizedOutputOptions, Plugin, PluginContext, PreRenderedChunk } from "rollup";

import { ENDING_RE } from "../../../constants";
import type { IsolatedDeclarationsResult } from "../../../types";
import patchCjsDefaultExport from "../typescript/utils/patch-cjs-default-export";
import lowestCommonAncestor from "./lowest-common-ancestor";

export type IsolatedDeclarationsOptions = {
    exclude?: FilterPattern;
    ignoreErrors?: boolean;
    include?: FilterPattern;
};

export const isolatedDeclarationsPlugin = (
    transformer: (code: string, id: string) => Promise<IsolatedDeclarationsResult>,
    declaration: boolean | "compatible" | "node16" | undefined,
    packageType: "commonjs" | "module" | undefined,
    cjsInterop: boolean,
    options: IsolatedDeclarationsOptions = {},
    // eslint-disable-next-line sonarjs/cognitive-complexity
): Plugin => {
    const filter = createFilter(options.include, options.exclude);

    const outputFiles: Record<string, string> = {};

    const addOutput = (filename: string, source: string) => {
        outputFiles[filename.replace(/\..?[jt]s$/, "")] = source;
    };

    // eslint-disable-next-line func-style
    async function transform(this: PluginContext, code: string, id: string): Promise<undefined> {
        if (!filter(id)) {
            return;
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

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let program: { body: any[] };

        try {
            const result = await parseAsync(code, { sourceFilename: id });

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            program = JSON.parse(result.program) as { body: any[] };
        } catch {
            return;
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const typeImports = program.body.filter((node: any) => {
            if (node.type !== "ImportDeclaration") {
                return false;
            }

            if (node.importKind === "type") {
                return true;
            }

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return (node.specifiers || []).every((spec: any) => spec.type === "ImportSpecifier" && spec.importKind === "type");
        });

        for await (const typeImport of typeImports) {
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

    const format = packageType === "module" ? "es" : "cjs";

    return <Plugin>{
        name: "packem:isolated-declarations",

        renderStart(outputOptions: NormalizedOutputOptions, { input }: NormalizedInputOptions): void {
            const outBase = lowestCommonAncestor(...(Array.isArray(input) ? input : Object.values(input)));

            if (typeof outputOptions.entryFileNames === "function") {
                // eslint-disable-next-line no-param-reassign
                outputOptions.entryFileNames = outputOptions.entryFileNames({ name: outputOptions.name } as unknown as PreRenderedChunk);
            }

            // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
            const entryFileNames = outputOptions.entryFileNames.replace(/\.(.)?[jt]s$/, (_, s) => `.d.${s || ""}ts`);

            // eslint-disable-next-line prefer-const
            for (let [filename, source] of Object.entries(outputFiles)) {
                if (cjsInterop && outputOptions.format === "cjs") {
                    const patched = patchCjsDefaultExport(source);

                    if (patched !== null) {
                        source = patched.code;
                    }
                }

                const quote = source.includes("from '") ? "'" : '"';

                if ((declaration === true || declaration === "compatible") && outputOptions.format === format) {
                    this.emitFile({
                        fileName: entryFileNames.replace("[name]", relative(outBase, filename)).replace(format === "cjs" ? ".cts" : ".mts", ".ts"),
                        source: source.replaceAll(
                        /from\s+['"]([^'"]+)['"]/g,
                        (_, p1) => `from ${quote}${(p1 as string).replace(ENDING_RE, "")}.js${quote}`,
                    ),
                        type: "asset",
                    });
                }

                this.emitFile({
                    fileName: entryFileNames.replace("[name]", relative(outBase, filename)),
                    // imports need correct extension for the declarations .cts or .mts
                    source: source.replaceAll(
                        /from\s+['"]([^'"]+)['"]/g,
                        (_, p1) => `from ${quote}${(p1 as string).replace(ENDING_RE, "")}${outputOptions.format === "cjs" ? ".cjs" : ".mjs"}${quote}`,
                    ),
                    type: "asset",
                });
            }
        },

        transform,
    };
};
