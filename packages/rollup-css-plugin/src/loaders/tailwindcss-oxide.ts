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

        this.logger.debug({
            data: {
                availableFeatures: this.compiler.features,
                hasAtApply: Boolean(this.compiler.features & Features.AtApply),
                hasJsPluginCompat: Boolean(this.compiler.features & Features.JsPluginCompat),
                hasRequiredFeatures: Boolean(hasRequiredFeatures),
                hasThemeFunction: Boolean(this.compiler.features & Features.ThemeFunction),
                hasUtilities: Boolean(this.compiler.features & Features.Utilities),
                requiredFeatures: Features.AtApply | Features.JsPluginCompat | Features.ThemeFunction | Features.Utilities,
            },
            message: "Feature analysis",
        });

        if (!hasRequiredFeatures) {
            this.logger.debug({
                data: {
                    missingFeatures: {
                        AtApply: !(this.compiler.features & Features.AtApply),
                        JsPluginCompat: !(this.compiler.features & Features.JsPluginCompat),
                        ThemeFunction: !(this.compiler.features & Features.ThemeFunction),
                        Utilities: !(this.compiler.features & Features.Utilities),
                    },
                },
                message: "Missing required features, returning false",
            });

            return false;
        }

        // eslint-disable-next-line no-bitwise
        if (this.compiler.features & Features.Utilities) {
            this.logger.debug({
                data: {
                    candidatesCountBefore: this.candidates.size,
                    scannerExists: Boolean(this.scanner),
                    scannerHasScan: Boolean(this.scanner && typeof this.scanner.scan === "function"),
                },
                message: "Scan for candidates - Utilities feature enabled",
            });

            // Mock scanner.scan() since we don't have the actual Scanner class
            if (this.scanner && typeof this.scanner.scan === "function") {
                const scannedCandidates = this.scanner.scan();

                this.logger.debug({
                    data: {
                        scannedCandidates: scannedCandidates.slice(0, 10), // Limit to first 10 for readability
                        scannedCandidatesCount: scannedCandidates.length,
                    },
                    message: "Scanner results",
                });

                for (const candidate of scannedCandidates) {
                    this.candidates.add(candidate);
                }

                this.logger.debug({
                    data: {
                        candidatesCountAfter: this.candidates.size,
                        newCandidatesAdded: scannedCandidates.length,
                    },
                    message: "Candidates updated",
                });
            } else {
                this.logger.debug({
                    data: {
                        hasScanMethod: Boolean(this.scanner && typeof this.scanner.scan === "function"),
                        scannerType: typeof this.scanner,
                    },
                    message: "Scanner not available or missing scan method",
                });
            }
        } else {
            this.logger.debug({ message: "Utilities feature not enabled, skipping candidate scanning" });
        }

        // eslint-disable-next-line no-bitwise
        if (this.compiler.features & Features.Utilities) {
            // Watch individual files found via custom `@source` paths
            if (this.scanner && this.scanner.files) {
                this.logger.debug({
                    data: {
                        files: this.scanner.files.slice(0, 5), // Limit to first 5 for readability
                        filesCount: this.scanner.files.length,
                    },
                    message: "Watching individual files from scanner",
                });

                for (const file of this.scanner.files) {
                    addWatchFileWrapper(file);
                }
            } else {
                this.logger.debug({ message: "No individual files to watch from scanner" });
            }

            // Watch globs found via custom `@source` paths
            if (this.scanner && this.scanner.globs) {
                this.logger.debug({
                    data: {
                        globs: this.scanner.globs.slice(0, 3), // Limit to first 3 for readability
                        globsCount: this.scanner.globs.length,
                    },
                    message: "Processing globs from scanner",
                });

                for await (const glob of this.scanner.globs) {
                    if (glob.pattern[0] === "!") {
                        this.logger.debug({
                            data: { pattern: glob.pattern },
                            message: "Skipping negated glob pattern",
                        });
                        continue;
                    }

                    let relativePath = relative(this.base, glob.base);

                    if (relativePath[0] !== ".") {
                        relativePath = `./${relativePath}`;
                    }

                    const watchPath = join(relativePath, glob.pattern);

                    this.logger.debug({
                        data: { base: glob.base, glob: glob.pattern, watchPath },
                        message: "Adding glob to watch list",
                    });

                    addWatchFileWrapper(watchPath);

                    const { root } = this.compiler;

                    if (root !== "none" && root !== null) {
                        const basePath = pathResolve(root.base, root.pattern);

                        try {
                            const stats = await stat(basePath);

                            if (stats.isDirectory()) {
                                this.logger.debug({
                                    data: { basePath, isDirectory: stats.isDirectory() },
                                    message: "Valid source directory confirmed",
                                });
                            } else {
                                const errorMessage = `The path given to \`source(…)\` must be a directory but got \`source(${basePath})\` instead.`;

                                this.logger.debug({
                                    data: { basePath, error: errorMessage, isDirectory: stats.isDirectory() },
                                    message: "Invalid source path detected",
                                });
                                throw new Error(errorMessage);
                            }
                        } catch (error) {
                            this.logger.debug({
                                data: { basePath, error: error instanceof Error ? error.message : String(error) },
                                message: "Error checking source directory",
                            });
                            // File doesn't exist or can't be accessed
                        }
                    }
                }
            } else {
                this.logger.debug({ message: "No globs to process from scanner" });
            }
        } else {
            this.logger.debug({ message: "Utilities feature not enabled, skipping file watching" });
        }

        this.logger.debug({
            data: {
                candidates: [...this.candidates].slice(0, 10), // Limit to first 10 for readability
                candidatesCount: this.candidates.size,
            },
            message: "Build CSS",
        });
        const code = this.compiler.build([...this.candidates]);

        this.logger.debug({
            data: {
                cssLength: code.length,
                cssPreview: code.slice(0, 200) + (code.length > 200 ? "..." : ""),
            },
            message: "CSS build completed",
        });

        this.logger.debug({
            data: { enableSourceMaps: this.enableSourceMaps },
            message: "Build Source Map",
        });
        const map = this.enableSourceMaps ? toSourceMap(this.compiler.buildSourceMap()).raw : undefined;

        if (map) {
            this.logger.debug({
                data: {
                    hasMappings: Boolean(map.mappings),
                    mapSize: JSON.stringify(map).length,
                    sourcesCount: map.sources?.length || 0,
                },
                message: "Source map generated",
            });
        } else {
            this.logger.debug({ message: "No source map generated" });
        }

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
            this.logger.debug({
                data: { returningOriginalContent: true },
                message: "Tailwind generation returned false - not a Tailwind file or missing features",
            });

            return { code, map };
        }

        this.logger.debug({ message: "[@tailwindcss/rollup] Generate CSS" });

        // Optimize the CSS if in production mode
        if (this.environment === "production") {
            this.logger.debug({
                data: {
                    minify: true,
                    originalSize: result.code.length,
                },
                message: "[@tailwindcss/rollup] Optimize CSS",
            });

            const optimizedResult = optimize(result.code, {
                file: this.id,
                map: result.map,
                minify: true,
            });

            this.logger.debug({
                data: {
                    optimizedSize: optimizedResult.code.length,
                    originalSize: result.code.length,
                    sizeReduction: result.code.length - optimizedResult.code.length,
                    sizeReductionPercent: `${(((result.code.length - optimizedResult.code.length) / result.code.length) * 100).toFixed(2)}%`,
                },
                message: "CSS optimization completed",
            });

            result = optimizedResult;
        } else {
            this.logger.debug({
                data: { environment: this.environment },
                message: "Development mode - skipping CSS optimization",
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
