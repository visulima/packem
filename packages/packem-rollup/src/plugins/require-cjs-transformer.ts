import { builtinModules } from "node:module";
import process from "node:process";

import type { FilterPattern } from "@rollup/pluginutils";
import { createFilter } from "@rollup/pluginutils";
import { init } from "cjs-module-lexer";
import MagicString from "magic-string";
import { parseSync } from "oxc-parser";
import type { NormalizedOutputOptions, Plugin, RenderedChunk, SourceMapInput } from "rollup";

import isPureCJS from "../utils/is-pure-cjs";

let initted = false;

const REQUIRE = `__cjs_require`;

// Helper function constants for reuse
const CREATE_REQUIRE_IMPORT = `import { createRequire as __cjs_createRequire } from "node:module";`;
const REQUIRE_DECLARATION = `const ${REQUIRE} = __cjs_createRequire(import.meta.url);`;
const GET_PROCESS_DECLARATION = `const __cjs_getProcess = typeof globalThis !== "undefined" && typeof globalThis.process !== "undefined" ? globalThis.process : process;`;

// Runtime capability helpers
const GET_BUILTIN_MODULE_DECLARATION = `const __cjs_getBuiltinModule = (module) => {
    // Check if we're in Node.js and version supports getBuiltinModule
    if (typeof __cjs_getProcess !== "undefined" && __cjs_getProcess.versions && __cjs_getProcess.versions.node) {
        const [major, minor] = __cjs_getProcess.versions.node.split(".").map(Number);
        // Node.js 20.16.0+ and 22.3.0+
        if (major > 22 || (major === 22 && minor >= 3) || (major === 20 && minor >= 16)) {
            return __cjs_getProcess.getBuiltinModule(module);
        }
    }
    // Fallback to createRequire
    return __cjs_require(module);
};`;

// Helper functions to check if helpers already exist in code
const hasCreateRequireImport = (code: string): boolean => code.includes("import { createRequire as __cjs_createRequire }") && code.includes("\"node:module\"");

const hasRequireDeclaration = (code: string): boolean => code.includes(`const ${REQUIRE} = __cjs_createRequire(import.meta.url)`);

const hasGetProcessDeclaration = (code: string): boolean =>
    code.includes("const __cjs_getProcess = typeof globalThis !== \"undefined\"") && code.includes("globalThis.process !== \"undefined\"");

const hasGetBuiltinModuleDeclaration = (code: string): boolean =>
    code.includes("const __cjs_getBuiltinModule = (module) =>") && code.includes("__cjs_getProcess.getBuiltinModule(module)");

