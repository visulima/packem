import { readFileSync } from "node:fs";

import { resolveAsync } from "../../utils/resolve";
import { getUrlOfPartial, normalizeUrl } from "../../utils/url";

const extensions = [".less", ".css"];

const getStylesFileManager = (less: LessStatic): Less.FileManager =>
    new (class extends less.FileManager implements Less.FileManager {
        // eslint-disable-next-line class-methods-use-this
        public override supports(): boolean {
            return true;
        }

        // eslint-disable-next-line class-methods-use-this
        public override async loadFile(filename: string, filedir: string, options_: Less.Options): Promise<Less.FileLoadResult> {
            const url = normalizeUrl(filename);
            const partialUrl = getUrlOfPartial(url);
            const options = { basedirs: [filedir], caller: "Less importer", extensions };

            if (options_.paths) {
                options.basedirs.push(...options_.paths);
            }

            // Give precedence to importing a partial
            const id = await resolveAsync([partialUrl, url], options);

            // eslint-disable-next-line security/detect-non-literal-fs-filename
            return { contents: readFileSync(id, "utf8"), filename: id };
        }
    })();

const importer: Less.Plugin = {
    install(less, pluginManager) {
        pluginManager.addFileManager(getStylesFileManager(less));
    },
};

export default importer;
