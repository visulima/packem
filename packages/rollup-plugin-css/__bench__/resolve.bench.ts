import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { ResolverFactory } from "oxc-resolver";
import { bench, describe } from "vitest";

import { resolve } from "../src/utils/resolve";

const here = dirname(fileURLToPath(import.meta.url));
const extensions = [".mjs", ".js", ".cjs", ".json"];

// Resolve real installed dependencies from the package's src directory. Each
// invocation in the "before" variant must reconstruct the native oxc engine,
// while the "after" variant (the real exported resolve) reuses a memoized one.
const ids = ["@visulima/path"];
const baseDirs = [join(here, "..", "src")];

// Baseline: construct a fresh ResolverFactory on every resolution, mirroring
// the pre-optimization behavior of resolve().
const resolveFreshFactory = (): string => {
    const resolver = new ResolverFactory({ extensions, symlinks: true });

    for (const basedir of baseDirs) {
        for (const id of ids) {
            const { path } = resolver.sync(basedir, id);

            if (path) {
                return path;
            }
        }
    }

    throw new Error("could not resolve");
};

describe("resolve - ResolverFactory reuse", () => {
    bench("before: new ResolverFactory per call", () => {
        resolveFreshFactory();
    });

    bench("after: memoized ResolverFactory (real resolve)", () => {
        resolve(ids, { baseDirs, extensions });
    });
});
