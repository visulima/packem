import { fileURLToPath } from "node:url";

import { readFile } from "@visulima/fs";
import { dirname, extname } from "@visulima/path";
import { pathToFileURL } from "mlly";
import type { CanonicalizeContext, Importer, ImporterResult, Syntax } from "sass";

import { resolve } from "../../../utils/resolve";
import resolveSyntax from "../utils/resolve-syntax";

const extensions = [".scss", ".sass", ".css"];
const mainFields = ["sass", "style"];

const importer = async (resourcePath: string): Promise<Importer<"async">> => {
    return {
        async canonicalize(originalUrl: string, context: CanonicalizeContext) {
            const previous = context.containingUrl ? fileURLToPath(context.containingUrl.toString()) : resourcePath;

            let result;

            try {
                result = resolve([originalUrl], {
                    basedirs: [dirname(previous)],
                    caller: "Sass modern importer",
                    extensions,
                    mainFields
                });
            } catch {
                // If no stylesheets are found, the importer should return null.
                return null;
            }

            return new URL(pathToFileURL(result));
        },
        async load(canonicalUrl: URL): Promise<ImporterResult | null> {
            const extension = extname(canonicalUrl.pathname);

            const syntax: Syntax = extension ? (resolveSyntax(extension.toLowerCase()) ?? "scss") : "scss"; // Default syntax

            try {
                const contents = await readFile(canonicalUrl);

                return { contents: contents as string, sourceMapUrl: canonicalUrl, syntax };
            } catch {
                return null;
            }
        },
    };
};

export default importer;
