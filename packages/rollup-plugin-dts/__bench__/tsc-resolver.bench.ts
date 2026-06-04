import path from "node:path";

import ts from "typescript";
import { bench, describe } from "vitest";

import tscResolve from "../src/tsc/resolver";

// Realistic-ish raw tsconfig content as it would be passed through the plugin
// (already JSON-parsed). `parseJsonConfigFileContent` is the dominant per-call cost
// the memoization in `resolver.ts` eliminates.
const tsconfigRaw = {
    compilerOptions: {
        declaration: true,
        emitDeclarationOnly: true,
        esModuleInterop: true,
        module: "ESNext",
        moduleResolution: "Bundler",
        skipLibCheck: true,
        strict: true,
        target: "ESNext",
    },
};

const cwd = process.cwd();
const tsconfig = path.join(cwd, "tsconfig.json");
const importer = path.join(cwd, "src", "index.ts");
const baseDirectory = path.dirname(tsconfig);

// A handful of imports as you'd see scanned across many .d.ts modules.
const ids = ["typescript", "node:path", "./filename", "../src/options", "rollup"];

// Baseline: the pre-optimization hot path — re-parse the tsconfig on every resolve call.
const tscResolveNaive = (id: string): string | undefined => {
    const parsedConfig = ts.parseJsonConfigFileContent(tsconfigRaw, ts.sys, baseDirectory);
    const resolved = ts.bundlerModuleNameResolver(id, importer, parsedConfig.options, ts.sys, undefined, undefined);

    return resolved.resolvedModule?.resolvedFileName;
};

for (const moduleCount of [50, 200]) {
    describe(`tsc resolve phase (${moduleCount} modules x ${ids.length} imports)`, () => {
        const calls = moduleCount * ids.length;

        bench("before: parseJsonConfigFileContent per resolve", () => {
            for (let index = 0; index < calls; index++) {
                tscResolveNaive(ids[index % ids.length]!);
            }
        });

        bench("after: memoized parsed tsconfig (tscResolve)", () => {
            for (let index = 0; index < calls; index++) {
                tscResolve(ids[index % ids.length]!, importer, cwd, tsconfig, tsconfigRaw, undefined);
            }
        });
    });
}
