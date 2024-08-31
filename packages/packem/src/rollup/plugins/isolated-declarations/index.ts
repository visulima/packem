import type { FilterPattern } from "@rollup/pluginutils";
import { createFilter } from "@rollup/pluginutils";
import { readFile } from "@visulima/fs";
import { relative } from "@visulima/path";
import { parseAsync } from "oxc-parser";
import type { NormalizedInputOptions, NormalizedOutputOptions, Plugin, PluginContext, PreRenderedChunk } from "rollup";

import { ENDING_RE } from "../../../constants";
import type { IsolatedDeclarationsResult } from "../../../types";
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
    options: IsolatedDeclarationsOptions = {},
): Plugin => {
    const filter = createFilter(options.include, options.exclude);

    const outputFiles: Record<string, string> = {};

    const addOutput = (filename: string, source: string) => {
        outputFiles[filename.replace(/\..?[jt]s$/, "")] = source;
    };

    // eslint-disable-next-line sonarjs/cognitive-complexity,func-style
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

        let program: any;

        try {
            program = JSON.parse((await parseAsync(code, { sourceFilename: id })).program);
        } catch {
            return;
        }

        const typeImports = program.body.filter((node: any) => {
            if (node.type !== "ImportDeclaration") {
                return false;
            }

            if (node.importKind === "type") {
                return true;
            }

            // eslint-disable-next-line @typescript-eslint/no-unsafe-return
            return (node.specifiers || []).every((spec: any) => spec.type === "ImportSpecifier" && spec.importKind === "type");
        });

        // eslint-disable-next-line no-loops/no-loops,no-restricted-syntax
        for await (const typeImport of typeImports) {
            this.resolve(typeImport.source.value, id)
                .then(async (resolved) => {
                    if (!resolved) {
                        return;
                    }

                    const resolvedId = resolved.id;

                    // eslint-disable-next-line promise/always-return
                    if (filter(resolvedId) && !outputFiles[resolvedId.replace(ENDING_RE, "")]) {
                        try {
                            const source = await readFile(resolvedId);

                            await transform.call(this, source, resolvedId);
                        } catch {
                            // empty
                        }
                    }
                })
                .catch((error) => {
                    console.log(error);
                });
        }
    }

    const format = packageType === "module" ? "es" : "cjs";

    return <Plugin>{
        name: "packem:isolated-declarations",

        renderStart(outputOptions: NormalizedOutputOptions, { input }: NormalizedInputOptions): void {
            let outBase = "";

            outBase = lowestCommonAncestor(...(Array.isArray(input) ? input : Object.values(input)));

            if (typeof outputOptions.entryFileNames === "function") {
                // eslint-disable-next-line no-param-reassign
                outputOptions.entryFileNames = outputOptions.entryFileNames({ name: outputOptions.name } as unknown as PreRenderedChunk);
            }

            const entryFileNames = outputOptions.entryFileNames.replace(/\.(.)?[jt]s$/, (_, s) => `.d.${s || ""}ts`);

            // eslint-disable-next-line no-loops/no-loops,no-restricted-syntax
            for (const [filename, source] of Object.entries(outputFiles)) {
                // console.log({
                //     entry: entryFileNames.replace("[name]", relative(outBase, filename)),
                //     source,
                // });

                if ((declaration === true || declaration === "compatible") && outputOptions.format === format) {
                    this.emitFile({
                        fileName: entryFileNames.replace("[name]", relative(outBase, filename)).replace(format === "cjs" ? ".cts" : ".mts", ".ts"),
                        source,
                        type: "asset",
                    });
                }

                const hasSingleQuoted = source.includes("from '");

                const quote = hasSingleQuoted ? "'" : '"';

                this.emitFile({
                    fileName: entryFileNames.replace("[name]", relative(outBase, filename)),
                    // imports need correct extension for the declarations .cts or .mts
                    source: source.replaceAll(/from\s+['"]([^'"]+)['"]/g, (_, p1) => `from ${quote}${p1.replace(ENDING_RE, "")}${outputOptions.format === "cjs" ? ".cts" : ".mts"}${quote}`),
                    type: "asset",
                });
            }
        },

        transform,
    };
};
