import { readFileSync } from "@visulima/fs";

import { resolve } from "../../utils/resolve";
import { getUrlOfPartial, normalizeUrl } from "../../utils/url";

const extensions = [".less", ".css"];

const getStylesFileManager = (less: LessStatic, cwd: string): Less.FileManager =>
    new (class extends less.FileManager implements Less.FileManager {
        // eslint-disable-next-line class-methods-use-this
        public override supports(): boolean {
            return true;
        }

        // eslint-disable-next-line class-methods-use-this
        public override async loadFile(filename: string, filedir: string, options_: Less.Options): Promise<Less.FileLoadResult> {
            const url = normalizeUrl(filename);
            const partialUrl = getUrlOfPartial(url);

            const options = { basedirs: [cwd, filedir], caller: "Less importer", extensions };

            if (options_.paths) {
                options.basedirs.push(...options_.paths);
            }

            // Give precedence to importing a partial
            const id = resolve([partialUrl, url], options);

            return { contents: readFileSync(id), filename: id };
        }
    })();

const importer: (cwd: string) => Less.Plugin = (cwd: string) => {
    return {
        install(less, pluginManager) {
            pluginManager.addFileManager(getStylesFileManager(less, cwd));
        },
    };
};

export default importer;
