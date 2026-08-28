import type { BuildContext, BuildContextBuildAssetAndChunk, BuildContextBuildEntry } from "@visulima/packem-share/types";
import { bench, describe } from "vitest";

import type { BuildOutputItem } from "../src/utils/collect-build-entries";
import { collectBuildEntries } from "../src/utils/collect-build-entries";
import type { InternalBuildOptions } from "../src/types";

/**
 * Build a realistic rollup-style `write()` output: many entry chunks that each
 * import a slice of the other entry chunks. The hot path is the per-import
 * membership test against the set of entry-chunk fileNames.
 */
const makeOutput = (entryCount: number, importsPerEntry: number): BuildOutputItem[] => {
    const output: BuildOutputItem[] = [];

    for (let index = 0; index < entryCount; index += 1) {
        const imports: string[] = [];

        for (let import_ = 0; import_ < importsPerEntry; import_ += 1) {
            imports.push(`chunk-${(index + import_) % entryCount}.mjs`);
        }

        output.push({
            code: "export const x = 1;",
            dynamicImports: [],
            exports: ["x"],
            fileName: `chunk-${index}.mjs`,
            imports,
            isEntry: true,
            modules: { [`src/file-${index}.ts`]: { renderedLength: 32 } },
            type: "chunk",
        });
    }

    return output;
};

const makeContext = (): BuildContext<InternalBuildOptions> => ({ buildEntries: [] }) as unknown as BuildContext<InternalBuildOptions>;

// Baseline: the previous O(imports x chunks) `.some()` implementation.
const collectBuildEntriesBaseline = (
    output: BuildOutputItem[],
    context: BuildContext<InternalBuildOptions>,
    assets: Map<string, BuildContextBuildAssetAndChunk | BuildContextBuildEntry>,
): void => {
    const outputChunks = output.filter((item) => item.type === "chunk" && item.isEntry);

    for (const entry of outputChunks) {
        context.buildEntries.push({
            chunks: (entry.imports ?? []).filter((id) => outputChunks.some((c) => c.fileName === id)),
            dynamicImports: entry.dynamicImports ?? [],
            exports: entry.exports ?? [],
            modules: Object.entries(entry.modules ?? {}).map(([id, module_]) => ({ bytes: module_.renderedLength, id })),
            path: entry.fileName,
            size: { bytes: Buffer.byteLength(entry.code ?? "", "utf8") },
            type: "entry",
        });
    }
};

for (const [entryCount, importsPerEntry] of [
    [50, 10],
    [200, 20],
    [500, 30],
] as const) {
    describe(`collectBuildEntries (${entryCount} entries, ${importsPerEntry} imports/entry)`, () => {
        const output = makeOutput(entryCount, importsPerEntry);

        bench("before (.some scan)", () => {
            collectBuildEntriesBaseline(output, makeContext(), new Map());
        });

        bench("after (Set lookup)", () => {
            collectBuildEntries(output, makeContext(), new Map());
        });
    });
}
