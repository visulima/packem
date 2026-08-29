import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";

import { join } from "@visulima/path";
import type { ModuleJSON, RollupCache } from "rollup";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import pruneStaleRollupCache from "../../../src/utils/prune-stale-rollup-cache";

const moduleWith = (id: string, resolvedIds: ModuleJSON["resolvedIds"] = {}): ModuleJSON => ({ id, resolvedIds }) as ModuleJSON;

const resolved = (id: string, external = false): ModuleJSON["resolvedIds"][string] => ({ external, id }) as ModuleJSON["resolvedIds"][string];

describe("pruneStaleRollupCache", () => {
    let temporaryDirectoryPath: string;
    let presentFile: string;

    beforeEach(async () => {
        temporaryDirectoryPath = await mkdtemp(join(tmpdir(), "packem-prune-"));
        presentFile = join(temporaryDirectoryPath, "present.ts");

        await writeFile(presentFile, "export const value = 1;");
    });

    afterEach(async () => {
        await rm(temporaryDirectoryPath, { recursive: true });
    });

    it("should return the cache unchanged when every module and resolution is still on disk", () => {
        expect.assertions(1);

        const cache = { modules: [moduleWith(presentFile, { "./present": resolved(presentFile) })] } as RollupCache;

        expect(pruneStaleRollupCache(cache)).toBe(cache);
    });

    it("should drop a module whose resolution points at a file that is gone", () => {
        expect.assertions(2);

        const missing = join(temporaryDirectoryPath, "hash.ts");
        const importer = moduleWith(presentFile, { "./hash": resolved(missing) });

        const pruned = pruneStaleRollupCache({ modules: [importer] });

        expect(pruned?.modules).toHaveLength(0);
        expect(pruned?.modules).not.toContain(importer);
    });

    it("should drop a module whose own file is gone", () => {
        expect.assertions(1);

        const cache = { modules: [moduleWith(join(temporaryDirectoryPath, "hash.ts"))] } as RollupCache;

        expect(pruneStaleRollupCache(cache)?.modules).toHaveLength(0);
    });

    it("should keep virtual, bare and external resolutions, which name no file here", () => {
        expect.assertions(1);

        const cache = {
            modules: [
                moduleWith("\0virtual:entry"),
                moduleWith(presentFile, {
                    "\0helper": resolved("\0helper"),
                    lodash: resolved("lodash", true),
                    react: resolved(join(temporaryDirectoryPath, "node_modules", "react", "index.js"), true),
                }),
            ],
        } as RollupCache;

        expect(pruneStaleRollupCache(cache)).toBe(cache);
    });

    it("should ignore a query suffix when checking a resolution", () => {
        expect.assertions(2);

        const withQuery = { modules: [moduleWith(presentFile, { "./present?raw": resolved(`${presentFile}?raw`) })] } as RollupCache;
        const missingWithQuery = {
            modules: [moduleWith(presentFile, { "./gone?raw": resolved(`${join(temporaryDirectoryPath, "gone.ts")}?raw`) })],
        } as RollupCache;

        expect(pruneStaleRollupCache(withQuery)).toBe(withQuery);
        expect(pruneStaleRollupCache(missingWithQuery)?.modules).toHaveLength(0);
    });

    it("should pass through a cache that was never written", () => {
        expect.assertions(1);

        expect(pruneStaleRollupCache(undefined)).toBeUndefined();
    });
});
