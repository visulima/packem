import { builtinModules } from "node:module";
import process from "node:process";

import type { FilterPattern } from "@rollup/pluginutils";
import { createFilter } from "@rollup/pluginutils";
import type { Pail } from "@visulima/pail";
import { init } from "cjs-module-lexer";
import MagicString from "magic-string";
import { parseSync } from "oxc-parser";
import type { Plugin } from "rollup";

import isPureCJS from "../utils/is-pure-cjs";

let initted = false;

const REQUIRE = `__cjs_require`;

type Awaitable<T> = T | Promise<T>;

type Overwrite<T, U> = Pick<T, Exclude<keyof T, keyof U>> & U;

type OptionsResolved = Overwrite<Required<Options>, Pick<Options, "order"> & { shouldTransform?: TransformFunction }>;

const resolveOptions = (options: Options): OptionsResolved => {
    if (Array.isArray(options.shouldTransform)) {
        const { shouldTransform } = options;

        options.shouldTransform = (id) => shouldTransform.includes(id);
    }

    return {
        builtinNodeModules: !!options.builtinNodeModules,
        cwd: options.cwd || process.cwd(),
        exclude: options.exclude || [/node_modules/, /\.d\.[cm]?ts$/],
        include: options.include || [/\.[cm]?[jt]sx?$/],
        order: "order" in options ? options.order : "pre",
        shouldTransform: options.shouldTransform,
    };
};

/**
 * @returns A boolean or a promise that resolves to a boolean,
 * or `undefined` to let the plugin decide automatically.
 */
export type TransformFunction = (
    /**
     * The module ID (path) being imported.
     */
    id: string,

    /**
     * The module ID (path) of the importer.
     */
    importer: string,

    /**
     * Rollup resolve function for better module resolution
     */
    rollupResolve: (id: string, importer?: string) => Promise<{ id: string }>,
) => Awaitable<boolean | undefined | void>;

export interface Options {
    /**
     * Whether to transform Node.js built-in modules (e.g., `fs`, `path`)
     * to `process.getBuiltinModule()` calls, which has the best performance.
     *
     * Note: `process.getBuiltinModule` is available since Node.js 20.16.0 and 22.3.0.
     */
    builtinNodeModules?: boolean;
    cwd?: string;
    exclude?: FilterPattern;
    include?: FilterPattern;
    order?: "pre" | "post" | undefined;

    /**
     * A function to determine whether a module should be transformed.
     * Return `true` to force transformation, `false` to skip transformation,
     * or `undefined` to let the plugin decide automatically.
     */
    shouldTransform?: string[] | TransformFunction;
}

