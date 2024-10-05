import type { Pail } from "@visulima/pail";
import type PQueue from "p-queue";
// eslint-disable-next-line import/no-extraneous-dependencies
import PQueueClass from "p-queue";

import type { InternalStyleOptions, StyleOptions } from "../types";
import type { Loader, LoaderContext, Payload } from "./types";
import matchFile from "./utils/match-file";

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
    logger: Pail;
    options: InternalStyleOptions;
}

export default class Loaders {
    private readonly test: (file: string) => boolean;

    private readonly loaders = new Map<string, Loader>();

    private readonly options: InternalStyleOptions;

    private workQueue?: PQueue;

    private readonly logger: Pail;

    public constructor({ extensions, loaders, logger, options }: LoadersOptions) {
        this.test = (file): boolean => extensions.some((extension) => file.toLowerCase().endsWith(extension));

        if (loaders.length > 0) {
            this.add(...loaders);
        }

        this.options = options;
        this.logger = logger;
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

        for await (const [name, loader] of this.loaders) {
            const loaderContext: LoaderContext = {
                ...context,
                // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
                options: (this.options[name as keyof StyleOptions] as Record<string, unknown>) ?? {},
            };

            if (loader.alwaysProcess || matchFile(loaderContext.id, loader.test)) {
                this.logger.debug(`Processing ${name} loader for ${loaderContext.id}`);

                const process = await this.workQueue.add(loader.process.bind(loaderContext, payload));

                if (process) {
                    // eslint-disable-next-line no-param-reassign
                    payload = process;
                }
            }
        }

        return payload;
    }
}
