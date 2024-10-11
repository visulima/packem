import { dirname, isAbsolute } from "@visulima/path";
import { isRelative } from "@visulima/path/utils";
import type { ImporterReturnType } from "node-sass";

import type { ResolveOptions } from "../../../utils/resolve";
import { resolve } from "../../../utils/resolve";
import { getUrlOfPartial, hasModuleSpecifier, normalizeUrl } from "../../../utils/url";

const extensions = [".scss", ".sass", ".css"];
const mainFields = ["sass", "style"];

/**
 * The exact behavior of importers defined here differ slightly between dart-sass and node-sass:
 * https://github.com/sass/dart-sass/issues/574
 *
 * In short, dart-sass specifies that the *correct* behavior is to only call importers when a
 * stylesheet fails to resolve via relative path. Since these importers below are implementation-
 * agnostic, the first attempt to resolve a file by a relative is unneeded in dart-sass and can be
 * removed once support for node-sass is fully deprecated.
 */
const importerImpl = <T extends (ids: string[], userOptions: ResolveOptions) => unknown>(url: string, importer: string, resolver: T): ReturnType<T> => {
    const candidates: string[] = [];
    const normalizedUrl = normalizeUrl(url);

    // Always add partial and full URL as candidates
    candidates.push(getUrlOfPartial(normalizedUrl), normalizedUrl);

    // Add module import candidates if necessary
    if (!hasModuleSpecifier(url) && !isAbsolute(url) && !isRelative(url)) {
        const moduleUrl = normalizeUrl(`~${url}`);

        candidates.push(getUrlOfPartial(moduleUrl), moduleUrl);
    }

    const options = {
        baseDirs: [dirname(importer)],
        caller: "Sass importer",
        extensions,
        mainFields,
    };

    return resolver(candidates, options) as ReturnType<T>;
};

const finalize = (id: string): ImporterReturnType => {
    return { file: id.replace(/\.css$/i, "") };
};

const importer: (url: string, previousImporter: string) => ImporterReturnType | null = (url: string, previousImporter: string): ImporterReturnType | null => {
    try {
        return finalize(importerImpl(url, previousImporter, resolve));
    } catch {
        return null;
    }
};

export default importer;
