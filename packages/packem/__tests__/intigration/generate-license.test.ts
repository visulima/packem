import { rm } from "node:fs/promises";

import { readFileSync, writeFileSync, writeJsonSync } from "@visulima/fs";
import { temporaryDirectory } from "tempy";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createPackageJson, createPackemConfig, createTsConfig, execPackemSync, installPackage } from "../helpers";

describe("packem generate-license", () => {
    let temporaryDirectoryPath: string;

    beforeEach(async () => {
        temporaryDirectoryPath = temporaryDirectory();
    });

    afterEach(async () => {
        await rm(temporaryDirectoryPath, { recursive: true });
    });

    it("should bundle the license file placeholder if a dev-required package is bundled", async () => {
        expect.assertions(3);

        writeFileSync(`${temporaryDirectoryPath}/node_modules/dep/index.js`, `export default "dep"`);
        writeJsonSync(`${temporaryDirectoryPath}/node_modules/dep/package.json`, { name: "dep", version: "1.0.0" });
        writeFileSync(`${temporaryDirectoryPath}/node_modules/dev/LICENSE`, `The MIT License (MIT) dep`);

        writeFileSync(`${temporaryDirectoryPath}/node_modules/dev-dep/index.js`, `export default "dev-dep"`);
        writeJsonSync(`${temporaryDirectoryPath}/node_modules/dev-dep/package.json`, { name: "dev-dep", version: "1.0.0" });
        writeFileSync(`${temporaryDirectoryPath}/node_modules/dev-dep/LICENSE`, `The MIT License (MIT) dev-dep`);

        writeFileSync(
            `${temporaryDirectoryPath}/src/index.ts`,
            `import dep from 'dep';
import devDep from 'dev-dep';

export const data = { dep, devDep };`,
        );
        writeFileSync(
            `${temporaryDirectoryPath}/LICENSE.md`,
            `The MIT License (MIT) root
<!-- DEPENDENCIES -->
<!-- /DEPENDENCIES -->

<!-- TYPE_DEPENDENCIES -->
<!-- /TYPE_DEPENDENCIES -->`,
        );

        await installPackage(temporaryDirectoryPath, "typescript");
        await createTsConfig(temporaryDirectoryPath);
        await createPackageJson(temporaryDirectoryPath, {
            dependencies: {
                dep: "*",
            },
            devDependencies: {
                "dev-dep": "*",
                typescript: "*",
            },
            main: "./dist/index.cjs",
            module: "./dist/index.mjs",
        });

        await createPackemConfig(temporaryDirectoryPath, {
            config: {
                rollup: {
                    license: {
                        path: "./LICENSE.md",
                    },
                },
            },
        });

        const binProcess = await execPackemSync("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        const licenseContent = readFileSync(`${temporaryDirectoryPath}/LICENSE.md`);

        expect(licenseContent).toBe(`The MIT License (MIT) root
<!-- DEPENDENCIES -->

# Licenses of bundled dependencies
The published  artifact additionally contains code with the following licenses:

# Bundled dependencies:
## dev-dep

> The MIT License (MIT) dev-dep

<!-- /DEPENDENCIES -->

<!-- TYPE_DEPENDENCIES -->
<!-- /TYPE_DEPENDENCIES -->`);
    });

    it("should bundle license file placeholder only once if a dev-required package is bundled", async () => {
        expect.assertions(6);

        writeFileSync(`${temporaryDirectoryPath}/node_modules/dep/index.js`, `export default "dep"`);
        writeJsonSync(`${temporaryDirectoryPath}/node_modules/dep/package.json`, { name: "dep", version: "1.0.0" });
        writeFileSync(`${temporaryDirectoryPath}/node_modules/dev/LICENSE`, `The MIT License (MIT) dep`);

        writeFileSync(`${temporaryDirectoryPath}/node_modules/dev-dep/index.js`, `export default "dev-dep"`);
        writeJsonSync(`${temporaryDirectoryPath}/node_modules/dev-dep/package.json`, { name: "dev-dep", version: "1.0.0" });
        writeFileSync(`${temporaryDirectoryPath}/node_modules/dev-dep/LICENSE`, `The MIT License (MIT) dev-dep`);

        writeFileSync(
            `${temporaryDirectoryPath}/src/index.ts`,
            `import dep from 'dep';
import devDep from 'dev-dep';

export const data = { dep, devDep };`,
        );
        writeFileSync(
            `${temporaryDirectoryPath}/LICENSE.md`,
            `The MIT License (MIT) root
<!-- DEPENDENCIES -->
<!-- /DEPENDENCIES -->

<!-- TYPE_DEPENDENCIES -->
<!-- /TYPE_DEPENDENCIES -->`,
        );

        await installPackage(temporaryDirectoryPath, "typescript");
        await createTsConfig(temporaryDirectoryPath);
        await createPackageJson(temporaryDirectoryPath, {
            dependencies: {
                dep: "*",
            },
            devDependencies: {
                "dev-dep": "*",
                typescript: "*",
            },
            main: "./dist/index.cjs",
            module: "./dist/index.mjs",
        });

        await createPackemConfig(temporaryDirectoryPath, {
            config: {
                rollup: {
                    license: {
                        path: "./LICENSE.md",
                    },
                },
            },
        });

        const binProcess = await execPackemSync("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        const licenseContent = readFileSync(`${temporaryDirectoryPath}/LICENSE.md`);

        expect(licenseContent).toBe(`The MIT License (MIT) root
<!-- DEPENDENCIES -->

# Licenses of bundled dependencies
The published  artifact additionally contains code with the following licenses:

# Bundled dependencies:
## dev-dep

> The MIT License (MIT) dev-dep

<!-- /DEPENDENCIES -->

<!-- TYPE_DEPENDENCIES -->
<!-- /TYPE_DEPENDENCIES -->`);

        const binProcess2 = await execPackemSync("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess2.stderr).toBe("");
        expect(binProcess2.exitCode).toBe(0);

        const licenseContent2 = readFileSync(`${temporaryDirectoryPath}/LICENSE.md`);

        expect(licenseContent2).toBe(`The MIT License (MIT) root
<!-- DEPENDENCIES -->

# Licenses of bundled dependencies
The published  artifact additionally contains code with the following licenses:

# Bundled dependencies:
## dev-dep

> The MIT License (MIT) dev-dep

<!-- /DEPENDENCIES -->

<!-- TYPE_DEPENDENCIES -->
<!-- /TYPE_DEPENDENCIES -->`);
    });

    it("should bundle license file placeholder only once and remove placeholder if the dev-dep was bundle with packem", async () => {
        expect.assertions(6);

        writeFileSync(`${temporaryDirectoryPath}/node_modules/dep/index.js`, `export default "dep"`);
        writeJsonSync(`${temporaryDirectoryPath}/node_modules/dep/package.json`, { name: "dep", version: "1.0.0" });
        writeFileSync(`${temporaryDirectoryPath}/node_modules/dev/LICENSE`, `The MIT License (MIT) dep`);

        writeFileSync(`${temporaryDirectoryPath}/node_modules/dev-dep/index.js`, `export default "dev-dep"`);
        writeJsonSync(`${temporaryDirectoryPath}/node_modules/dev-dep/package.json`, { name: "dev-dep", version: "1.0.0" });
        writeFileSync(
            `${temporaryDirectoryPath}/node_modules/dev-dep/LICENSE`,
            `The MIT License (MIT) dev-dep
<!-- DEPENDENCIES -->

# Licenses of bundled dependencies
The published  artifact additionally contains code with the following licenses:

# Bundled dependencies:
## dep2

> The MIT License (MIT) dev-dep

<!-- /DEPENDENCIES -->

<!-- TYPE_DEPENDENCIES -->
<!-- /TYPE_DEPENDENCIES -->`,
        );

        writeFileSync(
            `${temporaryDirectoryPath}/src/index.ts`,
            `import dep from 'dep';
import devDep from 'dev-dep';

export const data = { dep, devDep };`,
        );
        writeFileSync(
            `${temporaryDirectoryPath}/LICENSE.md`,
            `The MIT License (MIT) root
<!-- DEPENDENCIES -->
<!-- /DEPENDENCIES -->

<!-- TYPE_DEPENDENCIES -->
<!-- /TYPE_DEPENDENCIES -->`,
        );

        await installPackage(temporaryDirectoryPath, "typescript");
        await createTsConfig(temporaryDirectoryPath);
        await createPackageJson(temporaryDirectoryPath, {
            dependencies: {
                dep: "*",
            },
            devDependencies: {
                "dev-dep": "*",
                typescript: "*",
            },
            main: "./dist/index.cjs",
            module: "./dist/index.mjs",
        });

        await createPackemConfig(temporaryDirectoryPath, {
            config: {
                rollup: {
                    license: {
                        path: "./LICENSE.md",
                    },
                },
            },
        });

        const binProcess = await execPackemSync("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        const licenseContent = readFileSync(`${temporaryDirectoryPath}/LICENSE.md`);

        expect(licenseContent).toBe(`The MIT License (MIT) root
<!-- DEPENDENCIES -->

# Licenses of bundled dependencies
The published  artifact additionally contains code with the following licenses:

# Bundled dependencies:
## dev-dep

> The MIT License (MIT) dev-dep
>
>
> # Licenses of bundled dependencies
> The published  artifact additionally contains code with the following licenses:
>
> # Bundled dependencies:
> ## dep2
>
> > The MIT License (MIT) dev-dep

<!-- /DEPENDENCIES -->

<!-- TYPE_DEPENDENCIES -->
<!-- /TYPE_DEPENDENCIES -->`);

        const binProcess2 = await execPackemSync("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess2.stderr).toBe("");
        expect(binProcess2.exitCode).toBe(0);

        const licenseContent2 = readFileSync(`${temporaryDirectoryPath}/LICENSE.md`);

        expect(licenseContent2).toBe(`The MIT License (MIT) root
<!-- DEPENDENCIES -->

# Licenses of bundled dependencies
The published  artifact additionally contains code with the following licenses:

# Bundled dependencies:
## dev-dep

> The MIT License (MIT) dev-dep
>
>
> # Licenses of bundled dependencies
> The published  artifact additionally contains code with the following licenses:
>
> # Bundled dependencies:
> ## dep2
>
> > The MIT License (MIT) dev-dep

<!-- /DEPENDENCIES -->

<!-- TYPE_DEPENDENCIES -->
<!-- /TYPE_DEPENDENCIES -->`);
    });
});
