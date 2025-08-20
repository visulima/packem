import { stat } from "node:fs/promises";

import { compile, Features, optimize, toSourceMap } from "@tailwindcss/node";
import { clearRequireCache } from "@tailwindcss/node/require-cache";
import { findPackageJson } from "@visulima/package";
import { dirname, join, normalize, relative, resolve as pathResolve } from "@visulima/path";
import { resolveAlias } from "@visulima/path/utils";

import { generateJsExports } from "../utils/generate-js-exports";
import { resolve } from "../utils/resolve";
import type { Loader, LoaderContext } from "./types";

// Type alias for resolver functions
type ResolverFunction = (id: string, base: string) => Promise<string | false | undefined>;

// Mock scanner interface since we don't have the actual Scanner class
interface MockScanner {
    files: string[];
    globs: { base: string; pattern: string }[];
    scan: () => string[];
    sources: { base: string; negated: boolean; pattern: string }[];
}

/**
 * Tailwind Oxide Root class for managing compilation and scanning
 */
class TailwindRoot {
    private compiler?: Awaited<ReturnType<typeof compile>>;

    private scanner?: MockScanner;

    private candidates: Set<string> = new Set<string>();

    private buildDependencies = new Map<string, number | undefined>();

    public constructor(
        private readonly id: string,
        private readonly base: string,
        private readonly enableSourceMaps: boolean,
        private readonly customCssResolver: ResolverFunction,
        private readonly customJsResolver: ResolverFunction,
        private readonly logger: LoaderContext["logger"],
    ) {}

