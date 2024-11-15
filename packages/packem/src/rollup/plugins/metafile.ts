import type { OutputBundle, OutputOptions, Plugin } from "rollup";
import {  } from "@visulima/fs/utils";
import { ENDING_RE } from "../../constants";

interface MetaInfo {
    source: string;
    target: string;
}

const metafilePlugin = (): Plugin =>
    ({
        async generateBundle(outputOptions: OutputOptions, outputBundle: OutputBundle) {
            const deps: MetaInfo[] = [];

            for (const id of this.getModuleIds()) {
                const moduleInfo = this.getModuleInfo(id);

                if (moduleInfo != null && !moduleInfo.isExternal) {
                    for (const target of moduleInfo.importedIds) {
                        deps.push({
                            source: id,
                            target,
                        });
                    }
                }
            }

            if (Array.isArray(deps) && deps.length === 0) {
                return;
            }

            const outputBundleKeys = Object.keys(outputBundle);

            this.emitFile({
                // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
                fileName: `metafile-${(outputBundleKeys[0] as string).replace(ENDING_RE, "")}-${outputOptions.format}.json`,
                source: JSON.stringify(deps, null, 2),
                type: "asset",
            });
        },
        name: "packem:metafile",
    }) as Plugin;

export default metafilePlugin;
