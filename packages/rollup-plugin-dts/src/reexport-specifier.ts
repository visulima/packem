import { readFileSync } from "node:fs";
import path from "node:path";

import { ResolverFactory } from "oxc-resolver";

import { RE_DTS } from "./filename";

// Fixes sxzz/rolldown-plugin-dts#227.
//
// When TypeScript synthesizes an import for a type it had to infer (i.e. the
// consumer never wrote the import by hand), it points the specifier at the
// symbol's *origin* package rather than at the dependency the consumer actually
// imports. Example: a consumer imports a value from `design-system`, whose
// declarations re-export a type from `inner-lib`. The inferred declaration ends
// up as `import("inner-lib").Foo`, even though the consumer depends on
// `design-system` and not on `inner-lib` — in a real (pnpm) install that origin
// specifier resolves to an unreachable deep path.
//
// This rewriter detects that pattern and points the specifier back at the
// re-exporting dependency the source file already imports. It is deliberately
// conservative: it only rewrites when exactly one imported dependency re-exports
// the referenced symbol *under the same name*, so it never invents an export a
// package does not actually provide.

interface ReexportInfo {
    /** `true` when the dependency re-exports everything (`export * from "X"`). */
    all: boolean;
    /** Origin names re-exported under the same name (`export { Foo } from "X"`). */
    names: Set<string>;
}

