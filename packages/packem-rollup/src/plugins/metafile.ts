import { ENDING_REGEX } from "@visulima/packem-share";
import type { OutputBundle, OutputOptions, Plugin } from "rollup";

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

                if (moduleInfo != undefined && !moduleInfo.isExternal) {
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
                fileName: `metafile-${(outputBundleKeys[0] as string).replace(ENDING_REGEX, "")}-${outputOptions.format}.json`,
                source: JSON.stringify(deps, undefined, 2),
                type: "asset",
            });
        },
        name: "packem:metafile",
    }) as Plugin;

export default metafilePlugin;
