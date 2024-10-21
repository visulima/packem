import { fileURLToPath } from "node:url";

import { readFileSync } from "@visulima/fs";
import { dirname, extname } from "@visulima/path";
import { pathToFileURL } from "mlly";
import type { CanonicalizeContext, Importer, ImporterResult, Syntax } from "sass";

import { resolve } from "../../../utils/resolve";
import { getUrlOfPartial, normalizeUrl } from "../../../utils/url";
import resolveSyntax from "../utils/resolve-syntax";

const extensions = [".scss", ".sass", ".css"];
const mainFields = ["sass", "style"];

const importer = (resourcePath: string, debug: boolean): Importer<"sync"> => {
    return {
        canonicalize(originalUrl: string, context: CanonicalizeContext): URL | null {
            const previous = context.containingUrl ? fileURLToPath(context.containingUrl.toString()) : resourcePath;

            let result;

            const moduleUrl = normalizeUrl(originalUrl);
            const partialUrl = getUrlOfPartial(moduleUrl);

            try {
                result = resolve([partialUrl, moduleUrl], {
                    baseDirs: [dirname(previous)],
                    caller: "Sass modern importer",
                    extensions,
                    mainFields,
                });
            } catch {
                // If no stylesheets are found, the importer should return null.
                return null;
            }

            return new URL(pathToFileURL(result));
        },
        load(canonicalUrl: URL): ImporterResult | null {
            const extension = extname(canonicalUrl.pathname);

            const syntax: Syntax = extension ? (resolveSyntax(extension.toLowerCase()) ?? "scss") : "scss"; // Default syntax

            try {
                let contents = readFileSync(canonicalUrl);

                if (debug) {
                    contents = "/* " + canonicalUrl.pathname + " */\n" + contents;
                }

                return { contents: contents as string, sourceMapUrl: canonicalUrl, syntax };
            } catch {
                return null;
            }
        },
    };
};

export default importer;
