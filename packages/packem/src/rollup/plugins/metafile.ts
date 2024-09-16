import { writeJsonSync } from "@visulima/fs";
import { resolve } from "@visulima/path";
import type { Plugin } from "rollup";

interface MetafileOptions {
    outDir: string;
    rootDir: string;
}

interface MetaInfo {
    source: string;
    target: string;
}

const metafilePlugin = (options: MetafileOptions): Plugin =>
    ({
        async buildEnd() {
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

            const outPath = resolve(options.rootDir, options.outDir, `graph.json`);

            writeJsonSync(outPath, deps);
        },
        name: "packem:metafile",
    }) as Plugin;

export default metafilePlugin;
