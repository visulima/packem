import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { BuildContext } from "@visulima/packem-share/types";
import { beforeAll, describe, expect, it } from "vitest";

import { computeDtsResolve } from "../../../src/rollup/get-rollup-options";
import type { InternalBuildOptions } from "../../../src/types";

const SCOPE_REGEX = /^@scope\//;

// `isTypesOnlyPackage` reads the real manifest under `<rootDir>/node_modules/<name>`,
// so the fixtures have to exist on disk. `type-fest` and `@scope/tooling` ship
// declarations only; `typescript` and `react` have a runtime entry and stand in for the
// heavyweight build tooling that must stay external.
const rootDirectory = mkdtempSync(join(tmpdir(), "packem-dts-resolve-"));

const writeManifest = (name: string, manifest: Record<string, unknown>): void => {
    const directory = join(rootDirectory, "node_modules", name);

    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, "package.json"), JSON.stringify({ name, version: "1.0.0", ...manifest }));
};

const writeFixtureManifests = (): void => {
    writeManifest("type-fest", { exports: { ".": { types: "./index.d.ts" } }, types: "./index.d.ts" });
    writeManifest("@scope/tooling", { exports: { ".": { types: "./index.d.ts" } } });
    // Two of them, so a stateful /g pattern that skips the first can be caught skipping
    // the second — one alone would pass whether or not `lastIndex` is handled.
    writeManifest("@scope/a-tooling", { exports: { ".": { types: "./index.d.ts" } } });
    writeManifest("@scope/b-tooling", { exports: { ".": { types: "./index.d.ts" } } });
    writeManifest("typescript", { exports: { ".": { default: "./lib/typescript.js", types: "./lib/typescript.d.ts" } }, main: "./lib/typescript.js" });
    writeManifest("react", { exports: { ".": { default: "./index.js", types: "./index.d.ts" } }, main: "./index.js" });
    writeManifest("defu", { exports: { ".": { import: "./dist/defu.mjs", types: "./dist/defu.d.ts" } } });
    // The @types/* shape: a top-level `types` and no `exports` map at all.
    writeManifest("@types/legacy", { types: "./index.d.ts" });
    // Same, via the older `typings` alias.
    writeManifest("legacy-typings", { typings: "./index.d.ts" });
    // No `exports`, but a `main` — a runtime package that merely ships its own types.
    writeManifest("legacy-runtime", { main: "./index.js", types: "./index.d.ts" });
};

interface ContextShape {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    externalizeDevDeps?: boolean;
    externals?: (RegExp | string)[];
    optionalDependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
    peerDependenciesMeta?: Record<string, { optional?: boolean }>;
    resolve?: boolean | (RegExp | string)[];
    used?: string[];
}

const createContext = ({
    dependencies,
    devDependencies,
    externalizeDevDeps,
    externals,
    optionalDependencies,
    peerDependencies,
    peerDependenciesMeta,
    resolve,
    used,
}: ContextShape): BuildContext<InternalBuildOptions> =>
    ({
        // `externals` is non-optional on InternalBuildOptions, so default it here rather
        // than making the production code re-guard what its own type already promises.
        options: { externals: externals ?? [], rollup: { dts: { resolve }, resolveExternals: { devDeps: externalizeDevDeps } }, rootDir: rootDirectory },
        pkg: { dependencies, devDependencies, optionalDependencies, peerDependencies, peerDependenciesMeta },
        usedDependencies: new Set(used),
    }) as unknown as BuildContext<InternalBuildOptions>;

