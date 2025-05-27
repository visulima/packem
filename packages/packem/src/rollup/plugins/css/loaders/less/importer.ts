import { readFileSync } from "@visulima/fs";
import { resolveAlias } from "@visulima/path/utils";

import type { ResolveOptions } from "../../utils/resolve";
import { resolve } from "../../utils/resolve";
import { getUrlOfPartial, normalizeUrl } from "../../utils/url";

const extensions = [".less", ".css"];

const getStylesFileManager = (less: LessStatic, aliases: Record<string, string>): Less.FileManager =>
    new class extends less.FileManager implements Less.FileManager {
        // eslint-disable-next-line class-methods-use-this
        public override supports(): boolean {
            return true;
        }

        // eslint-disable-next-line class-methods-use-this
        public override async loadFile(filename: string, fileDirectory: string, options: Less.Options): Promise<Less.FileLoadResult> {
            const url = normalizeUrl(resolveAlias(filename, aliases));
            const partialUrl = getUrlOfPartial(url);

            const resolveOptions: ResolveOptions & { baseDirs: string[] } = { baseDirs: [], caller: "Less importer", extensions };

            if (Array.isArray(options.paths)) {
                resolveOptions.baseDirs.push(...options.paths);
            }

            resolveOptions.baseDirs.push(fileDirectory);

            // Give precedence to importing a partial
            const id = resolve([partialUrl, url], resolveOptions);

            return { contents: readFileSync(id), filename: id };
        }
    }();

const importer = (alias: Record<string, string>): Less.Plugin => {
    return {
        install(less, pluginManager) {
            pluginManager.addFileManager(getStylesFileManager(less, alias));
        },
    };
};

export default importer;
