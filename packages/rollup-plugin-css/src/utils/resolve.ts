import { fileURLToPath } from "node:url";

import { dirname } from "@visulima/path";
import type { NapiResolveOptions } from "oxc-resolver";
import { ResolverFactory } from "oxc-resolver";

import arrayFmt from "./array-fmt";

const baseDirectory = dirname(fileURLToPath(import.meta.url));

// ResolverFactory construction allocates a native oxc resolution engine and its
// caches. Memoize instances keyed by their construction options so repeated
// resolutions (per @import, url(), Sass @use, PostCSS plugin load) reuse the
// same engine and its internal directory/package.json cache across the build.
const resolverCache = new Map<string, ResolverFactory>();

const getResolver = (extensions: string[], symlinks: boolean): ResolverFactory => {
    const key = JSON.stringify({ extensions, symlinks });

    let resolver = resolverCache.get(key);

    if (!resolver) {
        resolver = new ResolverFactory({ extensions, symlinks });
        resolverCache.set(key, resolver);
    }

    return resolver;
};

/**
 * Attempts to resolve a single identifier from a single base directory.
 * @param resolver Configured OXC resolver factory instance.
 * @param basedir Base directory to resolve from.
 * @param id Module identifier to resolve.
 * @param diagnostics Array collecting human-readable failure reasons for each tried path.
 * @returns Absolute path to the resolved module, or `undefined` if it cannot be resolved.
 */
const tryResolve = (resolver: ResolverFactory, basedir: string, id: string, diagnostics: string[]): string | undefined => {
    try {
        const { error, path } = resolver.sync(basedir, id);

        if (path) {
            return path;
        }

        if (error) {
            diagnostics.push(`"${id}" from "${basedir}": ${error}`);
        }
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);

        diagnostics.push(`"${id}" from "${basedir}": ${message}`);
    }

    return undefined;
};

/**
 * Resolves module identifiers using advanced resolution strategies.
 *
 * This function implements sophisticated module resolution logic using the OXC resolver,
 * supporting various resolution strategies and providing detailed error reporting.
 * It's primarily used for resolving CSS imports, PostCSS plugins, and other dependencies.
 *
 * Features:
 * - Multiple base directory support
 * - Configurable file extensions
 * - Symlink resolution
 * - Detailed error reporting and debugging
 * - Fallback resolution strategies
 * @param ids Array of module identifiers to resolve.
 * @param userOptions Resolution configuration options.
 * @returns Absolute path to the resolved module.
 * @throws Error if no module can be resolved.
 * @example
 * ```typescript
 * // Resolving a PostCSS plugin
 * const pluginPath = resolve(['autoprefixer'], {
 *   caller: 'PostCSS',
 *   baseDirs: ['/project/node_modules'],
 *   extensions: ['.js', '.mjs']
 * });
 * ```
 */
export const resolve = (ids: string[], userOptions: ResolveOptions): string => {
    const options = {
        baseDirs: [baseDirectory],
        caller: "Resolver",
        extensions: [".mjs", ".js", ".cjs", ".json"],
        symlinks: true,
        ...userOptions,
    } satisfies ResolveOptions;

    const resolver = getResolver(options.extensions, options.symlinks);
    const diagnostics: string[] = [];

    for (const basedir of options.baseDirs) {
        for (const id of ids) {
            const path = tryResolve(resolver, basedir, id, diagnostics);

            if (path) {
                return path;
            }
        }
    }

    const details = diagnostics.length > 0 ? `\nTried:\n${diagnostics.map((line) => `  - ${line}`).join("\n")}` : "";

    if (userOptions.logger && diagnostics.length > 0) {
        userOptions.logger.debug?.({ message: `${options.caller} could not resolve ${arrayFmt(ids)}.${details}` });
    }

    throw new Error(`${options.caller} could not resolve ${arrayFmt(ids)}.${details}`);
};

export interface ResolveOptions extends NapiResolveOptions {
    /** directories to begin resolving from (defaults to `[__dirname]`) */
    baseDirs?: string[];

    /** name of the caller for error message (default to `Resolver`) */
    caller?: string;

    /** optional logger for routing resolution diagnostics */
    logger?: {
        debug?: (log: { [key: string]: unknown; message: string }) => void;
        warn?: (log: { [key: string]: unknown; message: string }) => void;
    };
}
