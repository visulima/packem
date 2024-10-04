import { dirname } from "@visulima/path";
import type { ImporterReturnType } from "node-sass";

import { isAbsolutePath, isRelativePath } from "../../../utils/path";
import type { ResolveOptions } from "../../../utils/resolve";
import { packageFilterBuilder, resolveSync } from "../../../utils/resolve";
import { getUrlOfPartial, hasModuleSpecifier, normalizeUrl } from "../../../utils/url";

const extensions = [".scss", ".sass", ".css"];
const conditions = ["sass", "style"];

/**
 * The exact behavior of importers defined here differ slightly between dart-sass and node-sass:
 * https://github.com/sass/dart-sass/issues/574
 *
 * In short, dart-sass specifies that the *correct* behavior is to only call importers when a
 * stylesheet fails to resolve via relative path. Since these importers below are implementation-
 * agnostic, the first attempt to resolve a file by a relative is unneeded in dart-sass and can be
 * removed once support for node-sass is fully deprecated.
 */
const importerImpl = <T extends (ids: string[], userOptions: ResolveOptions) => unknown>(url: string, importer: string, resolve: T): ReturnType<T> => {
    const candidates: string[] = [];

    if (hasModuleSpecifier(url)) {
        const moduleUrl = normalizeUrl(url);
        // Give precedence to importing a partial
        candidates.push(getUrlOfPartial(moduleUrl), moduleUrl);
    } else {
        const relativeUrl = normalizeUrl(url);
        candidates.push(getUrlOfPartial(relativeUrl), relativeUrl);

        // fall back to module imports
        if (!isAbsolutePath(url) && !isRelativePath(url)) {
            const moduleUrl = normalizeUrl(`~${url}`);
            candidates.push(getUrlOfPartial(moduleUrl), moduleUrl);
        }
    }

    const options = {
        basedirs: [dirname(importer)],
        caller: "Sass importer",
        extensions,
        packageFilter: packageFilterBuilder({ conditions }),
    };

    return resolve(candidates, options) as ReturnType<T>;
};

const finalize = (id: string): ImporterReturnType => {
    return { file: id.replace(/\.css$/i, "") };
};

const importer: (url: string, previousImporter: string) => ImporterReturnType | null = (url: string, previousImporter: string): ImporterReturnType | null => {
    try {
        return finalize(importerImpl(url, previousImporter, resolveSync));
    } catch {
        return null;
    }
};

export default importer;