describe(computeDtsResolve, () => {
    beforeAll(writeFixtureManifests);

    it("keeps every dependency external when the user disables resolution", () => {
        expect.assertions(1);

        expect(computeDtsResolve(createContext({ optionalDependencies: { foo: "1.0.0" }, resolve: false }))).toBe(false);
    });

    it("merges the user's patterns with the auto-detected ones", () => {
        expect.assertions(1);

        const resolved = computeDtsResolve(
            createContext({
                optionalDependencies: { "auto-inlined": "1.0.0" },
                resolve: ["asked-for"],
            }),
        );

        expect(resolved).toStrictEqual(["auto-inlined", "asked-for"]);
    });

    it("drops a package the user excluded with `!`, and the marker itself", () => {
        expect.assertions(1);

        // typedoc's declarations re-export through `#node-utils`, a subpath import
        // private to its package: inlining them emits a specifier that resolves
        // nowhere for a consumer. Excluding it has to survive auto-detection adding
        // it back as an optional peer.
        const resolved = computeDtsResolve(
            createContext({
                peerDependencies: { typedoc: ">=0.28.0" },
                peerDependenciesMeta: { typedoc: { optional: true } },
                resolve: ["wanted", "!typedoc"],
            }),
        );

        expect(resolved).toStrictEqual(["wanted"]);
    });

    it("leaves regular expression patterns alone while excluding by name", () => {
        expect.assertions(1);

        const pattern = SCOPE_REGEX;
        const resolved = computeDtsResolve(
            createContext({
                optionalDependencies: { excluded: "1.0.0" },
                resolve: [pattern, "!excluded"],
            }),
        );

        expect(resolved).toStrictEqual([pattern]);
    });

    // A types-only devDep is imported purely in type position, so the TS transform
    // erases it before the JS build builds a module graph and it never lands in
    // `usedDependencies`. Gating on that set made this — the one leak that is always
    // broken for consumers, who never install a devDep — the one leak we could not see.
    it("inlines a types-only devDependency the JS build never saw", () => {
        expect.assertions(1);

        const resolved = computeDtsResolve(
            createContext({
                devDependencies: { "type-fest": "4.0.0" },
                used: [],
            }),
        );

        expect(resolved).toStrictEqual(["type-fest"]);
    });

    it("keeps a devDependency external when it is also a peerDependency", () => {
        expect.assertions(1);

        // The JS build externalizes peer deps because the consumer provides the
        // runtime, so the .d.ts has to match. Listing it in devDependencies too is
        // just how the package installs it for its own development.
        const resolved = computeDtsResolve(
            createContext({
                devDependencies: { react: "19.0.0", "type-fest": "4.0.0" },
                peerDependencies: { react: ">=18" },
            }),
        );

        expect(resolved).toStrictEqual(["type-fest"]);
    });

    it("keeps a devDependency external when it is also a runtime dependency", () => {
        expect.assertions(1);

        // Consumers install it transitively, so the import resolves for them.
        const resolved = computeDtsResolve(
            createContext({
                dependencies: { defu: "6.1.5" },
                devDependencies: { defu: "6.1.5", "type-fest": "4.0.0" },
            }),
        );

        expect(resolved).toStrictEqual(["type-fest"]);
    });

    it("leaves devDependencies alone when the user externalizes them", () => {
        expect.assertions(1);

        const resolved = computeDtsResolve(
            createContext({
                devDependencies: { "type-fest": "4.0.0" },
                externalizeDevDeps: true,
            }),
        );

        expect(resolved).toBe(false);
    });

    // The perf half of the rule. `typescript` is a devDep of nearly every project and
    // carries an enormous declaration set; inlining it whenever it is reachable from an
    // exported type cost 2-5x DTS build time on this repo's own fixtures. It has a
    // runtime entry, so a consumer who genuinely needs it can resolve it.
    it("keeps a devDependency with a runtime entry external when the JS build never used it", () => {
        expect.assertions(1);

        expect(computeDtsResolve(createContext({ devDependencies: { typescript: "6.0.0" }, used: [] }))).toBe(false);
    });

    it("still inlines a devDependency with a runtime entry that the JS build bundled", () => {
        expect.assertions(1);

        // Unchanged behaviour: the .d.ts has to match what the .js actually inlined.
        const resolved = computeDtsResolve(
            createContext({
                devDependencies: { typescript: "6.0.0" },
                used: ["typescript"],
            }),
        );

        expect(resolved).toStrictEqual(["typescript"]);
    });

    // `externals` is how a user keeps a package out of both the bundled code and the
    // emitted types. Auto-detection has to skip those names: the externals plugin folds
    // the DTS resolve list into its `exclude` set, so auto-inlining a package the user
    // externalized would override the very entry they added to externalize it.
    it("skips a devDependency the user listed in `externals`", () => {
        expect.assertions(1);

        const resolved = computeDtsResolve(
            createContext({
                devDependencies: { "@scope/tooling": "1.0.0", "type-fest": "4.0.0" },
                externals: ["@scope/tooling"],
            }),
        );

        expect(resolved).toStrictEqual(["type-fest"]);
    });

    it("skips a devDependency matched by a regular expression in `externals`", () => {
        expect.assertions(1);

        const resolved = computeDtsResolve(
            createContext({
                devDependencies: { "@scope/tooling": "1.0.0", "type-fest": "4.0.0" },
                externals: [SCOPE_REGEX],
            }),
        );

        expect(resolved).toStrictEqual(["type-fest"]);
    });

    // Most @types/* packages predate `exports` and declare only a top-level `types`.
    // Requiring an `exports` map would have missed the very packages this detection
    // exists for.
    it("inlines a types-only devDependency that has no `exports` map", () => {
        expect.assertions(1);

        const resolved = computeDtsResolve(
            createContext({
                devDependencies: { "@types/legacy": "1.0.0", "legacy-typings": "1.0.0" },
            }),
        );

        expect(resolved).toStrictEqual(["@types/legacy", "legacy-typings"]);
    });

    it("keeps a devDependency with `main` and no `exports` external", () => {
        expect.assertions(1);

        // Shipping its own types does not make a runtime package types-only.
        expect(computeDtsResolve(createContext({ devDependencies: { "legacy-runtime": "1.0.0" } }))).toBe(false);
    });

    // `test` advances `lastIndex` on a global regex and resumes from there next call, so
    // a shared /g pattern would match the first devDep and then miss later ones —
    // auto-inlining packages the user had externalized.
    it("applies a global regular expression in `externals` to every devDependency", () => {
        expect.assertions(1);

        const resolved = computeDtsResolve(
            createContext({
                devDependencies: { "@scope/a-tooling": "1.0.0", "@scope/b-tooling": "1.0.0", "type-fest": "4.0.0" },
                externals: [/^@scope\//g],
            }),
        );

        expect(resolved).toStrictEqual(["type-fest"]);
    });

    it("lets `!name` drop an auto-detected devDependency", () => {
        expect.assertions(1);

        const resolved = computeDtsResolve(
            createContext({
                devDependencies: { "@scope/tooling": "1.0.0", "type-fest": "4.0.0" },
                resolve: ["!@scope/tooling"],
            }),
        );

        expect(resolved).toStrictEqual(["type-fest"]);
    });
});
