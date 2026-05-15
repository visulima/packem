import { readFileSync, writeFileSync } from "@visulima/fs";
import { resolveAliases } from "@visulima/packem-rollup";
import { getShebang, makeExecutable } from "@visulima/packem-rollup/plugin/shebang";
import { DEFAULT_EXTENSIONS, ENDING_REGEX } from "@visulima/packem-share/constants";
import type { BuildContext } from "@visulima/packem-share/types";
import { getDtsExtension, getOutputExtension, warn } from "@visulima/packem-share/utils";
import { dirname, relative, resolve } from "@visulima/path";
import { fileURLToPath, pathToFileURL, resolveModuleExportNames, resolvePath } from "mlly";

import type { InternalBuildOptions } from "../types";

const IDENTIFIER_REGEX = /^[_$a-z\u00A0-\uFFFF][\w$\u00A0-\uFFFF]*$/iu;

/**
 * A babel plugin entry is either a bare module specifier or a tuple of the
 * module specifier followed by its options. jiti types `babel` loosely
 * (an untyped record), so the shape is asserted locally instead of leaking
 * loose typing through the serialization logic.
 */
type BabelPluginEntry = string | [string, ...unknown[]];

type JitiImportResolver = (...arguments_: string[]) => string;

/**
 * Serializes the jiti options into a string literal, replacing the babel
 * `plugins` array with references to the (separately imported) plugin
 * bindings. The names of the imported plugins are collected into the
 * passed-in array so the caller can emit the matching imports.
 */
const serializeJitiOptions = (context: BuildContext<InternalBuildOptions>, importedBabelPlugins: string[]): string => {
    const babelPlugins = context.options.jiti.transformOptions?.babel?.plugins as BabelPluginEntry[] | undefined;

    return JSON.stringify(
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
                .map((plugin: BabelPluginEntry, index: number): string => {
                    if (Array.isArray(plugin)) {
                        // eslint-disable-next-line @typescript-eslint/naming-convention
                        const [name, ...arguments_] = plugin;

                        importedBabelPlugins.push(name);

                        return `[${[`plugin${String(index)}`, ...arguments_.map((value) => JSON.stringify(value))].join(", ")}]`;
                    }

                    importedBabelPlugins.push(plugin);

                    return `plugin${String(index)}`;
                })
                .join(",")}]`
            : "[]",
    );
};

const buildNamedExportLines = (namedExports: string[]): string[] =>
    namedExports
        .filter((name) => name !== "default")
        .map((name, index) => {
            if (IDENTIFIER_REGEX.test(name)) {
                return `export const ${name} = _module.${name};`;
            }

            // For arbitrary module namespace identifiers (non-identifier strings),
            // we need to use a temporary variable and then export with the string literal
            const temporaryVariable = `__packem_export_${String(index)}`;

            // If the name is already quoted (starts and ends with quotes), use it directly
            // Otherwise, wrap it in JSON.stringify
            const propertyAccess = name.startsWith("'") && name.endsWith("'") ? `_module[${name}]` : `_module[${JSON.stringify(name)}]`;

            return `const ${temporaryVariable} = ${propertyAccess};\nexport { ${temporaryVariable} as ${JSON.stringify(name)} };`;
        });

const writeDtsStub = (path: string, typePath: string, hasDefaultExport: boolean): void => {
    writeFileSync(path, `export * from "${typePath}";\n${hasDefaultExport ? `export { default } from "${typePath}";` : ""}`);
};

const buildEsmStub = async (
    context: BuildContext<InternalBuildOptions>,
    jitiImportResolve: JitiImportResolver,
    output: string,
    resolvedEntry: string,
    resolvedEntryWithoutExtension: string,
    shebang: string,
    serializedJitiOptions: string,
    importedBabelPlugins: string[],
    namedExports: string[],
    hasDefaultExport: boolean,
): Promise<void> => {
    const jitiESMPath = jitiImportResolve(
        dirname(output),
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

            ...importedBabelPlugins.map((plugin, index) => `import plugin${String(index)} from "${plugin}";`),
            "",
            `const jiti = createJiti(import.meta.url, ${serializedJitiOptions});`,
            "",
            `/** @type {import("${typePath}")} */`,

            `const _module = await jiti.import("${resolvedEntry}");`,
            ...hasDefaultExport ? [`export default _module?.default ?? _module;`] : [],
            ...buildNamedExportLines(namedExports),
        ].join("\n"),
    );

    if (context.options.declaration) {
        writeDtsStub(`${output}.${dtsExtension}`, typePath, hasDefaultExport);
    }
};

const buildCjsStub = async (
    context: BuildContext<InternalBuildOptions>,
    jitiImportResolve: JitiImportResolver,
    output: string,
    resolvedEntry: string,
    resolvedEntryWithoutExtension: string,
    shebang: string,
    serializedJitiOptions: string,
    importedBabelPlugins: string[],
    hasDefaultExport: boolean,
): Promise<void> => {
    const jitiCJSPath = jitiImportResolve(
        dirname(output),
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

            ...importedBabelPlugins.map((plugin, index) => `const plugin${String(index)} = require(${JSON.stringify(plugin)})`),
            "",
            `const jiti = createJiti(__filename, ${serializedJitiOptions});`,
            "",
            `/** @type {import("${typePath}")} */`,

            `module.exports = jiti("${resolvedEntry}")`,
        ].join("\n"),
    );

    if (context.options.declaration) {
        writeDtsStub(`${output}.${dtsExtension}`, typePath, hasDefaultExport);
    }
};

const createStub = async (context: BuildContext<InternalBuildOptions>): Promise<void> => {
    const importedBabelPlugins: string[] = [];
    const serializedJitiOptions = serializeJitiOptions(context, importedBabelPlugins);

    for (const entry of context.options.entries) {
        // Build entries are normalised with a name before stub generation runs.
        const output = resolve(context.options.rootDir, context.options.outDir, entry.name as string);

        const resolvedEntry = fileURLToPath(context.jiti.esmResolve(entry.input, { try: true }) ?? entry.input);
        const resolvedEntryWithoutExtension = resolvedEntry.replace(ENDING_REGEX, "");
        const code = readFileSync(resolvedEntry);
        const shebang = getShebang(code);

        // MJS Stub
        // Try to analyze exports
        let namedExports: string[];

        try {
            // eslint-disable-next-line no-await-in-loop
            namedExports = await resolveModuleExportNames(resolvedEntry, {
                extensions: DEFAULT_EXTENSIONS,
            });
        } catch (error: unknown) {
            warn(context, `Cannot analyze ${resolvedEntry} for exports: ${String(error)}`);

            return;
        }

        const hasDefaultExport = namedExports.includes("default") || namedExports.length === 0;

        const jitiImportResolve: JitiImportResolver = context.options.jiti.absoluteJitiPath
            ? (...arguments_: string[]): string => pathToFileURL(resolve(...arguments_))
            : relative;

        if (context.options.emitESM) {
            // eslint-disable-next-line no-await-in-loop
            await buildEsmStub(
                context,
                jitiImportResolve,
                output,
                resolvedEntry,
                resolvedEntryWithoutExtension,
                shebang,
                serializedJitiOptions,
                importedBabelPlugins,
                namedExports,
                hasDefaultExport,
            );
        }

        if (context.options.emitCJS) {
            // eslint-disable-next-line no-await-in-loop
            await buildCjsStub(
                context,
                jitiImportResolve,
                output,
                resolvedEntry,
                resolvedEntryWithoutExtension,
                shebang,
                serializedJitiOptions,
                importedBabelPlugins,
                hasDefaultExport,
            );
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
