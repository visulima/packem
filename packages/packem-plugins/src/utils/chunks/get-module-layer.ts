/* eslint-disable no-secrets/no-secrets */

/**
 * Modified copy of https://github.com/huozhi/bunchee/blob/3cb85160bbad3af229654cc09d6fcd67120fe8bd/src/lib/split-chunk.ts
 *
 * The MIT License (MIT)
 *
 * Copyright (c) 2018 these people -> https://github.com/huozhi/bunchee/graphs/contributors
 */
import type { CustomPluginOptions } from "rollup";

const USE_PREFIX_REGEX = /^use /;

interface PreserveDirectivesMeta {
    directives: string[];
}

const getModuleLayer = (moduleMeta: CustomPluginOptions): string | undefined => {
    const preserveDirectives = (moduleMeta.preserveDirectives as PreserveDirectivesMeta | undefined) ?? { directives: [] };

    return preserveDirectives.directives.map((d: string) => d.replace(USE_PREFIX_REGEX, "")).find((d: string) => d !== "strict");
};

export default getModuleLayer;
