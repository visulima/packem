import { rm } from "node:fs/promises";

import { readFileSync, writeFileSync } from "@visulima/fs";
import { temporaryDirectory } from "tempy";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createPackageJson, createPackemConfig, createTsConfig, execPackemSync, installPackage } from "../helpers";

describe("packem typedoc", () => {
    let temporaryDirectoryPath: string;

    beforeEach(async () => {
        temporaryDirectoryPath = temporaryDirectory();
    });

    afterEach(async () => {
        await rm(temporaryDirectoryPath, { recursive: true });
    });

    it("should inline the generated typedoc if format is inline", async () => {
        expect.assertions(3);

        writeFileSync(
            `${temporaryDirectoryPath}/src/index.ts`,
            `/**
* This is a test function to show typedoc generation
*
* @example
* // If there are no code blocks, TypeDoc assumes the whole tag
* // should be a code block. This is not valid TSDoc, but is recognized
* // by VSCode and enables better JSDoc support.
* factorial(1)
*
* @example
* If there is a code block, then both TypeDoc and VSCode will treat
* text outside of the code block as regular text.
* \`\`\`ts
* factorial(1)
* \`\`\`
* @param {number} n
* @returns {number}
*/
export const factorial = (n: number): number => {
    return n;
}`,
        );
        writeFileSync(
            `${temporaryDirectoryPath}/README.md`,
            `# Test README
<!-- TYPEDOC --><!-- /TYPEDOC -->`,
        );

        await installPackage(temporaryDirectoryPath, "typescript");

        await createTsConfig(temporaryDirectoryPath, {});
        await createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                typescript: "*",
            },
            main: "./dist/index.cjs",
            module: "./dist/index.mjs",
            name: "typedoc",
        });

        await createPackemConfig(temporaryDirectoryPath, {
            config: {
                typedoc: {
                    format: "inline",
                    readmePath: "./README.md",
                },
            },
        });

        const binProcess = await execPackemSync("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        const mjsContent = readFileSync(`${temporaryDirectoryPath}/README.md`);

        expect(mjsContent).toBe(`# Test README
<!-- TYPEDOC -->

# typedoc

## Functions

### factorial()

\`\`\`ts
function factorial(n): number
\`\`\`

This is a test function to show typedoc generation

#### Parameters

• **n**: \`number\`

#### Returns

\`number\`

#### Examples

\`\`\`ts
// If there are no code blocks, TypeDoc assumes the whole tag
// should be a code block. This is not valid TSDoc, but is recognized
// by VSCode and enables better JSDoc support.
factorial(1)
\`\`\`

If there is a code block, then both TypeDoc and VSCode will treat
text outside of the code block as regular text.
\`\`\`ts
factorial(1)
\`\`\`

#### Defined in

index.ts:19

<!-- /TYPEDOC -->`);
    });
});
