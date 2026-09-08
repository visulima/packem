import { describe, expect, it } from "vitest";

import { resolveSignOptions } from "../../../src/exe/sign";

describe(resolveSignOptions, () => {
    it("should default to ad-hoc signing when unset", () => {
        expect.assertions(1);

        expect(resolveSignOptions(undefined)).toStrictEqual({ identity: "-" });
    });

    it("should default to ad-hoc signing for `true`", () => {
        expect.assertions(1);

        expect(resolveSignOptions(true)).toStrictEqual({ identity: "-" });
    });

    it("should disable signing for `false`", () => {
        expect.assertions(1);

        expect(resolveSignOptions(false)).toBeUndefined();
    });

    it("should keep a configured identity", () => {
        expect.assertions(1);

        expect(resolveSignOptions({ identity: "Developer ID Application: Acme" })).toStrictEqual({
            identity: "Developer ID Application: Acme",
        });
    });

    it("should fill in the ad-hoc identity when only entitlements are given", () => {
        expect.assertions(1);

        expect(resolveSignOptions({ entitlements: "./app.entitlements" })).toStrictEqual({
            entitlements: "./app.entitlements",
            identity: "-",
        });
    });

    it("should carry extra codesign arguments through", () => {
        expect.assertions(1);

        expect(resolveSignOptions({ args: ["--timestamp"] })?.args).toStrictEqual(["--timestamp"]);
    });
});
