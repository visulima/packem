// eslint-disable-next-line import/no-namespace
import type * as nodeSass from "node-sass";
import type PQueue from "p-queue";
// eslint-disable-next-line import/no-extraneous-dependencies
import PQueueClass from "p-queue";
// eslint-disable-next-line import/no-namespace
import type * as sass from "sass";
// eslint-disable-next-line import/no-namespace
import type * as sassEmbedded from "sass-embedded";

import type { SassApiType } from "../types";

let workQueue: PQueue | undefined;

/**
 * Verifies that the implementation and version of Sass is supported by this loader.
 */
const getCompileFunction = async (
    implementation: typeof sass | typeof sassEmbedded | typeof nodeSass,
    apiType: SassApiType,
): Promise<
    | ((sassOptions: nodeSass.SyncOptions) => nodeSass.Result)
    // eslint-disable-next-line @typescript-eslint/no-invalid-void-type
    | ((sassOptions: nodeSass.SyncOptions) => Promise<void | nodeSass.Result>)
    | ((sassOptions: { data: string } & sass.StringOptions<"sync">) => sass.CompileResult)
    | ((sassOptions: { data: string } & sassEmbedded.StringOptions<"sync">) => sassEmbedded.CompileResult)
> => {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if ((implementation as typeof sass | typeof sassEmbedded).compileString !== undefined) {
        if (apiType === "modern") {
            return (sassOptions: { data: string } & sass.StringOptions<"sync">) => {
                const { data, ...rest } = sassOptions;

                return (implementation as typeof sass).compileString(data as string, rest);
            };
        }

        if (apiType === "modern-compiler") {
            return (sassOptions: { data: string } & sassEmbedded.StringOptions<"sync">) => {
                const { data, ...rest } = sassOptions;

                return (implementation as typeof sassEmbedded).compileString(data as string, rest);
            };
        }

        return (sassOptions: nodeSass.SyncOptions) => (implementation as typeof nodeSass).renderSync(sassOptions);
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

    return async (sassOptions: nodeSass.SyncOptions) =>
        await (workQueue as PQueue).add<nodeSass.Result>(
            async () =>
                await new Promise<nodeSass.Result>((resolve, reject) => {
                    (implementation as typeof nodeSass).render.bind(implementation)(
                        sassOptions,
                        (error: nodeSass.SassError | undefined, result: nodeSass.Result) => {
                            if (error) {
                                reject(error);

                                return;
                            }

                            resolve(result);
                        },
                    );
                }),
        );
};

export default getCompileFunction;
