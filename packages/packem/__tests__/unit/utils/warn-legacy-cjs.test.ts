import { describe, expect, it, vi, beforeEach } from "vitest";

import warnLegacyCJS from "../../../src/utils/warn-legacy-cjs";
import type { BuildContext } from "@visulima/packem-share/types";

describe(warnLegacyCJS, () => {
    let logger: { warn: ReturnType<typeof vi.fn>; info: ReturnType<typeof vi.fn>; debug: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };

    beforeEach(() => {
        logger = { warn: vi.fn(), info: vi.fn(), debug: vi.fn(), error: vi.fn() };
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
        } as unknown as BuildContext<any>;

        warnLegacyCJS(context);

        expect(logger.warn).toHaveBeenCalled();
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
        } as unknown as BuildContext<any>;

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
        } as unknown as BuildContext<any>;

        warnLegacyCJS(context);

        expect(logger.warn).not.toHaveBeenCalled();
    });
});





