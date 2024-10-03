import { dirname } from "@visulima/path";

import { isAbsolutePath, isRelativePath } from "../../utils/path";
import type { ResolveOptions } from "../../utils/resolve";
import { packageFilterBuilder, resolveAsync, resolveSync } from "../../utils/resolve";
import { getUrlOfPartial, hasModuleSpecifier, normalizeUrl } from "../../utils/url";

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

const finalize = (id: string): sass.Data => {
    return { file: id.replace(/\.css$/i, "") };
};

export const importer: sass.Importer = (url, previous, done): void => {
    importerImpl(url, previous, resolveAsync)
        // eslint-disable-next-line promise/no-callback-in-promise
        .then((id) => done(finalize(id)))
        // eslint-disable-next-line promise/no-callback-in-promise
        .catch(() => done(null));
};

export const importerSync: sass.Importer = (url, previous): sass.Data => {
    try {
        return finalize(importerImpl(url, previous, resolveSync));
    } catch {
        return null;
    }
};
