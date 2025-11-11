import { builtinModules } from "node:module";
import process from "node:process";

import type { FilterPattern } from "@rollup/pluginutils";
import { createFilter } from "@rollup/pluginutils";
import { init } from "cjs-module-lexer";
import MagicString from "magic-string";
import { parseSync } from "oxc-parser";
import type { NormalizedOutputOptions, Plugin, RenderedChunk, ResolvedId, SourceMapInput } from "rollup";

import isPureCJS from "../utils/is-pure-cjs";

// Constants
const REQUIRE_VAR = `__cjs_require`;

// Helper function templates
const CREATE_REQUIRE_IMPORT = `import { createRequire as __cjs_createRequire } from "node:module";`;
const REQUIRE_DECLARATION = `const ${REQUIRE_VAR} = __cjs_createRequire(import.meta.url);`;
const GET_PROCESS_DECLARATION = `const __cjs_getProcess = typeof globalThis !== "undefined" && typeof globalThis.process !== "undefined" ? globalThis.process : process;`;

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
    return ${REQUIRE_VAR}(module);
};`;

// Regex patterns for duplicate detection
const REGEX_PATTERNS = {
    builtin: /const\s+__cjs_getBuiltinModule\s*=\s*\(module\)\s*=>\s*\{[\s\S]*?\};\s*/g,
    import: /import\s*\{\s*createRequire(?:\s+as\s+__cjs_createRequire)?\s*\}\s*from\s*["']node:module["'];?\s*/g,
    process: /const\s+__cjs_getProcess\s*=\s*typeof\s+globalThis[^;]*;\s*/g,
    require: /const\s+__cjs_require\s*=\s*(?:__cjs_)?createRequire\s*\([^)]*\);\s*/g,
} as const;

// Global state
let cjsLexerInitialized = false;

// Helper functions
const isBuiltinModule = (source: string, builtinNodeModules: boolean): boolean =>
    builtinNodeModules && (builtinModules.includes(source) || source.startsWith("node:"));

const shouldTransformImport = async (
    source: string,
    isBuiltin: boolean,
    shouldTransform: TransformFunction | undefined,
    cwd: string,
    resolveId: (id: string, importer?: string) => Promise<ResolvedId | null>,
): Promise<boolean> => {
    if (isBuiltin) {
        return true;
    }

    const transformResult = await shouldTransform?.(source, cwd, resolveId);

    return transformResult === undefined ? await isPureCJS(source, cwd, resolveId) : transformResult;
};

const generateRequireCode = (source: string, isBuiltin: boolean): { code: string; needsBuiltin: boolean; needsProcess: boolean; needsRequire: boolean } => {
    if (isBuiltin) {
        if (source === "process" || source === "node:process") {
            return {
                code: `__cjs_getProcess`,
                needsBuiltin: false,
                needsProcess: true,
                needsRequire: true,
            };
        }

        return {
            code: `__cjs_getBuiltinModule(${JSON.stringify(source)})`,
            needsBuiltin: true,
            needsProcess: true,
            needsRequire: true,
        };
    }

    return {
        code: `${REQUIRE_VAR}(${JSON.stringify(source)})`,
        needsBuiltin: false,
        needsProcess: false,
        needsRequire: true,
    };
};

const removeDuplicates = (code: string): string => {
    const s = new MagicString(code);

    // Find all matches for each pattern
    const matches = {
        builtin: [...code.matchAll(REGEX_PATTERNS.builtin)],
        import: [...code.matchAll(REGEX_PATTERNS.import)],
        process: [...code.matchAll(REGEX_PATTERNS.process)],
        require: [...code.matchAll(REGEX_PATTERNS.require)],
    };

    // Remove duplicates (keep first occurrence, remove the rest)
    Object.values(matches).forEach((patternMatches) => {
        if (patternMatches.length > 1) {
            for (let i = patternMatches.length - 1; i > 0; i -= 1) {
                const match = patternMatches[i];

                if (match) {
                    s.remove(match.index, match.index + match[0].length);
                }
            }
        }
    });

    return s.toString();
};

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
    rollupResolve: (id: string, importer?: string) => Promise<ResolvedId | null>,
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

export const requireCJSTransformerPlugin = (userOptions: Options, _logger: Console): Plugin => {
    // Skip processing during internal packem builds to avoid processing our own files
    if (process.env.INTERNAL_PACKEM_BUILD) {
        return {
            name: "require-cjs-transformer",
        } satisfies Plugin;
    }

    const { builtinNodeModules, cwd, exclude, include, order, shouldTransform } = resolveOptions(userOptions);
    const filter = createFilter(include, exclude);

    return {
        async buildStart() {
            if (!cjsLexerInitialized) {
                await init();
                cjsLexerInitialized = true;
            }
        },

        name: "packem:plugin-require-cjs",

        renderChunk: {
            // eslint-disable-next-line sonarjs/cognitive-complexity
            async handler(code: string, chunk: RenderedChunk, options: NormalizedOutputOptions): Promise<{ code: string; map: SourceMapInput } | undefined> {
                if (options.format !== "es" || !filter(chunk.fileName)) {
                    return undefined;
                }

                const parsed = parseSync(chunk.fileName, code, {
                    astType: "js",
                    lang: "js",
                    sourceType: "module",
                });

                const s = new MagicString(code);
                let needsRequire = false;
                let needsProcess = false;
                let needsBuiltin = false;

                for await (const stmt of parsed.program.body) {
                    if (stmt.type !== "ImportDeclaration" || stmt.importKind === "type") {
                        continue;
                    }

                    const source = stmt.source.value;
                    const isBuiltin = isBuiltinModule(source, builtinNodeModules);
                    const resolveId = this.resolve;

                    if (!await shouldTransformImport(source, isBuiltin, shouldTransform, cwd, resolveId)) {
                        continue;
                    }

                    const {
                        code: requireCode,
                        needsBuiltin: needsBuilt,
                        needsProcess: needsProc,
                        needsRequire: needsRequest,
                    } = generateRequireCode(source, isBuiltin);

                    needsRequire ||= needsRequest;
                    needsProcess ||= needsProc;
                    needsBuiltin ||= needsBuilt;

                    if (stmt.specifiers.length === 0) {
                        // import 'module'
                        if (isBuiltin) {
                            s.remove(stmt.start, stmt.end);
                        } else {
                            s.overwrite(stmt.start, stmt.end, `${requireCode};`);
                        }

                        continue;
                    }

                    // Handle specifiers
                    const mapping: [string, string][] = [];
                    let namespaceId: string | undefined;
                    let defaultId: string | undefined;

                    for (const specifier of stmt.specifiers) {
                        if (specifier.type === "ImportNamespaceSpecifier") {
                            namespaceId = specifier.local.name;
                        } else if (specifier.type === "ImportSpecifier" && specifier.importKind !== "type") {
                            const importedName = code.slice(specifier.imported.start, specifier.imported.end);

                            mapping.push([importedName, specifier.local.name]);
                        } else if (specifier.type === "ImportDefaultSpecifier") {
                            defaultId = specifier.local.name;
                        }
                    }

                    const codes: string[] = [];

                    if (namespaceId) {
                        defaultId ||= `_cjs_${namespaceId}_default`;
                    }

                    if (defaultId) {
                        codes.push(`const ${defaultId} = ${requireCode};`);
                    }

                    if (namespaceId) {
                        codes.push(`const ${namespaceId} = { ...${defaultId}, default: ${defaultId} };`);
                    }

                    if (mapping.length > 0) {
                        const destructuring = `const {\n${mapping.map(([k, v]) => `  ${k === v ? v : `${k}: ${v}`}`).join(",\n")}\n} = ${defaultId || requireCode};`;

                        codes.push(destructuring);
                    }

                    s.overwrite(stmt.start, stmt.end, codes.join("\n"));
                }

                // Add helpers if needed
                if (needsRequire || needsProcess || needsBuiltin) {
                    const preambleParts: string[] = [];

                    if (needsRequire) {
                        preambleParts.push(CREATE_REQUIRE_IMPORT, REQUIRE_DECLARATION);
                    }

                    if (needsProcess) {
                        preambleParts.push(GET_PROCESS_DECLARATION);
                    }

                    if (needsBuiltin) {
                        preambleParts.push(GET_BUILTIN_MODULE_DECLARATION);
                    }

                    const preamble = `${preambleParts.join("\n\n")}\n\n`;
                    const transformedCode = s.toString();

                    if (transformedCode[0] === "#") {
                        const firstNewLineIndex = transformedCode.indexOf("\n") + 1;

                        s.appendLeft(firstNewLineIndex, preamble);
                    } else {
                        s.prepend(preamble);
                    }
                }

                const s2 = new MagicString(removeDuplicates(s.toString()));

                return { code: s2.toString(), map: s2.generateMap() };
            },
            order,
        },
    };
};
