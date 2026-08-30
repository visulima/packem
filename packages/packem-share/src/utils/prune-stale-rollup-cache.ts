import { isAccessibleSync } from "@visulima/fs";
import { isAbsolute } from "@visulima/path";
import type { RollupCache } from "rollup";

/**
 * The cache is read back as JSON written by an earlier build — possibly by an earlier
 * version of packem — so it is described here by what this function reads rather than
 * by rollup's live types, and every field is treated as optional.
 */
interface CachedResolution {
    external?: boolean | string;
    id?: string;
}

interface CachedModule {
    id?: string;
    resolvedIds?: Record<string, CachedResolution | null | undefined>;
}

/**
 * Whether a path names a file this build could load, and that file is gone. Virtual ids
 * (`\0`-prefixed), bare specifiers and anything non-absolute are left alone: they are
 * resolved by plugins rather than read off disk.
 */
const namesAFileThatIsGone = (id: string | undefined): boolean => {
    if (id === undefined || id.startsWith("\0") || !isAbsolute(id)) {
        return false;
    }

    const queryIndex = id.indexOf("?");

    return !isAccessibleSync(queryIndex === -1 ? id : id.slice(0, queryIndex));
};

const isStale = (module: CachedModule): boolean => {
    if (namesAFileThatIsGone(module.id)) {
        return true;
    }

    return Object.values(module.resolvedIds ?? {}).some((resolved) => {
        // Externals are not required to exist here — the consumer's runtime resolves them.
        if (!resolved || (resolved.external !== undefined && resolved.external !== false)) {
            return false;
        }

        return namesAFileThatIsGone(resolved.id);
    });
};

/**
 * Drops cached modules whose own file, or one of the files they resolved to, is gone.
 *
 * Rollup stores each module's resolved dependency ids in its cache and reuses them on
 * the next build instead of resolving again. A module that moves from `X.ts` to
 * `X/index.ts` keeps every importer's source identical — the specifier is still
 * `"./X"` — so nothing tells rollup to re-resolve, and it tries to load the file that
 * is no longer there:
 *
 * ```
 * Error: [cached(commonjs)] Could not load .../src/hash.ts: ENOENT
 * ```
 *
 * The path it names appears nowhere in the source, which is what makes this expensive
 * to debug. Dropping the affected modules costs them a re-resolve and a re-transform;
 * everything else still comes from the cache.
 * @param cache The rollup cache read back from disk, if there was one.
 * @returns The cache with stale modules removed, or the original object when nothing is stale.
 */
const pruneStaleRollupCache = (cache: RollupCache | undefined): RollupCache | undefined => {
    if (cache?.modules === undefined) {
        return cache;
    }

    const modules = cache.modules.filter((module) => !isStale(module as CachedModule));

    if (modules.length === cache.modules.length) {
        return cache;
    }

    return { ...cache, modules };
};

export default pruneStaleRollupCache;
