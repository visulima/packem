import type { FilterPattern } from "@rollup/pluginutils";
import { createFilter } from "@rollup/pluginutils";
import { relative } from "@visulima/path";
import type { Plugin, PreRenderedChunk } from "rollup";

import type { IsolatedDeclarationsResult } from "../../types";

export type IsolatedDeclarationsOptions = {
    exclude?: FilterPattern;
    ignoreErrors?: boolean;
    include?: FilterPattern;
};

export const isolatedDeclarationsPlugin =
    (sourceDirectory: string) =>
    (transformer: (code: string, id: string) => Promise<IsolatedDeclarationsResult>, options: IsolatedDeclarationsOptions = {}): Plugin => {
        const filter = createFilter(options.include, options.exclude);

        const outputFiles: Record<string, string> = {};

        const addOutput = (filename: string, source: string) => {
            outputFiles[filename.replace(/\..?[jt]s$/, "")] = source;
        };

        return <Plugin>{
            generateBundle(outputOptions, bundle): void | never {
                let { entryFileNames } = outputOptions;

                if (typeof entryFileNames === "function") {
                    entryFileNames = entryFileNames(bundle as unknown as PreRenderedChunk);
                }

                // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
                const entryFileName = entryFileNames.replace(/\.(.)?[jt]s$/, (_, s) => `.d.${s || ""}ts`);

                // eslint-disable-next-line no-loops/no-loops,no-restricted-syntax
                for (const [filename, source] of Object.entries(outputFiles)) {
                    this.emitFile({
                        fileName: entryFileName.replace("[name]", relative(sourceDirectory, filename)),
                        source,
                        type: "asset",
                    });
                }
            },

            name: "packem:isolated-declarations",

            async transform(code, id): Promise<void> {
                if (!filter(id)) {
                    return;
                }

                const result = await transformer(id, code);

                const { errors, sourceText } = result;

                if (errors.length > 0) {
                    if (options.ignoreErrors) {
                        this.warn(errors[0] as string);
                    } else {
                        this.error(errors[0] as string);
                    }
                } else {
                    addOutput(id, sourceText);
                }
            },
        };
    };
