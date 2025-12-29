/**
 * Modified copy of https://github.com/webpack-contrib/sass-loader
 *
 * MIT License
 *
 * Copyright JS Foundation and other contributors
 */
import type { Environment } from "@visulima/packem-share/types";
import type { StringOptions as SassStringOptions } from "sass";
import type { StringOptions as SassEmbeddedStringOptions } from "sass-embedded";

export type SassLoaderContext = {
    environment: Environment;
    resourcePath: string;
    rootContext: string;
};

export type SassLoaderOptions = (Omit<SassEmbeddedStringOptions<"sync">, "charset" | "indentedSyntax"> | Omit<SassStringOptions<"sync">, "charset" | "indentedSyntax">) & {
    additionalData:
        | string
        | ((content: string | Buffer, loaderContext: SassLoaderContext) => Promise<string>)
        | ((content: string | Buffer, loaderContext: SassLoaderContext) => string);
    implementation?: "sass-embedded" | "sass";
    warnRuleAsWarning?: boolean;
};
