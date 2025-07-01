import { fileURLToPath } from "node:url";

import { dirname } from "@visulima/path";
import type { NapiResolveOptions } from "oxc-resolver";
import { ResolverFactory } from "oxc-resolver";

import arrayFmt from "./array-fmt";

const baseDirectory = dirname(fileURLToPath(import.meta.url));

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
 * @param ids Array of module identifiers to resolve
 * @param userOptions Resolution configuration options
 * @returns Absolute path to the resolved module
 * @throws Error if no module can be resolved
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

    const resolver = new ResolverFactory({
        extensions: options.extensions as string[],
        symlinks: options.symlinks,
    });

    for (const basedir of options.baseDirs) {
        for (const id of ids) {
            try {
                const { error, path } = resolver.sync(basedir, id);

                if (path) {
                    return path;
                }

                if (error) {
                    // eslint-disable-next-line no-console
                    console.debug(error, {
                        context: [
                            {
                                basedir,
                                caller: userOptions.caller,
                                extensions: userOptions.extensions,
                                id,
                            },
                        ],
                    });
                }
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } catch (error: any) {
                // eslint-disable-next-line no-console
                console.debug(error.message, {
                    context: [
                        {
                            basedir,
                            caller: userOptions.caller,
                            error,
                            extensions: userOptions.extensions,
                            id,
                        },
                    ],
                });
            }
        }
    }

    throw new Error(`${options.caller} could not resolve ${arrayFmt(ids)}`);
};

export interface ResolveOptions extends NapiResolveOptions {
    /** directories to begin resolving from (defaults to `[__dirname]`) */
    baseDirs?: string[];

    /** name of the caller for error message (default to `Resolver`) */
    caller?: string;
}
