import { readFile } from "node:fs";
import { fileURLToPath } from "node:url";

import { dirname, extname } from "@visulima/path";
import { pathToFileURL } from "mlly";
import type { CanonicalizeContext, Importer, ImporterResult, Syntax } from "sass";

import { packageFilterBuilder, resolveAsync } from "../../../utils/resolve";

const extensions = [".scss", ".sass", ".css"];
const conditions = ["sass", "style"];

const importer = async (resourcePath: string): Promise<Importer<"async">> => {
    return {
        async canonicalize(originalUrl: string, context: CanonicalizeContext) {
            const previous = context.containingUrl ? fileURLToPath(context.containingUrl.toString()) : resourcePath;

            let result;

            try {
                result = await resolveAsync([originalUrl], {
                    basedirs: [dirname(previous)],
                    caller: "Sass modern importer",
                    extensions,
                    packageFilter: packageFilterBuilder({ conditions }),
                });
            } catch {
                // If no stylesheets are found, the importer should return null.
                return null;
            }

            return new URL(pathToFileURL(result));
        },
        async load(canonicalUrl: URL): Promise<ImporterResult | null> {
            const extension = extname(canonicalUrl.pathname);

            let syntax: Syntax = "scss"; // Default syntax

            if (extension && extension.toLowerCase() === ".scss") {
                syntax = "scss";
            } else if (extension && extension.toLowerCase() === ".sass") {
                syntax = "indented";
            } else if (extension && extension.toLowerCase() === ".css") {
                syntax = "css";
            }

            try {
                const contents = await new Promise((resolve, reject) => {
                    // eslint-disable-next-line security/detect-non-literal-fs-filename
                    readFile(canonicalUrl, "utf8", (error, content) => {
                        if (error) {
                            reject(error);
                            return;
                        }

                        resolve(content);
                    });
                });

                return { contents: contents as string, sourceMapUrl: canonicalUrl, syntax };
            } catch {
                return null;
            }
        },
    };
};

export default importer;
