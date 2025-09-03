import { rm } from "node:fs/promises";

import { readFileSync, writeFileSync } from "@visulima/fs";
import { temporaryDirectory } from "tempy";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
    createPackageJson,
    createPackemConfig,
    createTsConfig,
    execPackem,
    installPackage,
} from "../helpers";

describe("packem raw data", () => {
    let temporaryDirectoryPath: string;

    beforeEach(async () => {
        temporaryDirectoryPath = temporaryDirectory();

        await createPackemConfig(temporaryDirectoryPath);
    });

    afterEach(async () => {
        await rm(temporaryDirectoryPath, { recursive: true });
    });

    it("should generate js files with included raw content", async () => {
        expect.assertions(4);

        writeFileSync(
            `${temporaryDirectoryPath}/src/content.txt`,
            `thisismydata`,
        );
        writeFileSync(
            `${temporaryDirectoryPath}/src/index.ts`,
            `import content from './content.txt';

export const data = content;`,
        );

        await installPackage(temporaryDirectoryPath, "typescript");
        await createTsConfig(temporaryDirectoryPath);
        await createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                typescript: "*",
            },
            main: "./dist/index.cjs",
            module: "./dist/index.mjs",
        });

        const binProcess = await execPackem("build", [], {
            cwd: temporaryDirectoryPath,
            reject: false,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        const mjsContent = readFileSync(
            `${temporaryDirectoryPath}/dist/index.mjs`,
        );

        expect(mjsContent).toBe(`const data$1 = "thisismydata";

const data = data$1;

export { data };
`);

        const cjsContent = readFileSync(
            `${temporaryDirectoryPath}/dist/index.cjs`,
        );

        expect(cjsContent).toBe(`'use strict';

Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const data$1 = "thisismydata";

const data = data$1;

exports.data = data;
`);
    });

    it("should generate js files with included raw content when the '?raw' query param is used", async () => {
        expect.assertions(4);

        writeFileSync(
            `${temporaryDirectoryPath}/src/content.txt`,
            `thisismydata`,
        );
        writeFileSync(
            `${temporaryDirectoryPath}/src/index.ts`,
            `import content from './content.txt?raw';

export const data = content;`,
        );

        await installPackage(temporaryDirectoryPath, "typescript");
        await createTsConfig(temporaryDirectoryPath);
        await createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                typescript: "*",
            },
            main: "./dist/index.cjs",
            module: "./dist/index.mjs",
        });

        const binProcess = await execPackem("build", [], {
            cwd: temporaryDirectoryPath,
            reject: false,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        const mjsContent = readFileSync(
            `${temporaryDirectoryPath}/dist/index.mjs`,
        );

        expect(mjsContent).toBe(`const data$1 = "thisismydata";

const data = data$1;

export { data };
`);

        const cjsContent = readFileSync(
            `${temporaryDirectoryPath}/dist/index.cjs`,
        );

        expect(cjsContent).toBe(`'use strict';

Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const data$1 = "thisismydata";

const data = data$1;

exports.data = data;
`);
    });

    it("should generate js files with included raw content when importing .js?raw", async () => {
        expect.assertions(4);

        writeFileSync(
            `${temporaryDirectoryPath}/src/data.js`,
            `const message = "Hello from JS file";
console.log(message);
export default message;`,
        );
        writeFileSync(
            `${temporaryDirectoryPath}/src/index.ts`,
            `import jsContent from './data.js?raw';

export const data = jsContent;`,
        );

        await installPackage(temporaryDirectoryPath, "typescript");
        await createTsConfig(temporaryDirectoryPath);
        await createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                typescript: "*",
            },
            main: "./dist/index.cjs",
            module: "./dist/index.mjs",
        });

        // Configure packem to include .js files for raw imports
        await createPackemConfig(temporaryDirectoryPath);

        const binProcess = await execPackem("build", [], {
            cwd: temporaryDirectoryPath,
            reject: false,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        const mjsContent = readFileSync(
            `${temporaryDirectoryPath}/dist/index.mjs`,
        );

        expect(mjsContent).toBe(`const data$1 = "const message = \\"Hello from JS file\\";\\nconsole.log(message);\\nexport default message;";

const data = data$1;

export { data };
`);

        const cjsContent = readFileSync(
            `${temporaryDirectoryPath}/dist/index.cjs`,
        );

        expect(cjsContent).toBe(`'use strict';

Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const data$1 = "const message = \\"Hello from JS file\\";\\nconsole.log(message);\\nexport default message;";

const data = data$1;

exports.data = data;
`);
    });

    it("should generate js files with included raw HTML content", async () => {
        expect.assertions(4);

        writeFileSync(
            `${temporaryDirectoryPath}/src/template.html`,
            `<!DOCTYPE html>
<html lang="en" data-theme="dark" class="no-js">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="description" content="Test HTML file with various attributes">
    <title data-testid="page-title">Test Page</title>
    <link rel="stylesheet" href="styles.css" crossorigin="anonymous" data-preload>
    <script src="app.js" defer async type="module" data-entry-point></script>
</head>
<body data-page="test" class="loading ready">
    <header role="banner" aria-label="Site header">
        <nav role="navigation" aria-labelledby="main-nav">
            <ul id="main-nav" class="nav-list">
                <li><a href="/" class="nav-link active" data-nav-item="home">Home</a></li>
                <li><a href="/about" class="nav-link" data-nav-item="about" aria-current="false">About</a></li>
            </ul>
        </nav>
    </header>
    <main role="main" id="content" data-content-area>
        <article class="post" data-post-id="123" itemscope itemtype="https://schema.org/Article">
            <h1 itemprop="headline" data-heading-level="1">Test Article</h1>
            <p class="excerpt" data-word-count="150">This is a test paragraph with <strong>bold text</strong> and <em>italic text</em>.</p>
            <img src="image.jpg" alt="Test image" width="800" height="600" loading="lazy" data-src="image.jpg">
        </article>
    </main>
    <footer role="contentinfo" data-footer>
        <p>&copy; 2024 Test Site</p>
    </footer>
</body>
</html>`,
        );
        writeFileSync(
            `${temporaryDirectoryPath}/src/index.ts`,
            `import htmlContent from './template.html?raw';

export const template = htmlContent;`,
        );

        await installPackage(temporaryDirectoryPath, "typescript");
        await createTsConfig(temporaryDirectoryPath);
        await createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                typescript: "*",
            },
            main: "./dist/index.cjs",
            module: "./dist/index.mjs",
        });

        const binProcess = await execPackem("build", [], {
            cwd: temporaryDirectoryPath,
            reject: false,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        const mjsContent = readFileSync(
            `${temporaryDirectoryPath}/dist/index.mjs`,
        );

        expect(mjsContent).toMatchSnapshot("ESM output with raw HTML content");

        const cjsContent = readFileSync(
            `${temporaryDirectoryPath}/dist/index.cjs`,
        );

        expect(cjsContent).toMatchSnapshot("CommonJS output with raw HTML content");
    });

    it("should update output when source changes using '?raw'", async () => {
        expect.assertions(7);

        writeFileSync(
            `${temporaryDirectoryPath}/src/content.txt`,
            `first-version`,
        );
        writeFileSync(
            `${temporaryDirectoryPath}/src/index.ts`,
            `import content from './content.txt?raw';

export const data = content;`,
        );

        await installPackage(temporaryDirectoryPath, "typescript");
        await createTsConfig(temporaryDirectoryPath);
        await createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                typescript: "*",
            },
            main: "./dist/index.cjs",
            module: "./dist/index.mjs",
        });

        // First build
        let binProcess = await execPackem("build", [], {
            cwd: temporaryDirectoryPath,
            reject: false,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        let mjsContent = readFileSync(
            `${temporaryDirectoryPath}/dist/index.mjs`,
        );
        let cjsContent = readFileSync(
            `${temporaryDirectoryPath}/dist/index.cjs`,
        );

        expect(mjsContent.includes("first-version")).toBe(true);
        expect(cjsContent.includes("first-version")).toBe(true);

        // Change source content and rebuild
        writeFileSync(
            `${temporaryDirectoryPath}/src/content.txt`,
            `second-version`,
        );

        binProcess = await execPackem("build", [], {
            cwd: temporaryDirectoryPath,
            reject: false,
        });

        expect(binProcess.exitCode).toBe(0);

        mjsContent = readFileSync(
            `${temporaryDirectoryPath}/dist/index.mjs`,
        );
        cjsContent = readFileSync(
            `${temporaryDirectoryPath}/dist/index.cjs`,
        );

        expect(mjsContent.includes("second-version")).toBe(true);
        expect(cjsContent.includes("second-version")).toBe(true);
    });

    it("should update output when source changes without '?raw' (transform path)", async () => {
        expect.assertions(7);

        writeFileSync(
            `${temporaryDirectoryPath}/src/content.txt`,
            `alpha`,
        );
        writeFileSync(
            `${temporaryDirectoryPath}/src/index.ts`,
            `import content from './content.txt';

export const data = content;`,
        );

        await installPackage(temporaryDirectoryPath, "typescript");
        await createTsConfig(temporaryDirectoryPath);
        await createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                typescript: "*",
            },
            main: "./dist/index.cjs",
            module: "./dist/index.mjs",
        });

        // First build
        let binProcess = await execPackem("build", [], {
            cwd: temporaryDirectoryPath,
            reject: false,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        let mjsContent = readFileSync(
            `${temporaryDirectoryPath}/dist/index.mjs`,
        );
        let cjsContent = readFileSync(
            `${temporaryDirectoryPath}/dist/index.cjs`,
        );

        expect(mjsContent.includes("alpha")).toBe(true);
        expect(cjsContent.includes("alpha")).toBe(true);

        // Change source content and rebuild
        writeFileSync(
            `${temporaryDirectoryPath}/src/content.txt`,
            `beta`,
        );

        binProcess = await execPackem("build", [], {
            cwd: temporaryDirectoryPath,
            reject: false,
        });

        expect(binProcess.exitCode).toBe(0);

        mjsContent = readFileSync(
            `${temporaryDirectoryPath}/dist/index.mjs`,
        );
        cjsContent = readFileSync(
            `${temporaryDirectoryPath}/dist/index.cjs`,
        );

        expect(mjsContent.includes("beta")).toBe(true);
        expect(cjsContent.includes("beta")).toBe(true);
    });
});
