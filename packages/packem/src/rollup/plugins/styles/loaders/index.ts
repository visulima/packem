import type PQueue from "p-queue";
// eslint-disable-next-line import/no-extraneous-dependencies
import PQueueClass from "p-queue";

import type { InternalStyleOptions } from "../types";
import sourcemapLoader from "./sourcemap";
import type { Loader, LoaderContext, Payload } from "./types";

const matchFile = (file: string, condition: Loader["test"]): boolean => {
    if (!condition) {
        return false;
    }

    if (typeof condition === "function") {
        return condition(file);
    }

    return condition.test(file);
};

// This queue makes sure one thread is always available,
// which is necessary for some cases
// ex.: https://github.com/sass/node-sass/issues/857
const threadPoolSize = process.env.UV_THREADPOOL_SIZE ? Number.parseInt(process.env.UV_THREADPOOL_SIZE, 10) : 4; // default `libuv` threadpool size

/** Options for {@link Loaders} class */
interface LoadersOptions {
    /** @see {@link Options.extensions} */
    extensions: string[];
    /** @see {@link Options.loaders} */
    loaders: Loader[];
    options: InternalStyleOptions;
}

export default class Loaders {
    private readonly test: (file: string) => boolean;

    private readonly loaders = new Map<string, Loader>();

    private readonly options: InternalStyleOptions;

    private workQueue?: PQueue;

    public constructor({ extensions, loaders, options }: LoadersOptions) {
        this.test = (file): boolean => extensions.some((extension) => file.toLowerCase().endsWith(extension));
        this.add(sourcemapLoader);

        if (loaders.length > 0) {
            this.add(...loaders);
        }

        this.options = options;
    }

    public add<T extends Record<string, unknown>>(...loaders: Loader<T>[]): void {
        for (const loader of loaders) {
            if (this.loaders.has(loader.name)) {
                // eslint-disable-next-line no-continue
                continue;
            }

            this.loaders.set(loader.name, loader as Loader);
        }
    }

    public isSupported(file: string): boolean {
        if (this.test(file)) {
            return true;
        }

        for (const [, loader] of this.loaders) {
            if (matchFile(file, loader.test)) {
                return true;
            }
        }

        return false;
    }

    public async process(payload: Payload, context: LoaderContext): Promise<Payload> {
        if (!this.workQueue) {
            this.workQueue = new PQueueClass({ concurrency: threadPoolSize - 1 });
        }

        let processed: Payload = payload;

        for await (const [name, loader] of this.loaders) {
            const loaderContext: LoaderContext = {
                ...context,
                dts: this.options.dts,
                emit: this.options.emit,
                extensions: this.options.extensions,
                extract: this.options.extract,
                import: this.options.import,
                inject: this.options.inject,
                minimize: this.options.minimize,
                namedExports: this.options.namedExports,
                options: this.options[name] ?? {},
                url: this.options.url,
            };

            if (loader.alwaysProcess || matchFile(loaderContext.id, loader.test)) {
                const process = await this.workQueue.add(loader.process.bind(loaderContext, payload));

                if (process) {
                    processed = process;
                }
            }
        }

        return processed;
    }
}