    /**
     * Generate CSS for the root file
     */
    public async generate(
        content: string,
        addWatchFile: (file: string) => void,
    ): Promise<{ code: string; map: string | undefined } | false> {
        const inputPath = pathResolve(this.id.replace(/\?.*$/u, ""));

        const addWatchFileWrapper = (file: string) => {
            // Don't watch the input file since it's already a dependency
            if (file === inputPath) {
                return;
            }

            // Scanning `.svg` file containing a `#` or `?` in the path will crash
            if (/[#?].*\.svg$/u.test(file)) {
                return;
            }

            addWatchFile(file);
        };

        const requiresBuildPromise = this.requiresBuild();
        const inputBase = dirname(pathResolve(inputPath));

        if (!this.compiler || !this.scanner || await requiresBuildPromise) {
            clearRequireCache([...this.buildDependencies.keys()]);

            this.buildDependencies.clear();

            this.addBuildDependency(inputPath);

            this.logger.debug({ message: "Setup compiler" });

            const addBuildDependenciesPromises: Promise<void>[] = [];

            this.compiler = await compile(content, {
                base: inputBase,
                customCssResolver: this.customCssResolver,
                customJsResolver: this.customJsResolver,
                from: this.enableSourceMaps ? this.id : undefined,
                onDependency: (path) => {
                    addWatchFileWrapper(path);
                    addBuildDependenciesPromises.push(this.addBuildDependency(path));
                },
                shouldRewriteUrls: true,
            });

            await Promise.all(addBuildDependenciesPromises);

            this.logger.debug({ message: "Setup scanner" });

            const sources = (() => {
                // Disable auto source detection
                if (this.compiler.root === "none") {
                    return [];
                }

                // No root specified, auto-detect based on the `**/*` pattern
                if (this.compiler.root === null) {
                    return [{ base: this.base, negated: false, pattern: "**/*" }];
                }

                // Use the specified root
                return [{ ...this.compiler.root, negated: false }];
            })();

            // Use spread operator instead of concat
            const allSources = [...sources, ...this.compiler.sources];

            // Create scanner with sources
            this.scanner = {
                files: [],
                globs: [],
                scan: () => [],
                sources: allSources,
            };
        } else {
            for (const buildDependency of this.buildDependencies.keys()) {
                addWatchFileWrapper(buildDependency);
            }
        }

        // Check if compiler has required features using bitwise operations
        // eslint-disable-next-line no-bitwise
        const hasRequiredFeatures = this.compiler.features & (
            // eslint-disable-next-line no-bitwise
            Features.AtApply | Features.JsPluginCompat | Features.ThemeFunction | Features.Utilities
        );

        if (!hasRequiredFeatures) {
            return false;
        }

        // eslint-disable-next-line no-bitwise
        if (this.compiler.features & Features.Utilities) {
            this.logger.debug({ message: "Scan for candidates" });

            // Mock scanner.scan() since we don't have the actual Scanner class
            if (this.scanner && typeof this.scanner.scan === "function") {
                for (const candidate of this.scanner.scan()) {
                    this.candidates.add(candidate);
                }
            }
        }

        // eslint-disable-next-line no-bitwise
        if (this.compiler.features & Features.Utilities) {
            // Watch individual files found via custom `@source` paths
            if (this.scanner && this.scanner.files) {
                for (const file of this.scanner.files) {
                    addWatchFileWrapper(file);
                }
            }

            // Watch globs found via custom `@source` paths
            if (this.scanner && this.scanner.globs) {
                for await (const glob of this.scanner.globs) {
                    if (glob.pattern[0] === "!") {
                        continue;
                    }

                    let relativePath = relative(this.base, glob.base);

                    if (relativePath[0] !== ".") {
                        relativePath = `./${relativePath}`;
                    }

                    addWatchFileWrapper(join(relativePath, glob.pattern));

                    const { root } = this.compiler;

                    if (root !== "none" && root !== null) {
                        const basePath = pathResolve(root.base, root.pattern);

                        try {
                            const stats = await stat(basePath);

                            if (!stats.isDirectory()) {
                                throw new Error(
                                    `The path given to \`source(…)\` must be a directory but got \`source(${basePath})\` instead.`,
                                );
                            }
                        } catch {
                            // File doesn't exist or can't be accessed
                        }
                    }
                }
            }
        }

        this.logger.debug({ message: "Build CSS" });
        const code = this.compiler.build([...this.candidates]);

        this.logger.debug({ message: "Build Source Map" });
        const map = this.enableSourceMaps ? toSourceMap(this.compiler.buildSourceMap()).raw : undefined;

        return {
            code,
            map,
        };
    }

    private async addBuildDependency(path: string): Promise<void> {
        let mtime: number | undefined;

        try {
            const stats = await stat(path);

            mtime = stats.mtimeMs;
        } catch {
            // File doesn't exist or can't be accessed
        }

        this.buildDependencies.set(path, mtime);
    }

    private async requiresBuild(): Promise<boolean> {
        for await (const [path, mtime] of this.buildDependencies) {
            if (mtime === undefined) {
                return true;
            }

            try {
                const stats = await stat(path);

                if (stats.mtimeMs > mtime) {
                    return true;
                }
            } catch {
                return true;
            }
        }

        return false;
    }
}

/**
 * Tailwind Oxide loader for processing Tailwind CSS files
 */
const tailwindcssLoader: Loader = {
    name: "tailwindcss",

    /**
     * Process Tailwind CSS content using Tailwind Oxide
     */
    async process(this: LoaderContext, { code, map }) {
        const aliases = this.alias;

        // Create custom resolvers for CSS and JS imports
        const customCssResolver = async (id: string, base: string): Promise<string | false | undefined> => {
            try {
                const packageJsonResult = await findPackageJson(base);

                const resolvedPath = resolve([id, resolveAlias(id, aliases ?? {})], {
                    baseDirs: [base, join(dirname(packageJsonResult.path), "node_modules")],
                    caller: "Tailwind CSS Resolver",
                    conditionNames: ["style", "development|production"],
                    extensions: [".css"],
                    mainFields: ["style"],
                    preferRelative: true,
                });

                if (resolvedPath) {
                    this.logger.debug({ message: `Resolved CSS import: ${id} -> ${resolvedPath}` });

                    return resolvedPath;
                }
            } catch {
                // File doesn't exist or can't be accessed
            }

            this.logger.debug({ message: `Failed to resolve CSS import: ${id} from ${base}` });

            return false;
        };

        const customJsResolver = async (id: string, base: string): Promise<string | false | undefined> => {
            try {
                const packageJsonResult = await findPackageJson(base);

                const resolvedPath = resolve([id, resolveAlias(id, aliases ?? {})], {
                    baseDirs: [base, join(dirname(packageJsonResult.path), "node_modules")],
                    caller: "Tailwind JS Resolver",
                    extensions: [".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx"],
                });

                if (resolvedPath) {
                    this.logger.debug({ message: `Resolved JS import: ${id} -> ${resolvedPath}` });

                    return resolvedPath;
                }
            } catch {
                // File doesn't exist or can't be accessed
            }

            this.logger.debug({ message: `Failed to resolve JS import: ${id} from ${base}` });

            return false;
        };

        // Create or get the Tailwind root for this file
        const root = new TailwindRoot(
            this.id,
            this.sourceDir || process.cwd(),
            this.useSourcemap,
            customCssResolver,
            customJsResolver,
            this.logger,
        );

        let result = await root.generate(
            code,
            (file) => this.deps.add(normalize(file)),
        );

        if (!result) {
            // Not a Tailwind file, return original content
            return { code, map };
        }

        this.logger.debug({ message: "[@tailwindcss/rollup] Generate CSS" });

        // Optimize the CSS if in production mode
        if (this.environment === "production") {
            this.logger.debug({ message: "[@tailwindcss/rollup] Optimize CSS" });

            result = optimize(result.code, {
                file: this.id,
                map: result.map,
                minify: true,
            });
        }

        // Handle emit mode - return CSS directly when emit is true
        if (this.emit) {
            return {
                ...result,
                meta: {
                    moduleContents: result, // Use CSS directly instead of JS code
                    types: undefined, // No types for emit mode
                },
                moduleSideEffects: true,
            };
        }

        // Use the shared utility for JavaScript export generation
        const jsExportResult = generateJsExports({
            css: result.code,
            cwd: this.cwd as string,
            dts: this.dts,
            emit: this.emit,
            extract: this.extract,
            icssDependencies: [], // Tailwind Oxide doesn't support CSS modules by default
            id: this.id,
            inject: this.inject,
            logger: this.logger,
            map: result.map,
            modulesExports: {}, // Tailwind Oxide doesn't support CSS modules by default
            namedExports: this.namedExports,
            supportModules: false,
        });

        // Handle CSS extraction for separate CSS files
        if (this.extract) {
            return {
                code: jsExportResult.code,
                extracted: { css: result.code, id: this.id, map: result.map },
                map: jsExportResult.map,
                meta: jsExportResult.meta,
                moduleSideEffects: jsExportResult.moduleSideEffects,
            };
        }

        // Return JavaScript code for CSS injection
        return {
            code: jsExportResult.code,
            map: jsExportResult.map,
            meta: jsExportResult.meta,
            moduleSideEffects: jsExportResult.moduleSideEffects,
        };
    },

    /** RegExp pattern to match CSS files that might contain Tailwind */
    test: /\.css$/i,
};

export default tailwindcssLoader;
