import type { BuildContext } from "@visulima/packem-share/types";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { InternalBuildOptions } from "../../../src/types";
import warnLegacyCJS from "../../../src/utils/warn-legacy-cjs";

describe(warnLegacyCJS, () => {
    type LoggerMethod = (...args: unknown[]) => void;

    let logger: {
        debug: ReturnType<typeof vi.fn<LoggerMethod>>;
        error: ReturnType<typeof vi.fn<LoggerMethod>>;
        info: ReturnType<typeof vi.fn<LoggerMethod>>;
        warn: ReturnType<typeof vi.fn<LoggerMethod>>;
    };

    beforeEach(() => {
        logger = {
            debug: vi.fn<LoggerMethod>(),
            error: vi.fn<LoggerMethod>(),
            info: vi.fn<LoggerMethod>(),
            warn: vi.fn<LoggerMethod>(),
        };
    });

    it("should warn when emitting CJS for Node engines >= 23", () => {
        expect.assertions(1);

        const context = {
            logger,
            options: {
                emitCJS: true,
                rollup: {
                    esbuild: { target: ["node23"] },
                },
                runtime: "node",
            },
            pkg: { engines: { node: ">=23" } },
        } as unknown as BuildContext<InternalBuildOptions>;

        warnLegacyCJS(context);

        expect(logger.warn).toHaveBeenCalledExactlyOnceWith(
            "We recommend using the ESM format instead of CommonJS.\n"
                + "The ESM format is compatible with modern platforms and runtimes, and most new libraries are now distributed only in ESM format.\n"
                + "Learn more at https://nodejs.org/en/learn/modules/publishing-a-package#how-did-we-get-here",
        );
    });

    it("should not warn when not emitting CJS", () => {
        expect.assertions(1);

        const context = {
            logger,
            options: {
                emitCJS: false,
                rollup: {
                    esbuild: { target: ["node23"] },
                },
                runtime: "node",
            },
            pkg: { engines: { node: ">=23" } },
        } as unknown as BuildContext<InternalBuildOptions>;

        warnLegacyCJS(context);

        expect(logger.warn).not.toHaveBeenCalled();
    });

    it("should not warn for browser runtime", () => {
        expect.assertions(1);

        const context = {
            logger,
            options: {
                emitCJS: true,
                rollup: {
                    esbuild: { target: ["node23"] },
                },
                runtime: "browser",
            },
            pkg: { engines: { node: ">=23" } },
        } as unknown as BuildContext<InternalBuildOptions>;

        warnLegacyCJS(context);

        expect(logger.warn).not.toHaveBeenCalled();
    });
});
