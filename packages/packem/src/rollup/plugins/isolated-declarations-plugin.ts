import type {FilterPattern} from "@rollup/pluginutils";
import { createFilter  } from "@rollup/pluginutils";
import { dirname, relative, sep } from "@visulima/path";
import type { Plugin } from "rollup";

import type { IsolatedDeclarationsResult } from "../../types";

const lowestCommonAncestor = (...filepaths: string[]) => {
    if (filepaths.length === 0) {
        return "";
    }

    if (filepaths.length === 1) {
        return dirname(filepaths[0] as string);
    }

    const [first, ...rest] = filepaths;

    let ancestor = (first as string).split(sep);

    // eslint-disable-next-line no-loops/no-loops,no-restricted-syntax
    for (const filepath of rest) {
        const directories = filepath.split(sep, ancestor.length);

        let index = 0;

        // eslint-disable-next-line no-loops/no-loops,no-restricted-syntax
        for (const directory of directories) {
            if (directory === ancestor[index]) {
                index += 1;
            } else {
                ancestor = ancestor.slice(0, index);

                break;
            }
        }

        ancestor = ancestor.slice(0, index);
    }

    return ancestor.length <= 1 && ancestor[0] === "" ? sep + ancestor[0] : ancestor.join(sep);
};

export type IsolatedDeclarationsOptions = {
    exclude?: FilterPattern;
    ignoreErrors?: boolean;
    include?: FilterPattern;
};

export const isolatedDeclarationsPlugin = (transformer: (code: string, id: string) => Promise<IsolatedDeclarationsResult>, options: IsolatedDeclarationsOptions = {}): Plugin => {
    const filter = createFilter(options.include, options.exclude);

    const outputFiles: Record<string, string> = {};

    const addOutput = (filename: string, source: string) => {
        outputFiles[filename.replace(/\..?[jt]s$/, "")] = source;
    };

    return <Plugin>{
        name: "packem:isolated-declarations",

        // eslint-disable-next-line consistent-return
        renderStart(outputOptions, inputOptions): void | never {
            let outBase = "";
            let { input } = inputOptions;

            input = typeof input === "string" ? [input] : input;

            if (Array.isArray(input)) {
                outBase = lowestCommonAncestor(...input);
            }

            if (typeof outputOptions.entryFileNames !== "string") {
                return this.error("entryFileNames must be a string");
            }

            const entryFileNames = outputOptions.entryFileNames.replace(/\.(.)?[jt]s$/, (_, s) => `.d.${s || ""}ts`);

            // eslint-disable-next-line no-loops/no-loops,no-restricted-syntax
            for (const [filename, source] of Object.entries(outputFiles)) {
                this.emitFile({
                    fileName: entryFileNames.replace("[name]", relative(outBase, filename)),
                    source,
                    type: "asset",
                });
            }
        },

        async transform(id, code): Promise<void> {
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
