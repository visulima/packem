import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

import type { PackageJson } from "@visulima/package";
import { describe, expect, it } from "vitest";

import packemManifest from "../../package.json";

const require = createRequire(import.meta.url);

/**
 * Reads an installed manifest rather than the workspace source, so the optional
 * platform bindings a package publishes are visible even when they are not
 * spelled out in the repo. Falls back to walking up from the resolved entry for
 * the packages whose `exports` map hides `./package.json`.
 */
const readInstalledManifest = (name: string): PackageJson => {
    try {
        return require(`${name}/package.json`) as PackageJson;
    } catch {
        // continue below
    }

    let directory: string;

    try {
        directory = dirname(require.resolve(name));
    } catch {
        return {};
    }

    for (let current = directory; ;) {
        const manifestPath = join(current, "package.json");

        if (existsSync(manifestPath)) {
            const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as PackageJson;

            if (manifest.name === name) {
                return manifest;
            }
        }

        const parent = dirname(current);

        if (parent === current) {
            return {};
        }

        current = parent;
    }
};

/**
 * A package ships prebuilt native code when its platform binaries hang off
 * `optionalDependencies` — the NAPI convention (`@oxc-transform/binding-darwin-arm64`,
 * `@swc/core-linux-x64-gnu`, …).
 */
const shipsNativeBindings = (name: string): boolean =>
    Object.keys(readInstalledManifest(name).optionalDependencies ?? {}).some((binding) => /binding|napi|^@swc\/core-/.test(binding));

describe("inlined workspace packages", () => {
    // dependencies and peerDependencies are what the externals plugin reads, so
    // anything listed there stays an external import. A workspace package that
    // appears only in devDependencies is bundled into our own dist instead.
    const declared = new Set([...Object.keys(packemManifest.dependencies), ...Object.keys(packemManifest.peerDependencies)]);
    const inlined = Object.keys(packemManifest.devDependencies).filter((name) => name.startsWith("@visulima/packem-") && !declared.has(name));

    it.each(inlined)("%s does not hand us a native dependency we fail to declare", (name) => {
        expect.assertions(1);

        const undeclared = Object.keys(readInstalledManifest(name).dependencies ?? {})
            .filter((dependency) => !declared.has(dependency))
            .filter((dependency) => shipsNativeBindings(dependency));

        // Inlining copies the dependency's own loader into our dist, where
        // `require("@scope/binding-<platform>")` resolves against packem instead of
        // against the package that owns it — which only works when the installer
        // happens to hoist. Declaring it keeps the import external.
        expect(undeclared).toStrictEqual([]);
    });
});
