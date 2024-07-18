import { transform as swcTransform } from "@swc/core";

import type { IsolatedDeclarationsResult } from "../../../types";

const isolatedDeclarationsSwcPlugin = async (id: string, code: string): Promise<IsolatedDeclarationsResult> => {
    try {
        const result = await swcTransform(code, {
            filename: id,
            jsc: {
                experimental: {
                    emitIsolatedDts: true,
                },
                parser: {
                    syntax: "typescript",
                    tsx: false,
                },
            },
        });

        // @ts-expect-error
        const output = JSON.parse(result.output);

        return {
            errors: [],
            sourceText: (output as { __swc_isolated_declarations__: string }).__swc_isolated_declarations__,
        };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
        return {
            errors: [error.toString()],
            sourceText: "",
        };
    }
};

export default isolatedDeclarationsSwcPlugin;
