import { describe, expect, it } from "vitest";

import { isFromNodeModules, isOutsideProject } from "../../../src/utils/import-specifier";

describe("isFromNodeModules", () => {
    const cwd = "/home/user/project";

    it("returns true when the path sits under node_modules relative to cwd", () => {
        expect(isFromNodeModules(`${cwd}/node_modules/foo/index.js`, cwd)).toBe(true);
        expect(isFromNodeModules(`${cwd}/node_modules/.pnpm/foo@1/node_modules/foo/index.js`, cwd)).toBe(true);
    });

    it("returns false for files inside the project source tree", () => {
        expect(isFromNodeModules(`${cwd}/src/index.ts`, cwd)).toBe(false);
        expect(isFromNodeModules(`${cwd}/dist/index.d.ts`, cwd)).toBe(false);
    });

    it("returns false for files outside cwd that are not under node_modules", () => {
        // Workspace sibling accessed via its real path — NOT under node_modules.
        expect(isFromNodeModules("/home/user/other/dist/index.d.ts", cwd)).toBe(false);
    });
});

describe("isOutsideProject", () => {
    const cwd = "/home/user/project";

    it("returns true for node_modules paths under cwd", () => {
        expect(isOutsideProject(`${cwd}/node_modules/foo/index.js`, cwd)).toBe(true);
        // pnpm-shaped path with double node_modules still flagged.
        expect(isOutsideProject(`${cwd}/node_modules/.pnpm/foo@1/node_modules/foo/index.js`, cwd)).toBe(true);
    });

    it("returns true for files outside cwd (pnpm workspace sibling realpath)", () => {
        // This is the cerebro/pail case: pnpm symlinks `node_modules/@visulima/pail`
        // → `../../error-debugging/pail`, and rollup follows the realpath. From
        // cerebro's cwd, that path escapes with `..`. The old isFromNodeModules
        // check missed this.
        expect(isOutsideProject("/home/user/other-workspace/pail/dist/index.d.ts", cwd)).toBe(true);
    });

    it("returns false for files inside the project source tree", () => {
        expect(isOutsideProject(`${cwd}/src/index.ts`, cwd)).toBe(false);
        expect(isOutsideProject(`${cwd}/src/nested/types.d.ts`, cwd)).toBe(false);
        expect(isOutsideProject(`${cwd}/dist/index.d.ts`, cwd)).toBe(false);
    });

    it("returns false for cwd itself", () => {
        expect(isOutsideProject(cwd, cwd)).toBe(false);
    });
});
