/**
 * Modified copy of https://github.com/webpack-contrib/sass-loader
 *
 * MIT License
 *
 * Copyright JS Foundation and other contributors
 */
import type { SyncOptions as NodeSassSyncOptions } from "node-sass";
import type { StringOptions as SassStringOptions } from "sass";
import type { StringOptions as SassEmbeddedStringOptions } from "sass-embedded";

import type { Environment } from "../../../../../types";

export type SassApiType = "legacy" | "modern" | "modern-compiler";

export type SassLoaderContext = {
    environment: Environment;
    resourcePath: string;
    rootContext: string;
};

export type SassLoaderOptions = {
    additionalData:
        | string
        | ((content: string | Buffer, loaderContext: SassLoaderContext) => string)
        | ((content: string | Buffer, loaderContext: SassLoaderContext) => Promise<string>);
    implementation?: "sass-embedded" | "sass" | "node-sass";
    warnRuleAsWarning?: boolean;
} & (
    | Omit<SassStringOptions<"sync">, "charset" | "indentedSyntax">
    | Omit<SassEmbeddedStringOptions<"sync">, "charset" | "indentedSyntax">
    | Omit<NodeSassSyncOptions, "data" | "sourceMapContents" | "sourceMapEmbed" | "sourceMapRoot" | "outFile">
);
