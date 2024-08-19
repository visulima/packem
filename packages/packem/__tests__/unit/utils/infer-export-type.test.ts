import { describe, expect, it } from "vitest";

import { inferExportType } from "../../../src/utils/infer-export-type";

describe("inferExportType", () => {
    it("should infers export type by condition", () => {
        expect.assertions(4);

        expect(inferExportType("import", [], "cjs")).toBe("esm");
        expect(inferExportType("require", [], "esm")).toBe("cjs");
        expect(inferExportType("node", [], "esm")).toBe("esm");
        expect(inferExportType("some_unknown_condition", [], "esm")).toBe("esm");
    });

    it("should infers export type based on previous conditions", () => {
        expect.assertions(4);

        expect(inferExportType("import", ["require"], "cjs")).toBe("esm");
        expect(inferExportType("node", ["require"], "esm")).toBe("cjs");
        expect(inferExportType("node", ["import"], "cjs")).toBe("esm");
        expect(inferExportType("node", ["unknown", "require"], "esm")).toBe("cjs");
    });

    it("should infers export type based on filename", () => {
        expect.assertions(3);

        expect(inferExportType("import", [], "cjs", "file.d.ts")).toBe("esm");
        expect(inferExportType("import", [], "cjs", "file.mjs")).toBe("esm");
        expect(inferExportType("import", [], "esm", "file.cjs")).toBe("cjs");
    });

    it("should use package.json type if no conditions are met", () => {
        expect.assertions(1);

        expect(inferExportType("unknown", [], "cjs", undefined)).toBe("cjs");
    });
});
