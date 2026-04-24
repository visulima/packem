import path from "node:path";

import { ResolverFactory } from "oxc-resolver";
import type { Plugin, ResolvedId } from "rollup";

import { existsSync, readFileSync } from "node:fs";

import { filename_js_to_dts, filename_to_dts, RE_CSS, RE_DTS, RE_JS, RE_JSON, RE_NODE_MODULES, RE_TS, RE_VUE } from "./filename";
import type { OptionsResolved } from "./options";

const isSourceFile = (id: string) => RE_TS.test(id) || RE_VUE.test(id) || RE_JSON.test(id);

const createDtsResolvePlugin = ({
    cwd,
    resolve,
    resolver,
    sideEffects,
    tsconfig,
    tsconfigRaw,
}: Pick<OptionsResolved, "cwd" | "tsconfig" | "tsconfigRaw" | "resolve" | "resolver" | "sideEffects">): Plugin => {
    const dtsResolver = new ResolverFactory({
        conditionNames: ["types", "typings", "import", "require"],
        mainFields: ["types", "typings", "module", "main"],
        tsconfig: tsconfig ? { configFile: tsconfig, references: "auto" } : undefined,
    });
    const moduleSideEffects = sideEffects ? true : null;

    return {
        name: "rollup-plugin-dts:resolver",

        resolveId: {
            async handler(id, importer, options) {
                // Guard: Only operate on imports inside .d.ts files
                if (!importer || !RE_DTS.test(importer)) {
                    return;
                }

                const external = {
                    external: true,
                    id,
                    moduleSideEffects: sideEffects,
                };

                // Guard: Externalize non-code imports
                if (RE_CSS.test(id)) {
                    return external;
                }

                // Bare specifier of a user-bundled package (via `resolve` option): resolve the
                // .d.ts directly without going through rollup's resolver chain. Rollup's
                // resolution loop re-enters this handler with the package's absolute `.js` path,
                // where `this.resolve` falls back to `external: "absolute"` — that would
                // short-circuit as external before `resolveDtsPath` gets a chance to pick
                // the actual `.d.ts` through the types condition.
                if (!isFilePath(id) && shouldBundleNodeModule(id)) {
                    const directDtsResolution = await resolveDtsPath(id, importer, null);

                    if (directDtsResolution && RE_DTS.test(directDtsResolution)) {
                        return { id: directDtsResolution, moduleSideEffects };
                    }

                    if (directDtsResolution && isSourceFile(directDtsResolution)) {
                        await this.load({ id: directDtsResolution });

                        return { id: filename_to_dts(directDtsResolution), moduleSideEffects };
                    }

                    // Couldn't find types despite being on the bundle list — fall through
                    // to the regular path so the normal "unresolvable → external" logic runs.
                }

                // Get Rollup's resolution first for fallback and policy checks
                const rollupResolution = await this.resolve(id, importer, options);

                // If rollup already marked the resolution as external, respect it
                if (rollupResolution?.external) {
                    return external;
                }

                const dtsResolution = await resolveDtsPath(id, importer, rollupResolution);

                // If resolution failed, error or externalize
                if (!dtsResolution) {
                    // Auto-export unresolvable packages
                    return isFilePath(id) ? null : external;
                }

                // Externalize non-bundled node_modules dependencies. Relative imports
                // issued from inside a node_modules file we're already bundling (e.g. a
                // package's internal `./types` re-export) must follow the bundle decision
                // of the containing package — otherwise the emitted .d.ts ends up with a
                // dangling `import {...} from './types'` that points nowhere at the
                // consumer's install path.
                if (
                    RE_NODE_MODULES.test(dtsResolution)
                    && !shouldBundleNodeModule(id)
                    && !(isFilePath(id) && RE_NODE_MODULES.test(importer) && shouldBundleImporterPackage(importer))
                ) {
                    return external;
                }

                // The path is either a declaration file or a source file that needs redirection.
                if (RE_DTS.test(dtsResolution)) {
                    // It's already a .d.ts file, we're done
                    return {
                        id: dtsResolution,
                        moduleSideEffects,
                    };
                }

                if (isSourceFile(dtsResolution)) {
                    // It's a .ts/.vue source file, so we load it to ensure its .d.ts is generated,
                    // then redirect the import to the future .d.ts path
                    await this.load({ id: dtsResolution });

                    return {
                        id: filename_to_dts(dtsResolution),
                        moduleSideEffects,
                    };
                }

                return null;
            },
            order: "pre",
        },
    };

    function shouldBundleNodeModule(id: string) {
        if (typeof resolve === "boolean")
            return resolve;

        return resolve.some((pattern) => (typeof pattern === "string" ? id === pattern : pattern.test(id)));
    }

    // Given a node_modules importer path, extract its npm package name and check whether
    // the user asked to bundle it via `resolve`. Used to follow relative imports inside
    // a bundled package (e.g. `./types` from `node_modules/deeks/index.d.ts`). pnpm paths
    // look like `…/node_modules/.pnpm/deeks@X/node_modules/deeks/…` so we match the LAST
    // `node_modules/<pkg>` segment — the first one would return `.pnpm`.
    function shouldBundleImporterPackage(importer: string) {
        const normalized = importer.replace(/\\/g, "/");
        const marker = "/node_modules/";
        const lastIdx = normalized.lastIndexOf(marker);

        if (lastIdx < 0)
            return false;

        const after = normalized.slice(lastIdx + marker.length);
        const firstSlash = after.indexOf("/");
        let packageName = firstSlash === -1 ? after : after.slice(0, firstSlash);

        if (packageName.startsWith("@")) {
            const scopedRest = after.slice(packageName.length + 1);
            const scopedSlash = scopedRest.indexOf("/");
            const subName = scopedSlash === -1 ? scopedRest : scopedRest.slice(0, scopedSlash);

            packageName = `${packageName}/${subName}`;
        }

        return shouldBundleNodeModule(packageName);
    }

    async function resolveDtsPath(id: string, importer: string, rollupResolution: ResolvedId | null): Promise<string | null> {
        let dtsPath: string | undefined | null;

        if (resolver === "tsc") {
            const { default: tscResolve } = await import("./tsc/resolver.js");

            dtsPath = tscResolve(
                id,
                importer,
                cwd,
                tsconfig,
                tsconfigRaw,
                // TODO reference
            );
        } else {
            const result = dtsResolver.resolveDtsSync(importer, id);

            dtsPath = result.path;
        }

        if (dtsPath) {
            dtsPath = path.normalize(dtsPath);
        }

        // Packages that ship ESM with `exports: "./index.js"` (a string form, no
        // types condition) and a sibling `index.d.ts` — e.g. `indent-string@5`,
        // `redent`, `strip-indent`: oxc-resolver falls through to the .js file
        // because string-form `exports` doesn't go through conditional resolution.
        // The JS build inlines these, so the emitted .d.ts must too. Try the
        // sibling `.d.ts` before giving up.
        //
        // Narrow this to string-form `exports` specifically: packages with
        // object-form `exports` that omit a `types` condition (e.g. they only list
        // `import`/`require` or `default`) are typically larger libraries that
        // bring their own transitive concerns — pulling their `.d.ts` into the
        // bundle can drag in node-subpath imports (`#utils`) that downstream
        // consumers would not have resolvable. Users who want those inlined can
        // pass an explicit `resolve: [...]` list.
        if (dtsPath && RE_JS.test(dtsPath) && hasStringExports(dtsPath)) {
            const siblingDts = filename_js_to_dts(dtsPath);

            if (existsSync(siblingDts)) {
                return siblingDts;
            }
        }

        if (!dtsPath || !isSourceFile(dtsPath)) {
            if (rollupResolution && isFilePath(rollupResolution.id) && isSourceFile(rollupResolution.id) && !rollupResolution.external) {
                return rollupResolution.id;
            }

            return null;
        }

        return dtsPath;
    }
};

const isFilePath = (id: string) => id.startsWith(".") || path.isAbsolute(id);

// Walk up from a resolved JS path to the owning `package.json` and return true
// if its `exports` field is a string (shorthand). Used to narrow the sibling-
// `.d.ts` fallback to packages that genuinely lack conditional type resolution.
const stringExportsCache = new Map<string, boolean>();
const hasStringExports = (resolvedJsPath: string): boolean => {
    let directory = path.dirname(resolvedJsPath);

    while (true) {
        const pkgPath = path.join(directory, "package.json");

        if (stringExportsCache.has(pkgPath)) {
            return stringExportsCache.get(pkgPath)!;
        }

        if (existsSync(pkgPath)) {
            let result = false;

            try {
                const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { exports?: unknown };

                result = typeof pkg.exports === "string";
            } catch {
                result = false;
            }

            stringExportsCache.set(pkgPath, result);

            return result;
        }

        const parent = path.dirname(directory);

        if (parent === directory) {
            return false;
        }

        directory = parent;
    }
};

export default createDtsResolvePlugin;
