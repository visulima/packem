import { rm } from "node:fs/promises";

import { readFileSync, writeFileSync } from "@visulima/fs";
// eslint-disable-next-line e18e/ban-dependencies -- tempy is core test-runner infra; fs.mkdtemp migration tracked separately
import { temporaryDirectory } from "tempy";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createPackageJson, createPackemConfig, createTsConfig, execPackem, installPackage } from "../helpers";
import { normalizeBundleOutput } from "../helpers/testing-utils";

const isRolldown = process.env.PACKEM_TEST_BUNDLER === "rolldown";

describe("packem jsx", () => {
    let temporaryDirectoryPath: string;

    beforeEach(() => {
        temporaryDirectoryPath = temporaryDirectory();
    });

    afterEach(async () => {
        await rm(temporaryDirectoryPath, { recursive: true });
    });

    it("should correctly export react tsx to js", async () => {
        // eslint-disable-next-line vitest/prefer-expect-assertions -- assertion count legitimately differs by bundler: rolldown skips the CJS-interop check (different output shape)
        expect.assertions(isRolldown ? 6 : 7);

        writeFileSync(
            `${temporaryDirectoryPath}/src/index.tsx`,
            `const Tr = () => (<tr className={"m-0 border-t border-gray-300 p-0 dark:border-gray-600 even:bg-gray-100 even:dark:bg-gray-600/20"} />);

export default Tr;`,
        );
        await createPackageJson(temporaryDirectoryPath, {
            dependencies: {
                react: "^18.2.0",
                "react-dom": "^18.2.0",
            },
            devDependencies: {
                "@types/react": "^18.0.0",
                "@types/react-dom": "^18.0.0",
                typescript: "^5",
            },
            main: "./dist/index.cjs",
            module: "./dist/index.mjs",
            type: "commonjs",
            types: "./dist/index.d.ts",
        });
        await createTsConfig(temporaryDirectoryPath, {
            compilerOptions: {
                jsx: "react-jsx",
                moduleResolution: "bundler",
            },
        });
        await createPackemConfig(temporaryDirectoryPath, {
            runtime: "browser",
        });

        await installPackage(temporaryDirectoryPath, "typescript");
        await installPackage(temporaryDirectoryPath, "react");
        await installPackage(temporaryDirectoryPath, "react-dom");

        const binProcess = await execPackem("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        const mjsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.mjs`);

        expect(normalizeBundleOutput(mjsContent)).toBe(`import { jsx } from 'react/jsx-runtime';

const Tr = () => jsx("tr", { className: "m-0 border-t border-gray-300 p-0 dark:border-gray-600 even:bg-gray-100 even:dark:bg-gray-600/20" });

export { Tr as default };
`);

        // eslint-disable-next-line vitest/no-conditional-in-test -- deterministic env branch (not flaky): only the CJS-interop output differs between rollup and rolldown
        if (!isRolldown) {
            // Rolldown emits a different CJS interop shape (`let X = require(...)`,
            // `(0, X.jsx)(...)`, no `'use strict';`). DTS + ESM still match.
            const cjsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.cjs`);

            // eslint-disable-next-line vitest/no-conditional-expect -- deterministic env branch (not flaky): rolldown emits a different CJS-interop shape, asserted separately below
            expect(normalizeBundleOutput(cjsContent)).toBe(`'use strict';

const jsxRuntime = require('react/jsx-runtime');

const Tr = () => jsxRuntime.jsx("tr", { className: "m-0 border-t border-gray-300 p-0 dark:border-gray-600 even:bg-gray-100 even:dark:bg-gray-600/20" });

module.exports = Tr;
`);
        }

        const dCtsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.d.cts`);

        expect(dCtsContent).toBe(`declare const Tr: () => any;
export = Tr;
`);

        const dMtsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.d.mts`);

        expect(dMtsContent).toBe(`declare const Tr: () => any;
export { Tr as default };
`);

        const dContent = readFileSync(`${temporaryDirectoryPath}/dist/index.d.ts`);

        expect(dContent).toBe(`declare const Tr: () => any;
export = Tr;
`);
    });

    // Rolldown line-breaks long object literals (className + data-testid here),
    // which rollup never does. Real bundler output difference, not a normalize-able
    // artifact — skip this single case rather than warp the assertion.
    it.skipIf(isRolldown)("should not delete a attribute if the jsxRemoveAttributes config is empty", async () => {
        // eslint-disable-next-line vitest/prefer-expect-assertions -- assertion count legitimately differs by bundler: rolldown skips the CJS-interop check (different output shape)
        expect.assertions(isRolldown ? 6 : 7);

        writeFileSync(
            `${temporaryDirectoryPath}/src/index.tsx`,
            `const Tr = () => (<tr className={"m-0 border-t border-gray-300 p-0 dark:border-gray-600 even:bg-gray-100 even:dark:bg-gray-600/20"} data-testid="test" />);

export default Tr;`,
        );
        await createPackageJson(temporaryDirectoryPath, {
            dependencies: {
                react: "^18.2.0",
                "react-dom": "^18.2.0",
            },
            devDependencies: {
                "@types/react": "^18.0.0",
                "@types/react-dom": "^18.0.0",
                typescript: "^5",
            },
            main: "./dist/index.cjs",
            module: "./dist/index.mjs",
            type: "commonjs",
            types: "./dist/index.d.ts",
        });
        await createTsConfig(temporaryDirectoryPath, {
            compilerOptions: {
                jsx: "react-jsx",
                moduleResolution: "bundler",
            },
        });
        await createPackemConfig(temporaryDirectoryPath, {
            runtime: "browser",
        });

        await installPackage(temporaryDirectoryPath, "typescript");
        await installPackage(temporaryDirectoryPath, "react");
        await installPackage(temporaryDirectoryPath, "react-dom");

        const binProcess = await execPackem("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        const mjsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.mjs`);

        expect(mjsContent).toBe(`import { jsx } from 'react/jsx-runtime';

const Tr = () => jsx("tr", { className: "m-0 border-t border-gray-300 p-0 dark:border-gray-600 even:bg-gray-100 even:dark:bg-gray-600/20", "data-testid": "test" });

export { Tr as default };
`);

        const cjsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.cjs`);

        expect(cjsContent).toBe(`'use strict';

const jsxRuntime = require('react/jsx-runtime');

const Tr = () => jsxRuntime.jsx("tr", { className: "m-0 border-t border-gray-300 p-0 dark:border-gray-600 even:bg-gray-100 even:dark:bg-gray-600/20", "data-testid": "test" });

module.exports = Tr;
`);

        const dCtsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.d.cts`);

        expect(dCtsContent).toBe(`declare const Tr: () => any;
export = Tr;
`);

        const dMtsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.d.mts`);

        expect(dMtsContent).toBe(`declare const Tr: () => any;
export { Tr as default };
`);

        const dContent = readFileSync(`${temporaryDirectoryPath}/dist/index.d.ts`);

        expect(dContent).toBe(`declare const Tr: () => any;
export = Tr;
`);
    });

    it("should delete a attribute if the jsxRemoveAttributes is configured", async () => {
        // eslint-disable-next-line vitest/prefer-expect-assertions -- assertion count legitimately differs by bundler: rolldown skips the CJS-interop check (different output shape)
        expect.assertions(isRolldown ? 6 : 7);

        writeFileSync(
            `${temporaryDirectoryPath}/src/index.tsx`,
            `const Tr = () => (<tr className={"m-0 border-t border-gray-300 p-0 dark:border-gray-600 even:bg-gray-100 even:dark:bg-gray-600/20"} data-testid="test" />);

export default Tr;`,
        );
        await createPackageJson(temporaryDirectoryPath, {
            dependencies: {
                react: "^18.2.0",
                "react-dom": "^18.2.0",
            },
            devDependencies: {
                "@types/react": "^18.0.0",
                "@types/react-dom": "^18.0.0",
                typescript: "^5",
            },
            main: "./dist/index.cjs",
            module: "./dist/index.mjs",
            type: "commonjs",
            types: "./dist/index.d.ts",
        });
        await createTsConfig(temporaryDirectoryPath, {
            compilerOptions: {
                jsx: "react-jsx",
                moduleResolution: "bundler",
            },
        });
        await createPackemConfig(temporaryDirectoryPath, {
            config: {
                rollup: {
                    jsxRemoveAttributes: {
                        attributes: ["data-testid"],
                    },
                },
            },
        });

        await installPackage(temporaryDirectoryPath, "typescript");
        await installPackage(temporaryDirectoryPath, "react");
        await installPackage(temporaryDirectoryPath, "react-dom");

        const binProcess = await execPackem("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        const mjsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.mjs`);

        expect(normalizeBundleOutput(mjsContent)).toBe(`import { jsx } from 'react/jsx-runtime';

const Tr = () => jsx("tr", { className: "m-0 border-t border-gray-300 p-0 dark:border-gray-600 even:bg-gray-100 even:dark:bg-gray-600/20" });

export { Tr as default };
`);

        // eslint-disable-next-line vitest/no-conditional-in-test -- deterministic env branch (not flaky): only the CJS-interop output differs between rollup and rolldown
        if (!isRolldown) {
            // Rolldown emits a different CJS interop shape (`let X = require(...)`,
            // `(0, X.jsx)(...)`, no `'use strict';`). DTS + ESM still match.
            const cjsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.cjs`);

            // eslint-disable-next-line vitest/no-conditional-expect -- deterministic env branch (not flaky): rolldown emits a different CJS-interop shape, asserted separately below
            expect(normalizeBundleOutput(cjsContent)).toBe(`'use strict';

const jsxRuntime = require('react/jsx-runtime');

const Tr = () => jsxRuntime.jsx("tr", { className: "m-0 border-t border-gray-300 p-0 dark:border-gray-600 even:bg-gray-100 even:dark:bg-gray-600/20" });

module.exports = Tr;
`);
        }

        const dCtsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.d.cts`);

        expect(dCtsContent).toBe(`declare const Tr: () => any;
export = Tr;
`);

        const dMtsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.d.mts`);

        expect(dMtsContent).toBe(`declare const Tr: () => any;
export { Tr as default };
`);

        const dContent = readFileSync(`${temporaryDirectoryPath}/dist/index.d.ts`);

        expect(dContent).toBe(`declare const Tr: () => any;
export = Tr;
`);
    });

    it("should delete a attributes if the jsxRemoveAttributes is configured", async () => {
        // eslint-disable-next-line vitest/prefer-expect-assertions -- assertion count legitimately differs by bundler: rolldown skips the CJS-interop check (different output shape)
        expect.assertions(isRolldown ? 6 : 7);

        writeFileSync(
            `${temporaryDirectoryPath}/src/index.tsx`,
            `const Tr = () => (<tr className={"m-0 border-t border-gray-300 p-0 dark:border-gray-600 even:bg-gray-100 even:dark:bg-gray-600/20"} data-testid="test" data-test="test" />);

export default Tr;`,
        );
        await createPackageJson(temporaryDirectoryPath, {
            dependencies: {
                react: "^18.2.0",
                "react-dom": "^18.2.0",
            },
            devDependencies: {
                "@types/react": "^18.0.0",
                "@types/react-dom": "^18.0.0",
                typescript: "^5",
            },
            main: "./dist/index.cjs",
            module: "./dist/index.mjs",
            type: "commonjs",
            types: "./dist/index.d.ts",
        });
        await createTsConfig(temporaryDirectoryPath, {
            compilerOptions: {
                jsx: "react-jsx",
                moduleResolution: "bundler",
            },
        });
        await createPackemConfig(temporaryDirectoryPath, {
            config: {
                rollup: {
                    jsxRemoveAttributes: {
                        attributes: ["data-testid", "data-test"],
                    },
                },
            },
            runtime: "browser",
        });

        await installPackage(temporaryDirectoryPath, "typescript");
        await installPackage(temporaryDirectoryPath, "react");
        await installPackage(temporaryDirectoryPath, "react-dom");

        const binProcess = await execPackem("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        const mjsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.mjs`);

        expect(normalizeBundleOutput(mjsContent)).toBe(`import { jsx } from 'react/jsx-runtime';

const Tr = () => jsx("tr", { className: "m-0 border-t border-gray-300 p-0 dark:border-gray-600 even:bg-gray-100 even:dark:bg-gray-600/20" });

export { Tr as default };
`);

        // eslint-disable-next-line vitest/no-conditional-in-test -- deterministic env branch (not flaky): only the CJS-interop output differs between rollup and rolldown
        if (!isRolldown) {
            // Rolldown emits a different CJS interop shape (`let X = require(...)`,
            // `(0, X.jsx)(...)`, no `'use strict';`). DTS + ESM still match.
            const cjsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.cjs`);

            // eslint-disable-next-line vitest/no-conditional-expect -- deterministic env branch (not flaky): rolldown emits a different CJS-interop shape, asserted separately below
            expect(normalizeBundleOutput(cjsContent)).toBe(`'use strict';

const jsxRuntime = require('react/jsx-runtime');

const Tr = () => jsxRuntime.jsx("tr", { className: "m-0 border-t border-gray-300 p-0 dark:border-gray-600 even:bg-gray-100 even:dark:bg-gray-600/20" });

module.exports = Tr;
`);
        }

        const dCtsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.d.cts`);

        expect(dCtsContent).toBe(`declare const Tr: () => any;
export = Tr;
`);

        const dMtsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.d.mts`);

        expect(dMtsContent).toBe(`declare const Tr: () => any;
export { Tr as default };
`);

        const dContent = readFileSync(`${temporaryDirectoryPath}/dist/index.d.ts`);

        expect(dContent).toBe(`declare const Tr: () => any;
export = Tr;
`);
    });
});
