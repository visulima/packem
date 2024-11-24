import { fileURLToPath } from "node:url";

import { dirname } from "@visulima/path";
import type { NapiResolveOptions } from "oxc-resolver";
import { ResolverFactory } from "oxc-resolver";

import arrayFmt from "./array-fmt";

const baseDirectory = dirname(fileURLToPath(import.meta.url));

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
                        context: [{
                            basedir,
                            caller: userOptions.caller,
                            extensions: userOptions.extensions,
                            id,
                        }],
                    });
                }
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } catch (error: any) {
                // eslint-disable-next-line no-console
                console.debug(error.message, {
                    context: [{
                        basedir,
                        caller: userOptions.caller,
                        error,
                        extensions: userOptions.extensions,
                        id,
                    }],
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
