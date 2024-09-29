import { dirname } from "@visulima/path";

import { packageFilterBuilder, resolveAsync, resolveSync } from "../../utils/resolve";
import { getUrlOfPartial, isModule, normalizeUrl } from "../../utils/url";

const extensions = [".scss", ".sass", ".css"];
const conditions = ["sass", "style"];

// eslint-disable-next-line @typescript-eslint/no-shadow
export const importer: sass.Importer = (url, importer, done): void => {
    const next = (): void => done(null);

    if (!isModule(url)) {
        next();
        return;
    }

    const moduleUrl = normalizeUrl(url);
    const partialUrl = getUrlOfPartial(moduleUrl);
    const options = {
        basedirs: [dirname(importer)],
        caller: "Sass importer",
        extensions,
        packageFilter: packageFilterBuilder({ conditions }),
    };

    // Give precedence to importing a partial
    resolveAsync([partialUrl, moduleUrl], options)
        .then((id: string): void => done({ file: id.replace(/\.css$/i, "") }))
        .catch(next);
};

// eslint-disable-next-line @typescript-eslint/no-shadow
export const importerSync: sass.Importer = (url, importer): sass.Data => {
    if (!isModule(url)) {
        return null;
    }

    const moduleUrl = normalizeUrl(url);
    const partialUrl = getUrlOfPartial(moduleUrl);
    const options = {
        basedirs: [dirname(importer)],
        caller: "Sass importer",
        extensions,
        packageFilter: packageFilterBuilder({ conditions }),
    };

    // Give precedence to importing a partial
    try {
        const id = resolveSync([partialUrl, moduleUrl], options);

        return { file: id.replace(/\.css$/i, "") };
    } catch {
        return null;
    }
};
