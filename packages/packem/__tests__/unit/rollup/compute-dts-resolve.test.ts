import type { BuildContext } from "@visulima/packem-share/types";
import { describe, expect, it } from "vitest";

import { computeDtsResolve } from "../../../src/rollup/get-rollup-options";
import type { InternalBuildOptions } from "../../../src/types";

interface ContextShape {
    devDependencies?: Record<string, string>;
    optionalDependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
    peerDependenciesMeta?: Record<string, { optional?: boolean }>;
    resolve?: boolean | (RegExp | string)[];
    used?: string[];
}

const createContext = ({ devDependencies, optionalDependencies, peerDependencies, peerDependenciesMeta, resolve, used }: ContextShape): BuildContext<InternalBuildOptions> =>
    ({
        options: { rollup: { dts: { resolve } } },
        pkg: { devDependencies, optionalDependencies, peerDependencies, peerDependenciesMeta },
        usedDependencies: new Set(used ?? []),
    }) as unknown as BuildContext<InternalBuildOptions>;

describe(computeDtsResolve, () => {
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

        const pattern = /^@scope\//;
        const resolved = computeDtsResolve(
            createContext({
                optionalDependencies: { excluded: "1.0.0" },
                resolve: [pattern, "!excluded"],
            }),
        );

        expect(resolved).toStrictEqual([pattern]);
    });
});
