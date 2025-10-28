import { readFileSync, writeFileSync } from "@visulima/fs";
import { getShebang, makeExecutable } from "@visulima/packem-rollup/plugin/shebang";
import { DEFAULT_EXTENSIONS, ENDING_REGEX } from "@visulima/packem-share/constants";
import type { BuildContext } from "@visulima/packem-share/types";
import { getDtsExtension, getOutputExtension, warn } from "@visulima/packem-share/utils";
import { dirname, relative, resolve } from "@visulima/path";
import { fileURLToPath, pathToFileURL, resolveModuleExportNames, resolvePath } from "mlly";

import resolveAliases from "../rollup/utils/resolve-aliases";
import type { InternalBuildOptions } from "../types";

const IDENTIFIER_REGEX = /^[_$a-z\u00A0-\uFFFF][\w$\u00A0-\uFFFF]*$/iu;

const createStub = async (context: BuildContext<InternalBuildOptions>): Promise<void> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const babelPlugins: (any[] | string)[] = context.options.jiti.transformOptions?.babel?.plugins as any;
    const importedBabelPlugins: string[] = [];
    const serializedJitiOptions = JSON.stringify(
        {
            ...context.options.jiti,
            alias: {
                ...resolveAliases(context.pkg, context.options),
                ...context.options.jiti.alias,
            },
            transformOptions: {
                ...context.options.jiti.transformOptions,
                babel: {
                    ...context.options.jiti.transformOptions?.babel,
                    plugins: "__$BABEL_PLUGINS",
                },
            },
        },
        undefined,
        2,
    ).replace(
        "\"__$BABEL_PLUGINS\"",
        Array.isArray(babelPlugins)
            ? `[${babelPlugins
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                .map((plugin: any[] | string, index: number): string => {
                    if (Array.isArray(plugin)) {
                        // eslint-disable-next-line @typescript-eslint/naming-convention
                        const [name, ...arguments_] = plugin;

                        importedBabelPlugins.push(name as string);

                        return `[${[`plugin${index}`, ...arguments_.map((value) => JSON.stringify(value))].join(", ")}]`;
                    }

                    importedBabelPlugins.push(plugin as string);

                    return `plugin${index}`;
                })
                .join(",")}]`
            : "[]",
    );

    for (const entry of context.options.entries) {
        const output = resolve(context.options.rootDir, context.options.outDir, entry.name as string);

        const resolvedEntry = fileURLToPath(context.jiti.esmResolve(entry.input, { try: true }) ?? entry.input);
        const resolvedEntryWithoutExtension = resolvedEntry.replace(ENDING_REGEX, "");
        const code = readFileSync(resolvedEntry) as unknown as string;
        const shebang = getShebang(code);

        // MJS Stub
        // Try to analyze exports
        let namedExports: string[] = [];

        try {
            // eslint-disable-next-line no-await-in-loop
            namedExports = await resolveModuleExportNames(resolvedEntry, {
                extensions: DEFAULT_EXTENSIONS,
            });
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (error: any) {
            warn(context, `Cannot analyze ${resolvedEntry} for exports: ${error.toString()}`);

            return;
        }

        const hasDefaultExport = namedExports.includes("default") || namedExports.length === 0;

        const jitiImportResolve = context.options.jiti.absoluteJitiPath ? (...arguments_: string[]): string => pathToFileURL(resolve(...arguments_)) : relative;

        if (context.options.emitESM) {
            const jitiESMPath = jitiImportResolve(
                dirname(output),
                // eslint-disable-next-line no-await-in-loop
                await resolvePath("jiti", {
                    conditions: ["node", "import"],
                    url: import.meta.url,
                }),
            );

            const dtsExtension = getDtsExtension(context, "esm");

            const typePath = `${resolvedEntryWithoutExtension}.${dtsExtension}`;

            writeFileSync(
                `${output}.${getOutputExtension(context, "esm")}`,
                shebang
                + [
                    `import { createJiti } from "${jitiESMPath}";`,

                    ...importedBabelPlugins.map((plugin, index) => `import plugin${index} from "${plugin}";`),
                    "",
                    `const jiti = createJiti(import.meta.url, ${serializedJitiOptions});`,
                    "",
                    `/** @type {import("${typePath}")} */`,

                    `const _module = await jiti.import("${resolvedEntry}");`,
                    ...hasDefaultExport ? [`export default _module?.default ?? _module;`] : [],
                    ...namedExports
                        .filter((name) => name !== "default")
                        .map((name, index) => {
                            if (IDENTIFIER_REGEX.test(name)) {
                                return `export const ${name} = _module.${name};`;
                            }

                            // For arbitrary module namespace identifiers (non-identifier strings),
                            // we need to use a temporary variable and then export with the string literal
                            const temporaryVariable = `__packem_export_${index}`;

                            // If the name is already quoted (starts and ends with quotes), use it directly
                            // Otherwise, wrap it in JSON.stringify
                            const propertyAccess = name.startsWith("'") && name.endsWith("'") ? `_module[${name}]` : `_module[${JSON.stringify(name)}]`;

                            return `const ${temporaryVariable} = ${propertyAccess};\nexport { ${temporaryVariable} as ${JSON.stringify(name)} };`;
                        }),
                ].join("\n"),
            );

            // DTS Stub
            if (context.options.declaration) {
                writeFileSync(`${output}.${dtsExtension}`, `export * from "${typePath}";\n${hasDefaultExport ? `export { default } from "${typePath}";` : ""}`);
            }
        }

        // CJS Stub
        if (context.options.emitCJS) {
            const jitiCJSPath = jitiImportResolve(
                dirname(output),
                // eslint-disable-next-line no-await-in-loop
                await resolvePath("jiti", {
                    conditions: ["node", "require"],
                    url: import.meta.url,
                }),
            );

            const dtsExtension = getDtsExtension(context, "cjs");

            const typePath = `${resolvedEntryWithoutExtension}.${dtsExtension}`;

            writeFileSync(
                `${output}.${getOutputExtension(context, "cjs")}`,
                shebang
                + [
                    `const { createJiti } = require("${jitiCJSPath}");`,

                    ...importedBabelPlugins.map((plugin, index) => `const plugin${index} = require(${JSON.stringify(plugin)})`),
                    "",
                    `const jiti = createJiti(__filename, ${serializedJitiOptions});`,
                    "",
                    `/** @type {import("${typePath}")} */`,

                    `module.exports = jiti("${resolvedEntry}")`,
                ].join("\n"),
            );

            // DTS Stub
            if (context.options.declaration) {
                writeFileSync(`${output}.${dtsExtension}`, `export * from "${typePath}";\n${hasDefaultExport ? `export { default } from "${typePath}";` : ""}`);
            }
        }

        if (shebang) {
            // eslint-disable-next-line no-await-in-loop
            await makeExecutable(`${output}.${getOutputExtension(context, "cjs")}`);
            // eslint-disable-next-line no-await-in-loop
            await makeExecutable(`${output}.${getOutputExtension(context, "esm")}`);
        }
    }

    await context.hooks.callHook("rollup:done", context);
};

export default createStub;
