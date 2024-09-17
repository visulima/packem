import { readFile, writeFile } from "@visulima/fs";
import { dirname, extname, normalize, relative, resolve } from "@visulima/path";
import { resolveModuleExportNames, resolvePath } from "mlly";

import { DEFAULT_EXTENSIONS } from "../constants";
import { getShebang, makeExecutable } from "../rollup/plugins/shebang";
import resolveAliases from "../rollup/utils/resolve-aliases";
import type { BuildContext } from "../types";
import warn from "../utils/warn";

// eslint-disable-next-line sonarjs/cognitive-complexity
const createStub = async (context: BuildContext): Promise<void> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const babelPlugins: (string | any[])[] = context.options.jiti.transformOptions?.babel?.plugins as any;
    const importedBabelPlugins: string[] = [];
    const serializedJitiOptions = JSON.stringify(
        {
            ...context.options.jiti,
            alias: {
                ...resolveAliases(context, "jit"),
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
        null,
        2,
    ).replace(
        '"__$BABEL_PLUGINS"',
        Array.isArray(babelPlugins)
            ? "[" +
                  babelPlugins
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      .map((plugin: string | any[], index: number): string => {
                          if (Array.isArray(plugin)) {
                              // eslint-disable-next-line @typescript-eslint/naming-convention
                              const [name, ...arguments_] = plugin;

                              importedBabelPlugins.push(name as string);

                              // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
                              return "[" + ["plugin" + index, ...arguments_.map((value) => JSON.stringify(value))].join(", ") + "]";
                          }

                          importedBabelPlugins.push(plugin as string);

                          // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
                          return "plugin" + index;
                      })
                      .join(",") +
                  "]"
            : "[]",
    );

    for (const entry of context.options.entries) {
        const output = resolve(context.options.rootDir, context.options.outDir, entry.name as string);

        const resolvedEntry = normalize(context.jiti.esmResolve(entry.input, { try: true }) ?? entry.input);
        const resolvedEntryWithoutExtension = resolvedEntry.slice(0, Math.max(0, resolvedEntry.length - extname(resolvedEntry).length));
        // eslint-disable-next-line no-await-in-loop
        const code = await readFile(resolvedEntry);
        const shebang = getShebang(code);

        // CJS Stub
        if (context.options.emitCJS) {
            const jitiCJSPath = relative(
                dirname(output),
                // eslint-disable-next-line no-await-in-loop
                await resolvePath("jiti", {
                    conditions: ["node", "require"],
                    url: import.meta.url,
                }),
            );

            // eslint-disable-next-line no-await-in-loop
            await writeFile(
                `${output}.cjs`,
                shebang +
                    [
                        `const { createJiti } = require(${JSON.stringify(jitiCJSPath)});`,
                        // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
                        ...importedBabelPlugins.map((plugin, index) => "const plugin" + index + " = require(" + JSON.stringify(plugin) + ")"),
                        "",
                        `const jiti = createJiti(__filename, ${serializedJitiOptions});`,
                        "",
                        `/** @type {import(${JSON.stringify(resolvedEntryWithoutExtension)})} */`,
                        `module.exports = jiti(${JSON.stringify(resolvedEntry)})`,
                    ].join("\n"),
            );
        }

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
            // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
            warn(context, `Cannot analyze ${resolvedEntry} for exports: ${error.toString()}`);

            return;
        }

        const hasDefaultExport = namedExports.includes("default") || namedExports.length === 0;

        if (context.options.emitESM) {
            const jitiESMPath = relative(
                dirname(output),
                // eslint-disable-next-line no-await-in-loop
                await resolvePath("jiti", {
                    conditions: ["node", "import"],
                    url: import.meta.url,
                }),
            );

            // eslint-disable-next-line no-await-in-loop
            await writeFile(
                `${output}.mjs`,
                shebang +
                    [
                        "import { createJiti } from " + JSON.stringify(jitiESMPath) + ";",
                        // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
                        ...importedBabelPlugins.map((plugin, index) => "import plugin" + index + " from " + JSON.stringify(plugin)),
                        "",
                        "const jiti = createJiti(import.meta.url, " + serializedJitiOptions + ");",
                        "",
                        "/** @type {import(" + JSON.stringify(resolvedEntry) + ")} */",
                        "const _module = await jiti.import(" + JSON.stringify(resolvedEntry) + ");",
                        hasDefaultExport ? "\nexport default _module;" : "",
                        ...namedExports.filter((name) => name !== "default").map((name) => `export const ${name} = _module.${name};`),
                    ].join("\n"),
            );
        }

        if (context.options.declaration) {
            // DTS Stub
            // eslint-disable-next-line no-await-in-loop
            await writeFile(
                `${output}.d.cts`,
                [
                    `export * from ${JSON.stringify(resolvedEntryWithoutExtension)};`,
                    hasDefaultExport ? `export { default } from ${JSON.stringify(resolvedEntryWithoutExtension)};` : "",
                ].join("\n"),
            );
            // eslint-disable-next-line no-await-in-loop
            await writeFile(
                `${output}.d.mts`,
                [`export * from ${JSON.stringify(resolvedEntry)};`, hasDefaultExport ? `export { default } from ${JSON.stringify(resolvedEntry)};` : ""].join(
                    "\n",
                ),
            );
        }

        if (shebang) {
            // eslint-disable-next-line no-await-in-loop
            await makeExecutable(`${output}.cjs`);
            // eslint-disable-next-line no-await-in-loop
            await makeExecutable(`${output}.mjs`);
        }
    }

    await context.hooks.callHook("rollup:done", context);
};

export default createStub;
