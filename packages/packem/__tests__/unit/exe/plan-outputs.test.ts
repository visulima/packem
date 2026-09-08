import { describe, expect, it } from "vitest";

import { planOutputs } from "../../../src/exe/build";
import type { ExeChunk, ExeOptions } from "../../../src/exe/options";
import type { ResolvedExeTarget } from "../../../src/exe/platform";

const linux: ResolvedExeTarget = { arch: "x64", nodeVersion: "25.7.0", platform: "linux" };
const win: ResolvedExeTarget = { arch: "x64", nodeVersion: "25.7.0", platform: "win" };
const linuxNext: ResolvedExeTarget = { arch: "x64", nodeVersion: "26.0.0", platform: "linux" };

// Both sides of a collision must be named, so the message can be acted on.
const BOTH_CHUNKS = /cli\.cjs[\s\S]*worker\.cjs/;

const cli: ExeChunk = { path: "cli.cjs", type: "entry" };
const worker: ExeChunk = { path: "worker.cjs", type: "entry" };

describe(planOutputs, () => {
    it("should keep plain names for a single target", () => {
        expect.assertions(1);

        expect(planOutputs([cli], [linux], {}, "1.0.0").map((entry) => entry.outputFileName)).toStrictEqual(["cli"]);
    });

    it("should keep plain names when several entries share one target", () => {
        expect.assertions(1);

        const plan = planOutputs([cli, worker], [linux], {}, "1.0.0");

        expect(plan.map((entry) => entry.outputFileName)).toStrictEqual(["cli", "worker"]);
    });

    it("should add a platform suffix once there is more than one target", () => {
        expect.assertions(1);

        const plan = planOutputs([cli], [linux, win], {}, "1.0.0");

        expect(plan.map((entry) => entry.outputFileName)).toStrictEqual(["cli-linux-x64", "cli-win-x64.exe"]);
    });

    it("should pair every entry with every target", () => {
        expect.assertions(1);

        expect(planOutputs([cli, worker], [linux, win], {}, "1.0.0")).toHaveLength(4);
    });

    // A token-free `fileName` is identical for every chunk, so the second build would
    // silently overwrite the first while the summary reported two executables.
    it("should reject a literal fileName shared by several entries on one target", () => {
        expect.assertions(1);

        expect(() => planOutputs([cli, worker], [linux], { fileName: "app" }, "1.0.0")).toThrow('Two executables would both be written to "app"');
    });

    it("should name both sides of a collision so it can be fixed", () => {
        expect.assertions(1);

        expect(() => planOutputs([cli, worker], [linux], { fileName: "app" }, "1.0.0")).toThrow(BOTH_CHUNKS);
    });

    it("should reject two targets that differ only by Node.js version under the default template", () => {
        expect.assertions(1);

        expect(() => planOutputs([cli], [linux, linuxNext], {}, "1.0.0")).toThrow('Two executables would both be written to "cli-linux-x64"');
    });

    it("should suggest a template that tells the outputs apart", () => {
        expect.assertions(1);

        expect(() => planOutputs([cli], [linux, linuxNext], {}, "1.0.0")).toThrow("[name]-[platform]-[arch]-node[node]");
    });

    it("should accept those same targets once the template includes the Node.js version", () => {
        expect.assertions(1);

        const plan = planOutputs([cli], [linux, linuxNext], { fileName: "[name]-[platform]-[arch]-node[node]" }, "1.0.0");

        expect(plan.map((entry) => entry.outputFileName)).toStrictEqual(["cli-linux-x64-node25.7.0", "cli-linux-x64-node26.0.0"]);
    });

    it("should reject a fileName function that returns the same name for two chunks", () => {
        expect.assertions(1);

        expect(() => planOutputs([cli, worker], [linux], { fileName: () => "same" }, "1.0.0")).toThrow("Two executables would both be written");
    });

    it("should accept a fileName function that varies per chunk", () => {
        expect.assertions(1);

        const exe: ExeOptions = { fileName: (chunk) => `bin-${chunk.name}` };

        expect(planOutputs([cli, worker], [linux], exe, "1.0.0").map((entry) => entry.outputFileName)).toStrictEqual(["bin-cli", "bin-worker"]);
    });

    it("should interpolate the package version", () => {
        expect.assertions(1);

        const plan = planOutputs([cli], [linux], { fileName: "[name]-[version]" }, "2.1.0");

        expect(plan[0]?.outputFileName).toBe("cli-2.1.0");
    });
});
