import { bench, describe } from "vitest";

import type { DtsMap, TsModule } from "../src/generate";

// Reproduces the tsc (non-eager) load hot path: per `.d.ts` load, the entries list
// is needed. The pre-optimization code rebuilt it from the whole `dtsMap` on every
// load (`[...dtsMap.values()].filter(v => v.isEntry).map(v => v.id)`) — O(n) per load,
// O(n^2) across the build. The optimization maintains a `Set<string>` of entry ids
// updated only when the transform hook registers an entry, making each load O(1).

const buildFixture = (moduleCount: number): { dtsMap: DtsMap; entryIds: Set<string> } => {
    const dtsMap: DtsMap = new Map<string, TsModule>();
    const entryIds = new Set<string>();

    for (let index = 0; index < moduleCount; index++) {
        const id = `/project/src/module-${index}.ts`;
        const dtsId = `/project/src/module-${index}.d.ts`;
        // ~25% of modules are entries, matching a typical multi-entry monorepo package.
        const isEntry = index % 4 === 0;

        dtsMap.set(dtsId, { code: "export const x = 1;", id, isEntry, jsFile: false });

        if (isEntry) {
            entryIds.add(id);
        }
    }

    return { dtsMap, entryIds };
};

// Old per-load recompute.
const recomputeEntries = (dtsMap: DtsMap): string[] => [...dtsMap.values()].filter((value) => value.isEntry).map((value) => value.id);

// New per-load read of the maintained set.
const readEntries = (entryIds: Set<string>): string[] => [...entryIds];

for (const moduleCount of [100, 500]) {
    describe(`tsc load entries (${moduleCount} modules, one load per module)`, () => {
        const { dtsMap, entryIds } = buildFixture(moduleCount);

        bench("before: recompute entries from dtsMap per load (O(n^2))", () => {
            for (let index = 0; index < moduleCount; index++) {
                recomputeEntries(dtsMap);
            }
        });

        bench("after: read maintained entryIds Set per load (O(n))", () => {
            for (let index = 0; index < moduleCount; index++) {
                readEntries(entryIds);
            }
        });
    });
}
