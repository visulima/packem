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

import type { Environment } from "@visulima/packem-share/types";

export type SassApiType = "legacy" | "modern-compiler" | "modern";

export type SassLoaderContext = {
    environment: Environment;
    resourcePath: string;
    rootContext: string;
};

export type SassLoaderOptions = (Omit<NodeSassSyncOptions, "data" | "sourceMapContents" | "sourceMapEmbed" | "sourceMapRoot" | "outFile"> | Omit<SassEmbeddedStringOptions<"sync">, "charset" | "indentedSyntax"> | Omit<SassStringOptions<"sync">, "charset" | "indentedSyntax">) & {
    additionalData:
        string | ((content: string | Buffer, loaderContext: SassLoaderContext) => Promise<string>) | ((content: string | Buffer, loaderContext: SassLoaderContext) => string);
    implementation?: "node-sass" | "sass-embedded" | "sass";
    warnRuleAsWarning?: boolean;
};
