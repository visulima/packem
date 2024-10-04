import type { render as nodeSassRender, Result as NodeSassResult, SassError as NodeSassSassError } from "node-sass";
import type PQueue from "p-queue";
// eslint-disable-next-line import/no-extraneous-dependencies
import PQueueClass from "p-queue";
import type { compileStringAsync } from "sass";
import type { compileStringAsync as embeddedCompileStringAsync } from "sass-embedded";

import type { SassApiType } from "../types";

let workQueue: PQueue | undefined;

/**
 * Verifies that the implementation and version of Sass is supported by this loader.
 */
const getCompileFunction = (
    implementation: {
        compileStringAsync?: typeof compileStringAsync | typeof embeddedCompileStringAsync;
        render?: typeof nodeSassRender;
    },
    apiType: SassApiType,
    // eslint-disable-next-line sonarjs/cognitive-complexity
): typeof compileStringAsync | typeof embeddedCompileStringAsync | typeof nodeSassRender => {
    if (implementation.compileStringAsync !== undefined) {
        if (apiType === "modern") {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return async (sassOptions: Record<string, any>) => {
                const { data, ...rest } = sassOptions;

                return await (implementation as { compileStringAsync: typeof compileStringAsync }).compileStringAsync(data, rest);
            };
        }

        if (apiType === "modern-compiler") {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return async (sassOptions: Record<string, any>) => {
                const { data, ...rest } = sassOptions;

                return await (implementation as { compileStringAsync: typeof embeddedCompileStringAsync }).compileStringAsync(data, rest);
            };
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return async (sassOptions: Record<string, any>) =>
            await new Promise((resolve, reject) => {
                (implementation as { render: typeof nodeSassRender }).render(sassOptions, (error: undefined | Error, result) => {
                    if (error) {
                        reject(error);

                        return;
                    }

                    resolve(result);
                });
            });
    }

    if (apiType === "modern" || apiType === "modern-compiler") {
        throw new Error("Modern API is not supported for 'node-sass'");
    }

    // There is an issue with node-sass when async custom importers are used
    // See https://github.com/sass/node-sass/issues/857#issuecomment-93594360
    // We need to use a job queue to make sure that one thread is always available to the UV lib
    if (!workQueue) {
        const threadPoolSize = Number(process.env.UV_THREADPOOL_SIZE ?? 4);

        workQueue = new PQueueClass({ concurrency: threadPoolSize - 1 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return async (sassOptions: Record<string, any>) =>
        await (workQueue as PQueue).add(
            await new Promise((resolve, reject) => {
                (implementation as { render: typeof nodeSassRender }).render.bind(implementation)(
                    sassOptions,
                    (error: NodeSassSassError | undefined, result: NodeSassResult) => {
                        if (error) {
                            reject(error);

                            return;
                        }

                        // @ts-expect-error - @TODO fix typing
                        resolve(result);
                    },
                );
            }),
        );
};

export default getCompileFunction;
