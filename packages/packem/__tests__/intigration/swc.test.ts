import { readdirSync } from "node:fs";
import { rm } from "node:fs/promises";

import { readFile, writeFile } from "@visulima/fs";
import { join } from "@visulima/path";
import { temporaryDirectory } from "tempy";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { assertContainFiles, createPackageJson, createPackemConfig, createTsConfig, execPackem, installPackage } from "../helpers";

describe("packem swc", () => {
    let temporaryDirectoryPath: string;

    beforeEach(async () => {
        temporaryDirectoryPath = temporaryDirectory({
            prefix: "packem-swc",
        });
    });

    afterEach(async () => {
        await rm(temporaryDirectoryPath, { recursive: true });
    });

    it("should generate shared common chunks with SWC transformer", async () => {
        expect.assertions(12);

        // Create bar.ts with modern syntax (using statement)
        await writeFile(
            `${temporaryDirectoryPath}/src/bar.ts`,
            `export class Bar {
  method() {
    const getResource = () => {
      return {
        [Symbol.dispose]: () => {
          console.log('Hooray!')
        },
      }
    }

    using resource = getResource()
    console.log('using resource', resource)
  }
}`,
        );

        // Create foo.ts with async/await
        await writeFile(
            `${temporaryDirectoryPath}/src/foo.ts`,
            `export class Foo {
  async foo() {
    return 'async-foo'
  }
}`,
        );

        // Create index.ts with object spread and Object.assign
        await writeFile(
            `${temporaryDirectoryPath}/src/index.ts`,
            `export class Index {
  async method() {
    const x = { a: 1 }
    const y = { b: 2 }
    const z = { ...x, ...y }
    console.log(z, Object.assign({}, x, y))
  }
}`,
        );

        // Create entry points that import these classes
        await writeFile(
            `${temporaryDirectoryPath}/src/entry1.ts`,
            `import { Bar } from './bar';
import { Foo } from './foo';

export const entry1 = () => {
  const bar = new Bar();
  const foo = new Foo();
  bar.method();
  return foo.foo();
};`,
        );

        await writeFile(
            `${temporaryDirectoryPath}/src/entry2.ts`,
            `import { Index } from './index';
import { Foo } from './foo';

export const entry2 = () => {
  const index = new Index();
  const foo = new Foo();
  index.method();
  return foo.foo();
};`,
        );

        await installPackage(temporaryDirectoryPath, "@swc/core");
        await installPackage(temporaryDirectoryPath, "typescript");

        await createTsConfig(temporaryDirectoryPath, {
            compilerOptions: {
                experimentalDecorators: true,
                lib: ["ES2022", "DOM"],
                target: "ES2022", // Enable modern syntax support
            },
        });

        await createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                "@swc/core": "*",
                typescript: "*",
            },
            exports: {
                "./entry1": {
                    import: "./dist/entry1.mjs",
                    require: "./dist/entry1.cjs",
                },
                "./entry2": {
                    import: "./dist/entry2.mjs",
                    require: "./dist/entry2.cjs",
                },
            },
            type: "module",
        });

        await createPackemConfig(temporaryDirectoryPath, {
            config: {
                rollup: {
                    output: {
                        chunkFileNames: "chunks/[name]-[hash].js",
                    },
                },
            },
            transformer: "swc",
        });

        const binProcess = await execPackem("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        const files = readdirSync(join(temporaryDirectoryPath, "dist"));

        // Should have entry files
        expect(files).toContain("entry1.mjs");
        expect(files).toContain("entry1.cjs");
        expect(files).toContain("entry2.mjs");
        expect(files).toContain("entry2.cjs");

        // Check that chunks directory exists (indicating code splitting)
        expect(files).toContain("chunks");

        const chunksDirectory = readdirSync(join(temporaryDirectoryPath, "dist", "chunks"));

        expect(chunksDirectory.length).toBeGreaterThan(0);

        // Verify the content of all generated files using snapshots
        const entry1MjsContent = await readFile(`${temporaryDirectoryPath}/dist/entry1.mjs`);

        expect(entry1MjsContent).toMatchSnapshot("entry1.mjs output");

        const entry1CjsContent = await readFile(`${temporaryDirectoryPath}/dist/entry1.cjs`);

        expect(entry1CjsContent).toMatchSnapshot("entry1.cjs output");

        const entry2MjsContent = await readFile(`${temporaryDirectoryPath}/dist/entry2.mjs`);

        expect(entry2MjsContent).toMatchSnapshot("entry2.mjs output");

        const entry2CjsContent = await readFile(`${temporaryDirectoryPath}/dist/entry2.cjs`);

        expect(entry2CjsContent).toMatchSnapshot("entry2.cjs output");
    });

    it("should handle modern TypeScript syntax with SWC transformer", async () => {
        expect.assertions(6);

        // Create a file with modern syntax features
        await writeFile(
            `${temporaryDirectoryPath}/src/modern.ts`,
            `export class ModernFeatures {
  // Using statement (ES2022)
  useResource() {
    const getResource = () => ({
      [Symbol.dispose]: () => console.log('Resource disposed')
    });

    using resource = getResource();
    return resource;
  }

  // Async/await with object spread
  async processData() {
    const base = { id: 1 };
    const extra = { name: 'test' };
    const combined = { ...base, ...extra };

    return Promise.resolve(combined);
  }

  // Optional chaining and nullish coalescing
  safeAccess(obj?: { nested?: { value?: string } }) {
    return obj?.nested?.value ?? 'default';
  }
}`,
        );

        await writeFile(
            `${temporaryDirectoryPath}/src/index.ts`,
            `export { ModernFeatures } from './modern';`,
        );

        await installPackage(temporaryDirectoryPath, "@swc/core");
        await installPackage(temporaryDirectoryPath, "typescript");

        await createTsConfig(temporaryDirectoryPath, {
            compilerOptions: {
                lib: ["ES2022"],
                strict: true,
                target: "ES2022",
            },
        });

        await createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                "@swc/core": "*",
                typescript: "*",
            },
            exports: {
                ".": {
                    import: "./dist/index.mjs",
                    require: "./dist/index.cjs",
                },
            },
            main: "./dist/index.cjs",
            module: "./dist/index.mjs",
            types: "./dist/index.d.ts",
        });

        await createPackemConfig(temporaryDirectoryPath, {
            transformer: "swc",
        });

        const binProcess = await execPackem("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        assertContainFiles(join(temporaryDirectoryPath, "dist"), ["index.mjs", "index.cjs", "index.d.ts"]);

        // Verify the transformed content using snapshots
        const mjsContent = await readFile(`${temporaryDirectoryPath}/dist/index.mjs`);

        expect(mjsContent).toMatchSnapshot("modern features index.mjs output");

        const cjsContent = await readFile(`${temporaryDirectoryPath}/dist/index.cjs`);

        expect(cjsContent).toMatchSnapshot("modern features index.cjs output");

        const dtsContent = await readFile(`${temporaryDirectoryPath}/dist/index.d.ts`);

        expect(dtsContent).toMatchSnapshot("modern features index.d.ts output");
    });
});