// Check if helpers are used (not just declared)
const hasRequireUsage = (code: string): boolean =>
    // Look for __cjs_require usage (either as declaration or call)
    // Match: const __cjs_require = or __cjs_require(
    /const\s+__cjs_require\s*=|[^.\w]__cjs_require\s*\(/.test(code) || code.startsWith("__cjs_require(");
const hasProcessUsage = (code: string): boolean =>
    // Look for __cjs_getProcess usage (either as declaration or usage)
    // Match: const __cjs_getProcess = or usage of __cjs_getProcess
    /const\s+__cjs_getProcess\s*=|[^.\w]__cjs_getProcess[^=]|^__cjs_getProcess/.test(code);
const hasBuiltinUsage = (code: string): boolean =>
    // Look for __cjs_getBuiltinModule usage (either as declaration or call)
    // Match: const __cjs_getBuiltinModule = or __cjs_getBuiltinModule(
    /const\s+__cjs_getBuiltinModule\s*=|[^.\w]__cjs_getBuiltinModule\s*\(/.test(code) || code.startsWith("__cjs_getBuiltinModule(");

type Awaitable<T> = T | Promise<T>;

type Overwrite<T, U> = Pick<T, Exclude<keyof T, keyof U>> & U;

type OptionsResolved = Overwrite<Required<Options>, Pick<Options, "order"> & { shouldTransform?: TransformFunction }>;

const resolveOptions = (options: Options): OptionsResolved => {
    if (Array.isArray(options.shouldTransform)) {
        const { shouldTransform } = options;

        // eslint-disable-next-line no-param-reassign
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
     * to `process.getBuiltinModule()` calls when supported, which has the best performance.
     * Falls back to `createRequire()` for older Node.js versions, Bun, and Deno.
     *
     * Note: `process.getBuiltinModule` is available since Node.js 20.16.0 and 22.3.0.
     * For older versions, the plugin uses `createRequire()` as fallback.
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

export const requireCJSTransformerPlugin = (userOptions: Options, logger: Console): Plugin => {
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
            // eslint-disable-next-line sonarjs/cognitive-complexity
            async handler(
                code: string,
                chunk: RenderedChunk,
                options: NormalizedOutputOptions,
            ): Promise<
                | {
                    code: string;
                    map: SourceMapInput;
                }
                | undefined
            > {
                if (options.format !== "es") {
                    return;
                }

                // Check for incomplete helpers FIRST, before any filtering
                // Use the precise usage detection functions
                const hasRequireCall = hasRequireUsage(code);
                const hasProcessCall = hasProcessUsage(code);
                const hasBuiltinCall = hasBuiltinUsage(code);
                const hasAnyHelper = hasRequireCall || hasProcessCall || hasBuiltinCall;

                if (hasAnyHelper) {
                    // Remove any existing incomplete helpers first
                    let cleanedCode = code;
                    const s = new MagicString(code);

                    // Remove incomplete require declarations (declaration without import)
                    if (hasRequireDeclaration(cleanedCode) && !hasCreateRequireImport(cleanedCode)) {
                        // Remove the declaration so we can add the complete helper
                        const declRegex = /const\s+__cjs_require\s*=\s*__cjs_createRequire\(import\.meta\.url\);\s*/g;

                        cleanedCode = cleanedCode.replaceAll(declRegex, "");
                        logger.debug({
                            message: `Removed incomplete __cjs_require declaration from ${chunk.fileName}`,
                            prefix: "plugin:require-cjs-transformer",
                        });
                    }

                    // Build complete preamble with all needed helpers
                    const preambleParts: string[] = [];

                    // Always add complete helpers when they're used
                    if (hasRequireCall) {
                        // Always add both import and declaration together to ensure completeness
                        preambleParts.push(CREATE_REQUIRE_IMPORT, REQUIRE_DECLARATION);
                    }

                    if (hasProcessCall) {
                        preambleParts.push(GET_PROCESS_DECLARATION);
                    }

                    if (hasBuiltinCall) {
                        preambleParts.push(GET_BUILTIN_MODULE_DECLARATION);
                    }

                    // Add the complete helpers
                    if (preambleParts.length > 0) {
                        const preamble = `${preambleParts.join("\n\n")}\n\n`;

                        if (cleanedCode[0] === "#") {
                            const firstNewLineIndex = cleanedCode.indexOf("\n") + 1;

                            s.appendLeft(firstNewLineIndex, preamble);
                        } else {
                            s.prepend(preamble);
                        }

                        logger.debug({
                            message: `Added complete helpers to chunk: ${chunk.fileName}, added ${preambleParts.length} helper(s)`,
                            prefix: "plugin:require-cjs-transformer",
                        });

                        return {
                            code: s.toString(),
                            map: s.generateMap(),
                        };
                    }
                }

                // Filter check - skip if not matching filter
                const shouldProcess = filter(chunk.fileName);

                if (!shouldProcess) {
                    return;
                }

                const parsed = parseSync(chunk.fileName, code, {
                    astType: "js",
                    lang: "js",
                    sourceType: "module",
                });

                const { body } = parsed.program;
                const s = new MagicString(code);

                let usingRequire = false;
                let needsGetProcess = false;
                let needsGetBuiltinModule = false;

                for await (const stmt of body) {
                    if (stmt.type === "ImportDeclaration") {
                        if (stmt.importKind === "type") {
                            continue;
                        }

                        const source = stmt.source.value;
                        const isBuiltinModule = builtinNodeModules && (builtinModules.includes(source) || source.startsWith("node:"));

                        let shouldProcess: boolean;

                        if (isBuiltinModule) {
                            shouldProcess = true;
                        } else {
                            const transformResult = shouldTransform?.(source, cwd, this?.resolveId);

                            shouldProcess = transformResult === undefined ? await isPureCJS(source, cwd, this.resolveId?.bind(this)) : transformResult;
                        }

                        if (!shouldProcess) {
                            continue;
                        }

                        if (stmt.specifiers.length === 0) {
                            // import 'cjs-module'
                            if (isBuiltinModule) {
                                // side-effect free
                                s.remove(stmt.start, stmt.end);
                            } else {
                                // require('cjs-module')
                                s.overwrite(stmt.start, stmt.end, `${REQUIRE}(${JSON.stringify(source)});`);
                                usingRequire = true;
                            }

                            continue;
                        }

                        const mapping: [string, string][] = [];
                        let namespaceId: string | undefined;
                        let defaultId: string | undefined;

                        for (const specifier of stmt.specifiers) {
                            if (specifier.type === "ImportNamespaceSpecifier") {
                                // import * as name from 'cjs-module'
                                namespaceId = specifier.local.name;
                            } else if (specifier.type === "ImportSpecifier") {
                                if (specifier.importKind === "type") {
                                    continue;
                                }

                                // named import
                                const importedName = code.slice(specifier.imported.start, specifier.imported.end);
                                const localName = specifier.local.name;

                                mapping.push([importedName, localName]);
                            } else {
                                // default import
                                defaultId = specifier.local.name;
                            }
                        }

                        let requireCode: string;

                        if (isBuiltinModule) {
                            if (source === "process" || source === "node:process") {
                                // Use the process helper
                                requireCode = `__cjs_getProcess`;
                                needsGetProcess = true;
                                usingRequire = true; // Need runtime helpers for __cjs_getProcess
                            } else {
                                // Use the builtin module helper function
                                requireCode = `__cjs_getBuiltinModule(${JSON.stringify(source)})`;
                                needsGetProcess = true;
                                needsGetBuiltinModule = true;
                                usingRequire = true; // Always use __cjs_require as fallback
                            }
                        } else {
                            requireCode = `__cjs_require(${JSON.stringify(source)})`;
                            usingRequire = true;
                        }

                        const codes: string[] = [];

                        if (namespaceId) {
                            defaultId ||= `_cjs_${namespaceId}_default`;
                        }

                        if (defaultId) {
                            codes.push(`const ${defaultId} = ${requireCode};`);
                        }

                        if (namespaceId) {
                            // const ns = { ...default, default }
                            codes.push(`const ${namespaceId} = { ...${defaultId}, default: ${defaultId} };`);
                        }

                        if (mapping.length > 0) {
                            const destructuring = `const {\n${mapping.map(([k, v]) => `  ${k === v ? v : `${k}: ${v}`}`).join(",\n")}\n} = ${defaultId || requireCode};`;

                            codes.push(destructuring);
                        }

                        const finalCode = codes.join("\n");

                        s.overwrite(stmt.start, stmt.end, finalCode);
                    }
                }

                // Check if code contains any helpers that need imports
                const hasAnyHelper2 = code.includes("__cjs_require") || code.includes("__cjs_getProcess") || code.includes("__cjs_getBuiltinModule");

                if (usingRequire || hasAnyHelper2) {
                    // Build preamble with missing helpers
                    const preambleParts: string[] = [];

                    // Always ensure complete __cjs_require helper if it's used
                    if (usingRequire || code.includes("__cjs_require")) {
                        if (!hasCreateRequireImport(code)) {
                            preambleParts.push(CREATE_REQUIRE_IMPORT);
                        }

                        if (!hasRequireDeclaration(code)) {
                            preambleParts.push(REQUIRE_DECLARATION);
                        }
                    }

                    // Add __cjs_getProcess if needed for process imports
                    if ((needsGetProcess || code.includes("__cjs_getProcess")) && !hasGetProcessDeclaration(code)) {
                        preambleParts.push(GET_PROCESS_DECLARATION);
                    }

                    // Add __cjs_getBuiltinModule if needed for builtin modules
                    if ((needsGetBuiltinModule || code.includes("__cjs_getBuiltinModule")) && !hasGetBuiltinModuleDeclaration(code)) {
                        preambleParts.push(GET_BUILTIN_MODULE_DECLARATION);
                    }

                    const preamble = preambleParts.join("\n\n") + (preambleParts.length > 0 ? "\n" : "");

                    if (preambleParts.length > 0) {
                        if (code[0] === "#") {
                            // skip shebang line
                            const firstNewLineIndex = code.indexOf("\n") + 1;

                            s.appendLeft(firstNewLineIndex, preamble);
                        } else {
                            s.prepend(preamble);
                        }
                    }
                }

                const transformedCode = s.toString();

                return {
                    code: transformedCode,
                    map: s.generateMap(),
                };
            },
            order,
        } satisfies Plugin,
    };
};