export const requireCJSTransformerPlugin = (userOptions: Options, logger: Pail): Plugin => {
    const { builtinNodeModules, cwd, exclude, include, order, shouldTransform } = resolveOptions(userOptions);
    const filter = createFilter(include, exclude);

    return {
        async buildStart() {
            if (!initted) {
                await init();
                initted = true;
            }
        },

        name: "packem:plugin-require-cjs",

        renderChunk: {
            async handler(code, chunk, { format }) {
                if (format !== "es") {
                    logger.debug({
                        message: "skip",
                        prefix: "plugin:require-cjs-transformer",
                    });

                    return;
                }

                if (!filter(chunk.fileName)) {
                    logger.debug({
                        message: `Skipping file (excluded by filter): ${chunk.fileName}`,
                        prefix: "plugin:require-cjs-transformer",
                    });

                    return;
                }

                logger.debug({
                    message: `Processing chunk: ${chunk.fileName}`,
                    prefix: "plugin:require-cjs-transformer",
                });

                logger.debug({
                    message: `Code length: ${code.length} characters`,
                    prefix: "plugin:require-cjs-transformer",
                });

                const parsed = parseSync(chunk.fileName, code, {
                    astType: "js",
                    lang: "js",
                    sourceType: "module",
                });

                const { body } = parsed.program;
                const s = new MagicString(code);

                let usingRequire = false;

                logger.debug({
                    message: `Found ${body.length} AST statements to process`,
                    prefix: "plugin:require-cjs-transformer",
                });

                for await (const stmt of body) {
                    if (stmt.type === "ImportDeclaration") {
                        if (stmt.importKind === "type") {
                            logger.debug({
                                message: `Skipping type-only import: ${stmt.source.value}`,
                                prefix: "plugin:require-cjs-transformer",
                            });
                            continue;
                        }

                        const source = stmt.source.value;

                        logger.debug({
                            message: `Processing import: ${source}`,
                            prefix: "plugin:require-cjs-transformer",
                        });

                        const isBuiltinModule = builtinNodeModules && (builtinModules.includes(source) || source.startsWith("node:"));

                        logger.debug({
                            message: `Is builtin module: ${isBuiltinModule}`,
                            prefix: "plugin:require-cjs-transformer",
                        });

                        let shouldProcess: boolean;

                        if (isBuiltinModule) {
                            shouldProcess = true;
                            logger.debug({
                                message: `Processing as builtin module`,
                                prefix: "plugin:require-cjs-transformer",
                            });
                        } else {
                            const transformResult = shouldTransform?.(source, cwd, this?.resolveId);

                            logger.debug({
                                message: `shouldTransform result: ${transformResult}`,
                                prefix: "plugin:require-cjs-transformer",
                            });

                            if (transformResult === undefined) {
                                const isPureCJSResult = await isPureCJS(source, cwd, this.resolveId?.bind(this));

                                shouldProcess = isPureCJSResult;
                                logger.debug({
                                    message: `isPureCJS result: ${isPureCJSResult}`,
                                    prefix: "plugin:require-cjs-transformer",
                                });
                            } else {
                                shouldProcess = transformResult;
                                logger.debug({
                                    message: `Using shouldTransform result: ${shouldProcess}`,
                                    prefix: "plugin:require-cjs-transformer",
                                });
                            }
                        }

                        if (!shouldProcess) {
                            logger.debug({
                                message: `Skipping import (not a CJS module): ${source}`,
                                prefix: "plugin:require-cjs-transformer",
                            });
                            continue;
                        }

                        if (stmt.specifiers.length === 0) {
                            // import 'cjs-module'
                            if (isBuiltinModule) {
                                // side-effect free
                                logger.debug({
                                    message: `Transforming side-effect builtin import to removal: ${source}`,
                                    prefix: "plugin:require-cjs-transformer",
                                });
                                s.remove(stmt.start, stmt.end);
                            } else {
                                // require('cjs-module')
                                logger.debug({
                                    message: `Transforming side-effect import to require call: ${source} -> ${REQUIRE}(${JSON.stringify(source)})`,
                                    prefix: "plugin:require-cjs-transformer",
                                });
                                s.overwrite(stmt.start, stmt.end, `${REQUIRE}(${JSON.stringify(source)});`);
                                usingRequire = true;
                            }

                            continue;
                        }

                        logger.debug({
                            message: `Processing ${stmt.specifiers.length} import specifiers`,
                            prefix: "plugin:require-cjs-transformer",
                        });

                        const mapping: [string, string][] = [];
                        let namespaceId: string | undefined;
                        let defaultId: string | undefined;

                        for (const specifier of stmt.specifiers) {
                            // namespace
                            if (specifier.type === "ImportNamespaceSpecifier") {
                                // import * as name from 'cjs-module'
                                namespaceId = specifier.local.name;
                                logger.debug({
                                    message: `Found namespace import: ${namespaceId} from ${source}`,
                                    prefix: "plugin:require-cjs-transformer",
                                });
                            } else if (specifier.type === "ImportSpecifier") {
                                if (specifier.importKind === "type") {
                                    logger.debug({
                                        message: `Skipping type-only named import: ${code.slice(specifier.imported.start, specifier.imported.end)}`,
                                        prefix: "plugin:require-cjs-transformer",
                                    });
                                    continue;
                                }

                                // named import
                                const importedName = code.slice(specifier.imported.start, specifier.imported.end);
                                const localName = specifier.local.name;

                                mapping.push([importedName, localName]);

                                logger.debug({
                                    message: `Found named import: ${importedName} as ${localName}`,
                                    prefix: "plugin:require-cjs-transformer",
                                });
                            } else {
                                // default import
                                defaultId = specifier.local.name;

                                logger.debug({
                                    message: `Found default import: ${defaultId}`,
                                    prefix: "plugin:require-cjs-transformer",
                                });
                            }
                        }

                        let requireCode: string;

                        if (isBuiltinModule) {
                            requireCode
                                = source === "process" || source === "node:process"
                                    ? "globalThis.process"
                                    : `globalThis.process.getBuiltinModule(${JSON.stringify(source)})`;
                            logger.debug({
                                message: `Generated builtin require code: ${requireCode}`,
                                prefix: "plugin:require-cjs-transformer",
                            });
                        } else {
                            requireCode = `__cjs_require(${JSON.stringify(source)})`;
                            usingRequire = true;
                            logger.debug({
                                message: `Generated CJS require code: ${requireCode}`,
                                prefix: "plugin:require-cjs-transformer",
                            });
                        }

                        const codes: string[] = [];

                        if (namespaceId) {
                            defaultId ||= `_cjs_${namespaceId}_default`;
                            logger.debug({
                                message: `Generated default ID for namespace: ${defaultId}`,
                                prefix: "plugin:require-cjs-transformer",
                            });
                        }

                        if (defaultId) {
                            // const name = require('cjs-module')
                            codes.push(`const ${defaultId} = ${requireCode};`);

                            logger.debug({
                                message: `Added default import transformation: const ${defaultId} = ${requireCode}`,
                                prefix: "plugin:require-cjs-transformer",
                            });
                        }

                        if (namespaceId) {
                            // const ns = { ...default, default }
                            codes.push(`const ${namespaceId} = { ...${defaultId}, default: ${defaultId} };`);

                            logger.debug({
                                message: `Added namespace import transformation: const ${namespaceId} = { ...${defaultId}, default: ${defaultId} }`,
                                prefix: "plugin:require-cjs-transformer",
                            });
                        }

                        if (mapping.length > 0) {
                            const destructuring = `const {\n${mapping.map(([k, v]) => `  ${k === v ? v : `${k}: ${v}`}`).join(",\n")}\n} = ${defaultId || requireCode};`;

                            codes.push(destructuring);

                            logger.debug({
                                message: `Added named imports transformation: ${destructuring.replaceAll("\n", " ").trim()}`,
                                prefix: "plugin:require-cjs-transformer",
                            });
                        }

                        const finalCode = codes.join("\n");

                        logger.debug({
                            message: `Final transformation for ${source}: ${finalCode}`,
                            prefix: "plugin:require-cjs-transformer",
                        });

                        s.overwrite(stmt.start, stmt.end, finalCode);
                    }
                }

                if (usingRequire) {
                    const preamble = builtinNodeModules
                        ? `const ${REQUIRE} = globalThis.process.getBuiltinModule("module").createRequire(import.meta.url);\n`
                        : `import { createRequire as __cjs_createRequire } from "node:module";
const ${REQUIRE} = __cjs_createRequire(import.meta.url);\n`;

                    logger.debug({
                        message: `Adding require preamble: ${preamble.replaceAll("\n", " ").trim()}`,
                        prefix: "plugin:require-cjs-transformer",
                    });

                    if (code[0] === "#") {
                        // skip shebang line
                        const firstNewLineIndex = code.indexOf("\n") + 1;

                        logger.debug({
                            message: `Adding preamble after shebang at position ${firstNewLineIndex}`,
                            prefix: "plugin:require-cjs-transformer",
                        });

                        s.appendLeft(firstNewLineIndex, preamble);
                    } else {
                        logger.debug({
                            message: `Adding preamble at the beginning`,
                            prefix: "plugin:require-cjs-transformer",
                        });

                        s.prepend(preamble);
                    }
                } else {
                    logger.debug({
                        message: `No require preamble needed`,
                        prefix: "plugin:require-cjs-transformer",
                    });
                }

                const transformedCode = s.toString();

                logger.debug({
                    message: `Transformation complete for ${chunk.fileName}`,
                    prefix: "plugin:require-cjs-transformer",
                });
                logger.debug({
                    message: `Original code length: ${code.length}, Transformed code length: ${transformedCode.length}`,
                    prefix: "plugin:require-cjs-transformer",
                });

                return {
                    code: transformedCode,
                    map: s.generateMap(),
                };
            },
            order,
        } satisfies Plugin,
    };
};