// Inline `import("X").Name` type references (the shape TS emits for inferred types).
const RE_INLINE_IMPORT = /\bimport\(\s*["']([^"']+)["']\s*\)\.(\w+)/g;
// `import <clause> "X"` statements. The clause is everything up to the first
// quote; greedy `[^'"]*` cannot cross a quote, so the match is bounded and the
// pattern has no overlapping quantifiers (no super-linear backtracking).
const RE_IMPORT_STATEMENT = /\bimport\b([^'"]*)["']([^"']+)["']/g;
// eslint-disable-next-line sonarjs/super-linear-regex -- `[^}]*` is bounded by the closing brace; linear, no backtracking
const RE_BRACED = /\{([^}]*)\}/;
// eslint-disable-next-line sonarjs/super-linear-regex -- two `\s+` separated by the literal `as`; no overlapping quantifiers
const RE_AS = /\s+as\s+/;
const RE_TYPE_PREFIX = /^type\s+/;
// `export * from "X"` (but not `export * as ns from "X"`, which only exposes a namespace).
const RE_EXPORT_STAR = /\bexport\s+\*\s+from\s*["']([^"']+)["']/g;
// `export { A, B as C } from "X"` / `export type { A } from "X"`.
const RE_EXPORT_NAMED = /\bexport\s+(?:type\s+)?\{([^}]*)\}\s*from\s*["']([^"']+)["']/g;

const isBareSpecifier = (specifier: string): boolean => specifier.length > 0 && !specifier.startsWith(".") && !path.isAbsolute(specifier);

// Collect the bare specifiers a file imports or re-exports from, together with
// the symbol names referenced for each. Covers top-level `from "X"` statements
// and inline `import("X").Name` type queries.
const collectReferencedSpecifiers = (code: string): Map<string, Set<string>> => {
    const result = new Map<string, Set<string>>();

    const add = (specifier: string, name?: string): void => {
        if (!isBareSpecifier(specifier)) {
            return;
        }

        let names = result.get(specifier);

        if (!names) {
            names = new Set<string>();
            result.set(specifier, names);
        }

        if (name) {
            names.add(name);
        }
    };

    let match: RegExpExecArray | null;

    RE_INLINE_IMPORT.lastIndex = 0;

    // eslint-disable-next-line no-cond-assign -- standard regex exec loop
    while ((match = RE_INLINE_IMPORT.exec(code))) {
        add(match[1], match[2]);
    }

    RE_IMPORT_STATEMENT.lastIndex = 0;

    // eslint-disable-next-line no-cond-assign -- standard regex exec loop
    while ((match = RE_IMPORT_STATEMENT.exec(code))) {
        const clause = match[1];
        const specifier = match[2];
        const braced = RE_BRACED.exec(clause);

        if (braced) {
            for (const part of braced[1].split(",")) {
                const local = part.trim().split(RE_AS).pop();

                if (local) {
                    add(specifier, local.replace(RE_TYPE_PREFIX, "").trim());
                }
            }
        } else {
            add(specifier);
        }
    }

    return result;
};

// Parse the re-export edges of a dependency's declaration text: which packages it
// re-exports from and which names it forwards under their original name.
const parseReexports = (code: string): Map<string, ReexportInfo> => {
    const result = new Map<string, ReexportInfo>();

    const get = (specifier: string): ReexportInfo => {
        let info = result.get(specifier);

        if (!info) {
            info = { all: false, names: new Set<string>() };
            result.set(specifier, info);
        }

        return info;
    };

    let match: RegExpExecArray | null;

    RE_EXPORT_STAR.lastIndex = 0;

    // eslint-disable-next-line no-cond-assign -- standard regex exec loop
    while ((match = RE_EXPORT_STAR.exec(code))) {
        get(match[1]).all = true;
    }

    RE_EXPORT_NAMED.lastIndex = 0;

    // eslint-disable-next-line no-cond-assign -- standard regex exec loop
    while ((match = RE_EXPORT_NAMED.exec(code))) {
        const info = get(match[2]);

        for (const part of match[1].split(",")) {
            const trimmed = part.trim().replace(RE_TYPE_PREFIX, "");

            if (!trimmed) {
                continue;
            }

            // Only forward names exported under their original name; a rename
            // (`A as B`) means the origin name `A` is not what the consumer sees,
            // so rewriting to this dependency would be incorrect.
            if (!RE_AS.test(trimmed)) {
                info.names.add(trimmed);
            }
        }
    }

    return result;
};

const replaceSpecifier = (code: string, from: string, to: string): string =>
    code
        .replaceAll(`import("${from}")`, `import("${to}")`)
        .replaceAll(`import('${from}')`, `import('${to}')`)
        .replaceAll(`from "${from}"`, `from "${to}"`)
        .replaceAll(`from '${from}'`, `from '${to}'`);

export type ReexportSpecifierRewriter = (dtsCode: string, sourceId: string, sourceCode: string) => string;

export const createReexportSpecifierRewriter = (tsconfig?: string): ReexportSpecifierRewriter => {
    const resolver = new ResolverFactory({
        conditionNames: ["types", "typings", "import", "require"],
        mainFields: ["types", "typings", "module", "main"],
        tsconfig: tsconfig ? { configFile: tsconfig, references: "auto" } : undefined,
    });

    // dependency `.d.ts` path -> its parsed re-export edges (parse once per file).
    const reexportCache = new Map<string, Map<string, ReexportInfo>>();
    // `${sourceDir}\0${specifier}` -> resolved `.d.ts` path (undefined when unresolved).
    const resolutionCache = new Map<string, string | undefined>();

    const resolveDts = (specifier: string, sourceId: string): string | undefined => {
        const key = `${path.dirname(sourceId)}\0${specifier}`;

        if (resolutionCache.has(key)) {
            return resolutionCache.get(key);
        }

        let resolved: string | undefined;

        try {
            const result = resolver.resolveDtsSync(sourceId, specifier);

            if (result.path && RE_DTS.test(result.path)) {
                resolved = result.path;
            }
        } catch {
            // Unresolved specifiers are cached as undefined and skipped.
        }

        resolutionCache.set(key, resolved);

        return resolved;
    };

    const getReexports = (specifier: string, sourceId: string): Map<string, ReexportInfo> | undefined => {
        const dtsPath = resolveDts(specifier, sourceId);

        if (!dtsPath) {
            return undefined;
        }

        let parsed = reexportCache.get(dtsPath);

        if (!parsed) {
            let text: string;

            try {
                text = readFileSync(dtsPath, "utf8");
            } catch {
                return undefined;
            }

            parsed = parseReexports(text);
            reexportCache.set(dtsPath, parsed);
        }

        return parsed;
    };

    return (dtsCode, sourceId, sourceCode) => {
        const dtsSpecifiers = collectReferencedSpecifiers(dtsCode);

        if (dtsSpecifiers.size === 0) {
            return dtsCode;
        }

        const sourceSpecifiers = collectReferencedSpecifiers(sourceCode);

        if (sourceSpecifiers.size === 0) {
            return dtsCode;
        }

        let result = dtsCode;

        for (const [origin, referencedNames] of dtsSpecifiers) {
            // Already pointing at a specifier the consumer imports — nothing to do.
            if (sourceSpecifiers.has(origin)) {
                continue;
            }

            const candidates: string[] = [];

            for (const dependency of sourceSpecifiers.keys()) {
                const reexports = getReexports(dependency, sourceId)?.get(origin);

                if (!reexports) {
                    continue;
                }

                // Every referenced name must be forwarded by this dependency under
                // the same name (or it re-exports everything). An inline reference
                // with no captured name (a plain top-level import) only needs the
                // origin link to exist.
                const forwardsAll = reexports.all || [...referencedNames].every((name) => reexports.names.has(name));

                if (forwardsAll) {
                    candidates.push(dependency);
                }
            }

            // Only rewrite when the re-exporting dependency is unambiguous.
            if (candidates.length === 1) {
                result = replaceSpecifier(result, origin, candidates[0]);
            }
        }

        return result;
    };
};
